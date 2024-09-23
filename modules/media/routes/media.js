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

  router.get('/:filename', controller.getMedia);
  router.delete('/:id', controller.removeMedia);

  // Add specific routes if needed
  // For example, router.get('/:filename/fragment', controller.getMediaFragment);

  return router;
}

module.exports = { createMediaRouter };
