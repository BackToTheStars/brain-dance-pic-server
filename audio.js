require('./config');
const axios = require('axios');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const streamifier = require('streamifier');
const app = express();
const port = process.env.AUDIO_PORT || 3010;
const { authenticateToken, checkOperation } = require('./middlewares/images');
const {
  OPERATION_UPLOAD,
  OPERATION_DOWNLOAD_AND_SAVE,
} = require('./config/images');
const { AUDIO_HOST } = require('./config/url');
const { MONGO_URL } = require('./config/db');

app.use(cors());
app.use(express.json({ limit: '350mb' }));
app.use(express.urlencoded({ limit: '350mb', extended: true }));

const storage = multer.memoryStorage();
const upload = multer({
  storage,
});

let conn;
let gfs;
mongoose
  .connect(MONGO_URL, {
    useUnifiedTopology: true,
    useNewUrlParser: true,
  })
  .then(() => {
    conn = mongoose.connection;
    gfs = new mongoose.mongo.GridFSBucket(conn.db, {
      bucketName: 'audio',
    });
  });

function saveAudioToGridFS(
  audioBlob,
  filename = 'example.mp4a',
  mimetype = 'audio/mp4'
) {
  return new Promise((resolve, reject) => {
    const writeStream = gfs.openUploadStream(filename, {
      metadata: {
        mimetype,
      },
    });

    writeStream.on('close', (file) => {
      resolve(writeStream.id.toString());
    });

    writeStream.on('finish', (file) => {
      resolve(writeStream.id.toString());
    });

    writeStream.on('error', (error) => {
      reject(error);
    });
    streamifier.createReadStream(audioBlob).pipe(writeStream);
  });
}

const getExt = (filename) => {
  const parts = filename.split('.');
  return parts[parts.length - 1];
};

// @todo: move to audio middleware
app.post(
  '/audios/upload',
  authenticateToken,
  upload.single('file'),
  checkOperation(OPERATION_UPLOAD),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No audio data uploaded.' });
      }
      const { originalname, buffer } = req.file;
      // const buffer = req.file.buffer; //Buffer.from(req.file.buffer, 'base64');
      const filename = `${uuidv4()}.${getExt(originalname)}`;
      await saveAudioToGridFS(buffer, filename);
      res.json({
        src: `${AUDIO_HOST}/audios/${filename}`,
        item: {
          filename,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: 'An error occurred during upload.',
        error: JSON.stringify(error),
      });
    }
  }
);

const getMimeType = (url) => {
  const ext = getExt(url);
  switch (ext) {
    case 'mp4':
      return 'video/mp4';
    case 'mp3':
      return 'audio/mpeg';
    default:
      return 'video/mp4';
  }
};

const downloadAndSaveAudio = async (audioUrl) => {
  return new Promise(async (resolve, reject) => {
    const filename = `${uuidv4()}.${getExt(audioUrl)}`;
    const response = await axios.get(audioUrl, {
      responseType: 'stream',
    });
    const writeStream = gfs.openUploadStream(filename, {
      metadata: {
        mimetype: getMimeType('audios', audioUrl),
      },
    });
    response.data.pipe(writeStream);

    writeStream.on('close', (file) => {
      resolve(filename);
    });
    writeStream.on('finish', (file) => {
      resolve(filename);
    });
    writeStream.on('error', (error) => {
      reject(error);
    });
  });
};

app.post(
  '/audios/download-and-save',
  authenticateToken,
  checkOperation(OPERATION_DOWNLOAD_AND_SAVE),
  async (req, res, next) => {
    try {
      const { audioUrl } = req.body;

      if (!audioUrl) {
        return res.status(400).json({ message: 'No audio URL provided.' });
      }

      const filename = await downloadAndSaveAudio(audioUrl);
      res.json({
        src: `${AUDIO_HOST}/audios/${filename}`,
        item: {
          filename,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get('/audios/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const range = req.headers.range;

    const files = await gfs.find({ filename }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).send('File not found');
    }

    const file = files[0];
    const fileSize = file.length;
    const contentType = file.contentType || 'audio/mpeg';

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
        'Content-Type': contentType,
      });

      const downloadStream = gfs.openDownloadStreamByName(filename, {
        start,
        end: end + 1,
      });
      downloadStream.pipe(res);
    } else {
      // @deprecated: return res.status(416).send('Range header required');

      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
      });
      const downloadStream = gfs.openDownloadStreamByName(filename);
      downloadStream.pipe(res);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'An error occurred during download.',
      error: JSON.stringify(error),
    });
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    message: 'An error occurred.',
    error: JSON.stringify(error),
  });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
