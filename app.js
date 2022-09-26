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
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/static/images', express.static(staticImagesBasePath));
app.use('/images', imagesRouter);

app.use('*', error404);
app.use(errorAll);

app.listen(PORT, () => {
  console.log(`Listening on ${HOST}`);
});
