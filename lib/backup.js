const { zip } = require('zip-a-folder');
const moment = require('moment');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { backupBasePath, staticImagesBasePath } = require('../config/path');

const todayBackup = () => {
  let startDate = moment();
  let filePath =
    staticImagesBasePath +
    startDate.format('YYYY') +
    '/' +
    startDate.format('MM') +
    '/' +
    startDate.format('DD');
  if (fs.existsSync(filePath)) {
    zip(
      filePath,
      backupBasePath +
        'backup' +
        '-today-' +
        moment(new Date()).format('YY-MM-DD') +
        '.zip'
    );
  }
};

const weekBackup = () => {
  let startDate = moment();
  const zip = new AdmZip();

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

const monthBackup = () => {
  let startDate = moment();
  let filePath =
    staticImagesBasePath +
    startDate.format('YYYY') +
    '/' +
    startDate.format('MM');

  console.log(filePath);

  if (fs.existsSync(filePath)) {
    zip(
      filePath,
      backupBasePath + 'backup' + '-month-' + startDate.format('MM') + '.zip'
    );
  }
};

const quarterBackup = () => {
  let startDate = moment();
  const zip = new AdmZip();

  for (let i = 0; i < 3; i++) {
    startDate = startDate.subtract(i, 'months');
    let filePath =
      staticImagesBasePath +
      startDate.format('YYYY') +
      '/' +
      startDate.format('MM');
    if (fs.existsSync(filePath)) {
      zip.addLocalFolder(filePath, './' + startDate.format('MM') + '/');
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

const yearBackup = () => {
  let startDate = moment();
  if (fs.existsSync(staticImagesBasePath + startDate.format('YYYY'))) {
    zip(
      staticImagesBasePath + startDate.format('YYYY'),
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
