const mongoose = require('mongoose');
const ImageSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      default: 'new',
    },
    server: {
      type: Number,
      default: 1,
    },
    path: {
      type: String,
      default: '',
    },
    fileType: {
      type: String,
      default: 'image',
    },
    info: {
      type: Object,
      default: '',
    },
    format: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);
const Image = mongoose.model('Image', ImageSchema);
module.exports = Image;
