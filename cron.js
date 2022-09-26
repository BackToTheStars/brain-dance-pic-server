require('./config');
const CronJob = require('cron').CronJob;
const fs = require('fs');
const moment = require('moment');
const path = require('path');
const { backupBasePath } = require('./config/path');
const { pastDayBackup, monthBackup, yearBackup } = require('./lib/backup');
const {
  TYPE_REPORT_BACKUP_CRON,
  addLog,
  TYPE_REPORT_BACKUP_CRON_ERROR,
} = require('./lib/logs');

const clearFolder = (folderName) => {
  const folderPath = path.join(backupBasePath, folderName);
  const files = fs.readdirSync(folderPath);
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
};

new CronJob(
  '0 0 1 * * *',
  async () => {
    try {
      const report = {};
      const utcDate = moment().utc();
      if (utcDate.format('DD') == '01' && utcDate.format('MM') != '01') {
        report.type = 'month';
        report.info = await monthBackup();
        if (report.info.success) {
          clearFolder('day');
        }
      } else if (utcDate.format('MM') == '01' && utcDate.format('DD') == '01') {
        report.type = 'year';
        report.info = await yearBackup();
        if (report.info.success) {
          clearFolder('month');
          clearFolder('day');
        }
      } else {
        report.type = 'day';
        report.info = await pastDayBackup();
      }
      await addLog(TYPE_REPORT_BACKUP_CRON, null, report);
    } catch (err) {
      await addLog(TYPE_REPORT_BACKUP_CRON_ERROR, null, err);
    }
  },
  null,
  true,
  'UTC+0'
);
