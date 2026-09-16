const mongoose = require('mongoose');

const {
  parseDeadKeysBody,
  parseGameBackfillBody,
  runDeadKeys,
  runGameBackfill,
} = require('../services/maintenance');

const handler = (parse, run) => async (req, res) => {
  const parsed = parse(req.body);
  if (parsed.error) {
    return res.status(400).json({ message: parsed.error });
  }

  try {
    res.json(await run(mongoose.connection.db, parsed.value));
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'An error occurred during files maintenance.',
    });
  }
};

module.exports = {
  deadKeys: handler(parseDeadKeysBody, runDeadKeys),
  gameBackfill: handler(parseGameBackfillBody, runGameBackfill),
};
