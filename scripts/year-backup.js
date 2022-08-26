const { yearBackup } = require('../lib/backup');

(async () => {
  const result = await yearBackup();
  console.log({ result });
  process.exit();
})();
