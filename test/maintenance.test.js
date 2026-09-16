const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseDeadKeysBody,
  parseGameBackfillBody,
  validateItem,
  normalizeItems,
  classifyFile,
  planGameBackfill,
  summarizePlan,
  MAX_ITEMS,
} = require('../modules/media/services/maintenance');

const GAME = { gameId: '0123456789abcdef01234567', gameHash: 'a1b2c3' };
const OTHER = { gameId: 'ffffffffffffffffffffffff', gameHash: 'zzz' };
const item = (extra = {}) => ({ type: 'images', filename: 'a.png', ...GAME, ...extra });
const doc = (metadata, id = 'x') => ({ _id: id, metadata });

test('dead keys body: mode and types', () => {
  assert.deepEqual(parseDeadKeysBody({ mode: 'report' }).value.types, [
    'audios',
    'videos',
    'images',
    'pdfs',
  ]);
  assert.deepEqual(parseDeadKeysBody({ mode: 'apply', types: 'images, pdfs' }).value, {
    mode: 'apply',
    types: ['images', 'pdfs'],
  });
  assert.match(parseDeadKeysBody({ mode: 'revert' }).error, /^mode: /);
  assert.match(parseDeadKeysBody({ mode: 'report', types: ['docs'] }).error, /types: неизвестные/);
  assert.match(parseDeadKeysBody({ mode: 'report', types: [] }).error, /types: пустой/);
  assert.match(parseDeadKeysBody(undefined).error, /объект JSON/);
  assert.match(parseDeadKeysBody([]).error, /объект JSON/);
});

test('game backfill body: items for report and apply, the mark scope for revert', () => {
  assert.deepEqual(parseGameBackfillBody({ mode: 'report', items: [] }).value, {
    mode: 'report',
    gameId: null,
    items: [],
  });
  assert.deepEqual(parseGameBackfillBody({ mode: 'revert', gameId: GAME.gameId }).value, {
    mode: 'revert',
    gameId: GAME.gameId,
    types: ['audios', 'videos', 'images', 'pdfs'],
  });
  assert.match(parseGameBackfillBody({ mode: 'apply' }).error, /items: ожидался массив/);
  assert.match(parseGameBackfillBody({ mode: 'revert', items: [] }).error, /items: откат/);
  assert.match(parseGameBackfillBody({ mode: 'report', items: [], types: 'images' }).error, /types: /);
  assert.match(parseGameBackfillBody({ mode: 'revert', gameId: 'ABC' }).error, /gameId: /);
  assert.match(
    parseGameBackfillBody({ mode: 'revert', gameId: GAME.gameId.toUpperCase() }).error,
    /gameId: /
  );
  assert.match(
    parseGameBackfillBody({ mode: 'report', items: new Array(MAX_ITEMS + 1).fill({}) }).error,
    /items: не больше/
  );
  const { error } = parseGameBackfillBody({ mode: 'x', items: 'y' });
  assert.match(error, /mode: .* items: /);
});

test('an item needs a known type, a plain file name, a 24-hex gameId and an address', () => {
  assert.deepEqual(validateItem(item()).value, item());
  assert.deepEqual(validateItem(item({ gameHash: '6d1' })).value, item({ gameHash: '6d1' }));
  const bad = [
    ['type', item({ type: 'docs' })],
    ['filename', item({ filename: 'a/b.png' })],
    ['filename', item({ filename: 'a\\b.png' })],
    ['filename', item({ filename: 'a\u0001.png' })],
    ['filename', item({ filename: '' })],
    ['filename', item({ filename: 'x'.repeat(256) })],
    ['gameId', item({ gameId: '0123456789ABCDEF01234567' })],
    ['gameId', item({ gameId: 42 })],
    ['gameHash', item({ gameHash: 'a b' })],
    ['gameHash', item({ gameHash: '' })],
    ['gameHash', item({ gameHash: undefined })],
  ];
  for (const [field, value] of bad) {
    const { reasons } = validateItem(value);
    assert.ok(reasons.some((reason) => reason.startsWith(`${field}:`)), `${field} ${JSON.stringify(value)}`);
  }
  assert.deepEqual(validateItem('x').reasons, ['элемент — не объект']);
  assert.match(validateItem(item(), OTHER.gameId).reasons[0], /не совпадает/);
});

test('repeated items collapse, different pairs for one file make it ambiguous', () => {
  const normalized = normalizeItems([
    item(),
    item(),
    item({ filename: 'b.png' }),
    item({ filename: 'b.png', ...OTHER }),
    item({ type: 'videos' }),
    { type: 'nope' },
  ]);
  assert.equal(normalized.received, 6);
  assert.equal(normalized.repeated, 1);
  assert.equal(normalized.invalid.length, 1);
  assert.equal(normalized.invalid[0].index, 5);
  assert.deepEqual(normalized.ambiguous, [
    { type: 'images', filename: 'b.png', pairs: [GAME, OTHER] },
  ]);
  assert.deepEqual(normalized.files, [item(), item({ type: 'videos' })]);
});

test('an invalid item is echoed without large values', () => {
  const { invalid } = normalizeItems([{ type: { deep: 1 }, filename: 'x'.repeat(500) }]);
  assert.equal(invalid[0].item.type, '[object]');
  assert.equal(invalid[0].item.filename.length, 100);
  assert.equal(invalid[0].item.gameId, null);
});

test('a file absent from one of the places is not written', () => {
  assert.deepEqual(classifyFile(GAME, undefined), { verdict: 'missing' });
  assert.deepEqual(classifyFile(GAME, { records: [], files: [] }), { verdict: 'missing' });
  assert.deepEqual(classifyFile(GAME, { records: [doc({})], files: [] }), {
    verdict: 'recordOnly',
  });
  assert.deepEqual(classifyFile(GAME, { records: [], files: [doc({})] }), {
    verdict: 'fileOnly',
  });
});

test('no pair anywhere is pending, with the count of places to write', () => {
  assert.deepEqual(
    classifyFile(GAME, { records: [doc({ mimetype: 'image/png' })], files: [doc({}), doc(undefined)] }),
    { verdict: 'pending', write: { records: 1, files: 2 } }
  );
});

test('the same pair everywhere is same; partly set is pending for the rest', () => {
  assert.deepEqual(classifyFile(GAME, { records: [doc({ ...GAME })], files: [doc({ ...GAME, gameBackfill: true })] }), {
    verdict: 'same',
  });
  assert.deepEqual(classifyFile(GAME, { records: [doc({ ...GAME })], files: [doc({}), doc({ ...GAME })] }), {
    verdict: 'pending',
    write: { records: 0, files: 1 },
  });
});

test('any other or partial pair is a conflict and lists what stands', () => {
  const conflict = classifyFile(GAME, {
    records: [doc({}, 'r1')],
    files: [doc({ ...OTHER }, 'f1')],
  });
  assert.deepEqual(conflict, {
    verdict: 'conflict',
    existing: [{ place: 'file', _id: 'f1', ...OTHER }],
  });
  for (const metadata of [
    { gameId: GAME.gameId },
    { gameHash: GAME.gameHash },
    { gameId: GAME.gameId, gameHash: 'other' },
    { gameId: null, gameHash: null },
  ]) {
    assert.equal(
      classifyFile(GAME, { records: [doc(metadata)], files: [doc({})] }).verdict,
      'conflict',
      JSON.stringify(metadata)
    );
  }
});

test('metadata that is not an object is never written', () => {
  for (const metadata of [null, 'x', ['a']]) {
    assert.deepEqual(
      classifyFile(GAME, { records: [doc(metadata)], files: [doc({ ...OTHER })] }),
      { verdict: 'badMetadata' }
    );
  }
});

test('the plan and its summary count verdicts per type and cap the lists', () => {
  const items = [
    item({ filename: 'pending.png' }),
    item({ filename: 'same.png' }),
    item({ filename: 'conflict.png' }),
    item({ type: 'pdfs', filename: 'missing.pdf' }),
    item({ filename: 'amb.png' }),
    item({ filename: 'amb.png', ...OTHER }),
    'bad',
  ];
  const normalized = normalizeItems(items);
  const found = new Map([
    ['images/pending.png', { records: [doc({})], files: [doc({})] }],
    ['images/same.png', { records: [doc({ ...GAME })], files: [doc({ ...GAME })] }],
    ['images/conflict.png', { records: [doc({ ...OTHER }, 'r')], files: [doc({})] }],
  ]);
  const plan = planGameBackfill(normalized, found);
  assert.deepEqual(
    plan.map(({ file, verdict }) => [file.filename, verdict]),
    [
      ['pending.png', 'pending'],
      ['same.png', 'same'],
      ['conflict.png', 'conflict'],
      ['missing.pdf', 'missing'],
    ]
  );

  const marked = { records: 0, files: 0, byType: {} };
  const written = {
    records: 1,
    files: 1,
    byType: {
      audios: { records: 0, files: 0 },
      videos: { records: 0, files: 0 },
      images: { records: 1, files: 1 },
      pdfs: { records: 0, files: 0 },
    },
  };
  const summary = summarizePlan(normalized, plan, { mode: 'apply', gameId: null, written, marked });
  assert.deepEqual(summary.items, { received: 7, repeated: 0, invalid: 1, ambiguous: 1, files: 4 });
  assert.equal(summary.counts.pending, 1);
  assert.equal(summary.counts.same, 1);
  assert.equal(summary.counts.conflict, 1);
  assert.equal(summary.counts.missing, 1);
  assert.deepEqual(summary.toWrite, { records: 1, files: 1 });
  assert.deepEqual(summary.written, { records: 1, files: 1 });
  assert.deepEqual(summary.byType.images.counts, {
    missing: 0,
    recordOnly: 0,
    fileOnly: 0,
    badMetadata: 0,
    conflict: 1,
    same: 1,
    pending: 1,
  });
  assert.deepEqual(summary.byType.images.written, { records: 1, files: 1 });
  assert.equal(summary.byType.pdfs.counts.missing, 1);
  assert.deepEqual(summary.lists.conflict[0].existing, [
    { place: 'record', _id: 'r', ...OTHER },
  ]);
  assert.equal(summary.lists.invalid[0].index, 6);

  const many = normalizeItems(
    Array.from({ length: 150 }, (_, i) => item({ filename: `m${i}.png` }))
  );
  const capped = summarizePlan(many, planGameBackfill(many, new Map()), {
    mode: 'report',
    gameId: null,
    written: null,
    marked,
  });
  assert.equal(capped.counts.missing, 150);
  assert.equal(capped.lists.missing.length, capped.listLimit);
  assert.equal(capped.written, null);
  assert.equal('written' in capped.byType.images, false);
});
