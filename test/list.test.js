const test = require('node:test');
const assert = require('node:assert/strict');

const { parseListQuery } = require('../modules/media/services/list');

test('game filter is taken as is', () => {
  assert.equal(parseListQuery({ game: 'a1b2c3' }).value.game, 'a1b2c3');
  assert.equal(parseListQuery({ game: '6d1' }).value.game, '6d1');
  assert.equal(parseListQuery({}).value.game, null);
  assert.equal(parseListQuery({ game: '' }).value.game, null);
});

test('a bad game value is one more error in the common line', () => {
  for (const game of [['a', 'b'], 'a b', 'x'.repeat(65), '<script>', 'абв']) {
    const { error } = parseListQuery({ game });
    assert.match(error, /^game: /, String(game));
  }
  const { error } = parseListQuery({ game: 'a b', sort: 'nope' });
  assert.match(error, /game: .* sort: /);
});

test('withoutGame is off unless set to 1', () => {
  assert.equal(parseListQuery({}).value.withoutGame, false);
  assert.equal(parseListQuery({ withoutGame: '' }).value.withoutGame, false);
  assert.equal(parseListQuery({ withoutGame: '1' }).value.withoutGame, true);
});

test('a withoutGame value other than 1 is an error', () => {
  for (const withoutGame of ['true', '0', 'yes', ['1']]) {
    const { error } = parseListQuery({ withoutGame });
    assert.match(error, /^withoutGame: /, String(withoutGame));
  }
});

test('withoutGame and game together are rejected, not silently merged', () => {
  const { error } = parseListQuery({ withoutGame: '1', game: 'a1b2c3' });
  assert.match(error, /game и withoutGame нельзя задавать одновременно/);
});

test('withoutGame alone parses game as null, and vice versa', () => {
  assert.equal(parseListQuery({ withoutGame: '1' }).value.game, null);
  assert.equal(parseListQuery({ game: 'a1b2c3' }).value.withoutGame, false);
});
