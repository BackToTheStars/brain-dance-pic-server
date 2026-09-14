const mongoose = require('mongoose');

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

// mongoose глотает ошибку построения индекса: сервис стартует молча и без него.
async function checkMediaIndexes(types) {
  for (const type of types) {
    const Media = getMediaModel(type);
    try {
      const initError = await Media.init().then(
        () => null,
        (error) => error
      );
      const built = new Set(
        (await Media.collection.indexes()).map((index) => index.name)
      );
      const missing = Media.schema
        .indexes()
        .map(([fields]) => indexName(fields))
        .filter((name) => !built.has(name));

      if (missing.length > 0) {
        console.error(
          `[indexes] ${type}: НЕ ПОСТРОЕНЫ ИНДЕКСЫ ${missing.join(', ')}` +
            (initError ? ` — ${initError.message}` : '') +
            ` (одноимённые записи: node scripts/orphans.js --type=${type})`
        );
      }
    } catch (error) {
      console.error(`[indexes] ${type}: проверка индексов не удалась`, error);
    }
  }
}

module.exports = { getMediaModel, checkMediaIndexes };
