const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const {
  downloadFileFromGridFS,
  getFileInfo,
  getNewestFile,
  removeFileFromGridFS,
} = require('../services/gridFs');
const { getMediaModel } = require('../models/Media');
const { storeMedia, NAME_TAKEN } = require('../services/store');
const { buildMetadata } = require('../services/metadata');
const { parseRange } = require('../services/range');
const {
  isInternalRead,
  isViewStart,
  trackAccess,
} = require('../services/access');
const {
  getMimeType,
  hasMimeType,
  getUploadLimit,
  tooLargeMessage,
} = require('../../../config/media');
const { MEDIA_HOST } = require('../../../config/url');
const {
  HTTP_HEAD_TIMEOUT,
  HTTP_DOWNLOAD_TIMEOUT,
} = require('../../../config/timeouts');

// Wikimedia и ряд CDN отдают 403 на запросы без осмысленного User-Agent
// (их User-Agent policy). Задаём описательный UA для серверного скачивания.
const DOWNLOAD_USER_AGENT =
  process.env.DOWNLOAD_USER_AGENT ||
  'BrainDanceMediaBot/1.0 (+https://brain-dance.net)';

const storage = multer.memoryStorage();

// Превышение maxContentLength axios отдаёт обычной ERR_BAD_RESPONSE — тем же кодом,
// что и прочие сетевые сбои, поэтому опознаём её ещё и по тексту сообщения.
// ERR_FR_MAX_BODY_LENGTH_EXCEEDED приходит из follow-redirects (maxBodyLength).
const isTooLargeError = (error) =>
  error?.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' ||
  (error?.code === 'ERR_BAD_RESPONSE' &&
    /maxContentLength/.test(error?.message || ''));

// multer отдаёт LIMIT_FILE_SIZE обычной ошибкой без statusCode, и клиент получил бы
// невнятную 500 «На сервере произошла ошибка» — переводим её в 413 с размером лимита.
function createUploadMiddleware(contentType) {
  const limit = getUploadLimit(contentType);
  // Браузеры шлют имя файла байтами UTF-8, а multer по умолчанию читает его как latin1.
  const upload = multer({
    storage,
    limits: { fileSize: limit },
    defParamCharset: 'utf8',
  });

  return (req, res, next) =>
    upload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: tooLargeMessage(limit) });
      }
      next(err);
    });
}

// Размер до скачивания: HEAD позволяет отказать, не потянув файл вовсе.
// Часть серверов не отвечает на HEAD или не отдаёт Content-Length — тогда
// возвращаем null и полагаемся на maxContentLength у самого GET.
async function getRemoteContentLength(mediaUrl) {
  try {
    const response = await axios.head(mediaUrl, {
      headers: {
        'User-Agent': DOWNLOAD_USER_AGENT,
        Accept: '*/*',
      },
      timeout: HTTP_HEAD_TIMEOUT,
    });
    const length = Number(response.headers['content-length']);

    return Number.isFinite(length) && length >= 0 ? length : null;
  } catch {
    return null;
  }
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

      const metadata = buildMetadata(req.body?.metadata, req.payload, {
        mimetype,
        originalname,
      });

      const media = await storeMedia(contentType, {
        filename,
        mimetype,
        metadata,
        data: buffer,
      });

      res.json({
        src: `${MEDIA_HOST}/${contentType}/${filename}`,
        item: {
          _id: media._id,
          filename,
        },
      });
    } catch (error) {
      if (error.code === NAME_TAKEN) {
        return res.status(409).json({ message: 'File name is already taken.' });
      }
      // Наружу — общая фраза: в error.message попадают внутренние подробности
      // (имя хоста mongo, путь, устройство схемы). Причина остаётся в логе.
      console.error(error);
      res.status(500).json({
        message: 'An error occurred during upload.',
      });
    }
  }

  async function downloadAndSaveMedia(req, res) {
    try {
      const { mediaUrl, metadata } = req.body || {};

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

      // Этот путь идёт мимо multer, то есть мимо его limits.fileSize. Файл так же
      // целиком буферизуется в памяти, поэтому потолок нужен и здесь: сначала по
      // Content-Length (если сервер его отдал), затем — на самом скачивании.
      const limit = getUploadLimit(contentType);
      const contentLength = await getRemoteContentLength(mediaUrl);
      if (contentLength !== null && contentLength > limit) {
        return res.status(413).json({ message: tooLargeMessage(limit) });
      }

      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': DOWNLOAD_USER_AGENT,
          Accept: '*/*',
        },
        maxContentLength: limit,
        maxBodyLength: limit,
        timeout: HTTP_DOWNLOAD_TIMEOUT,
      });
      const buffer = Buffer.from(response.data);

      const fileMetadata = buildMetadata(metadata, req.payload, {
        mimetype,
        originalUrl: mediaUrl,
      });

      const media = await storeMedia(contentType, {
        filename,
        mimetype,
        metadata: fileMetadata,
        data: buffer,
      });

      res.json({
        src: `${MEDIA_HOST}/${contentType}/${filename}`,
        item: {
          _id: media._id,
          filename
        },
      });
    } catch (error) {
      if (isTooLargeError(error)) {
        return res.status(413).json({
          message: tooLargeMessage(getUploadLimit(contentType)),
        });
      }
      if (error.code === NAME_TAKEN) {
        return res.status(409).json({ message: 'File name is already taken.' });
      }
      console.error(error);
      res.status(500).json({
        message: 'An error occurred during download and save.',
      });
    }
  }

  async function getMedia(req, res) {
    try {
      const { filename } = req.params;

      // Get file info from MongoDB
      const media = await Media.findOne({ filename });
      if (!media) {
        return res.status(404).send('File not found');
      }

      // Access control logic can be added here

      const file = await getNewestFile(contentType, filename);
      if (!file) {
        return res.status(404).send('File not found in storage');
      }

      const fileSize = file.length;
      const contentTypeHeader = media.contentType;
      const range = parseRange(req.headers.range, fileSize);

      // Учёт обращений — только начало просмотра и только
      // после того, как файл найден: запись без файла спросом не считается.
      // Ответа не ждём и на ошибке записи отдачу не роняем — счётчик здесь
      // побочная телеметрия, а не часть отдачи файла.
      if (isViewStart(range) && !isInternalRead(req)) {
        trackAccess(Media, media._id).catch((error) => {
          console.error('access tracking failed', error);
        });
      }

      // Поток GridFS падает уже после того, как файл найден в описи: запись
      // удалили между проверкой и чтением, или у неё не хватает чанков. Без
      // этого обработчика Node считает ошибку потока неперехваченной и убивает
      // процесс — один запрос к пропавшему файлу ронял отдачу всем сразу.
      const pipeToResponse = (downloadStream) => {
        downloadStream.on('error', (error) => {
          console.error(`download stream failed for ${filename}`, error);
          if (!res.headersSent) {
            const notFound = error.code === 'ENOENT';
            res.status(notFound ? 404 : 500).json({
              message: notFound
                ? 'File not found in storage'
                : 'An error occurred during download.',
            });
            return;
          }
          // Заголовки уже ушли, статус не поменять: рвём ответ, чтобы клиент
          // увидел обрыв, а не принял усечённый файл за целый.
          res.destroy(error);
        });
        // Брошенный клиентом ответ (перемотка, отменённый Range) без abort держит курсор
        // GridFS с пачкой чанков: замер — около 16 МБ памяти на каждый обрыв.
        res.on('close', () => {
          if (!downloadStream.readableEnded) {
            downloadStream.abort().catch(() => {});
          }
        });
        downloadStream.pipe(res);
      };

      if (range.kind === 'unsatisfiable') {
        res
          .status(416)
          .set('Content-Range', `bytes */${fileSize}`)
          .send('Requested range not satisfiable');
        return;
      }

      if (range.kind === 'partial') {
        const { start, end } = range;
        const chunksize = end - start + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentTypeHeader,
        });

        pipeToResponse(
          downloadFileFromGridFS(contentType, file._id, start, end + 1)
        );
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentTypeHeader,
          // без этого заголовка pdf.js считает, что сервер не умеет диапазоны,
          // и качает весь документ целиком вместо ленивой подгрузки страниц
          'Accept-Ranges': 'bytes',
        });
        pipeToResponse(downloadFileFromGridFS(contentType, file._id));
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: 'An error occurred during download.',
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

      // Файл мог исчезнуть из GridFS ручной чисткой или сбоем.
      if (!files || files.length === 0) {
        await Media.findByIdAndDelete(id);

        return res.json({
          message: 'Media removed successfully',
          fileMissing: true,
        });
      }

      // Все одноимённые версии: оставшаяся без записи стала бы сиротой.
      for (const file of files) {
        await removeFileFromGridFS(contentType, file._id);
      }

      await Media.findByIdAndDelete(id);

      res.json({ message: 'Media removed successfully', fileMissing: false });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: 'An error occurred during removal.',
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
