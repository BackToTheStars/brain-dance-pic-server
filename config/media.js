const OPERATION_UPLOAD = 'upload';
const OPERATION_DELETE = 'delete';
const OPERATION_DOWNLOAD_AND_SAVE = 'download_and_save';

const mediaTypes = ['audios', 'videos', 'images'];

const dMediaTypes = {
  audios: {
    mimeTypes: {
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      webm: 'audio/webm',
    },
  },
  videos: {
    mimeTypes: {
      mp4: 'video/mp4',
      webm: 'video/webm',
      ogg: 'video/ogg',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
    },
  },
  images: {
    mimeTypes: {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
    },
  },
};

const getMimeType = (contentType, extension) => {
  return (
    dMediaTypes[contentType].mimeTypes[extension.toLowerCase()] ||
    'application/octet-stream'
  );
};

const hasMimeType = (mediaType, extension) => {
  return dMediaTypes[mediaType].mimeTypes.hasOwnProperty(
    extension.toLowerCase()
  );
};

module.exports = {
  OPERATION_UPLOAD,
  OPERATION_DELETE,
  OPERATION_DOWNLOAD_AND_SAVE,
  mediaTypes,
  getMimeType,
  hasMimeType,
};
