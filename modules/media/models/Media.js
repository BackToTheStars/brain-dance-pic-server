const mongoose = require('mongoose');

function getMediaModel(contentType) {
  // Одна и та же модель нужна нескольким модулям (media и youtube — оба про
  // videos), а mongoose.model() со схемой второй раз для того же имени падает
  // с OverwriteModelError. Уже собранную отдаём как есть.
  if (mongoose.models[contentType]) {
    return mongoose.models[contentType];
  }

  const schema = new mongoose.Schema({
    filename: { type: String, required: true },
    metadata: { type: Object, default: {} },
    contentType: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    // Additional fields can be added here
  });

  // Return a model with the collection name set to the contentType
  return mongoose.model(contentType, schema, contentType);
}

module.exports = { getMediaModel };
