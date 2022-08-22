const moment = require('moment');
const AdmZip = require('adm-zip');
const fs = require('fs');

const quarterBackup = () => {
  let startDate = moment();
  const zip = new AdmZip();

  for (let i = 0; i < 3; i++) {
    startDate = startDate.subtract(i, 'months');
    let filePath =
      './static/images/' +
      startDate.format('YYYY') +
      '/' +
      startDate.format('MMM').toLowerCase();
    if (fs.existsSync(filePath)) {
      zip.addLocalFolder(filePath, './' + startDate.format('MMM').toLowerCase() + '/');
    }
  }

  zip.writeZip(
    './backup/backup' +
      '-quarter-' +
      moment(new Date()).format('MMM').toLowerCase() +
      '.zip'
  );
};

quarterBackup();
