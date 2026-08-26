require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const { MONGO_URL } = require('./config/db');

const { createMediaRouter } = require('./modules/media/routes/media');
const { createStatsRouter } = require('./modules/stats/routes/stats');
const { createFilesRouter } = require('./modules/media/routes/files');
const { createYoutubeRouter } = require('./modules/youtube/routes/youtube');
const { initGridFS } = require('./modules/media/services/gridFs');
const { mediaTypes } = require('./config/media');
const { error404, errorAll } = require('./modules/core/middlewares/errors');
const { cleanTmpRoot } = require('./modules/youtube/services/tmp');

const app = express();
const port = process.env.MEDIA_PORT || 3011;

// exposedHeaders: кросс-доменному коду (pdf.js в клиенте) по умолчанию видны только
// safelisted-заголовки ответа. Без Accept-Ranges/Content-Range он не видит поддержку
// диапазонов и качает документ целиком.
app.use(
  cors({
    exposedHeaders: ['Accept-Ranges', 'Content-Range', 'Content-Length'],
  })
);
app.use(express.json({ limit: '350mb' }));
app.use(express.urlencoded({ limit: '350mb', extended: true }));

// Connect to the database
mongoose
  .connect(MONGO_URL)
  .then(() => {
    console.log('Connected to MongoDB');
    initGridFS();
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
  });

// Create and use routers for each media type
mediaTypes.forEach((type) => {
  app.use(`/${type}`, createMediaRouter(type));
});

// Статистика хранилища — не привязана к типу медиа, поэтому отдельным роутером
app.use('/stats', createStatsRouter());

// Список файлов для админки: тип здесь фильтр, а не адрес, — поэтому тоже
// вне роутеров по типам.
app.use('/files', createFilesRouter());

// Перенос видео с YouTube: свой транспорт (yt-dlp) и свой лимит, к бакету
// привязан только результатом, поэтому тоже отдельным роутером
app.use('/youtube', createYoutubeRouter());

app.use(error404);
app.use(errorAll);

// После падения или перезапуска в каталоге youtube могли остаться недокачанные
// файлы — снимаем их до того, как примем первый запрос.
cleanTmpRoot();

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
