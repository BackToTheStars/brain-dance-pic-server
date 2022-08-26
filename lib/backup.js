const moment = require('moment');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
require('dotenv').config({
  path: path.join(__dirname, '../.env'),
});
require('../models/db');
const imageModel = require('../models/image');
const { staticImagesBasePath, backupBasePath } = require('../config/path');

const getRelativeFolderByDate = (d) => d.format('YYYY/MM/DD');
const getRelativeFolderByMonth = (d) => d.format('YYYY/MM');
const getRelativeFolderByYear = (d) => d.format('YYYY');

const backup = async ($gte, $lt, folders = [], zipFilePath) => {
  try {
    const zip = new AdmZip();
    let isEmptyFolderList = true;
    let isEmptyItemList = true;

    for (const folderPath of folders) {
      const absoluteFolderPath = `${staticImagesBasePath}/${folderPath}`;
      if (fs.existsSync(absoluteFolderPath)) {
        isEmptyFolderList = false;
        zip.addLocalFolder(absoluteFolderPath, folderPath);
      }
    }

    if (!isEmptyFolderList) {
      const images = await imageModel.find({ createdAt: { $gte, $lt } });
      if (images.length) {
        isEmptyItemList = false;
        const imagesBackup = JSON.stringify(images);
        zip.addFile('images.json', Buffer.from(imagesBackup, 'utf8'));
      }
    }

    zip.writeZip(zipFilePath);
    return {
      success: !isEmptyItemList,
      isEmptyFolderList,
      isEmptyItemList,
    };
  } catch (err) {
    return { success: false, err };
  }
};

const todayBackup = async () => {
  return await backup(
    moment().startOf('day').toISOString(),
    moment().toISOString(),
    [getRelativeFolderByDate(moment())],
    `${backupBasePath}/day/${moment().format('YYYY-MM-DD')}.zip`
  );
};

const weekBackup = async () => {
  const startDate = moment().startOf('day').subtract(7, 'days');
  const nextDate = startDate.clone();
  const folders = [];
  for (let i = 0; i < 7; i++) {
    folders.push(getRelativeFolderByDate(nextDate.add(1, 'days')));
  }

  return await backup(
    startDate.clone().toISOString(),
    startDate.clone().add(7, 'days').toISOString(),
    folders,
    `${backupBasePath}/week/${moment().format('YYYY-MM-DD')}.zip`
  );
};

const monthBackup = async () => {
  return await backup(
    moment().startOf('day').subtract(1, 'months').toISOString(),
    moment().startOf('day').toISOString(),
    [getRelativeFolderByMonth(moment())],
    `${backupBasePath}/month/${moment().format('YYYY-MM')}.zip`
  );
}

const quarterBackup = async () => {
  const startDate = moment().startOf('day').subtract(3, 'months');
  const nextDate = startDate.clone();
  const folders = [];
  for (let i = 0; i < 3; i++) {
    folders.push(getRelativeFolderByMonth(nextDate.add(1, 'months')));
  }

  return await backup(
    moment().startOf('day').subtract(3, 'months').toISOString(),
    moment().startOf('day').toISOString(),
    folders,
    `${backupBasePath}/quarter/${moment().format('YYYY-MM')}.zip`
  );
}

const yearBackup = async () => {
  return await backup(
    moment().startOf('day').subtract(1, 'years').toISOString(),
    moment().startOf('day').toISOString(),
    [getRelativeFolderByYear(moment())],
    `${backupBasePath}/year/${moment().format('YYYY')}.zip`
  );
}

module.exports = {
  todayBackup,
  weekBackup,
  monthBackup,
  quarterBackup,
  yearBackup,
};
