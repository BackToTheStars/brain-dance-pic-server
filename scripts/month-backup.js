const { monthBackup } = require('../lib/backup');

(async () => {
  await monthBackup();
  process.exit();
})();
