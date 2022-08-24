const { weekBackup } = require('../lib/backup');

(async () => {
  await weekBackup();
  process.exit();
})();
