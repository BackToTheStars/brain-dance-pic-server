require('../models/connect');
const Log = require('../models/log');

const TYPE_REPORT_RESTORE = 'report-restore';
const TYPE_REPORT_RESTORE_ERROR = 'report-restore-error';
const TYPE_REPORT_BACKUP_CRON = 'report-backup-cron';
const TYPE_BACKUP_MANUAL = 'report-backup-manual';
const TYPE_REPORT_BACKUP_CRON_ERROR = 'report-backup-cron-error';

const addLog = async (logType, params, info) => {
  const log = new Log({ logType, params, info });
  await log.save();
};

module.exports = {
  addLog,
  TYPE_REPORT_RESTORE,
  TYPE_REPORT_RESTORE_ERROR,
  TYPE_REPORT_BACKUP_CRON,
  TYPE_REPORT_BACKUP_CRON_ERROR,
  TYPE_BACKUP_MANUAL,
};
