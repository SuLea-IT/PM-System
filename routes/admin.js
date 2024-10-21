const express = require('express');
const {checkAdmin} = require('../middleware/checkRole');
const db = require('../config/db'); // 假设你有一个数据库连接模块

const router = express.Router();

// 管理员专用的路由
router.post('/only', checkAdmin, (req, res) => {
    res.json({message: '欢迎，管理员！'});
});

// 新增接口：根据用户ID将status设置为0
router.post('/set-status', checkAdmin, async (req, res) => {
    const {userid} = req.body;  // 从请求体中获取用户ID

    if (!userid) {
        return res.status(400).json({message: '用户ID是必须的'});
    }

    try {
        // 假设使用MySQL数据库
        const result = await db.query('UPDATE users SET status = 0 WHERE id = ?', [userid]);

        if (result.affectedRows === 0) {
            return res.status(404).json({message: '未找到用户'});
        }

        res.json({message: '用户已经被禁用'});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: '服务器错误'});
    }
});

module.exports = router;
