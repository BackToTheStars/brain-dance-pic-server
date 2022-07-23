var express = require('express')
var router = express.Router()
var multer  = require('multer')
var fs = require('fs')

var secretKey = "12345"

const imageModel = require("../models/image");

const { checkToken } = require('../lib/game');
//const { getToken } = require('../lib/game');


//const jwt = require('jsonwebtoken');
//const { sign } = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (token == null) return res.sendStatus(401)

  checkToken(secretKey, token)
    .then(
      (payload) => {
        req.payload = payload;
        next();
      }
    )
    .catch(
      (err) => {
        console.log(err);
        res.sendStatus(403)
      }
    )

}


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './static/images/tmp')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
})
const upload = multer({ storage: storage })


/* GET home page. */
/*router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});*/

router.post('/upload', authenticateToken, upload.single('file'),   function (req, res, next) {
  try {

    if ( ! ( req.file.mimetype === "image/png" || req.file.mimetype === "image/jpeg" || req.file.mimetype === "image/jpg" ) ) {
      res.json('not correct image extension')
    }

    if ( req.file.size > 10000000 ) {
      res.json('too big')
    }

    //console.log (req.payload)
    const {operation,hash} = req.payload

    const dir = './static/images/' + hash

    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
    }

    const ts = new Date().getTime();

    const extArray = req.file.mimetype.split("/");
    const extension = extArray[extArray.length - 1];

    const oldPath = './static/images/tmp/' + req.file.originalname
    const newPath = './static/images/' + hash + '/' + ts + '.' + extension

    fs.rename(oldPath, newPath, function (err) {
      if (err) throw err
    })

    //console.log(JSON.stringify(req.file))
    const image = new imageModel({

      info: {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        encoding: req.file.encoding,
        mimetype: req.file.mimetype,
        destination: req.file.destination,
        filename: req.file.filename,
        size: req.file.size,
      },
      path: req.file.path,

    });

    image.save();
    res.json('ok');
  } catch (error) {
    next(error);
  }
});


router.get('/:id', function(req, res, next) {

  var id = req.params.id

  imageModel.findById(id)
    .lean().exec(function (err, results) {
    if (err) return console.error(err)
    try {

      console.log(results)
      res.send(results)

    } catch (error) {

      console.log(error)
      next(error);

    }
  })

});

router.delete('/:id', function(req, res, next) {

  var id = req.params.id

  imageModel.findByIdAndUpdate(id,{"status": "deleted"}, function(error, result){

    if(error){
      next(error);
    }
    else{
      res.send(result)
    }

  })

});

module.exports = router;
