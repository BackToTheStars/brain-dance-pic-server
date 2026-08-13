const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const {
  saveFileToGridFS,
  downloadFileFromGridFS,
  getFileInfo,
  removeFileFromGridFS,
} = require('../services/gridFs');
const { getMediaModel } = require('../models/Media');
const {
  getMimeType,
  hasMimeType,
  getUploadLimit,
} = require('../../../config/media');
const { MEDIA_HOST } = require('../../../config/url');

// Wikimedia и ряд CDN отдают 403 на запросы без осмысленного User-Agent
// (их User-Agent policy). Задаём описательный UA для серверного скачивания.
const DOWNLOAD_USER_AGENT =
  process.env.DOWNLOAD_USER_AGENT ||
  'BrainDanceMediaBot/1.0 (+https://brain-dance.net)';

const storage = multer.memoryStorage();

const toMb = (bytes) => Math.round(bytes / (1024 * 1024));

// multer отдаёт LIMIT_FILE_SIZE обычной ошибкой без statusCode, и клиент получил бы
// невнятную 500 «На сервере произошла ошибка» — переводим её в 413 с размером лимита.
function createUploadMiddleware(contentType) {
  const limit = getUploadLimit(contentType);
  const upload = multer({ storage, limits: { fileSize: limit } });

  return (req, res, next) =>
    upload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          message: `Файл больше допустимого размера (${toMb(limit)} МБ).`,
        });
      }
      next(err);
    });
}

function getExtension(filename) {
  return filename.split('.').pop();
}

// Расширение из URL: берём из pathname, чтобы query-строка (?token=...) не попадала
// в расширение. При невалидном/относительном URL — откат на обычный разбор строки.
function getExtensionFromUrl(mediaUrl) {
  try {
    return getExtension(new URL(mediaUrl).pathname);
  } catch {
    return getExtension(mediaUrl);
  }
}

function createMediaController(contentType) {
  const Media = getMediaModel(contentType);

  async function uploadMedia(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
      }
      const { originalname, buffer } = req.file;
      const extension = getExtension(originalname);
      // Расширение проверяем так же, как в download-and-save: раньше upload принимал
      // любой файл, а mimetype брался из запроса (то есть от клиента) и потом отдавался
      // в Content-Type. Теперь тип определяется только нашей таблицей.
      if (!hasMimeType(contentType, extension)) {
        return res.status(400).json({ message: 'Unsupported media type.' });
      }
      const filename = `${uuidv4()}.${extension}`;
      const mimetype = getMimeType(contentType, extension);

      const metadata = {
        ...req.body.metadata,
        mimetype,
        originalname,
        uploader: req.user ? req.user.id : null, // If authentication is used
      };

      // Save file to GridFS
      await saveFileToGridFS(contentType, buffer, filename, metadata);

      // Save metadata to MongoDB
      const media = new Media({
        filename,
        metadata,
        contentType: mimetype,
      });

      await media.save();

      res.json({
        src: `${MEDIA_HOST}/${contentType}/${filename}`,
        item: {
          _id: media._id,
          filename,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: 'An error occurred during upload.',
        error: error.message,
      });
    }
  }

  async function downloadAndSaveMedia(req, res) {
    try {
      const { mediaUrl, metadata } = req.body;

      if (!mediaUrl) {
        return res.status(400).json({ message: 'No media URL provided.' });
      }

      const extension = getExtensionFromUrl(mediaUrl);
      const filename = `${uuidv4()}.${extension}`;
      if (!hasMimeType(contentType, extension)) {
        return res.status(400).json({
          message: 'Unsupported media type.',
        });
      }
      const mimetype = getMimeType(contentType, extension);

      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': DOWNLOAD_USER_AGENT,
          Accept: '*/*',
        },
      });
      const buffer = Buffer.from(response.data);

      const fileMetadata = {
        ...metadata,
        mimetype,
        originalUrl: mediaUrl,
        downloader: req.user ? req.user.id : null,
      };

      await saveFileToGridFS(contentType, buffer, filename, fileMetadata);

      // Save metadata to MongoDB
      const media = new Media({
        filename,
        metadata: fileMetadata,
        contentType: mimetype,
      });

      await media.save();

      res.json({
        src: `${MEDIA_HOST}/${contentType}/${filename}`,
        item: {
          _id: media._id,
          filename
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: 'An error occurred during download and save.',
        error: error.message,
      });
    }
  }

  async function getMedia(req, res) {
    try {
      const { filename } = req.params;
      const range = req.headers.range;

      // Get file info from MongoDB
      const media = await Media.findOne({ filename });
      if (!media) {
        return res.status(404).send('File not found');
      }

      // Access control logic can be added here

      // Get file info from GridFS
      const files = await getFileInfo(contentType, filename);
      if (!files || files.length === 0) {
        return res.status(404).send('File not found in storage');
      }

      const file = files[0];
      const fileSize = file.length;
      const contentTypeHeader = media.contentType;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize) {
          res.status(416).send('Requested range not satisfiable');
          return;
        }

        const chunksize = end - start + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentTypeHeader,
        });

        const downloadStream = downloadFileFromGridFS(
          contentType,
          filename,
          start,
          end + 1
        );
        downloadStream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentTypeHeader,
          // без этого заголовка pdf.js считает, что сервер не умеет диапазоны,
          // и качает весь документ целиком вместо ленивой подгрузки страниц
          'Accept-Ranges': 'bytes',
        });
        const downloadStream = downloadFileFromGridFS(contentType, filename);
        downloadStream.pipe(res);
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: 'An error occurred during download.',
        error: error.message,
      });
    }
  }

  async function removeMedia(req, res) {
    try {
      const { id } = req.params;

      const media = await Media.findById(id);

      if (!media) {
        return res.status(404).json({ message: 'Media not found' });
      }
      const files = await getFileInfo(contentType, media.filename);
      if (!files || files.length === 0) {
        return res.status(404).send('File not found in storage');
      }

      const file = files[0];
      // Получаем информацию о файле
      await removeFileFromGridFS(contentType, file._id);

      // Удаляем метаданные из MongoDB
      await Media.findByIdAndDelete(id);

      res.json({ message: 'Media removed successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: 'An error occurred during removal.',
        error: error.message,
      });
    }
  }

  // Placeholder for specific operations per media type
  // For example, getAudioFragment for audio, getVideoFragment for video

  return {
    uploadMedia: [createUploadMiddleware(contentType), uploadMedia],
    downloadAndSaveMedia,
    getMedia,
    removeMedia,
    // Add other methods as needed
  };
}

module.exports = {
  createMediaController,
};
