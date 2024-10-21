const express = require('express');
const router = express.Router();
const {verifyAndRefreshTokens} = require('../utils/tokenManager');
const adminRoutes = require('./admin');

// 引入路由文件
const indexRouter = require('./index');
const usersRouter = require('./users');
const projectsRouter = require('./projects');


// 设置 /users 路由前缀
router.use('/', indexRouter);
router.use('/users', usersRouter);
router.use('/projects', projectsRouter);

// 在使用 adminRoutes 之前，应用 verifyAndRefreshTokens 中间件
router.use('/admin', verifyAndRefreshTokens, adminRoutes);

module.exports = router;
