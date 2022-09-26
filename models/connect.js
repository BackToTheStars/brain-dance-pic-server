const mongoose = require('mongoose');
const { MONGO_URL } = require('../config/db');

mongoose.connect(MONGO_URL, {
  useUnifiedTopology: true,
  useNewUrlParser: true,
});
