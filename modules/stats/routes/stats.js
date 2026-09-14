const express = require('express');

const {
  authenticateToken,
  checkOperation,
} = require('../../auth/middlewares/auth');
const { getStats, getLimits } = require('../controllers/Stats');
const { OPERATION_STATS, OPERATION_LIMITS } = require('../../../config/media');

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

function createLimitsRouter() {
  const router = express.Router();

  router.get(
    '/',
    authenticateToken,
    checkOperation(OPERATION_LIMITS),
    getLimits
  );

  return router;
}

module.exports = { createStatsRouter, createLimitsRouter };
