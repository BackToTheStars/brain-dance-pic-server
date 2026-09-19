const test = require('node:test');
const assert = require('node:assert/strict');
const { after, mock } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');
const Module = require('node:module');

// Стенд: каталоги задания настоящие (их создание можно уронить), ffprobe и ffmpeg —
// заглушки; ни один процесс не запускается.
const created = [];
const removed = [];
let createFails = 0;
let removeFails = 0;

const tmpStub = {
  createJobDir() {
    if (createFails > 0) {
      createFails -= 1;
      throw Object.assign(new Error('ENOSPC: no space left on device, mkdir'), {
        code: 'ENOSPC',
      });
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-media-frame-test-'));
    created.push(dir);

    return dir;
  },
  removeJobDir(dir) {
    removed.push(dir);
    if (removeFails > 0) {
      removeFails -= 1;
      throw Object.assign(new Error('EBUSY: resource busy, rmdir'), { code: 'EBUSY' });
    }
    if (typeof dir === 'string' && dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

const tmpPath = require.resolve('../modules/youtube/services/tmp');
const tmpModule = new Module(tmpPath, null);
tmpModule.filename = tmpPath;
tmpModule.loaded = true;
tmpModule.exports = tmpStub;
require.cache[tmpPath] = tmpModule;

const spawnQueue = [];
const spawned = [];

// Один запуск: план описывает, чем он кончится. hold — держать до release().
function fakeChild(plan, args) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};

  const finish = () => {
    if (plan.frame) {
      fs.writeFileSync(args[args.length - 1], Buffer.from(plan.frame));
    }
    if (plan.error) {
      child.emit('error', plan.error);
    }
    if (plan.stdout) {
      child.stdout.emit('data', Buffer.from(plan.stdout));
    }
    if (plan.stderr) {
      child.stderr.emit('data', Buffer.from(plan.stderr));
    }
    child.emit('close', plan.code === undefined ? 0 : plan.code, plan.signal || null);
  };

  if (plan.hold) {
    plan.release = finish;
  } else {
    process.nextTick(finish);
  }

  return child;
}

mock.method(childProcess, 'spawn', (bin, args) => {
  spawned.push({ bin, args });
  const plan = spawnQueue.shift();
  if (!plan) {
    throw new Error(`не ожидался запуск ${bin}`);
  }

  return fakeChild(plan, args);
});

// Отказ ffprobe и отсутствие кадра пишутся в лог — в тесте он не нужен.
mock.method(console, 'error', () => {});

const {
  extractFrame,
  FRAME_CONCURRENCY,
  ERR_BUSY,
  ERR_INVALID,
  ERR_TIMEOUT,
  ERR_ABORTED,
} = require('../modules/media/services/frame');

const PROBE_OK = () => ({
  stdout: JSON.stringify({
    streams: [{ codec_type: 'video' }],
    format: { duration: '12.5' },
  }),
});
const FRAME_OK = () => ({ frame: 'jpeg-bytes' });

const queue = (...plans) => {
  spawnQueue.push(...plans);

  return plans;
};

const rejects = (promise, code) =>
  assert.rejects(promise, (error) => {
    assert.equal(error.code, code);

    return true;
  });

const takeFrame = () => extractFrame('video.mp4', 1);

test('a failed job directory does not take a frame slot for good', async () => {
  createFails = FRAME_CONCURRENCY;
  for (let attempt = 0; attempt < FRAME_CONCURRENCY; attempt += 1) {
    await rejects(takeFrame(), 'ENOSPC');
  }
  assert.equal(createFails, 0);

  queue(PROBE_OK(), FRAME_OK());
  const frame = await takeFrame();
  assert.equal(frame.mimetype, 'image/jpeg');
  assert.equal(spawnQueue.length, 0);
  assert.ok(removed.every((dir) => typeof dir === 'string' && dir.length > 0));
});

test('a refused probe frees the slot', async () => {
  for (let attempt = 0; attempt < FRAME_CONCURRENCY; attempt += 1) {
    queue({ code: 1, stderr: 'moov atom not found' });
    await rejects(takeFrame(), ERR_INVALID);
  }

  queue(PROBE_OK(), FRAME_OK());
  await takeFrame();
  assert.equal(spawnQueue.length, 0);
});

test('a killed ffmpeg frees the slot', async () => {
  for (let attempt = 0; attempt < FRAME_CONCURRENCY; attempt += 1) {
    queue(PROBE_OK(), { signal: 'SIGKILL' });
    await rejects(takeFrame(), ERR_TIMEOUT);
  }

  queue(PROBE_OK(), FRAME_OK());
  await takeFrame();
  assert.equal(spawnQueue.length, 0);
});

test('a cancelled request frees the slot', async () => {
  const abort = Object.assign(new Error('The operation was aborted'), {
    name: 'AbortError',
  });
  for (let attempt = 0; attempt < FRAME_CONCURRENCY; attempt += 1) {
    queue({ error: abort, code: null, signal: 'SIGTERM' });
    const controller = new AbortController();
    const frame = extractFrame('video.mp4', 1, { signal: controller.signal });
    controller.abort();
    await rejects(frame, ERR_ABORTED);
  }

  queue(PROBE_OK(), FRAME_OK());
  await takeFrame();
  assert.equal(spawnQueue.length, 0);
});

test('a finished frame removes its directory and frees the slot', async () => {
  const before = created.length;
  queue(PROBE_OK(), FRAME_OK());
  const frame = await takeFrame();

  assert.equal(frame.data.toString(), 'jpeg-bytes');
  assert.equal(frame.duration, 12.5);
  assert.equal(created.length, before + 1);
  const dir = created[created.length - 1];
  assert.equal(removed[removed.length - 1], dir);
  assert.equal(fs.existsSync(dir), false);

  queue(PROBE_OK(), FRAME_OK());
  await takeFrame();
  assert.equal(spawnQueue.length, 0);
});

test('a cleanup that fails does not take the slot with it', async () => {
  removeFails = FRAME_CONCURRENCY;
  for (let attempt = 0; attempt < FRAME_CONCURRENCY; attempt += 1) {
    queue(PROBE_OK(), FRAME_OK());
    await takeFrame().catch(() => {});
  }
  assert.equal(removeFails, 0);

  queue(PROBE_OK(), FRAME_OK());
  await takeFrame();
  assert.equal(spawnQueue.length, 0);
});

test('two frames at a time is still the limit', async () => {
  const held = [];
  const pending = [];
  for (let slot = 0; slot < FRAME_CONCURRENCY; slot += 1) {
    const plan = { ...PROBE_OK(), hold: true };
    held.push(plan);
    queue(plan);
    pending.push(takeFrame());
  }

  await rejects(takeFrame(), ERR_BUSY);

  for (const plan of held) {
    plan.code = 1;
    plan.release();
  }
  for (const promise of pending) {
    await rejects(promise, ERR_INVALID);
  }

  queue(PROBE_OK(), FRAME_OK());
  await takeFrame();
  assert.equal(spawnQueue.length, 0);
});

// Каталоги удаляются только те, что создал этот файл, и только по записанным путям:
// после отказа уборки они остаются на диске.
after(() => {
  for (const dir of created) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
