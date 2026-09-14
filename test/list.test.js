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
