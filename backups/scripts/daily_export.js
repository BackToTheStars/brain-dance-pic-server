// daily_export.js

const mongoose = require('mongoose');
const fs = require('fs-extra');
const path = require('path');
const { getDataForExport } = require('./helpers');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017/media';
const dateArg = process.argv[2]; // Формат YYYY-MM-DD
const mediaType = process.argv[3]; // Например, 'images'

if (!dateArg || !mediaType) {
  console.log('Usage: node daily_export.js <date> <mediaType>');
  process.exit(1);
}

(async () => {
  try {
    const date = new Date(dateArg);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    await mongoose.connect(MONGO_URL);
    const db = mongoose.connection.db;

    // Получаем список файлов из коллекции mediaType за указанную дату
    const mediaCollection = db.collection(mediaType);
    const items = await mediaCollection
      .find({
        uploadDate: {
          $gte: date,
          $lt: nextDate,
        },
      })
      .toArray();

    if (items.length === 0) {
      console.log(`No items found for ${dateArg} and type ${mediaType}.`);
      process.exit(0);
    }

    // Создаем директорию для бэкапа
    const backupDir = path.join('/backups/daily', mediaType, dateArg);
    await fs.ensureDir(backupDir);

    const exportData = [];
    const filesDir = path.join(backupDir, 'files');
    await fs.ensureDir(filesDir);

    for (const item of items) {
      const filename = item.filename;
      const { mediaDoc, fileDoc, chunksDocs, downloadStream } =
        await getDataForExport(db, mediaType, filename);

      // Добавляем данные в exportData
      exportData.push(mediaDoc);

      // Сохраняем файл в файловую систему
      const filePath = path.join(filesDir, filename);
      const writeStream = fs.createWriteStream(filePath);
      await new Promise((resolve, reject) => {
        downloadStream
          .pipe(writeStream)
          .on('error', reject)
          .on('finish', resolve);
      });
    }

    // Сохраняем exportData в JSON-файл
    const dataPath = path.join(backupDir, 'data.json');
    await fs.writeJson(dataPath, exportData);

    // Архивируем папку
    const archivePath = `${backupDir}.tar.gz`;
    await createTarGz(backupDir, archivePath);

    // Удаляем временную папку
    await fs.remove(backupDir);

    console.log(`Backup created successfully: ${archivePath}`);
    process.exit(0);
  } catch (error) {
    console.error('Error during daily export:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
})();

function createTarGz(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const tar = require('tar');

    // Получаем все файлы и папки в директории
    fs.readdir(sourceDir, (err, files) => {
      if (err) {
        return reject(err);
      }

      // Формируем пути файлов без указания '.'
      const filePaths = files.map((file) => path.join(file));

      tar
        .c(
          {
            gzip: true,
            file: outPath,
            cwd: sourceDir,
          },
          filePaths
        )
        .then(resolve)
        .catch(reject);
    });
  });
}
