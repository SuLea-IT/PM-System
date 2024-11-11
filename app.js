// app.js
const express = require('express');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const path = require("path");

// 根据环境动态选择 .env 文件路径
const envPath = path.resolve(__dirname, '../.env'); // 本地环境的相对路径

require('dotenv').config({path: envPath});
const apiRouter = require('./routes/api');
const createError = require("http-errors");
// 创建 Express 应用
const app = express();

app.use(cors());
// 设置视图目录和视图引擎
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// 使用中间件
app.use(logger('dev')); // 日志
app.use(express.json()); // 解析 JSON 请求体
app.use(express.urlencoded({extended: false})); // 解析 URL-encoded 请求体
app.use(cookieParser()); // 解析 cookie
// app.use(express.static(path.join(__dirname, 'public'))); // 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, '/uploads'))); // 为 /uploads 路径提供静态文件服务

// 设置路由
app.use('/api', apiRouter);
//
// 捕捉 404 并转发到错误处理器
app.use(function (req, res, next) {
  next(createError(404));
});

// 错误处理器
app.use(function (err, req, res, next) {
  // 设置局部变量，仅在开发中提供错误
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // 渲染错误页面
  res.status(err.status || 500);
  res.render('error');
});

// 设置和启动服务器
const PORT = process.env.PORT || 3177;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
