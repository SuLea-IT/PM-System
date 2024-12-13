const express = require('express');
const router = express.Router();
const {verifyAndRefreshTokens} = require('../utils/tokenManager');
const adminRouter = require('./admin');
const infoRouter = require('./info');
// 引入路由文件
const indexRouter = require('./index');
const usersRouter = require('./users');
const projectsRouter = require('./projects');
const directoriesRouter = require('./ProjectDirectories');
const projectTasks = require('./projectTasks');
// 设置 /users 路由前缀
router.use('/', indexRouter);
router.use('/users', usersRouter);
router.use('/projects', projectsRouter);
router.use('/directories', directoriesRouter);
router.use('/info', infoRouter);
router.use('/tasks', projectTasks);
// 在使用 adminRoutes 之前，应用 verifyAndRefreshTokens 中间件
router.use('/admin', verifyAndRefreshTokens, adminRouter);

module.exports = router;
