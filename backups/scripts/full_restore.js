// full_restore.js

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017/media';
const BACKUP_ARCHIVE = process.argv[2];

if (!BACKUP_ARCHIVE) {
  console.log('Usage: node full_restore.js <backup_archive.tar.gz>');
  process.exit(1);
}

(async () => {
  try {
    const backupDir = path.join('/tmp', 'restore_temp');

    // Распаковываем архив
    await fs.ensureDir(backupDir);
    await extractTarGz(BACKUP_ARCHIVE, backupDir);

    // Путь к распакованному бэкапу
    const backupPath = path.join(
      backupDir,
      path.basename(BACKUP_ARCHIVE, '.tar.gz')
    );

    // Команда для выполнения полного восстановления
    const command = `mongorestore --uri="${MONGO_URL}" --drop "${backupPath}"`;

    console.log('Starting full database restore...');
    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Error during restore: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      console.log('Database restored successfully.');

      // Удаляем временную папку
      await fs.remove(backupDir);
      console.log('Temporary files removed.');
    });
  } catch (error) {
    console.error('Error during full restore:', error);
  }
})();

function extractTarGz(archivePath, outDir) {
  return new Promise((resolve, reject) => {
    const tar = require('tar');
    tar
      .x({
        file: archivePath,
        cwd: outDir,
      })
      .then(resolve)
      .catch(reject);
  });
}
