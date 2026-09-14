const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { FFMPEG_FRAME_TIMEOUT } = require('../../../config/timeouts');
const { MEDIA_LOOPBACK_URL } = require('../../../config/url');
const { INTERNAL_READ_HEADER, INTERNAL_READ_TOKEN } = require('./access');
const { createJobDir, removeJobDir } = require('../../youtube/services/tmp');

const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_BIN || 'ffprobe';

// Замер 14.09.2026: ffmpeg на кадре 1080p с двумя потоками декодера — пик 120–130 МБ.
const FRAME_CONCURRENCY = 2;
const DECODER_THREADS = '2';
const FRAME_MIMETYPE = 'image/jpeg';
const FRAME_SCALE =
  "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease";
const PROBE_OUTPUT_LIMIT = 64 * 1024;

// Загруженный «видеофайл» может оказаться плейлистом со ссылками на локальные файлы и
// чужие адреса: ffmpeg читает только HTTP и только видеоконтейнеры.
const INPUT_GUARD = [
  '-protocol_whitelist',
  'http,tcp',
  '-format_whitelist',
  'mov,mp4,matroska,webm,ogg,avi',
];

const ERR_INVALID = 'FRAME_INVALID';
const ERR_BUSY = 'FRAME_BUSY';
const ERR_TIMEOUT = 'FRAME_TIMEOUT';
const ERR_ABORTED = 'FRAME_ABORTED';
const ERR_FAILED = 'FRAME_FAILED';

const frameError = (code, message) => Object.assign(new Error(message), { code });

let running = 0;

// Секунды: число или строка из цифр с необязательной дробной частью; точность — мс.
function parseFrameTime(value) {
  let number = null;
  if (typeof value === 'number') {
    number = value;
  } else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) {
    number = Number(value.trim());
  }
  if (number === null || !Number.isFinite(number) || number < 0) {
    return null;
  }

  return Math.round(number * 1000) / 1000;
}

function frameOriginalname(videoFilename, videoMetadata, t) {
  const { originalname, title } = videoMetadata || {};
  let base = path.parse(videoFilename).name;
  if (typeof originalname === 'string' && originalname) {
    base = path.parse(originalname).name;
  } else if (typeof title === 'string' && title) {
    base = title;
  }

  return `${base}-frame-${t}.jpg`;
}

// Процесс снимается по таймауту и по signal; промис решается только на close, чтобы
// каталог задания удалялся, когда файл уже никто не держит.
function runTool(bin, args, signal) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, args, {
        timeout: FFMPEG_FRAME_TIMEOUT,
        killSignal: 'SIGKILL',
        signal,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      return reject(frameError(ERR_FAILED, error.message));
    }

    const stdout = [];
    let stdoutBytes = 0;
    let stderr = '';
    let aborted = false;

    child.stdout.on('data', (chunk) => {
      if (stdoutBytes < PROBE_OUTPUT_LIMIT) {
        stdout.push(chunk);
        stdoutBytes += chunk.length;
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-2000);
    });

    child.on('error', (error) => {
      if (error.name === 'AbortError') {
        aborted = true;
        return;
      }
      if (error.code === 'ENOENT') {
        return reject(
          frameError(
            ERR_FAILED,
            `${bin} не найден. В образе он ставится пакетом ffmpeg, локально — на PATH или через FFMPEG_BIN / FFPROBE_BIN.`
          )
        );
      }
      reject(frameError(ERR_FAILED, error.message));
    });

    child.on('close', (code, closeSignal) => {
      if (aborted) {
        return reject(frameError(ERR_ABORTED, 'Запрос кадра отменён.'));
      }
      if (closeSignal) {
        return reject(
          frameError(
            ERR_TIMEOUT,
            `Кадр не снят за ${Math.round(FFMPEG_FRAME_TIMEOUT / 1000)} с.`
          )
        );
      }
      resolve({ code, stdout: Buffer.concat(stdout).toString('utf8'), stderr });
    });
  });
}

const internalReadHeaders = () => [
  '-headers',
  `${INTERNAL_READ_HEADER}: ${INTERNAL_READ_TOKEN}\r\n`,
];

async function probeVideo(url, signal) {
  const { code, stdout, stderr } = await runTool(
    FFPROBE_BIN,
    [
      '-v', 'error',
      ...INPUT_GUARD,
      ...internalReadHeaders(),
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_type:format=duration',
      '-of', 'json',
      url,
    ],
    signal
  );
  if (code !== 0) {
    console.error(`[frame] ffprobe exited with ${code}: ${stderr}`);
    throw frameError(ERR_INVALID, 'Файл не читается как видео.');
  }

  let info;
  try {
    info = JSON.parse(stdout);
  } catch {
    throw frameError(ERR_FAILED, 'ffprobe вернул не JSON.');
  }
  if (!Array.isArray(info.streams) || info.streams.length === 0) {
    throw frameError(ERR_INVALID, 'В файле нет видеодорожки.');
  }
  const duration = Number.parseFloat(info.format?.duration);

  return { duration: Number.isFinite(duration) ? duration : null };
}

function frameArgs(url, out, { from, window }) {
  return [
    '-hide_banner', '-nostdin', '-loglevel', 'error',
    ...INPUT_GUARD,
    ...internalReadHeaders(),
    '-threads', DECODER_THREADS,
    '-ss', String(from),
    ...(window ? ['-t', String(window)] : []),
    '-i', url,
    '-map', '0:v:0',
    ...(window ? [] : ['-frames:v', '1']),
    '-vf', FRAME_SCALE,
    '-q:v', '3',
    '-update', '1',
    '-y', out,
  ];
}

function hasFrame(file) {
  try {
    return fs.statSync(file).size > 0;
  } catch {
    return false;
  }
}

// Видео читается по HTTP самого сервиса диапазонами: память и диск не зависят от его размера.
async function extractFrame(filename, t, { signal } = {}) {
  if (running >= FRAME_CONCURRENCY) {
    throw frameError(ERR_BUSY, 'Уже снимаются другие кадры, повторите через несколько секунд.');
  }
  running += 1;
  const dir = createJobDir();

  try {
    const url = `${MEDIA_LOOPBACK_URL}/videos/${encodeURIComponent(filename)}`;
    const { duration } = await probeVideo(url, signal);
    if (duration !== null && t > duration) {
      throw frameError(ERR_INVALID, `t больше длительности видео (${duration} с).`);
    }

    const out = path.join(dir, 'frame.jpg');
    let result = await runTool(FFMPEG_BIN, frameArgs(url, out, { from: t }), signal);
    if (!hasFrame(out)) {
      // Между последним кадром и концом дорожки -ss не находит ничего: берём последний
      // кадр из окна перед t.
      result = await runTool(
        FFMPEG_BIN,
        frameArgs(url, out, { from: Math.max(0, t - 1), window: 1.5 }),
        signal
      );
    }
    if (!hasFrame(out)) {
      console.error(`[frame] no frame in ${filename} at ${t}: ${result.stderr}`);
      throw frameError(ERR_INVALID, `В момент ${t} с в видео нет кадра.`);
    }

    return { duration, mimetype: FRAME_MIMETYPE, data: fs.readFileSync(out) };
  } finally {
    removeJobDir(dir);
    running -= 1;
  }
}

module.exports = {
  FFMPEG_BIN,
  FFPROBE_BIN,
  FRAME_CONCURRENCY,
  ERR_INVALID,
  ERR_BUSY,
  ERR_TIMEOUT,
  ERR_ABORTED,
  ERR_FAILED,
  parseFrameTime,
  frameOriginalname,
  extractFrame,
};
