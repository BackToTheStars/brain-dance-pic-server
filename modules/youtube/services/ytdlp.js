const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const {
  YTDLP_PROBE_TIMEOUT,
  YTDLP_DOWNLOAD_TIMEOUT,
} = require('../../../config/timeouts');
const {
  createJobDir,
  removeJobDir,
  getDownloadedSize,
  findResultFile,
} = require('./tmp');

// Единственное место во всём сервисе, где запускается yt-dlp. Остальной модуль
// работает только с результатом этих двух функций, поэтому вынос слоя в
// отдельный контейнер — это перенос файла и замена тела probe/download на
// HTTP-вызов, а не переписывание вызывающего кода.
const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';

// Контейнер результата склейки. mp4 принимает и h264, и AAC-звук без
// перекодирования, а клиент играет его везде.
const MERGE_FORMAT = 'mp4';

// Как часто сверяем скачанное с лимитом. filesize_approx у YouTube врёт в обе
// стороны, поэтому одного лишь --max-filesize мало.
const SIZE_CHECK_INTERVAL = 1000;

// Потолки на вывод чужого процесса (память не должна зависеть от его ответа).
// Они разные, потому что буфер держит ХВОСТ: stderr нужен только ради текста
// ошибки, а stdout — это целый JSON от -J, и обрезанное начало валило бы
// JSON.parse ошибкой «yt-dlp вернул не JSON» на любом probe этого видео.
// Замер 21.08.2026 (yt-dlp 2026.08.19): у ролика с большим набором
// автосубтитров -J отдаёт 634 КБ — потолок в 2 МБ давал лишь троекратный
// запас, поэтому для stdout он поднят.
const STDOUT_LIMIT = 16 * 1024 * 1024;
const STDERR_LIMIT = 2 * 1024 * 1024;

// Порядок предпочтения кодеков внутри одного разрешения. h264 ложится в mp4
// remux'ом и играется где угодно; vp9 и av1 в mp4 тоже лягут, но игрок может
// их не взять, поэтому они — запасной вариант. Звук: mp4a (m4a) для mp4
// родной, opus попадает туда нестандартно.
const VIDEO_CODEC_ORDER = ['avc1', 'h264', 'vp9', 'vp09', 'av01'];
const AUDIO_CODEC_ORDER = ['mp4a', 'opus'];

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

// Селектор формата тоже уходит в argv (значение -f). У нас он выглядит как
// '18' (одиночный progressive) или '137+140' (пара дорожек) — ничего, кроме
// этого набора, не нужно.
function assertSafeFormatId(formatId) {
  if (typeof formatId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$/.test(formatId)) {
    throw layerError(ERR_INVALID, 'Некорректный идентификатор формата.');
  }
}

// Своя группа процессов на posix: для склейки yt-dlp запускает ffmpeg
// отдельным процессом, а Node снимает только сам yt-dlp. Переживший отмену
// ffmpeg продолжил бы писать в каталог задания, который мы уже удаляем
// (на Windows незакрытый файл вдобавок не даёт удалить каталог вовсе).
const OWN_PROCESS_GROUP = process.platform !== 'win32';

function killTree(child) {
  if (!child.pid) {
    return;
  }

  try {
    if (OWN_PROCESS_GROUP) {
      // Минус перед pid — «всей группе», то есть и yt-dlp, и его ffmpeg.
      process.kill(-child.pid, 'SIGKILL');
      return;
    }
    // На Windows групп процессов в этом смысле нет — дерево снимает taskkill.
    // Синхронно: следом за убийством идёт уборка каталога.
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
    });
  } catch {
    // Группы уже нет (все вышли сами) — на всякий случай добиваем процесс.
    try {
      child.kill('SIGKILL');
    } catch {
      // Процесс завершился между проверкой и сигналом — убивать нечего.
    }
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
        detached: OWN_PROCESS_GROUP,
      });
    } catch (error) {
      return reject(layerError(ERR_FAILED, error.message));
    }

    let stdout = '';
    let stderr = '';
    const append = (buffer, chunk, limit) => (buffer + chunk).slice(-limit);

    child.stdout.on('data', (chunk) => {
      stdout = append(stdout, chunk, STDOUT_LIMIT);
    });
    child.stderr.on('data', (chunk) => {
      stderr = append(stderr, chunk, STDERR_LIMIT);
    });

    child.on('error', (error) => {
      if (error.name === 'AbortError') {
        // Node убил только yt-dlp; ffmpeg добираем группой прежде, чем
        // вызывающий начнёт сносить каталог задания.
        killTree(child);
        return reject(layerError(ERR_ABORTED, 'Загрузка отменена.'));
      }
      if (error.code === 'ENOENT') {
        return reject(
          layerError(
            ERR_FAILED,
            `yt-dlp не найден (${YTDLP_BIN}). В образе он ставится вместе с python3 и ffmpeg, локально — на PATH или через YTDLP_BIN.`
          )
        );
      }
      reject(layerError(ERR_FAILED, error.message));
    });

    child.on('close', (code, closeSignal) => {
      // Процесс сняли извне (таймаут spawn или сторож размера) — по той же
      // причине проходим по группе: сам yt-dlp мёртв, ffmpeg мог остаться.
      if (closeSignal) {
        killTree(child);
      }
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
    formats: buildVariants(info.formats),
  };
}

// Место кодека в списке предпочтений; неизвестный уходит в конец.
function codecRank(codec, order) {
  const value = String(codec || '').toLowerCase();
  const index = order.findIndex((name) => value.startsWith(name));

  return index === -1 ? order.length : index;
}

// Размер дорожки: точный, если он есть, иначе оценка yt-dlp. approx помнит,
// какой из двух это был: сумма пары приблизительна вся целиком, даже если
// вторая дорожка известна точно.
function readSize(format) {
  const exact = typeof format.filesize === 'number' ? format.filesize : null;
  const approximate =
    typeof format.filesize_approx === 'number' ? format.filesize_approx : null;

  return {
    bytes: exact !== null ? exact : approximate,
    approx: exact === null && approximate !== null,
  };
}

// У многих аудиодорожек YouTube есть DRC-двойник (нормализованная громкость,
// суффикс '-drc' в id) — байт в байт того же размера и битрейта. При прочих
// равных берём обычную: это исходный звук, и селектор выходит привычный
// ('137+140', а не '137+140-drc').
const isDrc = (format) => /-drc$/i.test(String(format.format_id));

const hasVideo = (format) => Boolean(format.vcodec) && format.vcodec !== 'none';
const hasAudio = (format) => Boolean(format.acodec) && format.acodec !== 'none';

// Годится ли формат в кандидаты: нужен обычный https-файл с известным
// размером. HLS-потоки (m3u8) и раскадровки (mhtml) отсекаем — ни размера,
// ни смысла в них нет.
function isUsable(format) {
  if (!format || !format.format_id || format.ext === 'mhtml') {
    return false;
  }
  const protocol = format.protocol || 'https';

  return protocol === 'https' || protocol === 'http';
}

// Внутри одного разрешения: сначала совместимость кодека, потом битрейт.
function compareVideo(a, b) {
  const rank =
    codecRank(a.vcodec, VIDEO_CODEC_ORDER) - codecRank(b.vcodec, VIDEO_CODEC_ORDER);

  return rank !== 0 ? rank : (b.tbr || 0) - (a.tbr || 0);
}

// Аудиодорожка одна на все пары, поэтому берётся лучшая: сначала контейнер,
// потом битрейт, и уже между одинаковыми — обычная дорожка вместо DRC.
function compareAudio(a, b) {
  const rank =
    codecRank(a.acodec, AUDIO_CODEC_ORDER) - codecRank(b.acodec, AUDIO_CODEC_ORDER);
  if (rank !== 0) {
    return rank;
  }
  const bitrate = (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0);

  return bitrate !== 0 ? bitrate : Number(isDrc(a)) - Number(isDrc(b));
}

// Строка списка — одна на разрешение. Если высоты в метаданных нет, формат
// живёт под своим id и ни с чем не схлопывается.
function variantKey(format) {
  return typeof format.height === 'number' && format.height > 0
    ? `h${format.height}`
    : `id${format.format_id}`;
}

// Описание варианта для UI. Пара дорожек и progressive отличаются здесь только
// селектором и контейнером — дальше по коду они неразличимы.
function describeVariant(video, audio) {
  const videoSize = readSize(video);
  const audioSize = audio ? readSize(audio) : { bytes: 0, approx: false };
  const known = videoSize.bytes !== null && audioSize.bytes !== null;

  return {
    // Селектор для -f: '18' у progressive, '137+140' у пары. download
    // передаёт эту строку yt-dlp как есть, своего формата у нас нет.
    formatId: audio
      ? `${video.format_id}+${audio.format_id}`
      : String(video.format_id),
    // У пары контейнер задаёт склейка, а не дорожка.
    ext: audio ? MERGE_FORMAT : video.ext || null,
    resolution:
      video.resolution ||
      (video.width && video.height
        ? `${video.width}x${video.height}`
        : null),
    fps: typeof video.fps === 'number' ? video.fps : null,
    // Сумма обеих дорожек: столько займёт результат склейки.
    filesize: known ? videoSize.bytes + audioSize.bytes : null,
    // Точного размера нет хотя бы у одной дорожки — сумма приблизительная.
    approx: known && (videoSize.approx || audioSize.approx),
  };
}

// Варианты для UI. Progressive-форматов у YouTube больше нет (BP-4,
// решение 2), поэтому основа списка — пары «видео + лучшее аудио»; редкий
// progressive показывается, если он всё же нашёлся. Полный список — это два
// десятка строк на одно и то же разрешение, различающихся кодеком и
// битрейтом, поэтому на каждое разрешение остаётся один вариант.
function buildVariants(formats) {
  const usable = (formats || []).filter(isUsable);
  const bestAudio =
    usable
      .filter((format) => !hasVideo(format) && hasAudio(format))
      .sort(compareAudio)[0] || null;

  // Ключ — разрешение. Progressive занимает свои разрешения первым и остаётся
  // за ними: один готовый файл лучше пары, склейка ему не нужна.
  const variants = new Map();

  const addVariant = (video, audio) => {
    const key = variantKey(video);
    if (variants.has(key)) {
      return;
    }
    variants.set(key, {
      height: video.height || 0,
      ...describeVariant(video, audio),
    });
  };

  usable
    .filter((format) => hasVideo(format) && hasAudio(format))
    .forEach((format) => addVariant(format, null));

  if (bestAudio) {
    usable
      .filter((format) => hasVideo(format) && !hasAudio(format))
      .sort(compareVideo)
      .forEach((format) => addVariant(format, bestAudio));
  }

  // От мелкого к крупному: выбирают по объёму, и начинают с дешёвого.
  return [...variants.values()]
    .sort((a, b) => a.height - b.height)
    .map(({ height, ...variant }) => variant);
}

// Скачивание выбранного варианта во временный файл. Возвращает путь к нему;
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
        // Пару дорожек ffmpeg склеивает в mp4. Контейнеры совместимы, поэтому
        // это remux (-c copy), без перекодирования; на одиночном формате флаг
        // ничего не меняет.
        '--merge-output-format',
        MERGE_FORMAT,
        '--no-playlist',
        '--no-progress',
        '--no-warnings',
        // Первый рубеж: yt-dlp не начнёт качать дорожку, чей объявленный
        // размер больше лимита. Лимит здесь на дорожку, а не на сумму: сумму
        // проверяет вызывающий до старта, а факт — сторож ниже.
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
            if (getDownloadedSize(dir) > maxBytes) {
              killedForSize = true;
              clearInterval(monitor);
              killTree(child);
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
      // Отдельным текстом: причина не в видео и не в запросе, а в том, что
      // рядом нет ffmpeg — склеить дорожки нечем.
      if (/ffmpeg is not installed|ffmpeg not found/i.test(result.stderr)) {
        throw layerError(
          ERR_FAILED,
          'Для склейки дорожек нужен ffmpeg, а его нет на PATH.'
        );
      }
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
      // Сюда же попадает несостоявшаяся склейка: дорожки на диске есть, а
      // результата нет. Отдать вместо него дорожку значило бы положить в
      // GridFS видео без звука, поэтому findResultFile их не считает.
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
    // На любой неудаче каталог задания уходит целиком — вместе с .part и
    // обеими промежуточными дорожками.
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
  MERGE_FORMAT,
  ERR_INVALID,
  ERR_TOO_LARGE,
  ERR_TIMEOUT,
  ERR_ABORTED,
  ERR_FAILED,
  probe,
  download,
  cleanupDownload,
};
