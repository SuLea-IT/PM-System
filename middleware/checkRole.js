// middleware/checkRole.js
const jwt = require('jsonwebtoken');

function checkAdmin(req, res, next) {
    // req.user 已经通过 verifyAndRefreshTokens 中间件解析
    if (!req.user || req.user.role !== 0) {
        return res.status(400).json({message: '只有管理员可以访问'});
    }
    // 如果是管理员，继续处理请求
    next();
}

module.exports = {checkAdmin};
