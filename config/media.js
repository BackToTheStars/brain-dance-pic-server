const OPERATION_UPLOAD = 'upload';
const OPERATION_DELETE = 'delete';
const OPERATION_DOWNLOAD_AND_SAVE = 'download_and_save';
const OPERATION_STATS = 'stats';
const OPERATION_YOUTUBE = 'youtube';
const OPERATION_LIST = 'list';

const mediaTypes = ['audios', 'videos', 'images', 'pdfs'];

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
  pdfs: {
    mimeTypes: {
      pdf: 'application/pdf',
    },
  },
};

// Лимит размера загружаемого файла (multer limits.fileSize). Файл целиком
// буферизуется в памяти (memoryStorage), поэтому лимит — ещё и защита RAM.
// Значение по умолчанию совпадает с лимитом тела запроса в media.js.
const DEFAULT_UPLOAD_LIMIT = 350 * 1024 * 1024;
const UPLOAD_LIMITS = {
  pdfs: 50 * 1024 * 1024,
};

const getUploadLimit = (contentType) =>
  UPLOAD_LIMITS[contentType] || DEFAULT_UPLOAD_LIMIT;

// Б / КБ / МБ. Округление до мегабайт врало на мелких лимитах: при 600 КБ
// отказ читался как «(1 МБ)» (BP-15). Формат общий со scripts/orphans.js —
// он берёт функцию отсюда, чтобы размеры в сервисе выглядели одинаково.
const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
};

// Один текст отказа на все пути загрузки — multer, download-and-save и youtube:
// клиент видит одинаковую формулировку независимо от того, как файл попадал
// на сервер. Живёт рядом с лимитами, чтобы текст и число не разъезжались.
const tooLargeMessage = (limit) =>
  `Файл больше допустимого размера (${formatSize(limit)}).`;

// Учёт обращений: не чаще одной записи на файл за это окно.
// Держим константой, а не полем в базе: поменять окно — это перенастройка,
// а не миграция, и старые значения счётчика от неё не портятся.
const ACCESS_COUNT_WINDOW = 3 * 60 * 1000;

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
  OPERATION_STATS,
  OPERATION_YOUTUBE,
  OPERATION_LIST,
  mediaTypes,
  getMimeType,
  hasMimeType,
  getUploadLimit,
  formatSize,
  tooLargeMessage,
  ACCESS_COUNT_WINDOW,
};
