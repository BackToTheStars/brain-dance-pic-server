const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const LogSchema = new Schema(
  {
    logType: String,
    params: Schema.Types.Mixed,
    info: Schema.Types.Mixed,
  },
  { timestamps: true }
);
const Log = mongoose.model('Log', LogSchema);

const addLog = async (logType, params, info) => {
  const log = new Log({ logType, params, info });
  await log.save();
};

module.exports = { Log, addLog };
