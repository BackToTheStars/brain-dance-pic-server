const moment = require('moment');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { backupBasePath, staticImagesBasePath } = require('../config/path');
require('dotenv').config({
  path: path.join(__dirname, '../.env'),
});
require('../models/db');
const imageModel = require('../models/image');

const todayBackup = async () => {
  try {
    let startDate = moment().startOf('day');
    const zip = new AdmZip();

    const images = await imageModel.find({
      createdAt: {
        $gte: moment().startOf('day').toISOString(),
        $lt: moment().toISOString(),
      },
    });

    const imagesBackup = JSON.stringify(images);

    zip.addFile('images.json', Buffer.from(imagesBackup, 'utf8'));

    let filePath =
      staticImagesBasePath +
      startDate.format('YYYY') +
      '/' +
      startDate.format('MM') +
      '/' +
      startDate.format('DD');
    if (fs.existsSync(filePath)) {
      zip.addLocalFolder(
        filePath,
        './' +
          startDate.format('YYYY') +
          '/' +
          startDate.format('MM') +
          '/' +
          startDate.format('DD') +
          '/'
      );
      zip.writeZip(
        backupBasePath +
          'backup' +
          '-today-' +
          moment(new Date()).format('YY-MM-DD') +
          '.zip'
      );
    }
  } catch (err) {
    console.log(err);
  }
};

const weekBackup = async () => {
  let startDate = moment().startOf('day').subtract(1, 'days');
  const zip = new AdmZip();

  const images = await imageModel.find({
    createdAt: {
      $gte: moment().startOf('day').subtract(8, 'days').toISOString(),
      $lt: moment().startOf('day').subtract(1, 'days').toISOString(),
    },
  });

  const imagesBackup = JSON.stringify(images);

  zip.addFile('images.json', Buffer.from(imagesBackup, 'utf8'));

  for (let i = 1; i < 8; i++) {
    startDate = startDate.subtract(i, 'days');
    let filePath =
      staticImagesBasePath +
      startDate.format('YYYY') +
      '/' +
      startDate.format('MM') +
      '/' +
      startDate.format('DD');
    if (fs.existsSync(filePath)) {
      zip.addLocalFolder(
        filePath,
        './' +
          startDate.format('YYYY') +
          '/' +
          startDate.format('MM') +
          '/' +
          startDate.format('DD') +
          '/'
      );
    }
  }

  zip.writeZip(
    backupBasePath +
      'backup' +
      '-week-' +
      moment(new Date()).format('YY-MM-DD') +
      '.zip'
  );
};

const monthBackup = async () => {
  let startDate = moment().startOf('day');
  const zip = new AdmZip();

  const images = await imageModel.find({
    createdAt: {
      $gte: moment().startOf('day').subtract(1, 'months').toISOString(),
      $lt: moment().startOf('day').toISOString(),
    },
  });

  const imagesBackup = JSON.stringify(images);

  zip.addFile('images.json', Buffer.from(imagesBackup, 'utf8'));

  let filePath =
    staticImagesBasePath +
    startDate.format('YYYY') +
    '/' +
    startDate.format('MM');

  if (fs.existsSync(filePath)) {
    zip.addLocalFolder(
      filePath,
      './' + startDate.format('YYYY') + '/' + startDate.format('MM') + '/'
    );
    zip.writeZip(
      backupBasePath +
        'backup' +
        '-month-' +
        moment(new Date()).format('MM') +
        '.zip'
    );
  }
};

const quarterBackup = async () => {
  let startDate = moment().startOf('day');
  const zip = new AdmZip();

  const images = await imageModel.find({
    createdAt: {
      $gte: moment().startOf('day').subtract(3, 'months').toISOString(),
      $lt: moment().startOf('day').toISOString(),
    },
  });

  const imagesBackup = JSON.stringify(images);

  zip.addFile('images.json', Buffer.from(imagesBackup, 'utf8'));

  for (let i = 0; i < 3; i++) {
    startDate = startDate.subtract(i, 'months');
    let filePath =
      staticImagesBasePath +
      startDate.format('YYYY') +
      '/' +
      startDate.format('MM');
    if (fs.existsSync(filePath)) {
      zip.addLocalFolder(
        filePath,
        './' + startDate.format('YYYY') + '/' + startDate.format('MM') + '/'
      );
    }
  }

  zip.writeZip(
    backupBasePath +
      'backup' +
      '-quarter-' +
      moment(new Date()).format('MM') +
      '.zip'
  );
};

const yearBackup = async () => {
  let startDate = moment().startOf('day');
  const zip = new AdmZip();

  const images = await imageModel.find({
    createdAt: {
      $gte: moment().startOf('day').subtract(1, 'years').toISOString(),
      $lt: moment().startOf('day').toISOString(),
    },
  });

  const imagesBackup = JSON.stringify(images);

  zip.addFile('images.json', Buffer.from(imagesBackup, 'utf8'));

  if (fs.existsSync(staticImagesBasePath + startDate.format('YYYY'))) {
    zip.addLocalFolder(
      staticImagesBasePath + startDate.format('YYYY'),
      './' + startDate.format('YYYY') + '/'
    );
    zip.writeZip(
      backupBasePath + 'backup' + '-year-' + startDate.format('YYYY') + '.zip'
    );
  }
};

module.exports = {
  todayBackup,
  weekBackup,
  monthBackup,
  quarterBackup,
  yearBackup,
};
