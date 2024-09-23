require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const { MONGO_URL } = require('./config/db');

const { createMediaRouter } = require('./modules/media/routes/media');
const { initGridFS } = require('./modules/media/services/gridFs');
const { mediaTypes } = require('./config/media');
const { error404, errorAll } = require('./modules/core/middlewares/errors');

const app = express();
const port = process.env.MEDIA_PORT || 3011;

app.use(cors());
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

app.use('*', error404);
app.use(errorAll);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
