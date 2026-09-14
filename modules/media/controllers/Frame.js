const { v4: uuidv4 } = require('uuid');

const { getMediaModel } = require('../models/Media');
const { getNewestFile } = require('../services/gridFs');
const { storeMedia, NAME_TAKEN } = require('../services/store');
const { buildMetadata } = require('../services/metadata');
const {
  ERR_INVALID,
  ERR_BUSY,
  ERR_TIMEOUT,
  ERR_ABORTED,
  ERR_FAILED,
  parseFrameTime,
  frameOriginalname,
  extractFrame,
} = require('../services/frame');
const { MEDIA_HOST } = require('../../../config/url');

const VIDEOS = 'videos';
const IMAGES = 'images';

const BAD_TIME_MESSAGE = 't — число секунд от 0 до длительности видео.';

function respondError(res, error) {
  if (res.writableEnded || !res.writable) {
    return;
  }

  switch (error.code) {
    case ERR_INVALID:
      return res.status(400).json({ message: error.message });
    case ERR_BUSY:
      return res.status(429).json({ message: error.message });
    case ERR_TIMEOUT:
      return res.status(504).json({ message: error.message });
    case ERR_ABORTED:
      return;
    case ERR_FAILED:
      console.error(error);
      return res.status(502).json({ message: error.message });
    case NAME_TAKEN:
      return res.status(409).json({ message: 'File name is already taken.' });
    default:
      console.error(error);
      return res.status(500).json({
        message: 'An error occurred during frame extraction.',
      });
  }
}

function abortOnClose(res) {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  return controller.signal;
}

async function findVideo(filename) {
  const video = await getMediaModel(VIDEOS).findOne({ filename }).lean();
  if (!video || !(await getNewestFile(VIDEOS, filename))) {
    return null;
  }

  return video;
}

async function previewFrame(req, res) {
  const signal = abortOnClose(res);
  try {
    const t = parseFrameTime(req.query.t);
    if (t === null) {
      return res.status(400).json({ message: BAD_TIME_MESSAGE });
    }
    const { filename } = req.params;
    if (!(await findVideo(filename))) {
      return res.status(404).json({ message: 'Video not found.' });
    }

    const frame = await extractFrame(filename, t, { signal });

    res.json({
      t,
      duration: frame.duration,
      mimetype: frame.mimetype,
      size: frame.data.length,
      dataUrl: `data:${frame.mimetype};base64,${frame.data.toString('base64')}`,
    });
  } catch (error) {
    respondError(res, error);
  }
}

// Кадр снимается заново, а не берётся у клиента, и ложится новой картинкой: прежние
// файлы, в том числе прежнее превью, не трогаются.
async function saveFrame(req, res) {
  const signal = abortOnClose(res);
  try {
    const { t: rawTime, metadata } = req.body || {};
    const t = parseFrameTime(rawTime);
    if (t === null) {
      return res.status(400).json({ message: BAD_TIME_MESSAGE });
    }
    const { filename } = req.params;
    const video = await findVideo(filename);
    if (!video) {
      return res.status(404).json({ message: 'Video not found.' });
    }

    const frame = await extractFrame(filename, t, { signal });
    if (signal.aborted) {
      return;
    }

    const imageFilename = `${uuidv4()}.jpg`;
    const media = await storeMedia(IMAGES, {
      filename: imageFilename,
      mimetype: frame.mimetype,
      metadata: buildMetadata(metadata, req.payload, {
        mimetype: frame.mimetype,
        originalname: frameOriginalname(filename, video.metadata, t),
        sourceVideo: filename,
        frameTime: t,
      }),
      data: frame.data,
    });

    res.json({
      src: `${MEDIA_HOST}/${IMAGES}/${imageFilename}`,
      item: {
        _id: media._id,
        filename: imageFilename,
      },
    });
  } catch (error) {
    respondError(res, error);
  }
}

module.exports = {
  previewFrame,
  saveFrame,
};
