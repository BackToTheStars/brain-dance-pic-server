const { quarterBackup } = require('../lib/backup');

(async () => {
  const result = await quarterBackup();
  console.log({ result });
  process.exit();
})();
