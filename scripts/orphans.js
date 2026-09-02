// Поиск файлов в GridFS, на которые нет записи Media. Через API такой
// файл недоступен: и отдача, и удаление сначала ищут запись Media и отвечают
// 404, — при этом в byType из /stats он виден и место занимает.
//
// Обратный случай (запись есть, файла нет) чинится обычным DELETE /<type>/:id,
// поэтому здесь не разбирается.
//
// По умолчанию скрипт только отчитывается. Удаление — явным флагом и только
// с указанием, что именно сносить:
//
//   node scripts/orphans.js                      отчёт по всем типам
//   node scripts/orphans.js --type=images        отчёт по одному типу
//   node scripts/orphans.js --delete --all       снести всех найденных сирот
//   node scripts/orphans.js --delete --type=videos
//   node scripts/orphans.js --delete --id=<id>[,<id>]
require('dotenv').config();

const mongoose = require('mongoose');

const { MONGO_URL } = require('../config/db');
const { mediaTypes, formatSize } = require('../config/media');

const HELP = `Поиск осиротевших файлов в GridFS (файл есть, записи Media нет).

  node scripts/orphans.js [--type=<тип>] [--delete (--all | --type=<тип> | --id=<id>[,<id>])]

  --type=<тип>   ограничить типом: ${mediaTypes.join(', ')}; можно повторять
  --delete       удалять, а не только показывать; требует цели
  --all          цель удаления: все найденные сироты
  --id=<id>      цель удаления: конкретные файлы по _id из GridFS
  --help         этот текст

Без --delete скрипт ничего не меняет.`;

function parseArgs(argv) {
  const options = { remove: false, all: false, types: [], ids: [], help: false };
  const list = (arg) =>
    arg
      .slice(arg.indexOf('=') + 1)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--delete') {
      options.remove = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg.startsWith('--type=')) {
      options.types.push(...list(arg));
    } else if (arg.startsWith('--id=')) {
      options.ids.push(...list(arg));
    } else {
      throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }

  const unknownType = options.types.find((type) => !mediaTypes.includes(type));
  if (unknownType) {
    throw new Error(
      `Неизвестный тип: ${unknownType}. Известные: ${mediaTypes.join(', ')}`
    );
  }

  // Цели удаления без самого --delete — почти наверняка недописанная команда,
  // а не намерение получить отчёт.
  if (!options.remove && (options.all || options.ids.length > 0)) {
    throw new Error('--all и --id имеют смысл только вместе с --delete.');
  }

  // Главный предохранитель: «удалить всё» должно быть сказано вслух. Голый
  // --delete не значит «снеси, что найдёшь».
  if (
    options.remove &&
    !options.all &&
    options.ids.length === 0 &&
    options.types.length === 0
  ) {
    throw new Error(
      'Не указано, что удалять: добавьте --all, --type=<тип> или --id=<id>.'
    );
  }

  return options;
}

// Сколько имён показывать списком, прежде чем свернуть остаток в счётчик.
const MAX_LISTED = 10;

const formatDate = (date) =>
  date instanceof Date ? date.toISOString().replace('T', ' ').slice(0, 19) : '—';

// Опознание сирот. Разностью двух distinct считать нельзя: GridFS разрешает
// несколько файлов с одним именем, и distinct по <type>.files схлопывает их в
// одну строку — два сироты с общим именем превратятся в один. Поэтому имена
// метаданных берём множеством (их distinct как раз уместен: в Media имя одно
// на запись), а файлы перебираем курсором, документ за документом.
async function scanType(db, type) {
  const files = db.collection(`${type}.files`);
  const knownNames = new Set(await db.collection(type).distinct('filename'));

  const orphans = [];
  // Счётчик только для имён, у которых запись Media есть: одноимённые версии
  // среди них — не сироты, но и молчать о них нельзя.
  const counts = new Map();

  const cursor = files.find(
    {},
    { projection: { filename: 1, length: 1, uploadDate: 1 } }
  );

  let total = 0;
  for await (const file of cursor) {
    total += 1;
    if (!knownNames.has(file.filename)) {
      orphans.push(file);
      continue;
    }
    counts.set(file.filename, (counts.get(file.filename) || 0) + 1);
  }

  const duplicateNames = [...counts]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);

  // Обратный случай: запись есть, файла нет. Скрипт про него только сообщает —
  // такая запись снимается обычным DELETE /<тип>/:id. Считается
  // даром: имя, для которого не встретилось ни одного файла, в counts не попало.
  const withoutFile = [...knownNames].filter((name) => !counts.has(name));

  // Подробности по одноимённым добираем отдельным запросом: их единицы, а
  // держать в памяти все документы ради этого не нужно.
  const duplicates = duplicateNames.length
    ? await files
        .find(
          { filename: { $in: duplicateNames } },
          { projection: { filename: 1, length: 1, uploadDate: 1 } }
        )
        .toArray()
    : [];

  return {
    type,
    filesTotal: total,
    metaTotal: knownNames.size,
    orphans,
    duplicates,
    withoutFile,
  };
}

function printReport(results) {
  let orphansTotal = 0;
  let bytesTotal = 0;

  for (const result of results) {
    const bytes = result.orphans.reduce((sum, file) => sum + file.length, 0);
    orphansTotal += result.orphans.length;
    bytesTotal += bytes;

    console.log(
      `\n${result.type}: файлов — ${result.filesTotal}, имён в Media — ${result.metaTotal}, ` +
        `сирот — ${result.orphans.length}` +
        (result.orphans.length ? ` (${formatSize(bytes)})` : '')
    );

    for (const file of result.orphans) {
      console.log(
        `  ${file._id.toString()}  ${file.filename}  ` +
          `${formatSize(file.length)}  ${formatDate(file.uploadDate)}`
      );
    }

    if (result.duplicates.length) {
      const names = new Set(result.duplicates.map((file) => file.filename));
      // Не сироты: запись Media на это имя есть. Какая из версий лишняя —
      // отдельный вопрос, поэтому скрипт их только показывает.
      console.log(
        `  одноимённые версии (запись Media есть, файлов больше одного): ` +
          `имён — ${names.size}, файлов — ${result.duplicates.length}; не удаляются`
      );
      for (const file of result.duplicates) {
        console.log(
          `    ${file._id.toString()}  ${file.filename}  ` +
            `${formatSize(file.length)}  ${formatDate(file.uploadDate)}`
        );
      }
    }

    if (result.withoutFile.length) {
      // Не сироты, а обратный случай: запись Media есть, файла нет. Показываем
      // потому, что путать их легко, а лечатся они по-разному.
      console.log(
        `  записей Media без файла: ${result.withoutFile.length} — ` +
          `это обратный случай, снимается DELETE /${result.type}/:id; ` +
          `скрипт их не трогает`
      );
      for (const name of result.withoutFile.slice(0, MAX_LISTED)) {
        console.log(`    ${name}`);
      }
      if (result.withoutFile.length > MAX_LISTED) {
        console.log(`    … и ещё ${result.withoutFile.length - MAX_LISTED}`);
      }
    }
  }

  console.log(
    `\nИтого сирот — ${orphansTotal}` +
      (orphansTotal ? ` (${formatSize(bytesTotal)})` : '')
  );

  return orphansTotal;
}

// Удаляются только те файлы, что сами же были опознаны как сироты: список id
// приходит снаружи, но сверяется с находками, а не уходит в bucket.delete как
// есть.
async function removeOrphans(db, results, options) {
  const wanted = new Set(options.ids);
  const targets = [];

  for (const result of results) {
    for (const file of result.orphans) {
      if (wanted.size === 0 || wanted.has(file._id.toString())) {
        targets.push({ type: result.type, file });
      }
    }
  }

  const missing = [...wanted].filter(
    (id) => !targets.some(({ file }) => file._id.toString() === id)
  );
  for (const id of missing) {
    console.log(`\nПропущен ${id}: среди сирот такого файла нет.`);
  }

  if (targets.length === 0) {
    console.log('\nУдалять нечего.');

    return;
  }

  console.log(`\nУдаление: файлов — ${targets.length}`);
  let bytes = 0;
  for (const { type, file } of targets) {
    const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: type });
    await bucket.delete(file._id);
    bytes += file.length;
    console.log(`  удалён ${type}/${file.filename} (${file._id.toString()})`);
  }
  console.log(`Освобождено: ${formatSize(bytes)}`);
}

async function main() {
  const argv = process.argv.slice(2);

  // Справка раньше разбора: у `--help` не должно быть требований к остальным
  // аргументам.
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);

    return;
  }

  const options = parseArgs(argv);

  const types = options.types.length > 0 ? options.types : mediaTypes;

  await mongoose.connect(MONGO_URL);
  try {
    const db = mongoose.connection.db;
    const results = [];
    for (const type of types) {
      results.push(await scanType(db, type));
    }

    const orphansTotal = printReport(results);

    if (!options.remove) {
      if (orphansTotal > 0) {
        console.log(
          'Это только отчёт. Удаление: --delete вместе с --all, --type=<тип> или --id=<id>.'
        );
      }

      return;
    }

    await removeOrphans(db, results, options);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
