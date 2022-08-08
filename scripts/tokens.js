const { getToken } = require('../lib/game');

console.log(
  getToken(
    process.env.JWT_SECRET_STATIC,
    'upload',
    new Date().getTime() + 5 * 60 * 1000,
    'abc'
  )
);
