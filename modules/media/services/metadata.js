// Игру ставит только токен, прежнее имя — только scripts/names.js: из тела эти ключи не берутся.
const RESERVED_KEYS = ['gameId', 'gameHash', 'originalnameLatin1'];

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Игра берётся только из токена: тело запроса шлёт кто угодно, токен подписан сервером.
function gameFromPayload(payload) {
  const gameId = payload?.gameId;
  if (gameId === undefined || gameId === null || gameId === '') {
    return {};
  }

  const game = { gameId: String(gameId) };
  if (typeof payload.hash === 'string' && payload.hash !== '') {
    game.gameHash = payload.hash;
  }

  return game;
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
