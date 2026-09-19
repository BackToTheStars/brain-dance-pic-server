const mongoose = require('mongoose');
const { isDeepStrictEqual } = require('util');

function getMediaModel(contentType) {
  // Одна и та же модель нужна нескольким модулям (media и youtube — оба про
  // videos), а mongoose.model() со схемой второй раз для того же имени падает
  // с OverwriteModelError. Уже собранную отдаём как есть.
  if (mongoose.models[contentType]) {
    return mongoose.models[contentType];
  }

  const schema = new mongoose.Schema({
    filename: { type: String, required: true },
    metadata: { type: Object, default: {} },
    contentType: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    // Учёт обращений. Считает только начало просмотра и не
    // чаще раза в окно — вся логика в services/access.js.
    // У записей, сделанных до этой волны, полей нет: mongoose подставит
    // accessCount = 0 при чтении документа, а lastAccessAt так и останется
    // пустым — это и значит «обращений не было».
    lastAccessAt: { type: Date },
    accessCount: { type: Number, default: 0 },
    // Additional fields can be added here
  });

  // Под сортировку в админской таблице: 700+ записей на
  // прод-типе сортируются и без индекса, но таблица сортирует по этим полям
  // на каждый запрос, а стоят они на такой коллекции копейки.
  schema.index({ uploadDate: -1 });
  schema.index({ accessCount: -1 });
  schema.index({ lastAccessAt: -1 });
  // Запись и имя файла — одна сущность. На базе, где одноимённая запись уже есть,
  // индекс не строится, и об этом пишет checkMediaIndexes.
  schema.index({ filename: 1 }, { unique: true });
  schema.index({ 'metadata.gameId': 1 });
  schema.index({ 'metadata.gameHash': 1 });

  // Return a model with the collection name set to the contentType
  return mongoose.model(contentType, schema, contentType);
}

const indexName = (fields) =>
  Object.entries(fields)
    .map(([field, direction]) => `${field}_${direction}`)
    .join('_');

const show = (value) => (value === undefined ? 'нет' : JSON.stringify(value));

const sameKey = (fields, key = {}) => {
  const expected = Object.entries(fields);
  const actual = Object.entries(key);

  return (
    expected.length === actual.length &&
    expected.every(
      ([field, direction], position) =>
        actual[position][0] === field &&
        String(actual[position][1]) === String(direction)
    )
  );
};

// Имя индекса ничего не гарантирует: под ним может лежать другой ключ или тот же ключ
// без unique — запросы работают, а ограничение не действует.
function indexProblems(fields, options, index) {
  const problems = [];

  if (!sameKey(fields, index.key)) {
    problems.push(`ключ ${show(index.key)} вместо ${show(fields)}`);
  }
  for (const flag of ['unique', 'sparse']) {
    if (Boolean(options[flag]) !== Boolean(index[flag])) {
      problems.push(
        `${flag}: ожидалось ${Boolean(options[flag])}, в базе ${Boolean(index[flag])}`
      );
    }
  }
  if (
    !isDeepStrictEqual(options.partialFilterExpression, index.partialFilterExpression)
  ) {
    problems.push(
      `partialFilterExpression: ожидалось ${show(options.partialFilterExpression)}, ` +
        `в базе ${show(index.partialFilterExpression)}`
    );
  }
  // В collation mongo дописывает значения по умолчанию, поэтому сверяются объявленные
  // ключи; не объявлена в схеме — в базе её быть не должно.
  if (options.collation) {
    const actual = index.collation || {};
    const differs = Object.entries(options.collation)
      .filter(([key, value]) => !isDeepStrictEqual(actual[key], value))
      .map(([key]) => key);
    if (differs.length > 0) {
      problems.push(`collation: расходится по ${differs.join(', ')}`);
    }
  } else if (index.collation) {
    problems.push(`collation: в базе ${show(index.collation)}, в схеме нет`);
  }

  return problems;
}

// mongoose глотает ошибку построения индекса: сервис стартует молча и без него.
// Чужие индексы не трогаются: расхождение только сообщается.
async function checkMediaIndexes(types) {
  for (const type of types) {
    const Media = getMediaModel(type);
    const hint = ` (одноимённые записи: node scripts/orphans.js --type=${type})`;
    try {
      const initError = await Media.init().then(
        () => null,
        (error) => error
      );
      // Отдельно и всегда: при совпавших именах отказ init означает, что на месте
      // ожидаемого индекса остался прежний.
      if (initError) {
        console.error(
          `[indexes] ${type}: ПОСТРОЕНИЕ ИНДЕКСОВ ОТКЛОНЕНО — ${initError.message}${hint}`
        );
      }

      const built = new Map(
        (await Media.collection.indexes()).map((index) => [index.name, index])
      );
      const missing = [];
      for (const [fields, options = {}] of Media.schema.indexes()) {
        const name = options.name || indexName(fields);
        const index = built.get(name);
        if (!index) {
          missing.push(name);
          continue;
        }
        const problems = indexProblems(fields, options, index);
        if (problems.length > 0) {
          console.error(
            `[indexes] ${type}: ИНДЕКС ${name} НЕ ДАЁТ ОЖИДАЕМОЙ ГАРАНТИИ — ` +
              problems.join('; ') +
              (options.unique ? hint : '')
          );
        }
      }

      if (missing.length > 0) {
        console.error(
          `[indexes] ${type}: НЕ ПОСТРОЕНЫ ИНДЕКСЫ ${missing.join(', ')}${hint}`
        );
      }
    } catch (error) {
      console.error(`[indexes] ${type}: проверка индексов не удалась`, error);
    }
  }
}

module.exports = { getMediaModel, checkMediaIndexes };
