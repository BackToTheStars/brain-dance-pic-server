const mongoose = require('mongoose');

function getMediaModel(contentType) {
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
