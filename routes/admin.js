const express = require('express');
const {checkAdmin} = require('../middleware/checkRole');
const db = require('../config/db');
const path = require("path"); // 假设你有一个数据库连接模块

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
// 根据项目 ID 强制解散项目
router.post('/force-dissolve-project', checkAdmin, async (req, res) => {
    const {projectId} = req.body;

    if (!projectId) {
        return res.status(400).json({message: '项目 ID 是必需的。'});
    }

    try {
        // 1. 删除 project_applications 表中与该项目相关的记录
        await db.query('DELETE FROM project_applications WHERE project_id = ?', [projectId]);

        // 2. 删除 project_members 表中与该项目相关的成员记录
        await db.query('DELETE FROM project_members WHERE project_id = ?', [projectId]);

        // 3. 删除 files 表中与该项目相关的文件记录
        await db.query('DELETE FROM files WHERE project_id = ?', [projectId]);

        // 4. 删除 project_invitations 表中与该项目相关的邀请记录
        await db.query('DELETE FROM project_invitations WHERE project_id = ?', [projectId]);

        // 5. 最后删除 projects 表中的项目本身
        const result = await db.query('DELETE FROM projects WHERE id = ?', [projectId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({message: '未找到该项目。'});
        }

        res.json({message: '项目及相关记录已成功解散。'});
    } catch (error) {
        console.error('解散项目时发生错误:', error);
        res.status(500).json({message: '解散项目时发生错误。'});
    }
});

// 分页获取用户列表
router.get('/users', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const offset = (page - 1) * limit;

    try {
        // 使用整数解析后的 LIMIT 和 OFFSET 参数
        const usersResult = await db.query(
            'SELECT id, username, name, email, role, avatar, email_confirmed, status FROM users LIMIT ? OFFSET ?',
            [limit, offset]
        );

        const countResult = await db.query('SELECT COUNT(*) AS total FROM users');

        const users = usersResult;
        const total = countResult[0]?.total || 0;

        res.status(200).json({data: users, total, page, limit});
    } catch (error) {
        console.error("错误详情:", error.message);
        res.status(500).json({message: '获取用户列表失败'});
    }
});
// 根据用户名分页获取用户信息
router.get('/users/search', async (req, res) => {
    const {username, page = 1, limit = 5} = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    if (!username) {
        return res.status(400).json({message: '用户名是必需的'});
    }

    try {
        // 使用LIKE查询用户名包含指定字符串的用户
        const usersResult = await db.query(
            'SELECT id, username, name, email, role, avatar, email_confirmed, status FROM users WHERE username LIKE ? LIMIT ? OFFSET ?',
            [`%${username}%`, parseInt(limit), offset]
        );

        // 查询符合条件的用户总数
        const countResult = await db.query(
            'SELECT COUNT(*) AS total FROM users WHERE username LIKE ?',
            [`%${username}%`]
        );

        const users = usersResult;
        const total = countResult[0]?.total || 0;

        res.status(200).json({
            data: users,
            total,
            currentPage: parseInt(page),
            pageSize: parseInt(limit)
        });
    } catch (error) {
        console.error("错误详情:", error.message);
        res.status(500).json({message: '获取用户信息失败'});
    }
});

router.post('/users', async (req, res) => {
    const {username, name, email, role = 1, status} = req.body;
    let password = "A1b2c3"
    let avatarUrl = process.env.APP_URL
    let email_confirmed = 1
    avatarUrl = path.join(avatarUrl, 'uploads', 'avatar', 'default.jpg');
    try {
        await db.query(
            'INSERT INTO users (username, password, name, email, role, avatar,status,email_confirmed) VALUES (?, ?,' +
            ' ?, ?, ?, ?,?,?)',
            [username, password, name, email, role, avatarUrl, status, email_confirmed]
        );
        res.status(200).json({message: '用户创建成功'});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: '创建用户失败'});
    }
});
router.put('/users/:id', async (req, res) => {
    const {id} = req.params;
    const {username, password, name, email, avatar, role, status} = req.body;

    try {
        await db.query(
            'UPDATE users SET username = ?, name = ?, email = ?, avatar = ?,role = ?,status = ? WHERE id = ?',
            [username, name, email, avatar, role, status, id]
        );
        res.json({message: '用户更新成功'});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: '更新用户失败'});
    }
});
router.delete('/users/:id', async (req, res) => {
    const {id} = req.params;

    try {
        // 先删除 refresh_tokens 表中与该用户关联的记录
        await db.query('DELETE FROM refresh_tokens WHERE user_id = ?', [id]);

        // 然后删除 users 表中的用户记录
        await db.query('DELETE FROM users WHERE id = ?', [id]);

        res.json({message: '用户删除成功'});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: '删除用户失败'});
    }
});

module.exports = router;
