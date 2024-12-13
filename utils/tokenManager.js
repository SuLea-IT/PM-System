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
        const payload = {id: decoded.id, role: decoded.role, status: decoded.status}; // 包含角色信息
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
                        return res.status(403).json({code: 403, msg: '刷新令牌无效'});
                    }
                    // 生成新的令牌并更新响应头
                    const newTokens = generateTokens({id: decoded.id, role: decoded.role, status: decoded.status}); // 包含角色
                    res.setHeader('Authorization', `Bearer ${newTokens.accessToken}`);
                    res.setHeader('x-refresh-token', newTokens.refreshToken);

                    req.user = {id: decoded.id, role: decoded.role, status: decoded.status};
                    next();
                });
            } else {
                return res.status(403).json({code: 403, msg: '访问令牌无效'});
            }
        } else {
            req.user = decoded; // 包含用户的角色信息
            next();
        }
    });
};

module.exports = {
    generateTokens,
    refreshToken,
    verifyAndRefreshTokens
};
