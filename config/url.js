const MEDIA_PORT = process.env.MEDIA_PORT || 3011;
const MEDIA_HOST = process.env.MEDIA_HOST || `http://localhost:${MEDIA_PORT}`;
// Сам сервис изнутри процесса или контейнера: MEDIA_HOST — публичный адрес.
const MEDIA_LOOPBACK_URL = `http://127.0.0.1:${MEDIA_PORT}`;

module.exports = {
  MEDIA_PORT,
  MEDIA_HOST,
  MEDIA_LOOPBACK_URL,
};
