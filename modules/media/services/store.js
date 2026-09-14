const {
  saveFileToGridFS,
  saveStreamToGridFS,
  getNewestFile,
  removeFileFromGridFS,
} = require('./gridFs');
const { getMediaModel } = require('../models/Media');

const NAME_TAKEN = 'NAME_TAKEN';

function nameTakenError(contentType, filename) {
  const error = new Error(`File name is already taken: ${contentType}/${filename}`);
  error.code = NAME_TAKEN;
  error.statusCode = 409;

  return error;
}

async function isNameTaken(contentType, filename) {
  const Media = getMediaModel(contentType);
  const [record, file] = await Promise.all([
    Media.exists({ filename }),
    getNewestFile(contentType, filename),
  ]);

  return Boolean(record || file);
}

// Единственный путь записи нового файла: в GridFS и в опись под одним именем.
// data — Buffer, openStream — функция, отдающая поток; поток открывается только
// после проверки имени, чтобы отказ не оставлял открытый файл.
async function storeMedia(
  contentType,
  { filename, mimetype, metadata, data, openStream }
) {
  const Media = getMediaModel(contentType);

  if (await isNameTaken(contentType, filename)) {
    throw nameTakenError(contentType, filename);
  }

  const fileId = data
    ? await saveFileToGridFS(contentType, data, filename, metadata)
    : await saveStreamToGridFS(contentType, openStream(), filename, metadata);

  try {
    return await Media.create({ filename, metadata, contentType: mimetype });
  } catch (error) {
    // Запись не легла — файл без неё стал бы сиротой. 11000 — гонка за имя,
    // которую проверка выше не видит; её ловит уникальный индекс описи.
    await removeFileFromGridFS(contentType, fileId).catch((removeError) => {
      console.error(
        `failed to remove ${contentType}/${filename} (${fileId}) after a failed record insert`,
        removeError
      );
    });
    if (error.code === 11000) {
      throw nameTakenError(contentType, filename);
    }
    throw error;
  }
}

module.exports = {
  NAME_TAKEN,
  isNameTaken,
  storeMedia,
};
