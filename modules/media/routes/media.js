const express = require('express');
const {
  authenticateToken,
  checkOperation,
  // accessControl,
} = require('../../auth/middlewares/auth');
const { createMediaController } = require('../controllers/Media');
const { previewFrame, saveFrame } = require('../controllers/Frame');
const {
  OPERATION_UPLOAD,
  OPERATION_DOWNLOAD_AND_SAVE,
  OPERATION_DELETE,
  OPERATION_FRAME,
  OPERATION_FRAME_SAVE,
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

  if (contentType === 'videos') {
    router.get(
      '/:filename/frame',
      authenticateToken,
      checkOperation(OPERATION_FRAME),
      previewFrame
    );
    router.post(
      '/:filename/frame',
      authenticateToken,
      checkOperation(OPERATION_FRAME_SAVE),
      saveFrame
    );
  }

  return router;
}

module.exports = { createMediaRouter };
