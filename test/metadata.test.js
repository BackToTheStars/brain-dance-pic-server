const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMetadata, gameFromPayload } = require('../modules/media/services/metadata');

test('game comes from the token payload', () => {
  assert.deepEqual(gameFromPayload({ gameId: 'g1', hash: 'abc123' }), {
    gameId: 'g1',
    gameHash: 'abc123',
  });
  assert.deepEqual(gameFromPayload({ gameId: 42, hash: 'abc' }), {
    gameId: '42',
    gameHash: 'abc',
  });
});

test('no gameId in the token means no game keys at all', () => {
  assert.deepEqual(gameFromPayload({ hash: 'abc123' }), {});
  assert.deepEqual(gameFromPayload({ gameId: '', hash: 'abc123' }), {});
  assert.deepEqual(gameFromPayload({ gameId: null }), {});
  assert.deepEqual(gameFromPayload(undefined), {});
});

test('a missing, empty or non-string hash leaves no half of the pair', () => {
  assert.deepEqual(gameFromPayload({ gameId: 'g1', hash: '' }), {});
  assert.deepEqual(gameFromPayload({ gameId: 'g1', hash: 5 }), {});
  assert.deepEqual(gameFromPayload({ gameId: 'g1', hash: null }), {});
  assert.deepEqual(gameFromPayload({ gameId: 'g1', hash: ['abc'] }), {});
  assert.deepEqual(gameFromPayload({ gameId: 'g1' }), {});
});

test('a half pair never reaches the metadata of a new file', () => {
  assert.deepEqual(
    buildMetadata({ turnId: 't1' }, { gameId: 'g1' }, { mimetype: 'image/png' }),
    { turnId: 't1', mimetype: 'image/png' }
  );
  assert.deepEqual(
    buildMetadata(
      { gameId: 'forged', gameHash: 'forged' },
      { gameId: 'g1', hash: '' },
      { mimetype: 'image/png' }
    ),
    { mimetype: 'image/png' }
  );
});

test('game keys from the body are always dropped', () => {
  const body = { turnId: 't1', gameId: 'forged', gameHash: 'forged' };
  assert.deepEqual(buildMetadata(body, { operation: 'upload' }, { mimetype: 'image/png' }), {
    turnId: 't1',
    mimetype: 'image/png',
  });
  assert.deepEqual(
    buildMetadata(body, { gameId: 'real', hash: 'abc' }, { mimetype: 'image/png' }),
    { turnId: 't1', mimetype: 'image/png', gameId: 'real', gameHash: 'abc' }
  );
});

test('own keys override the body, a non-object body is ignored', () => {
  assert.deepEqual(buildMetadata({ mimetype: 'text/html' }, {}, { mimetype: 'image/png' }), {
    mimetype: 'image/png',
  });
  assert.deepEqual(buildMetadata('abc', {}, { originalname: 'a.png' }), {
    originalname: 'a.png',
  });
  assert.deepEqual(buildMetadata(['x'], {}, {}), {});
  assert.deepEqual(buildMetadata(undefined, undefined), {});
});

test('the body object is not mutated', () => {
  const body = { gameId: 'forged', x: 1 };
  buildMetadata(body, { gameId: 'g' }, {});
  assert.deepEqual(body, { gameId: 'forged', x: 1 });
});

test('the previous-name field of the names script is dropped from the body', () => {
  assert.deepEqual(
    buildMetadata({ originalnameLatin1: 'forged', turnId: 't1' }, {}, { originalname: 'a.png' }),
    { turnId: 't1', originalname: 'a.png' }
  );
});

test('the dead keys and the game backfill mark are dropped from the body', () => {
  assert.deepEqual(
    buildMetadata(
      { uploader: 'u', downloader: null, gameBackfill: true, turnId: 't1' },
      { gameId: 'g', hash: 'abc' },
      { originalname: 'a.png' }
    ),
    { turnId: 't1', originalname: 'a.png', gameId: 'g', gameHash: 'abc' }
  );
});
