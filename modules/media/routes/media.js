const express = require('express');
const {
  authenticateToken,
  checkOperation,
  // accessControl,
} = require('../../auth/middlewares/auth');
const { createMediaController } = require('../controllers/Media');
const {
  OPERATION_UPLOAD,
  OPERATION_DOWNLOAD_AND_SAVE,
  OPERATION_DELETE,
} = require('../../../config/media');

function createMediaRouter(contentType) {
  const controller = createMediaController(contentType);
  const router = express.Router();

  router.post(
    '/upload',
    authenticateToken,
    // accessControl,
    checkOperation(OPERATION_UPLOAD),
    controller.uploadMedia
  );

  router.post(
    '/download-and-save',
    authenticateToken,
    // accessControl,
    checkOperation(OPERATION_DOWNLOAD_AND_SAVE),
    controller.downloadAndSaveMedia
  );

  // Отдача без токена — намеренно: файл читает браузер по прямой ссылке.
  router.get('/:filename', controller.getMedia);

  router.delete(
    '/:id',
    authenticateToken,
    checkOperation(OPERATION_DELETE),
    controller.removeMedia
  );

  // Add specific routes if needed
  // For example, router.get('/:filename/fragment', controller.getMediaFragment);

  return router;
}

module.exports = { createMediaRouter };
