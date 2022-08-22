const moment = require('moment');
const AdmZip = require('adm-zip');
const fs = require('fs');

const weekBackup = () => {
  let startDate = moment();
  const zip = new AdmZip();

  for (let i = 1; i < 8; i++) {
    startDate = startDate.subtract(i, 'days');
    let filePath =
      './static/images/' +
      startDate.format('YYYY') +
      '/' +
      startDate.format('MMM').toLowerCase() +
      '/' +
      startDate.format('DD');
    if (fs.existsSync(filePath)) {
      zip.addLocalFolder(filePath, './' + startDate.format('DD') + '/');
    }
  }

  zip.writeZip(
    './backup/backup' +
      '-week-' +
      moment(new Date()).format('DD-MM-YY') +
      '.zip'
  );

  /*zip(
    './static/images/',
    './backup/backup' +
      '-week-' +
      moment(new Date()).format('DD-MM-YY') +
      '.zip'
  );*/
};

weekBackup();
