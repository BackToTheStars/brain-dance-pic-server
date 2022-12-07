require('./config');
require('./models/connect');
const { PORT, HOST } = require('./config/url');
const express = require('express');
const cors = require('cors');
const imagesRouter = require('./routes/images');
const { error404, errorAll } = require('./middlewares/errors');
const { staticImagesBasePath } = require('./config/path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/static/images', express.static(staticImagesBasePath));
app.use('/images', imagesRouter);

app.use('*', error404);
app.use(errorAll);

app.listen(PORT, () => {
  console.log(`Listening on ${HOST}`);
});
