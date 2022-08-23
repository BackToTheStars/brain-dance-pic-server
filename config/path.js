var path = require('path');

const backupBasePath = path.join(__dirname, '../backup/');
const staticImagesBasePath = path.join(__dirname, '../static/images/');

module.exports = {
  backupBasePath,
  staticImagesBasePath,
};
