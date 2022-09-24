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

/*const todayBackup = async () => {
  return await backup(
    moment().utc().startOf('day').toISOString(),
    moment().utc().toISOString(),
    [getRelativeFolderByDate(moment().utc())],
    `${backupBasePath}/day/${moment().utc().format('YYYY-MM-DD')}.zip`
  );
};*/

const todayBackup = async () => {
  return await backup(
    moment().utc().subtract(1, 'days').startOf('day').toISOString(),
    moment().utc().subtract(1, 'days').endOf('day').toISOString(),
    [getRelativeFolderByDate(moment().utc().subtract(1, 'days'))],
    `${backupBasePath}/day/${moment().utc().subtract(1, 'days').format('YYYY-MM-DD')}.zip`
  );
};

const weekBackup = async () => {
  const startDate = moment().utc().startOf('day').subtract(7, 'days');
  const nextDate = startDate.clone();
  const folders = [];
  for (let i = 0; i < 7; i++) {
    folders.push(getRelativeFolderByDate(nextDate.add(1, 'days')));
  }

  return await backup(
    startDate.clone().toISOString(),
    startDate.clone().add(7, 'days').toISOString(),
    folders,
    `${backupBasePath}/week/${moment().utc().format('YYYY-MM-DD')}.zip`
  );
};

const monthBackup = async () => {
  return await backup(
    moment().utc().startOf('month').subtract(1, 'months').toISOString(),
    moment().utc().endOf('month').subtract(1, 'months').toISOString(),
    [getRelativeFolderByMonth(moment().utc().subtract(1, 'months'))],
    `${backupBasePath}/month/${moment().utc().subtract(1, 'months').format('YYYY-MM')}.zip`
  );
}

const quarterBackup = async () => {
  const startDate = moment().utc().startOf('day').subtract(3, 'months');
  const nextDate = startDate.clone();
  const folders = [];
  for (let i = 0; i < 3; i++) {
    folders.push(getRelativeFolderByMonth(nextDate.add(1, 'months')));
  }

  return await backup(
    moment().utc().startOf('day').subtract(3, 'months').toISOString(),
    moment().utc().startOf('day').toISOString(),
    folders,
    `${backupBasePath}/quarter/${moment().utc().format('YYYY-MM')}.zip`
  );
}

const yearBackup = async () => {
  return await backup(
    moment().utc().startOf('year').subtract(1, 'years').toISOString(),
    moment().utc().endOf('year').subtract(1, 'years').toISOString(),
    [getRelativeFolderByYear(moment().utc().subtract(1, 'years'))],
    `${backupBasePath}/year/${moment().utc().subtract(1, 'years').format('YYYY')}.zip`
  );
}

module.exports = {
  todayBackup,
  weekBackup,
  monthBackup,
  quarterBackup,
  yearBackup,
};
