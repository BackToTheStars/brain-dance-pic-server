const fs = require('fs');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Свой именованный каталог, а не общий os.tmpdir(): чистка при старте сносит
// его целиком, и она не должна задевать чужие временные файлы.
const TMP_ROOT =
  process.env.YOUTUBE_TMP_DIR || path.join(os.tmpdir(), 'brain-media-youtube');

// Промежуточные дорожки склейки: yt-dlp кладёт их рядом с результатом под
// именем <имя>.f<format_id>.<ext>, у недокачанной сверху ещё .part. Отличать
// их от итогового файла нужно дважды — при подсчёте скачанного и при поиске
// результата.
const TRACK_FILE_RE = /\.f\d+\.[^.]+(\.part)?$/;

// Каждая загрузка — в собственном подкаталоге: рядом с итоговым файлом лежат
// и .part, и обе промежуточные дорожки, поэтому считать размер и убирать
// проще каталогом целиком, не угадывая имена.
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

// Плоский список файлов каталога задания.
function listFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full));
      continue;
    }
    files.push(full);
  }

  return files;
}

function fileSize(full) {
  try {
    return fs.statSync(full).size;
  } catch {
    // Файл мог быть переименован или удалён между readdir и stat —
    // на следующей проверке размер посчитается заново.
    return 0;
  }
}

// Сколько байт задание уже скачало с YouTube. По этому числу сторожится лимит
// во время скачивания, и файл склейки в него намеренно не входит: на этапе
// merge в каталоге лежат и обе дорожки, и результат — около 2× итогового
// размера, — так что общий размер каталога принял бы это за превышение.
// Размер самого результата проверяется отдельно, после выхода yt-dlp.
function getDownloadedSize(dir) {
  const files = listFiles(dir);
  const tracks = files.filter((full) =>
    TRACK_FILE_RE.test(path.basename(full))
  );
  // Одиночный формат (progressive) промежуточных дорожек не создаёт: там
  // скачанное — это всё содержимое каталога.
  const counted = tracks.length > 0 ? tracks : files;

  return counted.reduce((total, full) => total + fileSize(full), 0);
}

// Итоговый файл задания. Не в счёт: недокачанные (.part), служебные (.ytdl),
// файл склейки в процессе (video.temp.mp4) и промежуточные дорожки — принять
// дорожку за результат значило бы положить в GridFS видео без звука. Если
// подходящих файлов почему-то несколько, берём самый большой.
function findResultFile(dir) {
  const files = listFiles(dir).filter((full) => {
    const name = path.basename(full);
    return (
      !name.endsWith('.part') &&
      !name.endsWith('.ytdl') &&
      !/\.temp\.[^.]+$/.test(name) &&
      !TRACK_FILE_RE.test(name)
    );
  });

  if (files.length === 0) {
    return null;
  }

  return files.sort((a, b) => fileSize(b) - fileSize(a))[0];
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
  getDownloadedSize,
  findResultFile,
  cleanTmpRoot,
};
