const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const imageModel = require('../models/image');
const { staticImagesBasePath, backupBasePath } = require('../config/path');

const ERROR_CODE_UNEXPECTED = 'unexpected-error';
const ERROR_CODE_COMMON = 'common-error';
const ERROR_CODE_DUBLICATE = 'dublicate-error';

const MONGO_ERROR_DUBLICATE = 11000;

class RestoreError extends Error {
  constructor(message, errorCode = ERROR_CODE_COMMON) {
    super(message);
    this.code = errorCode;
  }
}

const processError = (err) => {
  if (err instanceof RestoreError) {
    return {
      message: err.message,
      code: err.code,
    };
  } else if (err.code === MONGO_ERROR_DUBLICATE) {
    return {
      message: err.message,
      code: ERROR_CODE_DUBLICATE,
      insertedDocsCount: err.insertedDocs.length,
      dublicates: err.writeErrors.map((item) => item.errmsg),
    };
  } else {
    console.log(err);
    return {
      message: err.message,
      code: ERROR_CODE_UNEXPECTED,
    };
  }
};

const checkIfExists = (folderName) => {
  const folderPath = path.join(backupBasePath, folderName);
  return fs.existsSync(folderPath);
};

const restoreBackupFolder = async (folderName) => {
  const report = { type: 'folder', path: folderName, files: [] };
  try {
    const folderPath = path.join(backupBasePath, folderName);
    const files = fs.readdirSync(folderPath);
    for (const file of files) {
      report.files.push(await restoreBackup(`${folderName}/${file}`));
    }
  } catch (err) {
    report.error = processError(err);
  }
  return report;
};

const restoreBackup = async (fileName) => {
  const report = { type: 'file', path: fileName };
  try {
    const pathToBackup = path.join(backupBasePath, fileName);
    if (!fs.existsSync(pathToBackup)) {
      throw new RestoreError(`Incorrect backup path: ${pathToBackup}`);
    }
    const zip = new AdmZip(pathToBackup);
    report.zipEntries = zip.getEntries().map((item) => item.entryName);
    zip.extractAllTo(staticImagesBasePath, true);

    const pathToDB = path.join(staticImagesBasePath, 'images.json');

    const images = JSON.parse(fs.readFileSync(pathToDB, 'utf8'));
    report.docsToInsertCount = images.length;

    await imageModel.insertMany(images, { ordered: false });

    if (fs.existsSync(pathToDB)) {
      fs.unlinkSync(pathToDB);
    }
  } catch (err) {
    report.error = processError(err);
  }
  return report;
};

module.exports = {
  restoreBackupFolder,
  restoreBackup,
  checkIfExists,
};
