// range_import.js

const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

const startDateArg = process.argv[2]; // Формат YYYY-MM-DD
const endDateArg = process.argv[3]; // Формат YYYY-MM-DD
const mediaTypes = process.argv.slice(4); // Список типов контента

if (!startDateArg || !endDateArg || mediaTypes.length === 0) {
  console.log(
    'Usage: node range_import.js <startDate> <endDate> <mediaType1> [<mediaType2> ...]'
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
        // Путь к архиву
        const archivePath = path.join(
          '/backups/daily',
          mediaType,
          `${date}.tar.gz`
        );

        if (!(await fs.pathExists(archivePath))) {
          console.log(
            `Backup for ${mediaType} on ${date} does not exist. Skipping.`
          );
          continue;
        }

        // Вызываем скрипт daily_import.js
        await runDailyImport(archivePath, mediaType);
      }
    }

    console.log('Range import completed.');
    process.exit(0);
  } catch (error) {
    console.error('Error during range import:', error);
    process.exit(1);
  }
})();

function runDailyImport(archivePath, mediaType) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'daily_import.js');
    const child = spawn('node', [scriptPath, archivePath, mediaType], {
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`daily_import.js exited with code ${code}`));
      }
    });
  });
}
