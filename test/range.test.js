const test = require('node:test');
const assert = require('node:assert/strict');

const { parseRange } = require('../modules/media/services/range');
const { isViewStart } = require('../modules/media/services/access');

const SIZE = 1000;
const full = { kind: 'full' };
const unsatisfiable = { kind: 'unsatisfiable' };
const partial = (start, end) => ({ kind: 'partial', start, end });

test('no header means the whole file', () => {
  assert.deepEqual(parseRange(undefined, SIZE), full);
  assert.deepEqual(parseRange('', SIZE), full);
});

test('a plain range and an open end', () => {
  assert.deepEqual(parseRange('bytes=0-99', SIZE), partial(0, 99));
  assert.deepEqual(parseRange('bytes=500-', SIZE), partial(500, 999));
  assert.deepEqual(parseRange('bytes=999-999', SIZE), partial(999, 999));
  assert.deepEqual(parseRange('bytes=0-0', SIZE), partial(0, 0));
});

test('the unit is case-insensitive and whitespace around the spec is allowed', () => {
  assert.deepEqual(parseRange('Bytes=0-9', SIZE), partial(0, 9));
  assert.deepEqual(parseRange(' bytes = 10-19 ', SIZE), partial(10, 19));
  assert.deepEqual(parseRange('bytes=0-9, ', SIZE), partial(0, 9));
});

test('a suffix range is the last N bytes, the whole file when N reaches the size', () => {
  assert.deepEqual(parseRange('bytes=-100', SIZE), partial(900, 999));
  assert.deepEqual(parseRange('bytes=-1', SIZE), partial(999, 999));
  assert.deepEqual(parseRange('bytes=-1000', SIZE), partial(0, 999));
  assert.deepEqual(parseRange('bytes=-5000', SIZE), partial(0, 999));
  assert.deepEqual(parseRange('bytes=-99999999999999999999999', SIZE), partial(0, 999));
});

test('an end past the size is truncated', () => {
  assert.deepEqual(parseRange('bytes=0-99999999', SIZE), partial(0, 999));
  assert.deepEqual(parseRange('bytes=900-1000', SIZE), partial(900, 999));
});

test('a start at or past the size and a zero suffix are not satisfiable', () => {
  assert.deepEqual(parseRange('bytes=1000-', SIZE), unsatisfiable);
  assert.deepEqual(parseRange('bytes=99999999-', SIZE), unsatisfiable);
  assert.deepEqual(parseRange('bytes=1000-2000', SIZE), unsatisfiable);
  assert.deepEqual(parseRange('bytes=-0', SIZE), unsatisfiable);
});

test('an empty file satisfies no range', () => {
  assert.deepEqual(parseRange('bytes=0-', 0), unsatisfiable);
  assert.deepEqual(parseRange('bytes=-10', 0), unsatisfiable);
  assert.deepEqual(parseRange(undefined, 0), full);
});

test('an invalid header is ignored', () => {
  for (const header of [
    'bytes=abc',
    'bytes=500-100',
    'bytes=-',
    'bytes=',
    'bytes',
    'bytes=1.5-2',
    'bytes=+1-2',
    'bytes=0x10-20',
    'bytes=1-2-3',
    'bytes=--5',
    'items=0-5',
    '=0-5',
    '0-5',
  ]) {
    assert.deepEqual(parseRange(header, SIZE), full, header);
  }
});

test('several ranges are ignored', () => {
  assert.deepEqual(parseRange('bytes=0-1,5-6', SIZE), full);
  assert.deepEqual(parseRange('bytes=0-1, -5', SIZE), full);
  assert.deepEqual(parseRange('bytes=0-1,abc', SIZE), full);
});

test('a view starts with the whole file or a range from the first byte', () => {
  assert.equal(isViewStart(full), true);
  assert.equal(isViewStart(partial(0, 99)), true);
  assert.equal(isViewStart(parseRange('bytes=-5000', SIZE)), true);
  assert.equal(isViewStart(partial(100, 199)), false);
  assert.equal(isViewStart(parseRange('bytes=-100', SIZE)), false);
  assert.equal(isViewStart(unsatisfiable), false);
});
