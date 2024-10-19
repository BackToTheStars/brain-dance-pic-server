const cron = require('node-cron');
const { exec } = require('child_process');

// Расписание для запуска скриптов каждый день в 2:00
cron.schedule('0 2 * * *', () => {
  console.log('Running backup task at 2:00 AM');

  // Выполняем команды для бэкапа
  exec(
    'node /app/scripts/daily_export.js $(date -d yesterday +%Y-%m-%d) images',
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing backup for images: ${error}`);
        return;
      }
      console.log(`Backup result for images: ${stdout}`);
    }
  );

  exec(
    'node /app/scripts/daily_export.js $(date -d yesterday +%Y-%m-%d) audios',
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing backup for audios: ${error}`);
        return;
      }
      console.log(`Backup result for audios: ${stdout}`);
    }
  );

  exec(
    'node /app/scripts/daily_export.js $(date -d yesterday +%Y-%m-%d) videos',
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing backup for videos: ${error}`);
        return;
      }
      console.log(`Backup result for videos: ${stdout}`);
    }
  );
});

console.log('Scheduler started');
