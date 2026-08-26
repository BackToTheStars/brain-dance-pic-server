const express = require('express');

const {
  authenticateToken,
  checkOperation,
} = require('../../auth/middlewares/auth');
const { listFiles } = require('../controllers/Files');
const { OPERATION_LIST } = require('../../../config/media');

function createFilesRouter() {
  const router = express.Router();

  // Защита та же, что у /stats: токен сервиса плюс сверка операции. Ручка
  // административная — наружу её открывать нечем.
  router.get('/', authenticateToken, checkOperation(OPERATION_LIST), listFiles);

  return router;
}

module.exports = { createFilesRouter };
