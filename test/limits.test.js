const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseNginxSize,
  nginxLimit,
  parseCgroupMemory,
} = require('../modules/stats/services/limits');

test('nginx sizes follow the nginx syntax', () => {
  assert.equal(parseNginxSize('350m'), 350 * 1024 * 1024);
  assert.equal(parseNginxSize('350M'), 350 * 1024 * 1024);
  assert.equal(parseNginxSize('1g'), 1024 ** 3);
  assert.equal(parseNginxSize('512k'), 512 * 1024);
  assert.equal(parseNginxSize('1000'), 1000);
  assert.equal(parseNginxSize(' 20m '), 20 * 1024 * 1024);
  assert.equal(parseNginxSize('0'), 0);
  assert.equal(parseNginxSize('350mb'), null);
  assert.equal(parseNginxSize('1.5m'), null);
  assert.equal(parseNginxSize('m'), null);
  assert.equal(parseNginxSize(''), null);
});

test('nginx limit: unset is unknown, never a guessed number', () => {
  for (const env of [{}, { NGINX_CLIENT_MAX_BODY_SIZE: '' }, { NGINX_CLIENT_MAX_BODY_SIZE: '  ' }]) {
    assert.deepEqual(nginxLimit(env), {
      value: null,
      bytes: null,
      unlimited: false,
      source: 'unknown',
      env: 'NGINX_CLIENT_MAX_BODY_SIZE',
    });
  }
});

test('nginx limit from env: value as written, bytes, off switch, unparsable', () => {
  assert.deepEqual(nginxLimit({ NGINX_CLIENT_MAX_BODY_SIZE: '350m' }), {
    value: '350m',
    bytes: 350 * 1024 * 1024,
    unlimited: false,
    source: 'env',
    env: 'NGINX_CLIENT_MAX_BODY_SIZE',
  });
  assert.equal(nginxLimit({ NGINX_CLIENT_MAX_BODY_SIZE: '0' }).unlimited, true);
  const bad = nginxLimit({ NGINX_CLIENT_MAX_BODY_SIZE: '350mb' });
  assert.equal(bad.value, '350mb');
  assert.equal(bad.bytes, null);
  assert.equal(bad.source, 'env');
});

test('cgroup v2: a number is the limit, max is unlimited', () => {
  assert.deepEqual(parseCgroupMemory({ v2: '536870912\n' }), {
    bytes: 536870912,
    unlimited: false,
    source: 'cgroup',
    file: '/sys/fs/cgroup/memory.max',
  });
  assert.deepEqual(parseCgroupMemory({ v2: 'max\n' }), {
    bytes: null,
    unlimited: true,
    source: 'cgroup',
    file: '/sys/fs/cgroup/memory.max',
  });
});

test('cgroup v1: a number is the limit, the huge sentinel is unlimited', () => {
  assert.deepEqual(parseCgroupMemory({ v1: '1073741824\n' }), {
    bytes: 1073741824,
    unlimited: false,
    source: 'cgroup',
    file: '/sys/fs/cgroup/memory/memory.limit_in_bytes',
  });
  assert.deepEqual(parseCgroupMemory({ v1: '9223372036854771712\n' }), {
    bytes: null,
    unlimited: true,
    source: 'cgroup',
    file: '/sys/fs/cgroup/memory/memory.limit_in_bytes',
  });
});

test('cgroup v2 wins over v1; no files or garbage is unknown', () => {
  assert.equal(parseCgroupMemory({ v2: '1000', v1: '2000' }).bytes, 1000);
  assert.equal(parseCgroupMemory({ v2: 'garbage', v1: '2000' }).bytes, 2000);
  const unknown = { bytes: null, unlimited: false, source: 'unknown' };
  assert.deepEqual(parseCgroupMemory({}), unknown);
  assert.deepEqual(parseCgroupMemory(), unknown);
  assert.deepEqual(parseCgroupMemory({ v2: '', v1: 'x' }), unknown);
});
