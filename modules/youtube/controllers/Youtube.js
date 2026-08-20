const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { saveStreamToGridFS } = require('../../media/services/gridFs');
const { getMediaModel } = require('../../media/models/Media');
const {
  getMimeType,
  hasMimeType,
  getUploadLimit,
  tooLargeMessage,
} = require('../../../config/media');
const { MEDIA_HOST } = require('../../../config/url');
const {
  ERR_INVALID,
  ERR_TOO_LARGE,
  ERR_TIMEOUT,
  ERR_ABORTED,
  ERR_FAILED,
  probe,
  download,
  cleanupDownload,
} = require('../services/ytdlp');

// Видео с YouTube ложится в общий видео-бакет: для остального сервиса это
// обычное видео, отличает его только originalUrl в метаданных.
const CONTENT_TYPE = 'videos';

const Media = getMediaModel(CONTENT_TYPE);

// Ошибки слоя → HTTP. Сам слой про статусы не знает.
function respondError(res, error) {
  // Соединение уже закрыто клиентом — отвечать некому.
  if (res.writableEnded || !res.writable) {
    return;
  }

  switch (error.code) {
    case ERR_INVALID:
      return res.status(400).json({ message: error.message });
    case ERR_TOO_LARGE:
      return res
        .status(413)
        .json({ message: tooLargeMessage(getUploadLimit(CONTENT_TYPE)) });
    case ERR_TIMEOUT:
      return res.status(504).json({ message: error.message });
    case ERR_ABORTED:
      return;
    case ERR_FAILED:
      return res.status(502).json({ message: error.message });
    default:
      console.error(error);
      return res.status(500).json({
        message: 'An error occurred during the youtube operation.',
        error: error.message,
      });
  }
}

async function probeVideo(req, res) {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ message: 'No video URL provided.' });
    }

    const info = await probe(url);
    const limit = getUploadLimit(CONTENT_TYPE);

    res.json({
      title: info.title,
      duration: info.duration,
      // Форматы больше лимита из ответа не убираем: показывать их или нет —
      // решение UI, media только помечает. Формат с неизвестным размером
      // непомечен: влезет он или нет, выяснится на скачивании.
      formats: info.formats.map((format) => ({
        ...format,
        tooLarge: format.filesize !== null && format.filesize > limit,
      })),
    });
  } catch (error) {
    respondError(res, error);
  }
}

async function downloadVideo(req, res) {
  const limit = getUploadLimit(CONTENT_TYPE);
  let tmpPath = null;

  // Клиент может закрыть соединение посреди скачивания — тогда yt-dlp убиваем
  // сигналом, а временный каталог всё равно снимется в finally.
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      abort.abort();
    }
  });

  try {
    const { url, formatId, metadata } = req.body;
    if (!url) {
      return res.status(400).json({ message: 'No video URL provided.' });
    }
    if (!formatId) {
      return res.status(400).json({ message: 'No format id provided.' });
    }

    // Отдельный probe до скачивания: он и проверяет, что формат существует и
    // progressive, и даёт размер — отказать по лимиту надо до старта.
    const info = await probe(url);
    const format = info.formats.find((item) => item.formatId === String(formatId));
    if (!format) {
      return res.status(400).json({
        message: 'Формат не найден среди progressive-форматов видео.',
      });
    }
    if (format.filesize !== null && format.filesize > limit) {
      return res.status(413).json({ message: tooLargeMessage(limit) });
    }
    if (!format.ext || !hasMimeType(CONTENT_TYPE, format.ext)) {
      return res.status(400).json({ message: 'Unsupported media type.' });
    }

    tmpPath = await download(url, format.formatId, limit, {
      signal: abort.signal,
    });

    if (abort.signal.aborted) {
      return;
    }

    // Расширение берём у скачанного файла, а не у формата: авторитетно то,
    // что реально получилось.
    const extension = path.extname(tmpPath).replace('.', '').toLowerCase();
    if (!hasMimeType(CONTENT_TYPE, extension)) {
      return res.status(400).json({ message: 'Unsupported media type.' });
    }

    const filename = `${uuidv4()}.${extension}`;
    const mimetype = getMimeType(CONTENT_TYPE, extension);
    const fileMetadata = {
      ...metadata,
      mimetype,
      // По исходной ссылке возможен откат: отдельного поля под неё в схеме
      // хода не заводится (BP-4, решение 4).
      originalUrl: url,
      formatId: format.formatId,
      title: info.title,
    };

    // Ровно то, ради чего модуль живёт внутри media: файл уходит в GridFS
    // потоком, расход памяти не зависит от его размера.
    await saveStreamToGridFS(
      CONTENT_TYPE,
      fs.createReadStream(tmpPath),
      filename,
      fileMetadata
    );

    const media = new Media({
      filename,
      metadata: fileMetadata,
      contentType: mimetype,
    });

    await media.save();

    res.json({
      src: `${MEDIA_HOST}/${CONTENT_TYPE}/${filename}`,
      item: {
        _id: media._id,
        filename,
      },
    });
  } catch (error) {
    respondError(res, error);
  } finally {
    // Временный файл снимается всегда: и на успехе, и на любой ошибке, и на
    // обрыве соединения клиентом.
    cleanupDownload(tmpPath);
  }
}

module.exports = {
  probeVideo,
  downloadVideo,
};
