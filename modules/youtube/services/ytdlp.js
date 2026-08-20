const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const {
  YTDLP_PROBE_TIMEOUT,
  YTDLP_DOWNLOAD_TIMEOUT,
} = require('../../../config/timeouts');
const {
  createJobDir,
  removeJobDir,
  getDirSize,
  findResultFile,
} = require('./tmp');

// Единственное место во всём сервисе, где запускается yt-dlp. Остальной модуль
// работает только с результатом этих двух функций, поэтому вынос слоя в
// отдельный контейнер — это перенос файла и замена тела probe/download на
// HTTP-вызов, а не переписывание вызывающего кода.
const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';

// Как часто сверяем размер скачанного с лимитом. filesize_approx у YouTube
// врёт в обе стороны, поэтому одного лишь --max-filesize мало.
const SIZE_CHECK_INTERVAL = 1000;

// Коды ошибок слоя. Контроллер раскладывает их по HTTP-статусам и ничего не
// знает ни про yt-dlp, ни про его коды возврата.
const ERR_INVALID = 'YOUTUBE_INVALID';
const ERR_TOO_LARGE = 'YOUTUBE_TOO_LARGE';
const ERR_TIMEOUT = 'YOUTUBE_TIMEOUT';
const ERR_ABORTED = 'YOUTUBE_ABORTED';
const ERR_FAILED = 'YOUTUBE_FAILED';

const layerError = (code, message) =>
  Object.assign(new Error(message), { code });

const tail = (text, limit = 500) =>
  text.length > limit ? text.slice(-limit) : text;

// URL приходит снаружи и попадает прямо в argv. Оболочки здесь нет (spawn без
// shell), но строка, начинающаяся с дефиса, была бы прочитана как флаг yt-dlp,
// поэтому пропускаем только http(s) и всё равно отделяем позиционный аргумент
// через '--'.
function assertSafeUrl(url) {
  if (typeof url !== 'string' || !url) {
    throw layerError(ERR_INVALID, 'Не передана ссылка на видео.');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw layerError(ERR_INVALID, 'Некорректная ссылка на видео.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw layerError(ERR_INVALID, 'Поддерживаются только http(s)-ссылки.');
  }
}

// Идентификатор формата тоже уходит в argv (значение -f). Форматы YouTube
// выглядят как '18', '22', '137+140' — ничего, кроме этого набора, не нужно.
function assertSafeFormatId(formatId) {
  if (typeof formatId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$/.test(formatId)) {
    throw layerError(ERR_INVALID, 'Некорректный идентификатор формата.');
  }
}

// Запуск yt-dlp. Возвращает результат как есть (код, сигнал, потоки) —
// трактуют его вызывающие функции, у них разные ожидания.
function runYtDlp(args, { timeout, signal, onChild } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(YTDLP_BIN, args, {
        timeout,
        killSignal: 'SIGKILL',
        signal,
        windowsHide: true,
      });
    } catch (error) {
      return reject(layerError(ERR_FAILED, error.message));
    }

    let stdout = '';
    let stderr = '';
    // Ограничение сверху: probe отдаёт JSON на сотни килобайт, но вешать
    // память на чужой ответ всё равно не стоит.
    const append = (buffer, chunk) =>
      (buffer + chunk).slice(-2 * 1024 * 1024);

    child.stdout.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });

    child.on('error', (error) => {
      if (error.name === 'AbortError') {
        return reject(layerError(ERR_ABORTED, 'Загрузка отменена.'));
      }
      if (error.code === 'ENOENT') {
        return reject(
          layerError(
            ERR_FAILED,
            `yt-dlp не найден (${YTDLP_BIN}). В образе он ставится вместе с python3, локально — на PATH или через YTDLP_BIN.`
          )
        );
      }
      reject(layerError(ERR_FAILED, error.message));
    });

    child.on('close', (code, closeSignal) => {
      resolve({ code, signal: closeSignal, stdout, stderr });
    });

    if (onChild) {
      onChild(child);
    }
  });
}

// Метаданные видео без скачивания. Наружу отдаётся уже нормализованная
// структура, а не сырой вывод yt-dlp: она и есть контракт слоя.
async function probe(url) {
  assertSafeUrl(url);

  const { code, signal, stdout, stderr } = await runYtDlp(
    ['-J', '--no-playlist', '--no-warnings', '--', url],
    { timeout: YTDLP_PROBE_TIMEOUT }
  );

  if (signal) {
    throw layerError(
      ERR_TIMEOUT,
      `yt-dlp не ответил за ${Math.round(YTDLP_PROBE_TIMEOUT / 1000)} с.`
    );
  }
  if (code !== 0) {
    throw layerError(
      ERR_FAILED,
      `yt-dlp завершился с кодом ${code}: ${tail(stderr) || 'без вывода'}`
    );
  }

  let info;
  try {
    info = JSON.parse(stdout);
  } catch {
    throw layerError(ERR_FAILED, 'yt-dlp вернул не JSON.');
  }

  return {
    title: info.title || null,
    duration: typeof info.duration === 'number' ? info.duration : null,
    formats: normalizeFormats(info.formats),
  };
}

// Только progressive-форматы: видео и звук уже в одном файле. За это решение
// (BP-4, решение 1) мы не ставим ffmpeg и знаем размер до скачивания.
function normalizeFormats(formats) {
  return (formats || [])
    .filter(
      (format) =>
        format.vcodec &&
        format.vcodec !== 'none' &&
        format.acodec &&
        format.acodec !== 'none'
    )
    .map((format) => {
      const exact = typeof format.filesize === 'number' ? format.filesize : null;
      const approximate =
        typeof format.filesize_approx === 'number'
          ? format.filesize_approx
          : null;

      return {
        formatId: String(format.format_id),
        ext: format.ext || null,
        resolution:
          format.resolution ||
          (format.width && format.height
            ? `${format.width}x${format.height}`
            : null),
        fps: typeof format.fps === 'number' ? format.fps : null,
        filesize: exact !== null ? exact : approximate,
        // Точного размера нет — показанный взят из filesize_approx.
        approx: exact === null && approximate !== null,
      };
    });
}

// Скачивание выбранного формата во временный файл. Возвращает путь к нему;
// удалить его обязан вызывающий — cleanupDownload().
async function download(url, formatId, maxBytes, { signal } = {}) {
  assertSafeUrl(url);
  assertSafeFormatId(formatId);

  const dir = createJobDir();
  let monitor = null;
  let killedForSize = false;

  try {
    const result = await runYtDlp(
      [
        '-f',
        formatId,
        '--no-playlist',
        '--no-progress',
        '--no-warnings',
        // Первый рубеж: yt-dlp сам не начнёт качать, если объявленный размер
        // больше лимита. Второй рубеж — сторож ниже, на случай вранья.
        '--max-filesize',
        String(maxBytes),
        '-o',
        path.join(dir, 'video.%(ext)s'),
        '--',
        url,
      ],
      {
        timeout: YTDLP_DOWNLOAD_TIMEOUT,
        signal,
        onChild: (child) => {
          monitor = setInterval(() => {
            if (getDirSize(dir) > maxBytes) {
              killedForSize = true;
              clearInterval(monitor);
              child.kill('SIGKILL');
            }
          }, SIZE_CHECK_INTERVAL);
        },
      }
    );

    if (killedForSize) {
      throw layerError(ERR_TOO_LARGE, 'Файл превысил лимит во время скачивания.');
    }
    if (result.signal) {
      throw layerError(
        ERR_TIMEOUT,
        `Скачивание не уложилось в ${Math.round(YTDLP_DOWNLOAD_TIMEOUT / 60000)} мин.`
      );
    }
    if (result.code !== 0) {
      throw layerError(
        ERR_FAILED,
        `yt-dlp завершился с кодом ${result.code}: ${tail(result.stderr) || 'без вывода'}`
      );
    }

    const file = findResultFile(dir);
    if (!file) {
      // На срабатывании --max-filesize yt-dlp выходит с кодом 0 и без файла,
      // поэтому пустой каталог сам по себе ещё не ошибка сервиса.
      if (/max-filesize/i.test(result.stdout + result.stderr)) {
        throw layerError(ERR_TOO_LARGE, 'Объявленный размер больше лимита.');
      }
      throw layerError(
        ERR_FAILED,
        `yt-dlp не оставил файла: ${tail(result.stdout + result.stderr) || 'без вывода'}`
      );
    }
    if (fs.statSync(file).size > maxBytes) {
      throw layerError(ERR_TOO_LARGE, 'Скачанный файл больше лимита.');
    }

    return file;
  } catch (error) {
    // На любой неудаче каталог задания уходит целиком — включая .part.
    removeJobDir(dir);
    throw error;
  } finally {
    clearInterval(monitor);
  }
}

// Убрать за успешным скачиванием: каталог задания вместе с файлом.
function cleanupDownload(tmpPath) {
  if (!tmpPath) {
    return;
  }
  removeJobDir(path.dirname(tmpPath));
}

module.exports = {
  YTDLP_BIN,
  ERR_INVALID,
  ERR_TOO_LARGE,
  ERR_TIMEOUT,
  ERR_ABORTED,
  ERR_FAILED,
  probe,
  download,
  cleanupDownload,
};
