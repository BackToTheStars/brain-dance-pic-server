// range_export.js

const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

const startDateArg = process.argv[2]; // Формат YYYY-MM-DD
const endDateArg = process.argv[3]; // Формат YYYY-MM-DD
const mediaTypes = process.argv.slice(4); // Список типов контента

if (!startDateArg || !endDateArg || mediaTypes.length === 0) {
  console.log(
    'Usage: node range_export.js <startDate> <endDate> <mediaType1> [<mediaType2> ...]'
  );
  process.exit(1);
}

(async () => {
  try {
    const startDate = new Date(startDateArg);
    const endDate = new Date(endDateArg);

    if (startDate > endDate) {
      console.error('Start date must be before end date.');
      process.exit(1);
    }

    // Создаем список дат
    const dates = [];
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      dates.push(currentDate.toISOString().slice(0, 10));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    for (const mediaType of mediaTypes) {
      for (const date of dates) {
        // Проверяем, существует ли архив
        const archivePath = path.join(
          '/backups/daily',
          mediaType,
          `${date}.tar.gz`
        );

        if (await fs.pathExists(archivePath)) {
          console.log(
            `Backup for ${mediaType} on ${date} already exists. Skipping.`
          );
        } else {
          // Вызываем скрипт daily_export.js
          await runDailyExport(date, mediaType);
        }
      }
    }

    console.log('Range export completed.');
    process.exit(0);
  } catch (error) {
    console.error('Error during range export:', error);
    process.exit(1);
  }
})();

function runDailyExport(date, mediaType) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'daily_export.js');
    const child = spawn('node', [scriptPath, date, mediaType], {
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`daily_export.js exited with code ${code}`));
      }
    });
  });
}
