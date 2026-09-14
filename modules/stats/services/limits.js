const fs = require('fs');
const os = require('os');

const {
  mediaTypes,
  getUploadLimit,
  REQUEST_BODY_LIMIT,
} = require('../../../config/media');
const { getStorageStats } = require('./storage');

const NGINX_BODY_SIZE_ENV = 'NGINX_CLIENT_MAX_BODY_SIZE';

const CGROUP_V2_MEMORY_MAX = '/sys/fs/cgroup/memory.max';
const CGROUP_V1_MEMORY_LIMIT = '/sys/fs/cgroup/memory/memory.limit_in_bytes';
// «Без ограничения» cgroup v1 пишет числом около 2^63 (кратным странице).
const CGROUP_V1_UNLIMITED = 2 ** 62;

const UPLOAD_MEMORY_FACTOR = 2;
const UPLOAD_MEMORY_HINT =
  'Загрузка держит файл в памяти целиком, на пике — около двух его размеров: замер 22.08.2026 — файл 318,8 МБ, пик RSS 758 МБ.';

const NGINX_UNITS = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };

// Синтаксис размера nginx: число и необязательные k, m или g; 0 выключает проверку.
function parseNginxSize(raw) {
  const match = /^(\d+)([kmg]?)$/i.exec(String(raw).trim());
  if (!match) {
    return null;
  }

  return Number(match[1]) * NGINX_UNITS[match[2].toLowerCase()];
}

function nginxLimit(env = process.env) {
  const raw = env[NGINX_BODY_SIZE_ENV];
  if (typeof raw !== 'string' || raw.trim() === '') {
    return {
      value: null,
      bytes: null,
      unlimited: false,
      source: 'unknown',
      env: NGINX_BODY_SIZE_ENV,
    };
  }

  const bytes = parseNginxSize(raw);

  return {
    value: raw.trim(),
    bytes,
    unlimited: bytes === 0,
    source: 'env',
    env: NGINX_BODY_SIZE_ENV,
  };
}

// v2 и v1 — содержимое memory.max и memory.limit_in_bytes, undefined — файла нет.
function parseCgroupMemory({ v2, v1 } = {}) {
  if (typeof v2 === 'string') {
    const text = v2.trim();
    if (text === 'max') {
      return { bytes: null, unlimited: true, source: 'cgroup', file: CGROUP_V2_MEMORY_MAX };
    }
    if (/^\d+$/.test(text)) {
      return { bytes: Number(text), unlimited: false, source: 'cgroup', file: CGROUP_V2_MEMORY_MAX };
    }
  }
  if (typeof v1 === 'string' && /^\d+$/.test(v1.trim())) {
    const bytes = Number(v1.trim());

    return bytes >= CGROUP_V1_UNLIMITED
      ? { bytes: null, unlimited: true, source: 'cgroup', file: CGROUP_V1_MEMORY_LIMIT }
      : { bytes, unlimited: false, source: 'cgroup', file: CGROUP_V1_MEMORY_LIMIT };
  }

  return { bytes: null, unlimited: false, source: 'unknown' };
}

function readOptional(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

function memoryLimits() {
  return {
    limit: parseCgroupMemory({
      v2: readOptional(CGROUP_V2_MEMORY_MAX),
      v1: readOptional(CGROUP_V1_MEMORY_LIMIT),
    }),
    // В контейнере это память хоста, а не контейнера.
    host: { bytes: os.totalmem(), source: 'os' },
    uploadFactor: UPLOAD_MEMORY_FACTOR,
    hint: UPLOAD_MEMORY_HINT,
  };
}

async function storageLimits() {
  try {
    const stats = await getStorageStats();

    return { free: stats.fs.free, total: stats.fs.total, source: 'mongo' };
  } catch (error) {
    console.error('[limits] storage stats failed', error);
    return { free: null, total: null, source: 'unknown' };
  }
}

async function getLimitsReport() {
  const upload = Object.fromEntries(
    mediaTypes.map((type) => [type, { bytes: getUploadLimit(type), source: 'code' }])
  );

  return {
    nginx: nginxLimit(),
    upload,
    requestBody: { bytes: REQUEST_BODY_LIMIT, source: 'code' },
    memory: memoryLimits(),
    storage: await storageLimits(),
  };
}

module.exports = {
  NGINX_BODY_SIZE_ENV,
  parseNginxSize,
  nginxLimit,
  parseCgroupMemory,
  getLimitsReport,
};
