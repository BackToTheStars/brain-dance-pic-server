const mongoose = require('mongoose');

const { mediaTypes } = require('../../../config/media');
const { MEDIA_HOST } = require('../../../config/url');

// Страница по умолчанию и её потолок. Таблица админки листается, а не
// выгружается целиком.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
// Предохранитель от ?page=1000000: номер страницы задаёт $limit в конвейере.
const MAX_PAGE = 10000;

// Поля, по которым таблица сортирует. size и storedAt берутся из GridFS, то
// есть появляются только после сверки, — поэтому и сортировка живёт в
// конвейере, а не в обычном find.
const SORT_FIELDS = [
  'uploadDate',
  'filename',
  'size',
  'storedAt',
  'accessCount',
  'lastAccessAt',
];

// Поиск по подстроке — не по шаблону: точка в имени файла должна искать точку,
// а не «любой символ», и уж тем более скобка не должна ронять запрос.
const escapeRegExp = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseList = (value) =>
  String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function parseNumber(value, name, errors) {
  if (value === undefined || value === '') return null;

  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    errors.push(`${name}: ожидалось число байт, получено «${value}».`);

    return null;
  }

  return number;
}

function parseInteger(value, name, errors, { min, max, fallback }) {
  if (value === undefined || value === '') return fallback;

  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    errors.push(
      `${name}: ожидалось целое от ${min} до ${max}, получено «${value}».`
    );

    return fallback;
  }

  return number;
}

// Дата принимается и как ISO-строка, и как миллисекунды: первое удобно писать
// руками, второе — отдавать из UI.
function parseDate(value, name, errors) {
  if (value === undefined || value === '') return null;

  const raw = /^\d+$/.test(String(value)) ? Number(value) : String(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${name}: не разобрана дата «${value}».`);

    return null;
  }

  return date;
}

// Разбор и проверка query. Ошибки собираются все сразу: чинить их по одной,
// каждый раз перезапрашивая ручку, — то ещё удовольствие.
function parseListQuery(query = {}) {
  const errors = [];

  let types = mediaTypes;
  if (query.type !== undefined && query.type !== '') {
    types = parseList(query.type);
    const unknown = types.filter((type) => !mediaTypes.includes(type));
    if (unknown.length > 0) {
      errors.push(
        `type: неизвестные типы — ${unknown.join(', ')}; известные: ${mediaTypes.join(', ')}.`
      );
    }
  }

  const name = query.name === undefined ? '' : String(query.name).trim();

  const minSize = parseNumber(query.minSize, 'minSize', errors);
  const maxSize = parseNumber(query.maxSize, 'maxSize', errors);
  if (minSize !== null && maxSize !== null && minSize > maxSize) {
    errors.push('minSize больше maxSize.');
  }

  const from = parseDate(query.from, 'from', errors);
  const to = parseDate(query.to, 'to', errors);
  if (from && to && from > to) {
    errors.push('from позже to.');
  }

  const sort = query.sort === undefined ? 'uploadDate' : String(query.sort);
  if (!SORT_FIELDS.includes(sort)) {
    errors.push(`sort: сортировка только по ${SORT_FIELDS.join(', ')}.`);
  }

  const order =
    query.order === undefined ? 'desc' : String(query.order).toLowerCase();
  if (order !== 'asc' && order !== 'desc') {
    errors.push('order: только asc или desc.');
  }

  const page = parseInteger(query.page, 'page', errors, {
    min: 1,
    max: MAX_PAGE,
    fallback: 1,
  });
  const limit = parseInteger(query.limit, 'limit', errors, {
    min: 1,
    max: MAX_LIMIT,
    fallback: DEFAULT_LIMIT,
  });

  if (errors.length > 0) {
    return { error: errors.join(' ') };
  }

  return {
    value: { types, name, minSize, maxSize, from, to, sort, order, page, limit },
  };
}

// Фильтр по полям самой записи — имя и даты. Размера здесь нет: он лежит в
// GridFS, и всё, что с ним связано, разбирается ниже отдельно.
function buildRecordMatch({ name, from, to }) {
  const match = {};

  if (name) {
    const regex = { $regex: escapeRegExp(name), $options: 'i' };
    // Имя файла — uuid, человеку он ничего не говорит, поэтому ищем ещё и по
    // тому, под каким именем файл пришёл: originalname у upload, originalUrl
    // и title — у download-and-save и youtube.
    match.$or = [
      { filename: regex },
      { 'metadata.originalname': regex },
      { 'metadata.originalUrl': regex },
      { 'metadata.title': regex },
    ];
  }

  if (from || to) {
    match.uploadDate = {};
    if (from) match.uploadDate.$gte = from;
    if (to) match.uploadDate.$lte = to;
  }

  return match;
}

// Что отдаём из записи. metadata нужна целиком: из неё берутся исходные имена.
const RECORD_FIELDS = {
  filename: 1,
  contentType: 1,
  uploadDate: 1,
  metadata: 1,
  accessCount: 1,
  lastAccessAt: 1,
};

// Нужен ли GridFS до сортировки. И фильтр по размеру, и сортировка по полям
// файла требуют соединения раньше, чем отрезана страница: сортировать по
// тому, чего ещё нет, нельзя.
const needsFilesUpfront = ({ minSize, maxSize, sort }) =>
  minSize !== null || maxSize !== null || sort === 'size' || sort === 'storedAt';

// Приписать записи то, что видно только сверкой: размер, дату файла и число
// одноимённых версий. files — уже отсортированные по убыванию uploadDate.
function withFiles(doc, files) {
  const newest = files[0] || null;

  return {
    ...doc,
    // Одноимённых версий может быть несколько; getMedia отдаёт последнюю
    // (openDownloadStreamByName без revision), поэтому и размер показываем
    // от неё, а не от первой попавшейся.
    size: newest ? newest.length : null,
    storedAt: newest ? newest.uploadDate : null,
    fileCount: files.length,
  };
}

// Обычный путь. Страницу отбирает коллекция записей — по своим индексам, — и
// только потом в бакет уходит один запрос по именам этой страницы. Сверка не
// касается остальной коллекции: на проде это 50 имён вместо 681.
async function collectByPage(db, type, params) {
  const { sort, direction, fetch } = params;
  const match = buildRecordMatch(params);
  const records = db.collection(type);

  const [total, docs] = await Promise.all([
    records.countDocuments(match),
    records
      .find(match, { projection: RECORD_FIELDS })
      .sort({ [sort]: direction, _id: 1 })
      .limit(fetch)
      .toArray(),
  ]);

  const names = docs.map((doc) => doc.filename);
  const files = names.length
    ? await db
        .collection(`${type}.files`)
        .find(
          { filename: { $in: names } },
          { projection: { _id: 0, filename: 1, length: 1, uploadDate: 1 } }
        )
        .sort({ uploadDate: -1 })
        .toArray()
    : [];

  const byName = new Map();
  for (const file of files) {
    const list = byName.get(file.filename);
    if (list) {
      list.push(file);
    } else {
      byName.set(file.filename, [file]);
    }
  }

  return {
    total,
    docs: docs.map((doc) => withFiles(doc, byName.get(doc.filename) || [])),
  };
}

// Путь для фильтра и сортировки по размеру. Здесь соединение неизбежно до
// отбора страницы, поэтому оно делается там же, где живут данные, — одним
// $lookup на тип (не запросом на строку), по filename, под который у GridFS
// есть свой индекс. Цена известна: соединение пройдёт по всем записям,
// прошедшим фильтр, а не по одной странице.
async function collectWithLookup(db, type, params) {
  const { minSize, maxSize, sort, direction, fetch } = params;

  const stages = [
    { $match: buildRecordMatch(params) },
    {
      $lookup: {
        from: `${type}.files`,
        localField: 'filename',
        foreignField: 'filename',
        // В файле лежит ещё и копия metadata — проекция не даёт таскать её
        // через весь конвейер. Сортировка — ради одноимённых версий, см.
        // withFiles.
        pipeline: [
          { $sort: { uploadDate: -1 } },
          { $project: { _id: 0, length: 1, uploadDate: 1 } },
        ],
        as: 'files',
      },
    },
    {
      $addFields: {
        size: { $ifNull: [{ $arrayElemAt: ['$files.length', 0] }, null] },
        storedAt: {
          $ifNull: [{ $arrayElemAt: ['$files.uploadDate', 0] }, null],
        },
        fileCount: { $size: '$files' },
      },
    },
  ];

  if (minSize !== null || maxSize !== null) {
    const sizeMatch = {};
    if (minSize !== null) sizeMatch.$gte = minSize;
    if (maxSize !== null) sizeMatch.$lte = maxSize;
    // Записи без файла из такой выдачи выпадают: размера у них нет, ни в
    // какой диапазон они не попадают. Искать их — фильтром без размера.
    stages.push({ $match: { size: sizeMatch } });
  }

  stages.push({
    $facet: {
      items: [
        { $sort: { [sort]: direction, _id: 1 } },
        { $limit: fetch },
        { $project: { ...RECORD_FIELDS, size: 1, storedAt: 1, fileCount: 1 } },
      ],
      total: [{ $count: 'count' }],
    },
  });

  const [result] = await db.collection(type).aggregate(stages).toArray();

  return {
    docs: result?.items || [],
    total: result?.total?.[0]?.count || 0,
  };
}

function toItem(type, doc) {
  const metadata = doc.metadata || {};

  return {
    _id: doc._id,
    type,
    filename: doc.filename,
    contentType: doc.contentType || null,
    originalname: metadata.originalname || null,
    originalUrl: metadata.originalUrl || null,
    title: metadata.title || null,
    uploadDate: doc.uploadDate || null,
    // Ниже — то, чего в записи Media нет: видно только сверкой с GridFS.
    size: doc.size,
    storedAt: doc.storedAt,
    fileCount: doc.fileCount,
    missing: doc.fileCount === 0,
    duplicate: doc.fileCount > 1,
    // У записей старше этой волны полей учёта нет вовсе — в выдаче это ноль и
    // «не обращались», а не пустое место.
    accessCount: doc.accessCount || 0,
    lastAccessAt: doc.lastAccessAt || null,
    src: `${MEDIA_HOST}/${type}/${doc.filename}`,
  };
}

// Порядок как в mongo: сначала пусто (нет поля или null), потом значения.
function compareValues(a, b) {
  const aEmpty = a === null || a === undefined;
  const bEmpty = b === null || b === undefined;
  if (aEmpty || bEmpty) {
    if (aEmpty && bEmpty) return 0;

    return aEmpty ? -1 : 1;
  }

  const first = a instanceof Date ? a.getTime() : a;
  const second = b instanceof Date ? b.getTime() : b;
  if (first < second) return -1;
  if (first > second) return 1;

  return 0;
}

// Ключ сортировки берётся из документа до всякой подстановки: mongo считает
// отсутствующее поле и null одним и тем же, и слияние типов обязано считать
// так же. Иначе записи без accessCount (все, что старше этой волны) встали бы
// в процессе иначе, чем в базе, и страницы разъехались бы на границе.
const toEntry = (type, sort, doc) => ({
  key: doc[sort] === undefined ? null : doc[sort],
  id: String(doc._id),
  item: toItem(type, doc),
});

const compareEntries = (direction) => (a, b) => {
  const diff = compareValues(a.key, b.key) * direction;
  if (diff !== 0) return diff;

  return compareValues(a.id, b.id);
};

async function collectType(db, type, params) {
  const { sort } = params;
  const collected = needsFilesUpfront(params)
    ? await collectWithLookup(db, type, params)
    : await collectByPage(db, type, params);

  return {
    total: collected.total,
    entries: collected.docs.map((doc) => toEntry(type, sort, doc)),
  };
}

// Каждый тип — своя коллекция и свой бакет, общего курсора у них нет. Поэтому
// пагинация такая: у каждого типа берём начало выдачи длиной skip + limit,
// сливаем в общий порядок и режем страницу. Лишнее вычитывается только при
// глубоком листании и только кратно числу типов — на объёмах сервиса это
// дешевле любого промежуточного хранилища.
async function listMedia(params) {
  const db = mongoose.connection.db;
  const { types, order, page, limit } = params;
  const direction = order === 'asc' ? 1 : -1;
  const skip = (page - 1) * limit;
  const fetch = skip + limit;

  const collected = await Promise.all(
    types.map((type) => collectType(db, type, { ...params, direction, fetch }))
  );

  const items = collected
    .flatMap((result) => result.entries)
    .sort(compareEntries(direction))
    .slice(skip, skip + limit)
    .map((entry) => entry.item);

  return {
    items,
    total: collected.reduce((sum, result) => sum + result.total, 0),
  };
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_PAGE,
  SORT_FIELDS,
  parseListQuery,
  listMedia,
};
