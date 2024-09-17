const mongoose = require('mongoose');

function initGridFS() {
  // Initialization logic if needed
}

function getGridFSBucket(contentType) {
  const conn = mongoose.connection;
  return new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: contentType,
  });
}

function saveFileToGridFS(contentType, buffer, filename, metadata) {
  return new Promise((resolve, reject) => {
    const bucket = getGridFSBucket(contentType);
    const writeStream = bucket.openUploadStream(filename, {
      metadata,
    });

    writeStream.on('finish', () => {
      resolve(writeStream.id.toString());
    });

    writeStream.on('error', (error) => {
      reject(error);
    });

    writeStream.end(buffer);
  });
}

function downloadFileFromGridFS(contentType, filename, start, end) {
  const bucket = getGridFSBucket(contentType);
  const options = {};
  if (start !== undefined && end !== undefined) {
    options.start = start;
    options.end = end;
  }
  return bucket.openDownloadStreamByName(filename, options);
}

function getFileInfo(contentType, filename) {
  const bucket = getGridFSBucket(contentType);
  return bucket.find({ filename }).toArray();
}

module.exports = {
  initGridFS,
  saveFileToGridFS,
  downloadFileFromGridFS,
  getFileInfo,
};
