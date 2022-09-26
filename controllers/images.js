const fs = require('fs');
const path = require('path');
const uniqid = require('uniqid');
const moment = require('moment');
const { staticImagesBasePath } = require('../config/path');
const { HOST } = require('../config/url');

const imageModel = require('../models/image');
const { validMimeTypes, maxImageSize } = require('../config/images');
const { getError } = require('../lib/errors');

const uploadImage = async (req, res, next) => {
  try {
    if (!validMimeTypes.includes(req.file.mimetype)) {
      throw getError('not correct image extension', 400);
    }

    if (req.file.size > maxImageSize) {
      throw getError('too big', 400);
    }

    const utcDate = moment().utc();
    const year = utcDate.format('YYYY');
    const month = utcDate.format('MM');
    const numberDate = utcDate.format('DD');

    const dirYear = path.join(staticImagesBasePath, year);
    const dirMonth = path.join(dirYear, month);
    const dirNumberDate = path.join(dirMonth, numberDate);

    for (const dir of [dirYear, dirMonth, dirNumberDate]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
      }
    }

    const imageUUID = uniqid.time();
    const extArray = req.file.mimetype.split('/');
    const extension = extArray[extArray.length - 1];

    const oldPath = path.join(
      staticImagesBasePath,
      'tmp/' + req.file.originalname
    );
    const imageName = `${imageUUID}.${extension}`;
    const newPath = path.join(dirNumberDate, imageName);
    const publicPath = `/static/images/${year}/${month}/${numberDate}/${imageName}`;

    fs.rename(oldPath, newPath, function (err) {
      if (err) throw err;
    });

    const image = new imageModel({
      info: {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        encoding: req.file.encoding,
        mimetype: req.file.mimetype,
        destination: req.file.destination,
        filename: req.file.filename,
        size: req.file.size,
      },
      path: publicPath,
    });

    await image.save();
    res.json({
      src: HOST + image['path'],
      item: image,
    });
  } catch (error) {
    next(error);
    console.log(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const image = await imageModel.findById(req.params.id);
    res.json({
      src: HOST + image.path,
      item: image,
    });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const id = req.params.id;
    const imageModel = await imageModel.findById(id);
    const filePath = path.join(__dirname, '..' + imageModel['path']);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    imageModel.status = 'deleted';
    await imageModel.save();
    return res.send({
      item: imageModel,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  uploadImage,
  getById,
  remove,
};
