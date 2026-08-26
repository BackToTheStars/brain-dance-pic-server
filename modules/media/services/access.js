const { ACCESS_COUNT_WINDOW } = require('../../../config/media');

// Начало просмотра — это отсутствие Range либо диапазон, запрошенный с нуля.
// Всё остальное — продолжение уже начатого: видео браузер тянет десятками
// кусков, pdf.js — страницами, и считать их значило бы мерить рваность сети,
// а не спрос. Суффиксный диапазон (bytes=-500) началом просмотра не считается.
const isViewStart = (range) => !range || /^\s*bytes\s*=\s*0\s*-/i.test(range);

// Один условный updateOne на обращение: фильтр пропускает запись, только если
// прошлое обращение старше окна (или его вовсе не было), и в том же запросе —
// $inc/$set. Чтения перед записью нет, поэтому две одновременные отдачи одного
// файла дают ровно один инкремент: условие проверяется на самом документе.
//
// lastAccessAt: null в фильтре ловит и записи, сделанные до этой волны, — у них
// поля нет вовсе, а в mongo отсутствующее поле равно null.
async function trackAccess(Media, id, now = new Date()) {
  const threshold = new Date(now.getTime() - ACCESS_COUNT_WINDOW);

  await Media.updateOne(
    {
      _id: id,
      $or: [{ lastAccessAt: { $lte: threshold } }, { lastAccessAt: null }],
    },
    { $inc: { accessCount: 1 }, $set: { lastAccessAt: now } }
  );
}

module.exports = {
  isViewStart,
  trackAccess,
};
