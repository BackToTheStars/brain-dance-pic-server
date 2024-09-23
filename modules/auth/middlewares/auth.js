const { JWT_SECRET_STATIC } = require("../../../config/auth");
const { getError } = require("../../core/lib/errors");
const { checkToken } = require("../lib/token");

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  checkToken(JWT_SECRET_STATIC, token)
    .then((payload) => {
      req.payload = payload;
      next();
    })
    .catch((err) => {
      console.log(err);
      res.sendStatus(403);
    });
};

const checkOperation = (operation) => {
  return (req, res, next) => {
    if (req?.payload?.operation !== operation) {
      next(getError(`Invalid operation`, 400));
    } else {
      next();
    }
  };
};

// временно не используется
const accessControl = (req, res, next) => {
  const project = req.headers['x-project-id'];
  if (!project) {
    return res.status(400).json({ message: 'Project ID is required' });
  }

  // Логика проверки прав доступа для данного проекта
  const userProjects = req.user.projects || [];
  if (!userProjects.includes(project)) {
    return res.status(403).json({ message: 'Access denied for this project' });
  }

  req.project = project;
  next();
}


module.exports = {
  authenticateToken,
  checkOperation,
  // accessControl,
};
