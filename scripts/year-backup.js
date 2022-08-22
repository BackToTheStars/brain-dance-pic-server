const { zip } = require('zip-a-folder');
const moment = require('moment');
const fs = require('fs');

const yearBackup = () => {
  let startDate = moment();
  if (fs.existsSync('./static/images/' + startDate.format('YYYY'))) {
    zip(
      './static/images/' + startDate.format('YYYY'),
      './backup/backup' + '-year-' + startDate.format('YYYY') + '.zip'
    );
  }
};

yearBackup();
