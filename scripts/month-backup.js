const { zip } = require('zip-a-folder');
const moment = require('moment');
const fs = require('fs');

const monthBackup = () => {
  let startDate = moment();
  let filePath =
    './static/images/' +
    startDate.format('YYYY') +
    '/' +
    startDate.format('MMM').toLowerCase();

    console.log(filePath)

  if (fs.existsSync(filePath)) {
    zip(
      filePath,
      './backup/backup' +
        '-month-' +
        startDate.format('MMM').toLowerCase() +
        '.zip'
    );
  }
};

monthBackup();
