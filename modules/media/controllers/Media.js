const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const {
  saveFileToGridFS,
  downloadFileFromGridFS,
  getFileInfo,
} = require('../services/gridFs');
const { getMediaModel } = require('../models/Media');
const { getMimeType, hasMimeType } = require('../../../config/media');
const { MEDIA_HOST } = require('../../../config/url');

const storage = multer.memoryStorage();
const upload = multer({ storage });

function getExtension(filename) {
  return filename.split('.').pop();
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
      const filename = `${uuidv4()}.${extension}`;
      const mimetype = req.file.mimetype || getMimeType(contentType, extension);

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
        item: { filename },
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

      const extension = getExtension(mediaUrl);
      const filename = `${uuidv4()}.${extension}`;
      if (!hasMimeType(contentType, extension)) {
        return res.status(400).json({
          message: 'Unsupported media type.',
        });
      }
      const mimetype = getMimeType(contentType, extension);

      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
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
        item: { filename },
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

  // Placeholder for specific operations per media type
  // For example, getAudioFragment for audio, getVideoFragment for video

  return {
    uploadMedia: [upload.single('file'), uploadMedia],
    downloadAndSaveMedia,
    getMedia,
    // Add other methods as needed
  };
}

module.exports = {
  createMediaController,
};
