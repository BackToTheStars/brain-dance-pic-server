const AdmZip = require('adm-zip');
const fs = require('fs');
const { staticImagesBasePath, backupBasePath } = require('../config/path');
require('../models/db');
const imageModel = require('../models/image');

const restoreBackup = async (pathToBackup) => {
  const zip = new AdmZip(pathToBackup);
  zip.extractAllTo(staticImagesBasePath, true);

  const pathToDB = staticImagesBasePath + 'images.json';

  const images = JSON.parse(fs.readFileSync(pathToDB, 'utf8'));

  await imageModel
    .insertMany(images, { ordered: false })
    .then(function () {
      console.log('Data inserted');
    })
    .catch(function (error) {
      console.log(error);
    });

  if (fs.existsSync(pathToDB)) {
    fs.unlinkSync(pathToDB);
  }
};

const start = async () => {
  try {
    const firstArg = process.argv.slice(2);

    if (firstArg == 'full') {
      const filesDay = fs.readdirSync(backupBasePath + 'day');

      for (const file of filesDay) {
        await restoreBackup(backupBasePath + 'day/' + file);
      }

      const filesMonth = fs.readdirSync(backupBasePath + 'month');

      for (const file of filesMonth) {
        await restoreBackup(backupBasePath + 'month/' + file);
      }

      const filesYear = fs.readdirSync(backupBasePath + 'year');

      for (const file of filesYear) {
        await restoreBackup(backupBasePath + 'year/' + file);
      }
    } else {
      await restoreBackup(backupBasePath + firstArg);
    }
    console.log('restore completed');
    process.exit();
  } catch (err) {
    console.log(err);
    process.exit();
  }
};

start();
