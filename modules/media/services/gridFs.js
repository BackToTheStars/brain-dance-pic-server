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

// Сохранение потоком: файл не читается в память целиком. Нужно там, где размер
// не ограничен парой мегабайт — сейчас это скачанное с YouTube видео.
function saveStreamToGridFS(contentType, readStream, filename, metadata) {
  return new Promise((resolve, reject) => {
    const bucket = getGridFSBucket(contentType);
    const uploadStream = bucket.openUploadStream(filename, {
      metadata,
    });

    // На ошибке любой из сторон убираем недописанный файл из GridFS: иначе
    // в бакете останутся чанки, на которые никто не ссылается.
    const fail = (error) => {
      readStream.destroy();
      uploadStream.abort().catch(() => {});
      reject(error);
    };

    readStream.on('error', fail);
    uploadStream.on('error', fail);
    uploadStream.on('finish', () => {
      resolve(uploadStream.id.toString());
    });

    readStream.pipe(uploadStream);
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

async function removeFileFromGridFS(contentType, fileId) {
  const bucket = getGridFSBucket(contentType);
  try {
    await bucket.delete(fileId);
  } catch (error) {
    throw error;
  }
}

module.exports = {
  initGridFS,
  saveFileToGridFS,
  saveStreamToGridFS,
  downloadFileFromGridFS,
  getFileInfo,
  removeFileFromGridFS,
};
