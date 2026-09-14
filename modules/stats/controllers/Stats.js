const { getStorageStats } = require('../services/storage');
const { getLimitsReport } = require('../services/limits');

async function getStats(req, res) {
  try {
    const stats = await getStorageStats();

    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'An error occurred during stats collection.',
    });
  }
}

async function getLimits(req, res) {
  try {
    res.json(await getLimitsReport());
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'An error occurred during limits collection.',
    });
  }
}

module.exports = {
  getStats,
  getLimits,
};
