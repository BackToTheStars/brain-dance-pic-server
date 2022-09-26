require('../config');
const { pastDayBackup } = require('../lib/backup');
const { addLog, TYPE_BACKUP_MANUAL } = require('../lib/logs');

(async () => {
  const result = await pastDayBackup();
  console.log({ result });
  await addLog(TYPE_BACKUP_MANUAL, 'month', result);
  process.exit();
})();
