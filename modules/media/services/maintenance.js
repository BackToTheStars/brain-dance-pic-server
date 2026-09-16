// Служебные проходы по metadata файлов: мёртвые ключи uploader / downloader и игра старых файлов.
// Каждое место — опись <тип> и <тип>.files (все версии имени).
const { mediaTypes } = require('../../../config/media');
const { GAME_ADDRESS_RE } = require('./list');

const DEAD_KEYS = ['uploader', 'downloader'];
const DEAD_KEYS_MODES = ['report', 'apply'];
const GAME_MODES = ['report', 'apply', 'revert'];
const BACKFILL_MARK = 'gameBackfill';
const VERDICTS = [
  'missing',
  'recordOnly',
  'fileOnly',
  'badMetadata',
  'conflict',
  'same',
  'pending',
];

const GAME_ID_RE = /^[0-9a-f]{24}$/;
const FILENAME_RE = /^[^/\\\x00-\x1f]{1,255}$/;
const MAX_ITEMS = 10000;
const LIST_LIMIT = 100;
const LOOKUP_CHUNK = 500;

const PLACES = [
  { place: 'records', collection: (type) => type },
  { place: 'files', collection: (type) => `${type}.files` },
];

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// $type конвейера, в отличие от оператора запроса, не заглядывает внутрь массивов.
const typeOf = (path) => ({ $type: `$${path}` });

const echo = (value) =>
  typeof value === 'string'
    ? value.slice(0, 100)
    : value === null || ['number', 'boolean', 'undefined'].includes(typeof value)
      ? value ?? null
      : `[${Array.isArray(value) ? 'array' : typeof value}]`;

function parseMode(body, modes, errors) {
  if (!modes.includes(body.mode)) {
    errors.push(`mode: ожидалось ${modes.join(' | ')}, получено «${echo(body.mode)}».`);
  }

  return body.mode;
}

function parseTypes(value, errors) {
  if (value === undefined) {
    return mediaTypes;
  }
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : null;
  if (!list) {
    errors.push('types: ожидался список типов.');

    return mediaTypes;
  }
  const types = [
    ...new Set(list.map((type) => String(type).trim()).filter(Boolean)),
  ];
  const unknown = types.filter((type) => !mediaTypes.includes(type));
  if (unknown.length > 0) {
    errors.push(
      `types: неизвестные типы — ${unknown.join(', ')}; известные: ${mediaTypes.join(', ')}.`
    );
  } else if (types.length === 0) {
    errors.push('types: пустой список.');
  }

  return types;
}

function parseDeadKeysBody(body) {
  if (!isPlainObject(body)) {
    return { error: 'Тело запроса — объект JSON.' };
  }
  const errors = [];
  const mode = parseMode(body, DEAD_KEYS_MODES, errors);
  const types = parseTypes(body.types, errors);

  return errors.length > 0
    ? { error: errors.join(' ') }
    : { value: { mode, types } };
}

function parseGameBackfillBody(body) {
  if (!isPlainObject(body)) {
    return { error: 'Тело запроса — объект JSON.' };
  }
  const errors = [];
  const mode = parseMode(body, GAME_MODES, errors);

  let gameId = null;
  if (body.gameId !== undefined) {
    if (typeof body.gameId === 'string' && GAME_ID_RE.test(body.gameId)) {
      gameId = body.gameId;
    } else {
      errors.push(
        `gameId: ожидалось 24 шестнадцатеричных символа в нижнем регистре, получено «${echo(body.gameId)}».`
      );
    }
  }

  if (mode === 'revert') {
    if (body.items !== undefined) {
      errors.push('items: откат идёт по метке прохода, элементы не принимаются.');
    }
    const types = parseTypes(body.types, errors);

    return errors.length > 0
      ? { error: errors.join(' ') }
      : { value: { mode, gameId, types } };
  }

  if (body.types !== undefined) {
    errors.push('types: принимается только в revert.');
  }
  if (!Array.isArray(body.items)) {
    errors.push('items: ожидался массив.');
  } else if (body.items.length > MAX_ITEMS) {
    errors.push(
      `items: не больше ${MAX_ITEMS} за запрос, получено ${body.items.length}.`
    );
  }

  return errors.length > 0
    ? { error: errors.join(' ') }
    : { value: { mode, gameId, items: body.items } };
}

function validateItem(item, scopeGameId) {
  if (!isPlainObject(item)) {
    return { reasons: ['элемент — не объект'] };
  }
  const { type, filename, gameId, gameHash } = item;
  const reasons = [];
  if (!mediaTypes.includes(type)) {
    reasons.push(`type: неизвестный тип «${echo(type)}»`);
  }
  if (typeof filename !== 'string' || !FILENAME_RE.test(filename)) {
    reasons.push('filename: от 1 до 255 символов, без /, \\ и управляющих');
  }
  if (typeof gameId !== 'string' || !GAME_ID_RE.test(gameId)) {
    reasons.push('gameId: 24 шестнадцатеричных символа в нижнем регистре');
  } else if (scopeGameId && gameId !== scopeGameId) {
    reasons.push('gameId: не совпадает с gameId запроса');
  }
  if (typeof gameHash !== 'string' || !GAME_ADDRESS_RE.test(gameHash)) {
    reasons.push('gameHash: латиница, цифры, - и _, до 64 символов');
  }

  return reasons.length > 0
    ? { reasons }
    : { value: { type, filename, gameId, gameHash } };
}

const fileKey = (type, filename) => `${type}/${filename}`;

// Одинаковые элементы схлопываются; файл с разными парами в одном запросе не трогается.
function normalizeItems(items, scopeGameId = null) {
  const invalid = [];
  const byFile = new Map();
  let repeated = 0;

  items.forEach((item, index) => {
    const checked = validateItem(item, scopeGameId);
    if (checked.reasons) {
      const shown = isPlainObject(item)
        ? {
            type: echo(item.type),
            filename: echo(item.filename),
            gameId: echo(item.gameId),
            gameHash: echo(item.gameHash),
          }
        : echo(item);
      invalid.push({ index, item: shown, reasons: checked.reasons });
      return;
    }
    const { type, filename, gameId, gameHash } = checked.value;
    const key = fileKey(type, filename);
    let entry = byFile.get(key);
    if (!entry) {
      entry = { type, filename, pairs: new Map() };
      byFile.set(key, entry);
    }
    const pairKey = `${gameId}/${gameHash}`;
    if (entry.pairs.has(pairKey)) {
      repeated += 1;
    } else {
      entry.pairs.set(pairKey, { gameId, gameHash });
    }
  });

  const files = [];
  const ambiguous = [];
  for (const { type, filename, pairs } of byFile.values()) {
    const list = [...pairs.values()];
    if (list.length > 1) {
      ambiguous.push({ type, filename, pairs: list });
    } else {
      files.push({ type, filename, ...list[0] });
    }
  }

  return { received: items.length, repeated, invalid, ambiguous, files };
}

function locationState(metadata, pair) {
  if (metadata === undefined) {
    return 'none';
  }
  if (!isPlainObject(metadata)) {
    return 'bad';
  }
  if (metadata.gameId === undefined && metadata.gameHash === undefined) {
    return 'none';
  }

  return metadata.gameId === pair.gameId && metadata.gameHash === pair.gameHash
    ? 'same'
    : 'other';
}

// found: { records: [{ _id, metadata }], files: [{ _id, metadata }] } одного имени.
function classifyFile(pair, found = {}) {
  const records = found.records || [];
  const files = found.files || [];
  if (records.length === 0 && files.length === 0) {
    return { verdict: 'missing' };
  }
  if (records.length === 0) {
    return { verdict: 'fileOnly' };
  }
  if (files.length === 0) {
    return { verdict: 'recordOnly' };
  }

  const locations = [
    ...records.map((doc) => ({ place: 'record', doc })),
    ...files.map((doc) => ({ place: 'file', doc })),
  ].map((location) => ({
    ...location,
    state: locationState(location.doc.metadata, pair),
  }));

  if (locations.some(({ state }) => state === 'bad')) {
    return { verdict: 'badMetadata' };
  }
  const others = locations.filter(({ state }) => state === 'other');
  if (others.length > 0) {
    return {
      verdict: 'conflict',
      existing: others.map(({ place, doc }) => ({
        place,
        _id: String(doc._id),
        gameId: echo(doc.metadata.gameId),
        gameHash: echo(doc.metadata.gameHash),
      })),
    };
  }
  const none = locations.filter(({ state }) => state === 'none');
  if (none.length === 0) {
    return { verdict: 'same' };
  }

  return {
    verdict: 'pending',
    write: {
      records: none.filter(({ place }) => place === 'record').length,
      files: none.filter(({ place }) => place === 'file').length,
    },
  };
}

function planGameBackfill(normalized, found) {
  return normalized.files.map((file) => ({
    file,
    ...classifyFile(file, found.get(fileKey(file.type, file.filename))),
  }));
}

const zeroCounts = () => Object.fromEntries(VERDICTS.map((verdict) => [verdict, 0]));
const zeroPlaces = () => ({ records: 0, files: 0 });

function summarizePlan(normalized, plan, { mode, gameId, written, marked }) {
  const counts = zeroCounts();
  const toWrite = zeroPlaces();
  const byType = Object.fromEntries(
    mediaTypes.map((type) => [
      type,
      {
        counts: zeroCounts(),
        toWrite: zeroPlaces(),
        ...(written ? { written: written.byType[type] } : {}),
      },
    ])
  );
  const lists = {
    invalid: normalized.invalid.slice(0, LIST_LIMIT),
    ambiguous: normalized.ambiguous.slice(0, LIST_LIMIT),
    ...Object.fromEntries(VERDICTS.map((verdict) => [verdict, []])),
  };

  for (const { file, verdict, existing, write } of plan) {
    counts[verdict] += 1;
    byType[file.type].counts[verdict] += 1;
    if (write) {
      for (const place of ['records', 'files']) {
        toWrite[place] += write[place];
        byType[file.type].toWrite[place] += write[place];
      }
    }
    if (lists[verdict].length < LIST_LIMIT) {
      lists[verdict].push(existing ? { ...file, existing } : file);
    }
  }

  return {
    mode,
    gameId,
    items: {
      received: normalized.received,
      repeated: normalized.repeated,
      invalid: normalized.invalid.length,
      ambiguous: normalized.ambiguous.length,
      files: normalized.files.length,
    },
    counts,
    toWrite,
    written: written ? { records: written.records, files: written.files } : null,
    byType,
    marked,
    lists,
    listLimit: LIST_LIMIT,
  };
}

async function lookupFiles(db, files) {
  const found = new Map();
  const namesByType = new Map();
  for (const { type, filename } of files) {
    found.set(fileKey(type, filename), { records: [], files: [] });
    if (!namesByType.has(type)) {
      namesByType.set(type, []);
    }
    namesByType.get(type).push(filename);
  }

  for (const [type, names] of namesByType) {
    for (let from = 0; from < names.length; from += LOOKUP_CHUNK) {
      const chunk = names.slice(from, from + LOOKUP_CHUNK);
      for (const { place, collection } of PLACES) {
        const docs = await db
          .collection(collection(type))
          .find(
            { filename: { $in: chunk } },
            { projection: { filename: 1, metadata: 1 } }
          )
          .toArray();
        for (const doc of docs) {
          found.get(fileKey(type, doc.filename))[place].push(doc);
        }
      }
    }
  }

  return found;
}

// Пара ложится только туда, где её нет ни одним ключом; повтор ничего не меняет.
const writableFilter = (filename) => ({
  filename,
  $expr: {
    $and: [
      { $in: [typeOf('metadata'), ['object', 'missing']] },
      { $eq: [typeOf('metadata.gameId'), 'missing'] },
      { $eq: [typeOf('metadata.gameHash'), 'missing'] },
    ],
  },
});

async function applyPlan(db, plan) {
  const written = {
    ...zeroPlaces(),
    byType: Object.fromEntries(mediaTypes.map((type) => [type, zeroPlaces()])),
  };

  for (const { file, verdict } of plan) {
    if (verdict !== 'pending') {
      continue;
    }
    const update = {
      $set: {
        'metadata.gameId': file.gameId,
        'metadata.gameHash': file.gameHash,
        [`metadata.${BACKFILL_MARK}`]: true,
      },
    };
    for (const { place, collection } of PLACES) {
      const { modifiedCount } = await db
        .collection(collection(file.type))
        .updateMany(writableFilter(file.filename), update);
      written[place] += modifiedCount;
      written.byType[file.type][place] += modifiedCount;
    }
  }

  return written;
}

const markFilter = (gameId) => {
  const marked = { $eq: [`$metadata.${BACKFILL_MARK}`, true] };

  return {
    $expr: gameId
      ? { $and: [marked, { $eq: ['$metadata.gameId', gameId] }] }
      : marked,
  };
};

async function countMarked(db, types, gameId) {
  const marked = { ...zeroPlaces(), byType: {} };
  for (const type of types) {
    marked.byType[type] = zeroPlaces();
    for (const { place, collection } of PLACES) {
      const count = await db
        .collection(collection(type))
        .countDocuments(markFilter(gameId));
      marked[place] += count;
      marked.byType[type][place] = count;
    }
  }

  return marked;
}

async function revertBackfill(db, { gameId, types }) {
  const reverted = { ...zeroPlaces(), byType: {} };
  for (const type of types) {
    reverted.byType[type] = zeroPlaces();
    for (const { place, collection } of PLACES) {
      const { modifiedCount } = await db.collection(collection(type)).updateMany(
        markFilter(gameId),
        {
          $unset: {
            'metadata.gameId': '',
            'metadata.gameHash': '',
            [`metadata.${BACKFILL_MARK}`]: '',
          },
        }
      );
      reverted[place] += modifiedCount;
      reverted.byType[type][place] = modifiedCount;
    }
  }

  return reverted;
}

async function runGameBackfill(db, params) {
  const { mode, gameId } = params;

  if (mode === 'revert') {
    const reverted = await revertBackfill(db, params);

    return {
      mode,
      gameId,
      types: params.types,
      reverted,
      marked: await countMarked(db, params.types, gameId),
    };
  }

  const normalized = normalizeItems(params.items, gameId);
  const plan = planGameBackfill(normalized, await lookupFiles(db, normalized.files));
  const written = mode === 'apply' ? await applyPlan(db, plan) : null;

  return summarizePlan(normalized, plan, {
    mode,
    gameId,
    written,
    marked: await countMarked(db, mediaTypes, gameId),
  });
}

const deadKeyCounts = () => [
  {
    $group: DEAD_KEYS.reduce(
      (group, key) => {
        const type = typeOf(`metadata.${key}`);
        group[`${key}Null`] = { $sum: { $cond: [{ $eq: [type, 'null'] }, 1, 0] } };
        group[`${key}NotNull`] = {
          $sum: { $cond: [{ $in: [type, ['null', 'missing']] }, 0, 1] },
        };

        return group;
      },
      { _id: null, total: { $sum: 1 } }
    ),
  },
];

const notNullFilter = {
  $expr: {
    $or: DEAD_KEYS.map((key) => ({
      $not: [{ $in: [typeOf(`metadata.${key}`), ['null', 'missing']] }],
    })),
  },
};

const hasValue = (value) => value !== undefined && value !== null;

async function divergence(db, type) {
  const [records, files] = await Promise.all([
    db.collection(type).distinct('filename'),
    db.collection(`${type}.files`).distinct('filename'),
  ]);
  const fileNames = new Set(files);
  const recordNames = new Set(records);
  const recordsWithoutFile = records.filter((name) => !fileNames.has(name));
  const filesWithoutRecord = files.filter((name) => !recordNames.has(name));

  return {
    recordsWithoutFile: {
      count: recordsWithoutFile.length,
      names: recordsWithoutFile.slice(0, LIST_LIMIT),
    },
    filesWithoutRecord: {
      count: filesWithoutRecord.length,
      names: filesWithoutRecord.slice(0, LIST_LIMIT),
    },
  };
}

const zeroKeys = () =>
  Object.fromEntries(DEAD_KEYS.map((key) => [key, { null: 0, notNull: 0 }]));
const zeroRemoved = () => Object.fromEntries(DEAD_KEYS.map((key) => [key, 0]));

// Счётчики — до снятия; apply снимает только null и возвращает, сколько снял.
async function runDeadKeys(db, { mode, types }) {
  const totals = {
    records: { total: 0, ...zeroKeys() },
    files: { total: 0, ...zeroKeys() },
    recordsWithoutFile: 0,
    filesWithoutRecord: 0,
    ...(mode === 'apply'
      ? { removed: { records: zeroRemoved(), files: zeroRemoved() } }
      : {}),
  };
  const byType = [];

  for (const type of types) {
    const entry = { type, notNull: [], ...(await divergence(db, type)) };
    totals.recordsWithoutFile += entry.recordsWithoutFile.count;
    totals.filesWithoutRecord += entry.filesWithoutRecord.count;
    if (mode === 'apply') {
      entry.removed = { records: zeroRemoved(), files: zeroRemoved() };
    }

    for (const { place, collection } of PLACES) {
      const target = db.collection(collection(type));
      const [row = { total: 0 }] = await target.aggregate(deadKeyCounts()).toArray();
      entry[place] = { total: row.total, ...zeroKeys() };
      totals[place].total += row.total;
      for (const key of DEAD_KEYS) {
        entry[place][key] = {
          null: row[`${key}Null`] || 0,
          notNull: row[`${key}NotNull`] || 0,
        };
        totals[place][key].null += entry[place][key].null;
        totals[place][key].notNull += entry[place][key].notNull;
      }

      const examples = await target
        .find(notNullFilter, {
          projection: Object.fromEntries([
            ['filename', 1],
            ...DEAD_KEYS.map((key) => [`metadata.${key}`, 1]),
          ]),
        })
        .limit(LIST_LIMIT)
        .toArray();
      for (const doc of examples) {
        for (const key of DEAD_KEYS) {
          const value = doc.metadata?.[key];
          if (hasValue(value) && entry.notNull.length < LIST_LIMIT) {
            entry.notNull.push({
              place,
              _id: String(doc._id),
              filename: doc.filename,
              key,
              value: echo(JSON.stringify(value)),
            });
          }
        }
      }

      if (mode === 'apply') {
        for (const key of DEAD_KEYS) {
          const { modifiedCount } = await target.updateMany(
            { $expr: { $eq: [typeOf(`metadata.${key}`), 'null'] } },
            { $unset: { [`metadata.${key}`]: '' } }
          );
          entry.removed[place][key] = modifiedCount;
          totals.removed[place][key] += modifiedCount;
        }
      }
    }

    byType.push(entry);
  }

  return { mode, keys: DEAD_KEYS, totals, byType, listLimit: LIST_LIMIT };
}

module.exports = {
  BACKFILL_MARK,
  DEAD_KEYS,
  LIST_LIMIT,
  MAX_ITEMS,
  VERDICTS,
  parseDeadKeysBody,
  parseGameBackfillBody,
  validateItem,
  normalizeItems,
  classifyFile,
  planGameBackfill,
  summarizePlan,
  runDeadKeys,
  runGameBackfill,
};
