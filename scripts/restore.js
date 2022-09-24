const AdmZip = require('adm-zip');
const fs = require('fs');
const { staticImagesBasePath, backupBasePath } = require('../config/path');
require('../models/db');
const imageModel = require('../models/image');
let numberFiles = 0;

const restoreBackup = async (pathToBackup) => {
  const zip = new AdmZip(pathToBackup);
  zip.extractAllTo(staticImagesBasePath, true);

  const pathToDB = staticImagesBasePath + 'images.json';

  const images = JSON.parse(fs.readFileSync(pathToDB, 'utf8'));

  numberFiles += Object.keys(images).length;

  await imageModel.insertMany(images, { ordered: false });

  if (fs.existsSync(pathToDB)) {
    fs.unlinkSync(pathToDB);
  }
};

const start = async () => {
  try {
    const firstArg = process.argv.slice(2);

    if (firstArg == 'full') {
      const filesDay = fs.readdirSync(backupBasePath + 'day');
      filesDay.forEach(async (file) => {
        await restoreBackup(backupBasePath + 'day/' + file);
      });

      const filesMonth = fs.readdirSync(backupBasePath + 'month');
      filesMonth.forEach(async (file) => {
        await restoreBackup(backupBasePath + 'month/' + file);
      });

      const filesYear = fs.readdirSync(backupBasePath + 'year');
      filesYear.forEach(async (file) => {
        await restoreBackup(backupBasePath + 'year/' + file);
      });
    } else {
      await restoreBackup(backupBasePath + firstArg);
      const filesBackup = fs.readdirSync(backupBasePath + 'month');
    }
    console.log(numberFiles + ' files restored');
    console.log('restore completed');
    process.exit();
  } catch (err) {
    console.log(err);
    process.exit();
  }
};

start();
