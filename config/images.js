const maxImageSize = 10000000;
const validMimeTypes = ['image/png', 'image/jpeg', 'image/jpg'];

const OPERATION_UPLOAD = 'upload';
const OPERATION_DELETE = 'delete';

module.exports = {
  maxImageSize,
  validMimeTypes,
  OPERATION_UPLOAD,
  OPERATION_DELETE,
};
