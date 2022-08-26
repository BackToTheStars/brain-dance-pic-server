const { todayBackup } = require('../lib/backup');

(async () => {
  const result = await todayBackup();
  console.log({ result });
  process.exit();
})()
