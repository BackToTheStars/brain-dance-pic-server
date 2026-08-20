const express = require('express');

const {
  authenticateToken,
  checkOperation,
} = require('../../auth/middlewares/auth');
const { probeVideo, downloadVideo } = require('../controllers/Youtube');
const { OPERATION_YOUTUBE } = require('../../../config/media');

function createYoutubeRouter() {
  const router = express.Router();

  router.post(
    '/probe',
    authenticateToken,
    checkOperation(OPERATION_YOUTUBE),
    probeVideo
  );

  router.post(
    '/download',
    authenticateToken,
    checkOperation(OPERATION_YOUTUBE),
    downloadVideo
  );

  return router;
}

module.exports = { createYoutubeRouter };
