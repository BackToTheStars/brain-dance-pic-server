const { getStorageStats } = require('../services/storage');

async function getStats(req, res) {
  try {
    const stats = await getStorageStats();

    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'An error occurred during stats collection.',
      error: error.message,
    });
  }
}

module.exports = {
  getStats,
};
