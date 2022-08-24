const { todayBackup } = require('../lib/backup');

(async () => {
  await todayBackup();
  process.exit();
})()
