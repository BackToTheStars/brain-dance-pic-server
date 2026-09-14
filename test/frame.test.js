const test = require('node:test');
const assert = require('node:assert/strict');

const { parseFrameTime, frameOriginalname } = require('../modules/media/services/frame');

test('t accepts non-negative seconds as a number or a plain decimal string', () => {
  assert.equal(parseFrameTime(0), 0);
  assert.equal(parseFrameTime(1.5), 1.5);
  assert.equal(parseFrameTime('12'), 12);
  assert.equal(parseFrameTime(' 2.25 '), 2.25);
  assert.equal(parseFrameTime(1.23456), 1.235);
});

test('t rejects everything else', () => {
  for (const value of [-1, '-1', 'abc', '', '1e3', '0x10', '1,5', '.5', NaN, Infinity, null, undefined, ['1'], {}, true]) {
    assert.equal(parseFrameTime(value), null, `value ${JSON.stringify(value)}`);
  }
});

test('frame name derives from the video name and stays recognisable', () => {
  assert.equal(
    frameOriginalname('u.webm', { originalname: 'e2e-video.webm' }, 1.5),
    'e2e-video-frame-1.5.jpg'
  );
  assert.equal(
    frameOriginalname('u.mp4', { originalname: 'Видео с дачи.mp4' }, 0),
    'Видео с дачи-frame-0.jpg'
  );
  assert.equal(frameOriginalname('u.mp4', { title: 'A talk. Part 2' }, 60), 'A talk. Part 2-frame-60.jpg');
  assert.equal(frameOriginalname('3f2a.mp4', { originalUrl: 'https://x/y.mp4' }, 2), '3f2a-frame-2.jpg');
  assert.equal(frameOriginalname('3f2a.mp4', undefined, 2), '3f2a-frame-2.jpg');
});
