const OPERATION_UPLOAD = 'upload';
const OPERATION_DELETE = 'delete';
const OPERATION_DOWNLOAD_AND_SAVE = 'download_and_save';

const mediaTypes = ['audios', 'videos', 'images'];

const dMediaTypes = {
  audios: {
    mimeTypes: {
      mp3: 'audio/mpeg',
    },
  },
  videos: {
    mimeTypes: {
      mp4: 'video/mp4',
    },
  },
  images: {
    mimeTypes: {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
    },
  },
};

const mimeTypes = mediaTypes.reduce((acc, type) => {
  return {
    ...acc,
    ...dMediaTypes[type].mimeTypes,
  };
}, {});

const getMimeType = (extension) => {
  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
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
