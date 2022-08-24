const { quarterBackup } = require('../lib/backup');

(async () => {
  await quarterBackup();
  process.exit();
})();
