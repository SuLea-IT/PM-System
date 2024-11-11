// 在 config 文件夹内的 db.js
const mysql = require('mysql2');
const path = require("path");

// 根据环境动态选择 .env 文件路径
const envPath = path.resolve(__dirname, '../.env'); // 本地环境的相对路径

require('dotenv').config({path: envPath});
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
});
const findUserById = (userId) => {
    return new Promise((resolve, reject) => {
        pool.query('SELECT * FROM users WHERE id = ?', [userId], (error, results) => {
            if (error) {
                reject(error);
            } else {
                resolve(results[0]); // 返回找到的第一个用户或undefined
            }
        });
    });
};

const query = (sql, params) => {
    return new Promise((resolve, reject) => {
        pool.query(sql, params, (error, results, fields) => {
            if (error) {
                reject(error);
            } else {
                resolve(results); // 这里确保返回结果是查询的行数组
            }
        });
    });
};

module.exports = {
    findUserById,
    query
};
