//routes/token.js
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const {jwtConfig} = require('../config/config');
const db = require('../config/db'); // 假设数据库配置和连接已正确设置

router.post('/token', async (req, res) => {
    const refreshToken = req.body.token;

    if (!refreshToken) {
        return res.status(401).json({
            code: 401,
            data: null,
            msg: '需要提供刷新令牌'
        });
    }

    // 验证 Refresh Token 是否在数据库中并检查是否已过期或被撤销
    const [[tokenData]] = await db.query('SELECT * FROM refresh_tokens WHERE token = ?', [refreshToken]);
    if (!tokenData || new Date() > new Date(tokenData.expires_at)) {
        return res.status(403).json({
            code: 403,
            data: null,
            msg: '刷新令牌无效或已过期'
        });
    }

    // 验证 Refresh Token 的合法性
    jwt.verify(refreshToken, jwtConfig.refreshTokenSecret, (err, decoded) => {
        if (err) {
            return res.status(403).json({
                code: 403,
                data: null,
                msg: '刷新令牌无效'
            });
        }

        // 如果验证通过，生成新的 Access Token
        const newAccessToken = jwt.sign({id: decoded.id}, jwtConfig.accessTokenSecret, {expiresIn: jwtConfig.accessTokenLife});

        res.json({
            code: 200,
            data: {
                accessToken: newAccessToken
            },
            msg: '成功生成新的访问令牌'
        });
    });
});

module.exports = router;
