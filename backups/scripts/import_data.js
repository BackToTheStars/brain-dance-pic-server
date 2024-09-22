// import_data.js

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Log = require('./models/Log');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017/media';
const mediaType = process.argv[2]; // "images", "videos", "audios"
const startDate = process.argv[3]; // "2024-07-12"
const endDate = process.argv[4]; // "2024-09-05"

if (!mediaType || !startDate || !endDate) {
  console.log('Usage: node import_data.js <mediaType> <startDate> <endDate>');
  process.exit(1);
}

mongoose.connect(MONGO_URL);

const Media = require(`./models/${mediaType}Model`);

(async () => {
  try {
    const dataDir = `/backups/daily/${mediaType}`;
    const files = fs.readdirSync(dataDir);

    for (const file of files) {
      const fileDate = file.replace('.json', '');
      if (fileDate >= startDate && fileDate <= endDate) {
        const filePath = path.join(dataDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        for (const item of data) {
          const exists = await Media.exists({ _id: item._id });
          if (!exists) {
            await Media.create(item);
          } else {
            console.log(`Item with _id ${item._id} already exists. Skipping.`);
          }
        }
      }
    }

    // Логирование
    await Log.create({
      logType: 'import_data',
      params: { mediaType, startDate, endDate },
      info: { status: 'success' },
    });

    console.log('Import completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error during import:', error);

    // Логирование ошибки
    await Log.create({
      logType: 'import_data',
      params: { mediaType, startDate, endDate },
      info: { status: 'error', error: error.message },
    });

    process.exit(1);
  }
})();
