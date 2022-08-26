const { weekBackup } = require('../lib/backup');

(async () => {
  const result = await weekBackup();
  console.log({ result });
  process.exit();
})();
