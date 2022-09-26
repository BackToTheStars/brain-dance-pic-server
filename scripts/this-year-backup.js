require('../config');
const { thisYearBackup } = require('../lib/backup');
const { addLog, TYPE_BACKUP_MANUAL } = require('../lib/logs');

(async () => {
  const result = await thisYearBackup();
  console.log({ result });
  await addLog(TYPE_BACKUP_MANUAL, 'this-year', result);
  process.exit();
})();
