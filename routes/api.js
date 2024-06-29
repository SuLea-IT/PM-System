// routes/api.js
const express = require('express');
const router = express.Router();
const {verifyAndRefreshTokens} = require('../utils/tokenManager');
// 引入路由文件
const indexRouter = require('./index');
const usersRouter = require('./users');
const UploadRouter = require('./files');
const projectsRouter = require('./projects');
// 设置 /users 路由前缀
router.use('/', indexRouter);
router.use('/users', usersRouter);
router.use("/files", verifyAndRefreshTokens, UploadRouter);
router.use('/projects', projectsRouter);
module.exports = router;
