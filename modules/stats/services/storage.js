const mongoose = require('mongoose');

const { mediaTypes } = require('../../../config/media');

// Разбивка по типам — агрегация по всем документам `<type>.files`, то есть линейна
// по числу файлов. UI дёргает статистику по кнопке, поэтому держим ответ в процессе
// небольшое время: серия кликов не должна упираться в БД.
const STATS_CACHE_TTL = 45 * 1000;

let cached = null; // { expiresAt, promise }

async function collectByType(db) {
  const entries = await Promise.all(
    mediaTypes.map(async (type) => {
      const [row] = await db
        .collection(`${type}.files`)
        .aggregate([
          { $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: '$length' } } },
        ])
        .toArray();

      return [type, { count: row?.count || 0, bytes: row?.bytes || 0 }];
    })
  );

  return Object.fromEntries(entries);
}

async function collectStorageStats() {
  const db = mongoose.connection.db;

  // fsTotalSize/fsUsedSize — файловая система, на которой лежит dbPath mongo,
  // то есть реальный диск сервера. Монтировать хостовые пути в контейнер не нужно.
  const [dbStats, byType] = await Promise.all([
    db.command({ dbStats: 1 }),
    collectByType(db),
  ]);

  const fsTotal = dbStats.fsTotalSize || 0;
  const fsUsed = dbStats.fsUsedSize || 0;

  return {
    fs: {
      total: fsTotal,
      used: fsUsed,
      free: Math.max(fsTotal - fsUsed, 0),
    },
    db: {
      dataSize: dbStats.dataSize || 0,
      storageSize: dbStats.storageSize || 0,
      indexSize: dbStats.indexSize || 0,
    },
    byType,
  };
}

function getStorageStats() {
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  // Кэшируем сам промис, а не результат: параллельные запросы в холодный кэш
  // не должны запускать агрегацию несколько раз.
  const promise = collectStorageStats();
  cached = { expiresAt: now + STATS_CACHE_TTL, promise };

  // Ошибку на весь TTL не кэшируем — следующий клик должен попробовать снова.
  promise.catch(() => {
    if (cached && cached.promise === promise) {
      cached = null;
    }
  });

  return promise;
}

module.exports = {
  STATS_CACHE_TTL,
  getStorageStats,
};
