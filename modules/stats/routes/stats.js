const express = require('express');

const {
  authenticateToken,
  checkOperation,
} = require('../../auth/middlewares/auth');
const { getStats } = require('../controllers/Stats');
const { OPERATION_STATS } = require('../../../config/media');

function createStatsRouter() {
  const router = express.Router();

  router.get(
    '/',
    authenticateToken,
    checkOperation(OPERATION_STATS),
    getStats
  );

  return router;
}

module.exports = { createStatsRouter };
