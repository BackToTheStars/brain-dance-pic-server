// full_export.js

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017/media';
const OUTPUT_DIR = '/backups/full';

const dbName = 'media'; // Замените на имя вашей базы данных

(async () => {
  try {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .split('-')
      .slice(0, -1)
      .join('-');
    const backupName = `full_backup_${timestamp}`;
    const backupPath = path.join(OUTPUT_DIR, backupName);

    // Убедимся, что директория существует
    await fs.ensureDir(OUTPUT_DIR);

    // Команда для выполнения полного экспорта
    const command = `mongodump --uri="${MONGO_URL}" --out="${backupPath}"`;

    console.log('Starting full database export...');
    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Error during export: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      console.log(`Database exported successfully to ${backupPath}`);

      // Перемещаем файлы из папки media на уровень выше
      const mediaPath = path.join(backupPath, dbName);
      const files = await fs.readdir(mediaPath);
      for (const file of files) {
        await fs.move(path.join(mediaPath, file), path.join(backupPath, file), {
          overwrite: true,
        });
      }
      // Удаляем пустую папку media
      await fs.rmdir(mediaPath);

      // Создаем архив tar.gz
      const archivePath = `${backupPath}.tar.gz`;
      await createTarGz(backupPath, archivePath);

      // Удаляем временную папку
      await fs.remove(backupPath);

      console.log(`Backup archived successfully: ${archivePath}`);
    });
  } catch (error) {
    console.error('Error during full export:', error);
  }
})();

function createTarGz(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const tar = require('tar');
    tar
      .c(
        {
          gzip: true,
          file: outPath,
          cwd: path.dirname(sourceDir),
        },
        [path.basename(sourceDir)]
      )
      .then(resolve)
      .catch(reject);
  });
}

// full_export.js

// const { exec } = require('child_process');
// const path = require('path');
// const fs = require('fs-extra');
// const tar = require('tar');

// const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017/media';
// const OUTPUT_DIR = '/backups/full';

// (async () => {
//   try {
//     const timestamp = new Date()
//       .toISOString()
//       .replace(/[:.]/g, '-')
//       .replace('T', '_')
//       .split('-')
//       .slice(0, -1)
//       .join('-');

//     const backupName = `full_backup_${timestamp}`;
//     const backupPath = path.join(OUTPUT_DIR, backupName);

//     // Убедимся, что директория существует
//     await fs.ensureDir(OUTPUT_DIR);

//     // Команда для выполнения полного экспорта
//     const command = `mongodump --uri="${MONGO_URL}" --out="${backupPath}"`;

//     console.log('Starting full database export...');
//     exec(command, async (error, stdout, stderr) => {
//       if (error) {
//         console.error(`Error during export: ${error.message}`);
//         return;
//       }
//       if (stderr) {
//         console.error(`stderr: ${stderr}`);
//       }
//       console.log(`Database exported successfully to ${backupPath}`);

//       // Создаём архив tar.gz
//       const archivePath = `${backupPath}.tar.gz`;
//       await createTarGz(backupPath, archivePath);

//       // Удаляем временную папку
//       await fs.remove(backupPath);

//       console.log(`Backup archived successfully: ${archivePath}`);
//     });
//   } catch (error) {
//     console.error('Error during full export:', error);
//   }
// })();

// function createTarGz(sourceDir, outPath) {
//   return new Promise((resolve, reject) => {
//     // Получаем список файлов в директории
//     fs.readdir(sourceDir, (err, files) => {
//       if (err) {
//         return reject(err); // Если ошибка, отклоняем промис
//       }

//       // Полные пути к файлам
//       const filePaths = files.map((file) => path.join(sourceDir, file));

//       // Создаем архив
//       tar
//         .c(
//           {
//             gzip: true,
//             file: outPath,
//             cwd: sourceDir,
//           },
//           files // Передаем только имена файлов
//         )
//         .then(resolve)
//         .catch(reject);
//     });
//   });
// }
