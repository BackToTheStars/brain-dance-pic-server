const CronJob = require('cron').CronJob;
const fs = require('fs');
const moment = require('moment');
const { staticImagesBasePath, backupBasePath } = require('./config/path');
const { todayBackup, monthBackup, yearBackup } = require('./lib/backup');

const jobDay = new CronJob(
  '0 1 * * *',
  async () => {
    if (
      moment().utc().format('DD') == '24' &&
      moment().utc().format('MM') != '01'
    ) {
      const filesDay = fs.readdirSync(backupBasePath + 'day');

      filesDay.forEach((file) => {
        if (fs.existsSync(backupBasePath + 'day/' + file)) {
          fs.unlinkSync(backupBasePath + 'day/' + file);
        }
      });
      await monthBackup();
    } else if (
      moment().utc().format('MM') == '01' &&
      moment().utc().format('DD') == '01'
    ) {
      const filesDay = fs.readdirSync(backupBasePath + 'day');

      filesDay.forEach((file) => {
        if (fs.existsSync(backupBasePath + 'day/' + file)) {
          fs.unlinkSync(backupBasePath + 'day/' + file);
        }
      });

      const filesMonth = fs.readdirSync(backupBasePath + 'month');

      filesMonth.forEach((file) => {
        if (fs.existsSync(backupBasePath + 'month/' + file)) {
          fs.unlinkSync(backupBasePath + 'month/' + file);
        }
      });

      await yearBackup();
    } else {
      await todayBackup();
    }
  },
  null,
  true,
  'UTC+0'
);
