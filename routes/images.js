var express = require('express')
var router = express.Router()
var multer  = require('multer')
var fs = require('fs')
var path = require('path')


const secretKey = process.env.SECRET_KEY
const host = process.env.HOST || 'http://localhost:3000'

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
      return res.json('not correct image extension')
    }

    if ( req.file.size > 10000000 ) {
      return res.json('too big')
    }

    //console.log (req.payload)

    const {operation,hash} = req.payload

    if (operation !== 'upload') {
      return res.json("not ok")
    }

    const dir = path.join(__dirname, '../static/images/' + hash )

    //console.log(dir);

    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
    }

    const ts = new Date().getTime();

    const extArray = req.file.mimetype.split("/");
    const extension = extArray[extArray.length - 1];

    const oldPath = path.join(__dirname, '../static/images/tmp/' + req.file.originalname )
    const newPath = path.join(__dirname, '../static/images/' + hash + '/' + ts + '.' + extension )

    const newPath2 = '/static/images/' + hash + '/' + ts + '.' + extension


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
      path: newPath2,

    });

    image.save();
    res.json(

      {
        src: host + image['path'],
        item: image,
      }

    );
  } catch (error) {
    next(error);
  }
});


router.get('/:id', function(req, res, next) {

  try {

    var id = req.params.id

    imageModel.findById(id)
      .lean().exec(function (err, results) {
      if (err) return next(err)

      res.send(
        {
          src: host + results['path'],
          item: results,
        }
      )

    })

  } catch (err) {
    next(err)
  }

});

router.delete('/:id', authenticateToken, function(req, res, next) {

  try {

    var id = req.params.id

    const {operation,hash} = req.payload

    if (operation !== 'delete') {
      return res.json("not ok")
    }

    imageModel.findById(id)
      .lean().exec(function (err, results) {
      if (err) return next(err)

      //console.log(results['path'])

      const pathArray = results['path'].split("/");
      const pathHash = pathArray[pathArray.length - 2];

      //console.log(pathHash)

      if ( ! (hash === pathHash) ) {
        return res.json("not ok")
      }


      var filePath = path.join(__dirname, '..' + results['path'] )

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      //res.send(results)

    })

    imageModel.findByIdAndUpdate(id,{"status": "deleted"}, function(error, result){

      if(error){
        next(error);
      }
      else{
        return res.send(result)
      }

    })



  } catch (err) {
    next(err)
  }

});

module.exports = router;
