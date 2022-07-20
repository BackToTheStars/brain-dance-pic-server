var express = require('express')
var router = express.Router()
var multer  = require('multer')
var auth_token = "1234"

const imageModel = require("../models/image");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
})
const upload = multer({ storage: storage })

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});


router.post('/upload', upload.single('file'), function (req, res, next) {
  try {

    //console.log(JSON.stringify(req.headers));
    let token = req.headers['authorization'];
    token = token.replace(/^Bearer\s+/, "");

    if (token === auth_token) {
      //console.log('authorised');
    } else {
      return res.json({
        success: false,
        message: 'not authorised'
      });
    }

    //console.log(JSON.stringify(req.file))
    const image = new imageModel({
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      encoding: req.file.encoding,
      mimetype: req.file.mimetype,
      destination: req.file.destination,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
    });

    image.save();
    res.json('ok');
  } catch (error) {
    next(error);
  }
});


module.exports = router;