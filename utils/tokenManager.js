//utils/tokenManager.js
const jwt = require('jsonwebtoken');
const {jwtConfig} = require('../config/config');

const generateTokens = (payload) => {
    const accessToken = jwt.sign(payload, jwtConfig.accessTokenSecret, {expiresIn: jwtConfig.accessTokenLife});
    const refreshToken = jwt.sign(payload, jwtConfig.refreshTokenSecret, {expiresIn: jwtConfig.refreshTokenLife});
    return {accessToken, refreshToken};
};

const refreshToken = (token) => {
    try {
        const decoded = jwt.verify(token, jwtConfig.refreshTokenSecret);
        const payload = {id: decoded.id};
        return generateTokens(payload);
    } catch (error) {
        return null;
    }
};

const verifyAndRefreshTokens = (req, res, next) => {
    const accessToken = req.headers['authorization']?.split(' ')[1];
    const refreshToken = req.headers['x-refresh-token'];

    if (!accessToken) {
        return res.status(401).json({msg: '需要访问令牌'});
    }

    jwt.verify(accessToken, jwtConfig.accessTokenSecret, (err, decoded) => {
        if (err) {
            if (err.name === 'TokenExpiredError' && refreshToken) {
                jwt.verify(refreshToken, jwtConfig.refreshTokenSecret, (err, decoded) => {
                    if (err) {
                        return res.status(403).json({msg: '刷新令牌无效'});
                    }
                    // 生成新的令牌并更新响应头
                    const newTokens = generateTokens({id: decoded.id});
                    res.setHeader('Authorization', `Bearer ${newTokens.accessToken}`);
                    res.setHeader('x-refresh-token', newTokens.refreshToken);

                    req.user = {id: decoded.id};
                    next();
                });
            } else {
                return res.status(403).json({msg: '访问令牌无效'});
            }
        } else {
            req.user = decoded;
            next();
        }
    });
};

module.exports = {
    generateTokens,
    refreshToken,
    verifyAndRefreshTokens
};
