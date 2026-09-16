const express = require('express');

const {
  authenticateToken,
  checkOperation,
} = require('../../auth/middlewares/auth');
const { listFiles } = require('../controllers/Files');
const { deadKeys, gameBackfill } = require('../controllers/Maintenance');
const {
  OPERATION_LIST,
  OPERATION_FILES_MAINTENANCE,
} = require('../../../config/media');

function createFilesRouter() {
  const router = express.Router();

  // Защита та же, что у /stats: токен сервиса плюс сверка операции. Ручка
  // административная — наружу её открывать нечем.
  router.get('/', authenticateToken, checkOperation(OPERATION_LIST), listFiles);

  const maintenance = [
    authenticateToken,
    checkOperation(OPERATION_FILES_MAINTENANCE),
  ];
  router.post('/dead-keys', ...maintenance, deadKeys);
  router.post('/game-backfill', ...maintenance, gameBackfill);

  return router;
}

module.exports = { createFilesRouter };
