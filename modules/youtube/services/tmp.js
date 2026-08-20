const fs = require('fs');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Свой именованный каталог, а не общий os.tmpdir(): чистка при старте сносит
// его целиком, и она не должна задевать чужие временные файлы.
const TMP_ROOT =
  process.env.YOUTUBE_TMP_DIR || path.join(os.tmpdir(), 'brain-media-youtube');

// Каждая загрузка — в собственном подкаталоге: yt-dlp кладёт рядом с итоговым
// файлом ещё и <name>.part, поэтому и считать размер, и убирать проще каталогом
// целиком, не угадывая имена.
function createJobDir() {
  const dir = path.join(TMP_ROOT, uuidv4());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function removeJobDir(dir) {
  if (!dir) {
    return;
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    // Уборка не должна ронять ответ клиенту — достаточно следа в логе.
    console.error(
      '[youtube] не удалось удалить временный каталог',
      dir,
      error.message
    );
  }
}

// Суммарный размер содержимого каталога задания: итоговый файл плюс .part.
// По нему сторожим лимит во время скачивания.
function getDirSize(dir) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      total += entry.isDirectory() ? getDirSize(full) : fs.statSync(full).size;
    } catch {
      // Файл мог быть переименован или удалён между readdir и stat —
      // на следующей проверке размер посчитается заново.
    }
  }

  return total;
}

// Итоговый файл задания: недокачанные (.part) и служебные (.ytdl) не в счёт.
// Если файлов почему-то несколько — берём самый большой.
function findResultFile(dir) {
  let files;
  try {
    files = fs
      .readdirSync(dir)
      .filter((name) => !name.endsWith('.part') && !name.endsWith('.ytdl'))
      .map((name) => path.join(dir, name))
      .filter((full) => {
        try {
          return fs.statSync(full).isFile();
        } catch {
          return false;
        }
      });
  } catch {
    return null;
  }

  if (files.length === 0) {
    return null;
  }

  return files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
}

// Чистка при старте сервиса: после падения или перезапуска в каталоге могли
// остаться недокачанные файлы, удалять их некому.
function cleanTmpRoot() {
  try {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  } catch (error) {
    console.error(
      '[youtube] не удалось очистить временный каталог',
      TMP_ROOT,
      error.message
    );
  }
  fs.mkdirSync(TMP_ROOT, { recursive: true });
}

module.exports = {
  TMP_ROOT,
  createJobDir,
  removeJobDir,
  getDirSize,
  findResultFile,
  cleanTmpRoot,
};
