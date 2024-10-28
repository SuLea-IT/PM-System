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


module.exports = router;
