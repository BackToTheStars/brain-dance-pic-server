require('../config');
require('../models/connect');
const {
  addLog,
  TYPE_REPORT_RESTORE,
  TYPE_REPORT_RESTORE_ERROR,
} = require('../lib/logs');
const {
  restoreBackup,
  restoreBackupFolder,
  checkIfExists,
} = require('../lib/restore');

const start = async () => {
  try {
    const firstArg = process.argv[2];
    const reports = {};

    if (firstArg == 'full') {
      for (let type of ['year', 'month', 'day']) {
        if (checkIfExists(type)) {
          reports[type] = await restoreBackupFolder(type);
        }
      }
    } else {
      reports['file'] = await restoreBackup(firstArg);
    }

    console.log('RESTORE REPORTS');
    console.log(JSON.stringify(reports, null, 2));
    await addLog(TYPE_REPORT_RESTORE, firstArg, reports);
    process.exit();
  } catch (err) {
    console.log('RESTORE ERROR');
    console.log(err);
    await addLog(TYPE_REPORT_RESTORE_ERROR, process.argv, err);
    process.exit();
  }
};

start();
