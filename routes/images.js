const router = require('express').Router();

const { OPERATION_UPLOAD, OPERATION_DELETE } = require('../config/images');
const { uploadImage, remove, getById } = require('../controllers/images');
const {
  authenticateToken,
  upload,
  checkOperation,
} = require('../middlewares/images');

router.post(
  '/upload',
  authenticateToken,
  upload.single('file'),
  checkOperation(OPERATION_UPLOAD),
  uploadImage
);

router.get('/:id', getById);

router.delete(
  '/:id',
  authenticateToken,
  checkOperation(OPERATION_DELETE),
  remove
);

module.exports = router;
