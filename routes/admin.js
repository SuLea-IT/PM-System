const express = require('express');
const {checkAdmin} = require('../middleware/checkRole');
const db = require('../config/db');
const path = require("path"); // 假设你有一个数据库连接模块
const bcrypt = require('bcryptjs');
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
        // 1. 删除 project_stats 表中与该项目相关的记录
        await db.query('DELETE FROM project_stats WHERE project_id = ?', [projectId]);

        // 2. 删除 directories 表中与该项目相关的记录
        await db.query('DELETE FROM directories WHERE project_id = ?', [projectId]);

        // 3. 删除 project_members 表中与该项目相关的成员记录
        await db.query('DELETE FROM project_members WHERE project_id = ?', [projectId]);

        // 4. 删除 files 表中与该项目相关的文件记录
        await db.query('DELETE FROM files WHERE project_id = ?', [projectId]);

        // 5. 删除 project_invitations 表中与该项目相关的邀请记录
        await db.query('DELETE FROM project_invitations WHERE project_id = ?', [projectId]);

        // 6. 删除 project_applications 表中与该项目相关的申请记录（如果存在）
        await db.query('DELETE FROM project_applications WHERE project_id = ?', [projectId]);

        // 7. 删除 project_tasks 表中与该项目相关的任务记录
        await db.query('DELETE FROM project_tasks WHERE project_id = ?', [projectId]);

        // 8. 最后删除 projects 表中的项目本身
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


// POST: 重置用户密码
router.post('/users/reset-password', async (req, res) => {
    const {userid} = req.body;

    if (!userid) {
        return res.status(400).json({message: '用户ID是必须的'});
    }

    const defaultPassword = "A1b2c3"; // 默认密码

    try {
        // 加密默认密码
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        // 更新用户的密码为新密码
        const result = await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userid]);

        if (result.affectedRows === 0) {
            return res.status(404).json({message: '未找到该用户'});
        }

        res.json({message: '密码已重置为默认密码'});
    } catch (error) {
        console.error("重置密码时发生错误:", error);
        res.status(500).json({message: '重置密码失败'});
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

// POST: 创建用户
router.post('/users', async (req, res) => {
    const {username, name, email, role = 1, status} = req.body;
    const defaultPassword = "A1b2c3"; // 默认密码
    let avatarUrl = process.env.APP_URL;
    let email_confirmed = 1;
    avatarUrl = path.join(avatarUrl, 'uploads', 'avatar', 'default.jpg');

    try {
        // 加密密码
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        // 插入新用户到数据库
        await db.query(
            'INSERT INTO users (username, password, name, email, role, avatar, status, email_confirmed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [username, hashedPassword, name, email, role, avatarUrl, status, email_confirmed]
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
        // 先删除 project_members 表中与该用户关联的记录
        await db.query('DELETE FROM project_members WHERE user_id = ?', [id]);

        // 然后删除 refresh_tokens 表中与该用户关联的记录
        await db.query('DELETE FROM refresh_tokens WHERE user_id = ?', [id]);

        // 最后删除 users 表中的用户记录
        await db.query('DELETE FROM users WHERE id = ?', [id]);

        res.json({message: '用户删除成功'});
    } catch (error) {
        console.error(error);
        res.status(500).json({message: '删除用户失败'});
    }
});
// GET: 获取项目列表
router.get('/projects', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const offset = (page - 1) * limit;

    try {
        // 执行联合查询，获取项目及其创建者的名字
        const projectsResult = await db.query(`
            SELECT p.id, p.name, p.description, p.created_at, p.avatar, u.name AS created_by
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        const countResult = await db.query('SELECT COUNT(*) AS total FROM projects');

        const projects = projectsResult;
        const total = countResult[0]?.total || 0;

        res.status(200).json({data: projects, total, page, limit});
    } catch (error) {
        console.error('获取项目列表失败:', error);
        res.status(500).json({message: '获取项目列表失败'});
    }
});

// GET: 获取单个项目详细信息
// router.get('/projects/:id', async (req, res) => {
//     const { id } = req.params;
//
//     try {
//         const projectResult = await db.query('SELECT * FROM projects WHERE id = ?', [id]);
//         if (projectResult.length === 0) {
//             return res.status(404).json({ message: '未找到该项目' });
//         }
//
//         res.status(200).json({ data: projectResult[0] });
//     } catch (error) {
//         console.error('获取项目详情失败:', error);
//         res.status(500).json({ message: '获取项目详情失败' });
//     }
// });
// DELETE: 删除项目
router.delete('/projects/:id', checkAdmin, async (req, res) => {
    const {id} = req.params;

    try {
        // 删除与项目相关的成员
        await db.query('DELETE FROM project_members WHERE project_id = ?', [id]);

        // 删除与项目相关的文件
        await db.query('DELETE FROM files WHERE project_id = ?', [id]);

        // 删除与项目相关的目录
        await db.query('DELETE FROM directories WHERE project_id = ?', [id]);

        // 删除项目本身
        const result = await db.query('DELETE FROM projects WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({message: '未找到该项目'});
        }

        res.status(200).json({message: '项目删除成功'});
    } catch (error) {
        console.error('删除项目失败:', error);
        res.status(500).json({message: '删除项目失败'});
    }
});
// GET: 获取项目成员
router.get('/projects/:id/members', async (req, res) => {
    const {id} = req.params;

    try {
        const membersResult = await db.query(
            'SELECT u.id, u.username, u.name, u.email, pm.role FROM project_members pm JOIN users u ON pm.user_id = u.id WHERE pm.project_id = ?',
            [id]
        );

        res.status(200).json({data: membersResult});
    } catch (error) {
        console.error('获取项目成员失败:', error);
        res.status(500).json({message: '获取项目成员失败'});
    }
});
// POST: 将成员添加到项目
router.post('/projects/:id/members', checkAdmin, async (req, res) => {
    const {id} = req.params;
    const {user_id, role = 'member'} = req.body;

    if (!user_id) {
        return res.status(400).json({message: '用户ID是必需的'});
    }

    try {
        // 检查项目是否存在
        const projectResult = await db.query('SELECT * FROM projects WHERE id = ?', [id]);
        console.log(projectResult.length);
        if (projectResult.length === 0) {
            return res.status(404).json({message: '未找到该项目'});
        }

        // 检查用户是否已经是项目成员
        const memberResult = await db.query(
            'SELECT * FROM project_members WHERE project_id = ? AND user_id = ?',
            [id, user_id]
        );

        if (memberResult.length > 0) {
            return res.status(400).json({message: '用户已是项目成员'});
        }

        // 将用户添加为项目成员
        await db.query(
            'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
            [id, user_id, role]
        );

        res.status(200).json({message: '成员添加成功'});
    } catch (error) {
        console.error('添加成员到项目失败:', error);
        res.status(500).json({message: '添加成员到项目失败'});
    }
});
router.get('/projects/search', async (req, res) => {
    const {query, page = '1', limit = '5'} = req.query;
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    if (!query) {
        return res.status(400).json({message: '搜索关键词是必需的'});
    }

    // 验证 page 和 limit 是否为有效数字
    if (isNaN(parsedPage) || isNaN(parsedLimit) || parsedPage <= 0 || parsedLimit <= 0) {
        return res.status(400).json({message: '分页参数无效'});
    }

    const offset = (parsedPage - 1) * parsedLimit;

    try {
        // 使用 LIKE 查询项目名称或描述中包含指定关键词的项目
        const projectsResult = await db.query(
            'SELECT id, name, description, created_at, created_by, avatar FROM projects WHERE name LIKE ? OR description LIKE ? LIMIT ? OFFSET ?',
            [`%${query}%`, `%${query}%`, parsedLimit, offset]
        );

        // 查询符合条件的项目总数
        const countResult = await db.query(
            'SELECT COUNT(*) AS total FROM projects WHERE name LIKE ? OR description LIKE ?',
            [`%${query}%`, `%${query}%`]
        );

        const projects = projectsResult;
        const total = countResult[0]?.total || 0;

        res.status(200).json({
            data: projects,
            total,
            currentPage: parsedPage,
            pageSize: parsedLimit,
        });
    } catch (error) {
        console.error('搜索项目时发生错误:', error);
        res.status(500).json({message: '搜索项目失败'});
    }
});
// 获取全部任务列表（带详细信息）
router.get('/tasks', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        // 联合查询获取详细任务信息
        const tasksResult = await db.query(`
            SELECT 
                t.id, 
                t.name, 
                t.status, 
                t.created_at, 
                t.task_type,
                t.data_format,
                p.name AS project_name,
                creator.name AS creator_name,
                project_owner.name AS project_owner_name,
                t.user_id AS creator_id,
                p.created_by AS project_owner_id
            FROM project_tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users creator ON t.user_id = creator.id
            LEFT JOIN users project_owner ON p.created_by = project_owner.id
            ORDER BY t.created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        // 获取总任务数
        const [countResult] = await db.query('SELECT COUNT(*) AS total FROM project_tasks');
        const total = countResult.total || 0;

        res.status(200).json({
            code: 200,
            data: {
                tasks: tasksResult,
                total,
                page,
                limit
            },
            msg: '获取任务列表成功'
        });
    } catch (error) {
        console.error("获取任务列表错误:", error);
        res.status(500).json({code: 500, msg: '服务器错误'});
    }
});

// 根据状态筛选任务
router.get('/tasks/filter', async (req, res) => {
    const {status, page = 1, limit = 10} = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        const tasksResult = await db.query(`
            SELECT 
                t.id, 
                t.name, 
                t.status, 
                t.created_at, 
                t.task_type,
                t.data_format,
                p.name AS project_name,
                creator.name AS creator_name,
                project_owner.name AS project_owner_name,
                t.user_id AS creator_id,
                p.created_by AS project_owner_id
            FROM project_tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users creator ON t.user_id = creator.id
            LEFT JOIN users project_owner ON p.created_by = project_owner.id
            WHERE t.status = ?
            ORDER BY t.created_at DESC
            LIMIT ? OFFSET ?
        `, [status, parseInt(limit), offset]);

        const [countResult] = await db.query(
            'SELECT COUNT(*) AS total FROM project_tasks WHERE status = ?',
            [status]
        );
        const total = countResult.total || 0;

        res.status(200).json({
            code: 200,
            data: {
                tasks: tasksResult,
                total,
                page: parseInt(page),
                limit: parseInt(limit)
            },
            msg: '根据状态获取任务列表成功'
        });
    } catch (error) {
        console.error("根据状态获取任务列表错误:", error);
        res.status(500).json({code: 500, msg: '服务器错误'});
    }
});

// 更新任务状态（管理员版本）
router.put('/tasks/:taskId/status', checkAdmin, async (req, res) => {
    const {taskId} = req.params;
    const {status} = req.body;

    // 校验状态值
    const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            code: 400,
            msg: '无效的任务状态'
        });
    }

    try {
        const result = await db.query(
            'UPDATE project_tasks SET status = ? WHERE id = ?',
            [status, taskId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                code: 404,
                msg: '未找到该任务'
            });
        }

        res.status(200).json({
            code: 200,
            msg: '任务状态更新成功'
        });
    } catch (error) {
        console.error("更新任务状态错误:", error);
        res.status(500).json({
            code: 500,
            msg: '服务器错误'
        });
    }
});

// 删除任务（管理员版本）
router.delete('/tasks/:taskId', checkAdmin, async (req, res) => {
    const {taskId} = req.params;

    try {
        const result = await db.query(
            'DELETE FROM project_tasks WHERE id = ?',
            [taskId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                code: 404,
                msg: '未找到该任务'
            });
        }

        res.status(200).json({
            code: 200,
            msg: '任务删除成功'
        });
    } catch (error) {
        console.error("删除任务错误:", error);
        res.status(500).json({
            code: 500,
            msg: '服务器错误'
        });
    }
});
// 根据任务名称搜索任务
router.get('/tasks/search', async (req, res) => {
    const {query, page = 1, limit = 10} = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    if (!query) {
        return res.status(400).json({
            code: 400,
            msg: '搜索关键词是必需的'
        });
    }

    try {
        // 使用 LIKE 查询任务名称中包含指定关键词的任务
        const tasksResult = await db.query(`
            SELECT 
                t.id, 
                t.name, 
                t.status, 
                t.created_at, 
                t.task_type,
                t.data_format,
                p.name AS project_name,
                creator.name AS creator_name,
                project_owner.name AS project_owner_name,
                t.user_id AS creator_id,
                p.created_by AS project_owner_id
            FROM project_tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users creator ON t.user_id = creator.id
            LEFT JOIN users project_owner ON p.created_by = project_owner.id
            WHERE t.name LIKE ?
            ORDER BY t.created_at DESC
            LIMIT ? OFFSET ?
        `, [`%${query}%`, parseInt(limit), offset]);

        // 查询符合条件的任务总数
        const [countResult] = await db.query(
            'SELECT COUNT(*) AS total FROM project_tasks WHERE name LIKE ?',
            [`%${query}%`]
        );
        const total = countResult.total || 0;

        res.status(200).json({
            code: 200,
            data: {
                tasks: tasksResult,
                total,
                page: parseInt(page),
                limit: parseInt(limit)
            },
            msg: '搜索任务成功'
        });
    } catch (error) {
        console.error("搜索任务错误:", error);
        res.status(500).json({
            code: 500,
            msg: '服务器错误'
        });
    }
});

module.exports = router;
