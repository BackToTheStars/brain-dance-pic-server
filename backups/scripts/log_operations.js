// /app/scripts/log_operations.js

const mongoose = require('mongoose');
const path = require('path');

// Подключаем модель Log.js из modules/core/models
const { Log } = require(path.join(__dirname, '../modules/core/models/Log'));

const logType = process.argv[2];
const params = JSON.parse(process.argv[3] || '{}');
const info = JSON.parse(process.argv[4] || '{}');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017/media';

mongoose.connect(MONGO_URL);

(async () => {
  try {
    await Log.create({ logType, params, info });
    process.exit(0);
  } catch (error) {
    console.error('Error logging operation:', error);
    process.exit(1);
  }
})();
