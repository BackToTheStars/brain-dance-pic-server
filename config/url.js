const MEDIA_PORT = process.env.MEDIA_PORT || 3011;
const MEDIA_HOST = process.env.MEDIA_HOST || `http://localhost:${MEDIA_PORT}`;

module.exports = {
  MEDIA_HOST,
};
