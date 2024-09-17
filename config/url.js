const PORT = process.env.PORT || 3003;
const AUDIO_PORT = process.env.AUDIO_PORT || 3010;
const MEDIA_PORT = process.env.MEDIA_PORT || 3011;
const HOST = process.env.HOST || `http://localhost:${PORT}`;
const AUDIO_HOST = process.env.AUDIO_HOST || `http://localhost:${AUDIO_PORT}`;
const MEDIA_HOST = process.env.MEDIA_HOST || `http://localhost:${MEDIA_PORT}`;

module.exports = {
  PORT,
  HOST,
  AUDIO_HOST,
  MEDIA_HOST,
};
