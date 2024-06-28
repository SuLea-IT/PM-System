// config/config.js
require('dotenv').config();

const jwtConfig = {
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
    accessTokenLife: '30m',
    refreshTokenLife: '7d'
};

module.exports = {
    jwtConfig
};
