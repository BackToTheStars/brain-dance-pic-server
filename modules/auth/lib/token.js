const jwt = require('jsonwebtoken');

module.exports = {
  // getToken example; extra carries scope, hash and gameId
  getToken: function (secret, operation, timestamp, extra = {}) {
    return jwt.sign(
      {
        ...extra,
        operation: operation,
        timestamp: timestamp,
      },
      secret
    );
  },
  checkToken: function (secret, token) {
    return new Promise((resolve, reject) => {
      jwt.verify(token, secret, { algorithms: ['HS256'] }, (err, payload) => {
        //console.log(err)
        if (err) return reject(err);
        if (!payload.timestamp || payload.timestamp < new Date().getTime())
          return reject(new Error('token expired'));

        resolve(payload);
      });
    });
  },
};
