const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { checkMediaIndexes, getMediaModel } = require('../modules/media/models/Media');

const TYPE = 'images';

// Схема подменяется своей, чтобы проверка не зависела от текущего набора индексов модели.
const SCHEMA = [
  [{ uploadDate: -1 }, {}],
  [{ filename: 1 }, { unique: true }],
  [{ 'metadata.gameId': 1 }, {}],
];

const ID_INDEX = { name: '_id_', key: { _id: 1 } };
const UPLOAD_DATE = { name: 'uploadDate_-1', key: { uploadDate: -1 } };
const GAME_ID = { name: 'metadata.gameId_1', key: { 'metadata.gameId': 1 } };
const FILENAME = { name: 'filename_1', key: { filename: 1 }, unique: true };

const builtWith = (...indexes) => [ID_INDEX, UPLOAD_DATE, GAME_ID, ...indexes];

// Любая попытка изменить индексы попадает сюда: чужое состояние трогать нельзя.
function fakeModel({ indexes, initError = null }) {
  const writes = [];

  return {
    writes,
    init: () => (initError ? Promise.reject(initError) : Promise.resolve()),
    schema: { indexes: () => SCHEMA },
    collection: {
      indexes: async () => indexes,
      dropIndex: async (name) => writes.push(['dropIndex', name]),
      createIndex: async (...args) => writes.push(['createIndex', ...args]),
    },
  };
}

async function run(model) {
  const lines = [];
  const restore = console.error;
  mongoose.models[TYPE] = model;
  console.error = (...args) => lines.push(args.map((arg) => String(arg)).join(' '));
  try {
    await checkMediaIndexes([TYPE]);
  } finally {
    console.error = restore;
    delete mongoose.models[TYPE];
  }
  assert.deepEqual(model.writes, []);

  return lines;
}

test('indexes that match the schema say nothing', async () => {
  assert.deepEqual(await run(fakeModel({ indexes: builtWith(FILENAME) })), []);
});

test('a missing index is still reported by name', async () => {
  const lines = await run(fakeModel({ indexes: builtWith() }));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[indexes\] images: .*filename_1/);
});

test('the expected name without unique is not the expected guarantee', async () => {
  const lines = await run(
    fakeModel({ indexes: builtWith({ name: 'filename_1', key: { filename: 1 } }) })
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /filename_1/);
  assert.match(lines[0], /unique/);
});

test('the expected name over another key is reported', async () => {
  const lines = await run(
    fakeModel({
      indexes: builtWith({
        name: 'filename_1',
        key: { filename: 1, uploadDate: -1 },
        unique: true,
      }),
    })
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /filename_1/);
  assert.match(lines[0], /uploadDate/);
});

test('a unique index limited by a filter or by sparse is reported', async () => {
  const partial = await run(
    fakeModel({
      indexes: builtWith({
        ...FILENAME,
        partialFilterExpression: { metadata: { $exists: true } },
      }),
    })
  );
  assert.equal(partial.length, 1);
  assert.match(partial[0], /partialFilterExpression/);

  const sparse = await run(
    fakeModel({ indexes: builtWith({ ...FILENAME, sparse: true }) })
  );
  assert.equal(sparse.length, 1);
  assert.match(sparse[0], /sparse/);
});

test('a collation the schema does not ask for is reported', async () => {
  const lines = await run(
    fakeModel({
      indexes: builtWith({ ...FILENAME, collation: { locale: 'ru', strength: 2 } }),
    })
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /collation/);
});

test('a refused index build is reported even when every name is in place', async () => {
  const initError = Object.assign(
    new Error('Index with name: filename_1 already exists with different options'),
    { codeName: 'IndexOptionsConflict' }
  );
  const lines = await run(fakeModel({ indexes: builtWith(FILENAME), initError }));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[indexes\] images: /);
  assert.match(lines[0], /IndexOptionsConflict|already exists with different options/);
});

test('indexes the schema does not know about are left alone', async () => {
  const lines = await run(
    fakeModel({
      indexes: builtWith(FILENAME, {
        name: 'metadata.turnId_1',
        key: { 'metadata.turnId': 1 },
        unique: true,
      }),
    })
  );
  assert.deepEqual(lines, []);
});

test('the schema of the service over the indexes mongo builds from it says nothing', async () => {
  const schema = getMediaModel('videos').schema.indexes();
  const indexes = [
    ID_INDEX,
    ...schema.map(([fields, options = {}]) => ({
      name:
        options.name ||
        Object.entries(fields)
          .map(([field, direction]) => `${field}_${direction}`)
          .join('_'),
      key: { ...fields },
      ...(options.unique ? { unique: true } : {}),
      ...(options.sparse ? { sparse: true } : {}),
    })),
  ];
  const model = fakeModel({ indexes });
  model.schema = { indexes: () => schema };

  assert.deepEqual(await run(model), []);
});
