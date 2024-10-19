// daily_import.js

const mongoose = require('mongoose');
const fs = require('fs-extra');
const path = require('path');
const { importData } = require('./helpers');
const tar = require('tar');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017/media';
const archivePath = process.argv[2]; // Путь к архиву
const mediaType = process.argv[3]; // Например, 'images'

if (!archivePath || !mediaType) {
  console.log('Usage: node daily_import.js <archivePath> <mediaType>');
  process.exit(1);
}

(async () => {
  try {
    // Распаковываем архив во временную директорию
    const tempDir = path.join(
      '/tmp',
      'import_temp',
      path.basename(archivePath, '.tar.gz')
    );
    await fs.ensureDir(tempDir);

    await tar.x({
      file: archivePath,
      cwd: tempDir,
    });

    // Подключаемся к базе данных
    await mongoose.connect(MONGO_URL);
    const db = mongoose.connection.db;

    // Загружаем данные из data.json
    const dataPath = path.join(tempDir, 'data.json');
    const exportData = await fs.readJson(dataPath);

    const filesDir = path.join(tempDir, 'files');

    for (const mediaDoc of exportData) {
      const filePath = path.join(filesDir, mediaDoc.filename);

      await importData(db, mediaType, mediaDoc, filePath);
    }

    // Удаляем временную директорию
    await fs.remove(tempDir);

    console.log('Import completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error during daily import:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
})();
