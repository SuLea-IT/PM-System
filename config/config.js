// config/config.js
const path = require('path');

// 根据环境动态选择 .env 文件路径
const envPath = path.resolve(__dirname, '../.env'); // 本地环境的相对路径

require('dotenv').config({path: envPath});

const jwtConfig = {
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
    accessTokenLife: '24h',
    refreshTokenLife: '7d'
};

module.exports = {
    jwtConfig
};
