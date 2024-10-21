const express = require('express');
const router = express.Router();
const {verifyAndRefreshTokens} = require('../utils/tokenManager');
const checkAdmin = require('../middleware/checkRole');

// 引入路由文件
const indexRouter = require('./index');
const usersRouter = require('./users');
const projectsRouter = require('./projects');

// 设置 /users 路由前缀
router.use('/', indexRouter);
router.use('/users', usersRouter);
router.use('/projects', projectsRouter);

// 需要管理员权限的路由示例
router.post('/admin/only', verifyAndRefreshTokens, checkAdmin, (req, res) => {
    res.json({message: '欢迎，管理员！'});
});

module.exports = router;
