// helpers.js
const { GridFSBucket } = require('mongodb');
const mongoose = require('mongoose');

async function getDataForExport(db, mediaType, filename) {
  // Получаем документ из коллекции mediaType
  const mediaCollection = db.collection(mediaType);
  const mediaDoc = await mediaCollection.findOne({ filename });

  if (!mediaDoc) {
    throw new Error(
      `Document with filename ${filename} not found in collection ${mediaType}`
    );
  }

  // Получаем файл из GridFS (mediaType.files)
  const filesCollection = db.collection(`${mediaType}.files`);
  const fileDoc = await filesCollection.findOne({ filename });

  if (!fileDoc) {
    throw new Error(
      `File with filename ${filename} not found in GridFS collection ${mediaType}.files`
    );
  }

  // Получаем связанные chunks из GridFS (mediaType.chunks)
  const chunksCollection = db.collection(`${mediaType}.chunks`);
  const chunksCursor = chunksCollection.find({ files_id: fileDoc._id });
  const chunksDocs = await chunksCursor.toArray();

  if (chunksDocs.length === 0) {
    throw new Error(
      `No chunks found for file with _id ${fileDoc._id} in collection ${mediaType}.chunks`
    );
  }

  // Получаем сам файл из GridFS
  const bucket = new GridFSBucket(db, { bucketName: mediaType });
  const downloadStream = bucket.openDownloadStreamByName(filename);

  return {
    mediaDoc,
    fileDoc,
    chunksDocs,
    downloadStream, // Поток для сохранения файла в файловую систему
  };
}

async function importData(db, mediaType, mediaDoc, filePath) {
  // Вставляем документ в коллекцию mediaType
  const mediaCollection = db.collection(mediaType);
  const existingMedia = await mediaCollection.findOne({ filename: mediaDoc.filename });
  if (!existingMedia) {
    await mediaCollection.insertOne({
      ...mediaDoc,
      _id: new mongoose.Types.ObjectId(mediaDoc._id),
      uploadDate: new Date(mediaDoc.uploadDate),
    });
  } else {
    console.log(`Document with _id ${mediaDoc._id} already exists in collection ${mediaType}. Skipping.`);
  }

  // Проверяем, существует ли файл в GridFS
  const filesCollection = db.collection(`${mediaType}.files`);
  const existingFile = await filesCollection.findOne({ filename: mediaDoc.filename });
  if (!existingFile) {
    // Загружаем файл в GridFS
    // const bucket = new GridFSBucket(db, { bucketName: mediaType });
    const fs = require('fs');
    const buffer = fs.readFileSync(filePath);
    // await new Promise((resolve, reject) => {
    //   fs.createReadStream(filePath)
    //     .pipe(uploadStream)
    //     .on('error', reject)
    //     .on('finish', resolve);
    // });

    // @todo: add log and report
    await saveFileToGridFS(
      mediaType,
      buffer,
      mediaDoc.filename,
      mediaDoc.metadata
    );

    // const uploadStream = bucket.openUploadStreamWithId(fileDoc._id, fileDoc.filename, {
    //   metadata: fileDoc.metadata,
    //   contentType: fileDoc.contentType,
    //   chunkSizeBytes: fileDoc.chunkSize,
    //   aliases: fileDoc.aliases,
    // });

    // // Читаем файл из файловой системы и загружаем в GridFS
    
  } else {
    console.log(
      `File with _id ${existingFile._id} already exists in GridFS collection ${mediaType}.files. Skipping.`
    );
  }
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

module.exports = {
  getDataForExport,
  importData,
};
