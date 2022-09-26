const error404 = (req, res) => {
  res.status(404).json({
    message: '404 Not Found',
  });
};

const errorAll = (err, req, res, next) => {
  const { statusCode = 500, message } = err;
  console.log({ err });
  res.status(statusCode).send({
    message: statusCode === 500 ? 'На сервере произошла ошибка' : message,
  });
};

module.exports = {
  error404,
  errorAll,
};
