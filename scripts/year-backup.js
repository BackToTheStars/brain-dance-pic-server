const { yearBackup } = require('../lib/backup');

(async () => {
  await yearBackup();
  process.exit();
})();
