const test = require('node:test');
const assert = require('node:assert/strict');

const { checkOperation } = require('../modules/auth/middlewares/auth');

const run = (operation, payload) => {
  let result;
  checkOperation(operation)({ payload }, {}, (error) => {
    result = error ? { status: error.statusCode, message: error.message } : 'next';
  });

  return result;
};

const SERVICE_OPERATIONS = [
  'list',
  'stats',
  'delete',
  'download_and_save',
  'youtube',
  'files_maintenance',
];

test('service operations need the service scope', () => {
  for (const operation of SERVICE_OPERATIONS) {
    assert.deepEqual(run(operation, { operation }), {
      status: 403,
      message: 'Service token required',
    });
    assert.deepEqual(run(operation, { operation, scope: 'admin' }), {
      status: 403,
      message: 'Service token required',
    });
    assert.equal(run(operation, { operation, scope: 'service' }), 'next');
  }
});

test('an operation unknown to media is a service operation by default', () => {
  assert.equal(run('video_frame', { operation: 'video_frame' }).status, 403);
  assert.equal(run('video_frame', { operation: 'video_frame', scope: 'service' }), 'next');
});

test('upload works without the scope and with it', () => {
  assert.equal(run('upload', { operation: 'upload' }), 'next');
  assert.equal(run('upload', { operation: 'upload', scope: 'service' }), 'next');
});

test('a token of another operation is refused before the scope is looked at', () => {
  assert.deepEqual(run('list', { operation: 'upload' }), {
    status: 400,
    message: 'Invalid operation',
  });
  assert.deepEqual(run('list', { operation: 'upload', scope: 'service' }), {
    status: 400,
    message: 'Invalid operation',
  });
  assert.equal(run('list', undefined).status, 400);
});
