const { monthBackup } = require('../lib/backup');

(async () => {
  const result = await monthBackup();
  console.log({ result });
  process.exit();
})();
