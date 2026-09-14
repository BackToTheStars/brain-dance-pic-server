// Починка имён загруженных файлов, испорченных приёмом: multer до правки читал
// имя из multipart как latin1, и байты UTF-8 ложились в metadata.originalname
// латиницей («Ð¢Ð°Ð±Ð»Ð¸ÑÐ°.pdf» вместо «Таблица.pdf»). Имя лежит в двух местах —
// в записи описи <тип> и в документе <тип>.files, — скрипт правит оба.
//
//   node scripts/names.js                  отчёт по всем типам, ничего не меняет
//   node scripts/names.js --type=pdfs      отчёт по одному типу
//   node scripts/names.js --apply          исправить восстановимые
//   node scripts/names.js --revert         вернуть сохранённые прежние значения
require('dotenv').config();

const mongoose = require('mongoose');

const { MONGO_URL } = require('../config/db');
const { mediaTypes } = require('../config/media');

const PREVIOUS_FIELD = 'originalnameLatin1';

const HELP = `Имена файлов, испорченные чтением UTF-8 как latin1.

  node scripts/names.js [--type=<тип>] [--apply | --revert]

  --type=<тип>   ограничить типом: ${mediaTypes.join(', ')}; можно повторять
  --apply        исправить восстановимые; прежнее значение — в metadata.${PREVIOUS_FIELD}
  --revert       вернуть metadata.originalname из metadata.${PREVIOUS_FIELD}
  --help         этот текст

Без --apply и --revert скрипт ничего не меняет.`;

const REPLACEMENT_CHAR = '\u{fffd}';

// fixable — восстанавливается перекодировкой; broken — похоже на испорченное, но
// не восстанавливается; ok — всё остальное, в том числе законное «café.pdf».
function classifyName(name) {
  if (typeof name !== 'string' || !/[\x80-\xff]/.test(name)) {
    return { status: 'ok' };
  }
  // Символ выше U+00FF latin1-чтением получиться не мог.
  if (/[^\x00-\xff]/.test(name)) {
    return { status: 'ok' };
  }

  const fixed = Buffer.from(name, 'latin1').toString('utf8');
  if (
    !fixed.includes(REPLACEMENT_CHAR) &&
    /[^\x00-\x7f]/.test(fixed) &&
    Buffer.from(fixed, 'utf8').toString('latin1') === name
  ) {
    return { status: 'fixable', fixed };
  }

  // Управляющие C1 или «ведущий байт + байт продолжения» в законном имени не встречаются.
  if (/[\x80-\x9f]|[\xc2-\xf4][\x80-\xbf]/.test(name)) {
    return { status: 'broken' };
  }

  return { status: 'ok' };
}

function parseArgs(argv) {
  const options = { apply: false, revert: false, types: [] };

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--revert') {
      options.revert = true;
    } else if (arg.startsWith('--type=')) {
      options.types.push(
        ...arg
          .slice('--type='.length)
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      );
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
  if (options.apply && options.revert) {
    throw new Error('--apply и --revert вместе не запускаются.');
  }

  return options;
}

const MAX_EXAMPLES = 5;

// Пароль из строки подключения не печатается.
const describeTarget = (url) => url.replace(/\/\/[^@/]*@/, '//');

async function scanCollection(collection) {
  const result = { total: 0, fixable: [], broken: [], repaired: [] };
  const cursor = collection.find(
    { 'metadata.originalname': { $type: 'string' } },
    {
      projection: {
        filename: 1,
        'metadata.originalname': 1,
        [`metadata.${PREVIOUS_FIELD}`]: 1,
      },
    }
  );

  for await (const doc of cursor) {
    result.total += 1;
    const name = doc.metadata.originalname;
    if (doc.metadata[PREVIOUS_FIELD] !== undefined) {
      result.repaired.push({ doc, name, previous: doc.metadata[PREVIOUS_FIELD] });
      continue;
    }
    const verdict = classifyName(name);
    if (verdict.status === 'fixable') {
      result.fixable.push({ doc, name, fixed: verdict.fixed });
    } else if (verdict.status === 'broken') {
      result.broken.push({ doc, name });
    }
  }

  return result;
}

function printCollection(label, result) {
  console.log(
    `  ${label}: с именем — ${result.total}, восстанавливается — ${result.fixable.length}, ` +
      `испорчено и не восстанавливается — ${result.broken.length}, ` +
      `уже исправлено (есть ${PREVIOUS_FIELD}) — ${result.repaired.length}`
  );
  for (const { doc, name, fixed } of result.fixable.slice(0, MAX_EXAMPLES)) {
    console.log(`    ${doc._id}  ${doc.filename}  «${name}» → «${fixed}»`);
  }
  if (result.fixable.length > MAX_EXAMPLES) {
    console.log(`    … и ещё ${result.fixable.length - MAX_EXAMPLES}`);
  }
  // Невосстановимые не трогаются никогда, поэтому перечисляются все.
  for (const { doc, name } of result.broken) {
    console.log(`    не восстанавливается: ${doc._id}  ${doc.filename}  «${name}»`);
  }
}

// Условие на прежнее значение делает правку повторяемой: второй --apply не находит
// документов с испорченным именем и без сохранённого поля.
async function applyCollection(collection, result) {
  let changed = 0;
  for (const { doc, name, fixed } of result.fixable) {
    const { modifiedCount } = await collection.updateOne(
      {
        _id: doc._id,
        'metadata.originalname': name,
        [`metadata.${PREVIOUS_FIELD}`]: { $exists: false },
      },
      {
        $set: {
          'metadata.originalname': fixed,
          [`metadata.${PREVIOUS_FIELD}`]: name,
        },
      }
    );
    changed += modifiedCount;
  }

  return changed;
}

// Возвращается только то, что мог сделать --apply: текущее имя обязано совпадать с
// починкой сохранённого. Поле с тем же именем, пришедшее в теле загрузки, не сработает.
async function revertCollection(collection, result) {
  let changed = 0;
  const skipped = [];
  for (const { doc, name, previous } of result.repaired) {
    const verdict = classifyName(previous);
    if (verdict.status !== 'fixable' || verdict.fixed !== name) {
      skipped.push(doc);
      continue;
    }
    const { modifiedCount } = await collection.updateOne(
      {
        _id: doc._id,
        'metadata.originalname': name,
        [`metadata.${PREVIOUS_FIELD}`]: previous,
      },
      {
        $set: { 'metadata.originalname': previous },
        $unset: { [`metadata.${PREVIOUS_FIELD}`]: '' },
      }
    );
    changed += modifiedCount;
  }

  return { changed, skipped };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);

    return;
  }

  const options = parseArgs(argv);
  const types = options.types.length > 0 ? options.types : mediaTypes;
  const mode = options.apply ? 'apply' : options.revert ? 'revert' : 'report';

  console.log(`База: ${describeTarget(MONGO_URL)}; режим: ${mode}`);

  await mongoose.connect(MONGO_URL);
  try {
    const db = mongoose.connection.db;
    const totals = { fixable: 0, broken: 0, repaired: 0, changed: 0 };

    for (const type of types) {
      console.log(`\n${type}`);
      for (const [label, name] of [
        ['опись', type],
        ['GridFS', `${type}.files`],
      ]) {
        const collection = db.collection(name);
        const result = await scanCollection(collection);
        printCollection(label, result);
        totals.fixable += result.fixable.length;
        totals.broken += result.broken.length;
        totals.repaired += result.repaired.length;

        if (mode === 'apply') {
          const changed = await applyCollection(collection, result);
          totals.changed += changed;
          console.log(`    исправлено: ${changed}`);
        } else if (mode === 'revert') {
          const { changed, skipped } = await revertCollection(collection, result);
          totals.changed += changed;
          console.log(`    возвращено: ${changed}`);
          for (const doc of skipped) {
            console.log(
              `    пропущено (имя не совпадает с починкой ${PREVIOUS_FIELD}): ${doc._id}  ${doc.filename}`
            );
          }
        }
      }
    }

    console.log(
      `\nИтого документов: восстанавливается — ${totals.fixable}, ` +
        `не восстанавливается — ${totals.broken}, уже исправлено — ${totals.repaired}` +
        (mode === 'report' ? '' : `; изменено — ${totals.changed}`)
    );
    if (mode === 'report' && totals.fixable > 0) {
      console.log('Это только отчёт. Правка: --apply; откат: --revert.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { classifyName, PREVIOUS_FIELD };
