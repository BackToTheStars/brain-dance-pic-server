const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyName } = require('../scripts/names');

// Так имя портил приём: байты UTF-8, прочитанные как latin1.
const asLatin1 = (name) => Buffer.from(name, 'utf8').toString('latin1');

test('broken names that decode back are fixable', () => {
  for (const name of [
    'Таблица_Менделеева.pdf',
    'тест кириллица.png',
    'café.pdf',
    'Größe (1).png',
    '中文名.png',
    '🙂.png',
    'смешанное name 2.pdf',
  ]) {
    assert.deepEqual(classifyName(asLatin1(name)), { status: 'fixable', fixed: name }, name);
  }
});

test('the stand record from the measurement is fixable', () => {
  const stored = asLatin1('Таблица_Менделеева.pdf');
  assert.equal(stored.startsWith('Ð¢Ð°Ð±Ð»Ð¸Ñ'), true);
  assert.equal(classifyName(stored).status, 'fixable');
});

test('legitimate names are left alone', () => {
  for (const name of [
    'plain name (1).png',
    'café.pdf',
    'naïve résumé.pdf',
    'Größe.png',
    'Таблица.pdf',
    '中文名.png',
    '🙂.png',
    'a "b" c.png',
    '',
  ]) {
    assert.equal(classifyName(name).status, 'ok', name);
  }
  assert.equal(classifyName(undefined).status, 'ok');
  assert.equal(classifyName(null).status, 'ok');
});

test('mojibake that cannot be decoded is reported, not fixed', () => {
  const truncated = asLatin1('Таблица.pdf').slice(0, 5);
  assert.deepEqual(classifyName(truncated + '.pdf'), { status: 'broken' });
  // Одиночный C1 без пары
  assert.deepEqual(classifyName('name\x81.pdf'), { status: 'broken' });
});

test('names broken by a different codepage are not guessed', () => {
  // cp1251-байты «Таблица», прочитанные как latin1: перекодировкой в UTF-8 не чинится.
  const cp1251 = Buffer.from([0xd2, 0xe0, 0xe1, 0xeb, 0xe8, 0xf6, 0xe0]).toString('latin1');
  assert.notEqual(classifyName(cp1251 + '.pdf').status, 'fixable');
});

test('fixing twice is a no-op', () => {
  const { fixed } = classifyName(asLatin1('Таблица.pdf'));
  assert.equal(classifyName(fixed).status, 'ok');
});
