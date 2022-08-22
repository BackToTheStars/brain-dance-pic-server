const { zip } = require('zip-a-folder');
const moment = require('moment');
const fs = require('fs');

const todayBackup = () => {
  let startDate = moment();
  let filePath =
    './static/images/' +
    startDate.format('YYYY') +
    '/' +
    startDate.format('MMM').toLowerCase() +
    '/' +
    startDate.format('DD');
  if (fs.existsSync(filePath)) {
    zip(
      filePath,
      './backup/backup' +
        '-today-' +
        moment(new Date()).format('DD-MM-YY') +
        '.zip'
    );
  }
};

todayBackup();
