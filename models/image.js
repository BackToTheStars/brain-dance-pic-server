const mongoose = require("mongoose");
const ImageSchema = new mongoose.Schema({
  fieldname: {
    type: String,
    //required: true,
    default: "",

  },
  originalname: {
    type: String,
    default: "",
  },
  encoding: {
    type: String,
    default: "",
  },
  mimetype: {
    type: String,
    default: "",
  },
  destination: {
    type: String,
    default: "",
  },
  filename: {
    type: String,
    default: "",
  },
  path: {
    type: String,
    default: "",
  },
  size: {
    type: String,
    default: "",
  },
});
const Image = mongoose.model("Image", ImageSchema);
module.exports = Image;