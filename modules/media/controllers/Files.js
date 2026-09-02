const { parseListQuery, listMedia } = require('../services/list');

// Список файлов для админки. Не привязан к типу медиа: тип
// здесь фильтр, а не адрес, — поэтому и роутер отдельный, как у /stats.
async function listFiles(req, res) {
  const parsed = parseListQuery(req.query);

  if (parsed.error) {
    return res.status(400).json({ message: parsed.error });
  }

  try {
    const { items, total } = await listMedia(parsed.value);

    res.json({
      items,
      total,
      page: parsed.value.page,
      limit: parsed.value.limit,
    });
  } catch (error) {
    // Наружу — общая фраза: в error.message попадают внутренние подробности
    // (имена коллекций, устройство конвейера). Причина остаётся в логе.
    console.error(error);
    res.status(500).json({
      message: 'An error occurred during media listing.',
    });
  }
}

module.exports = {
  listFiles,
};
