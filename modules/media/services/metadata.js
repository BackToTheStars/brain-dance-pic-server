// Игру ставит только токен или проход по игре файлов (с меткой gameBackfill), прежнее имя —
// только scripts/names.js; uploader и downloader — мёртвые ключи. Из тела эти ключи не берутся.
const RESERVED_KEYS = [
  'gameId',
  'gameHash',
  'gameBackfill',
  'originalnameLatin1',
  'uploader',
  'downloader',
];

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Игра берётся только из токена: тело запроса шлёт кто угодно, токен подписан сервером.
// Пара пишется целиком либо не пишется вовсе: файл с одним gameId не находится по адресу,
// а проход «игра старых файлов» его не чинит — он пишет только туда, где нет обоих ключей.
function gameFromPayload(payload) {
  const gameId = payload?.gameId;
  const hash = payload?.hash;
  if (gameId === undefined || gameId === null || gameId === '') {
    return {};
  }
  if (typeof hash !== 'string' || hash === '') {
    return {};
  }

  return { gameId: String(gameId), gameHash: hash };
}

// Строка вместо объекта (поле формы metadata) раньше раскладывалась по символам.
function buildMetadata(bodyMetadata, payload, own = {}) {
  const metadata = isPlainObject(bodyMetadata) ? { ...bodyMetadata } : {};
  for (const key of RESERVED_KEYS) {
    delete metadata[key];
  }

  return { ...metadata, ...own, ...gameFromPayload(payload) };
}

module.exports = {
  gameFromPayload,
  buildMetadata,
};
