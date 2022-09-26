const { checkToken } = require('../lib/game');
const multer = require('multer');
const { JWT_SECRET_STATIC } = require('../config/auth');
const { getError } = require('../lib/errors');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './static/images/tmp');
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage: storage });

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  checkToken(JWT_SECRET_STATIC, token)
    .then((payload) => {
      req.payload = payload;
      next();
    })
    .catch((err) => {
      console.log(err);
      res.sendStatus(403);
    });
};

const checkOperation = (operation) => {
  return (req, res, next) => {
    if (req?.payload?.operation !== operation) {
      next(getError(`Invalid operation`, 400));
    } else {
      next();
    }
  };
};

module.exports = {
  authenticateToken,
  upload,
  checkOperation,
};
