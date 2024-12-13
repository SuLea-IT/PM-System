// routes/tasks.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const taskProcessService = require('../utils/taskProcessService');
const {verifyAndRefreshTokens} = require("../utils/tokenManager");
// 获取当前用户项目的任务
router.get('/projects', verifyAndRefreshTokens, async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 3;
    const offset = (page - 1) * limit;
    const userId = req.user.id;

    try {
        // 查询当前用户所在的项目
        const userProjects = await db.query(
            `SELECT project_id
             FROM project_members
             WHERE user_id = ?
             UNION
             SELECT id AS project_id
             FROM projects
             WHERE created_by = ?`,
            [userId, userId]
        );

        const projectIds = userProjects.map(project => project.project_id);

        if (projectIds.length === 0) {
            return res.status(200).json({
                code: 200,
                data: {
                    tasks: [],
                    total: 0,
                    page,
                    limit
                },
                msg: '没有找到任务'
            });
        }

        // 修改查询以获取当前用户项目的任务
        const tasksResult = await db.query(
            `SELECT t.*, u.name as creator_name, p.name as project_name
             FROM project_tasks t
                      LEFT JOIN users u ON t.user_id = u.id
                      LEFT JOIN projects p ON t.project_id = p.id
             WHERE t.project_id IN (?)
             ORDER BY t.created_at DESC LIMIT ?
             OFFSET ?`,
            [projectIds, limit, offset]
        );

        // 查询总数
        const [countResult] = await db.query(
            `SELECT COUNT(*) as total
             FROM project_tasks
             WHERE project_id IN (?)`,
            [projectIds]
        );

        const total = countResult.total || 0;

        res.status(200).json({
            code: 200,
            data: {
                tasks: tasksResult,
                total,
                page,
                limit
            },
            msg: '获取项目任务列表成功'
        });
    } catch (error) {
        console.error("获取项目任务列表错误:", error);
        res.status(500).json({code: 500, msg: '服务器错误'});
    }
});


// 获取当前用户的所有任务
router.get('/my-tasks', verifyAndRefreshTokens, async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 3;
    const offset = (page - 1) * limit;
    const userId = req.user.id;

    try {
        // 修改查询以包含创建者用户名和项目名称
        const tasksResult = await db.query(
            `SELECT t.*, p.name as project_name, u.name as creator_name
             FROM project_tasks t
                      LEFT JOIN projects p ON t.project_id = p.id
                      LEFT JOIN users u ON t.user_id = u.id
             WHERE t.user_id = ?
             ORDER BY t.created_at DESC LIMIT ?
             OFFSET ?`,
            [userId, limit, offset]
        );

        // 查询总数
        const [countResult] = await db.query(
            `SELECT COUNT(*) as total
             FROM project_tasks
             WHERE user_id = ?`,
            [userId]
        );

        const total = countResult.total || 0;

        res.status(200).json({
            code: 200,
            data: {
                tasks: tasksResult,
                total,
                page,
                limit
            },
            msg: '获取个人任务列表成功'
        });
    } catch (error) {
        console.error("获取个人任务列表错误:", error);
        res.status(500).json({code: 500, msg: '服务器错误'});
    }
});

// 创建新任务
router.post('/create', verifyAndRefreshTokens, async (req, res) => {
    try {
        const {projectId, fileIds, taskType, name, dataFormat = 0} = req.body;
        const userId = req.user.id;
        // 验证数据格式范围
        if (dataFormat < 0 || dataFormat > 4) {
            return res.status(400).json({code: 400, msg: '数据格式标识必须在0-4之间'});
        }
        // 获取文件路径
        const filesResult = await db.query(
            `SELECT filepath
             FROM project_files
             WHERE id IN (?)
               AND project_id = ?`,
            [fileIds, projectId]
        );
        if (!filesResult.length) {
            return res.status(400).json({code: 400, msg: '未找到指定文件'});
        }
        const filePaths = filesResult.map(file => file.filepath).join(';');
        // 创建任务（添加data_format字段）
        const result = await db.query(
            `INSERT INTO project_tasks (user_id, project_id, name, file_paths, task_type, status, data_format)
             VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
            [userId, projectId, name, filePaths, taskType, dataFormat]
        );
        if (!result.insertId) {
            throw new Error('任务创建失败');
        }
        // 创建成功后立即发送处理请求
        try {
            await taskProcessService.sendTaskToProcess({
                taskId: result.insertId,
                taskType,
                dataFormat,
                filePaths,
                name
            });
            // 更新任务状态为处理中
            await db.query(
                'UPDATE project_tasks SET status = "processing" WHERE id = ?',
                [result.insertId]
            );
        } catch (processError) {
            // console.error("发送处理请求失败:", processError);
            // 记录错误但不影响任务创建的成功响应
            // 可以选择更新任务状态为失败
            await db.query(
                'UPDATE project_tasks SET status = "failed" WHERE id = ?',
                [result.insertId]
            );
        }
        res.status(200).json({
            code: 200,
            data: {taskId: result.insertId},
            msg: '任务创建成功'
        });
    } catch (error) {
        console.error("创建任务错误:", error);
        res.status(500).json({code: 500, msg: '服务器错误'});
    }
});

// 删除任务
router.delete('/:taskId', verifyAndRefreshTokens, async (req, res) => {
    try {
        const {taskId} = req.params;
        const userId = req.user.id;

        // 检查任务是否存在且属于当前用户
        const [task] = await db.query(
            'SELECT * FROM project_tasks WHERE id = ? AND user_id = ?',
            [taskId, userId]
        );

        if (!task) {
            return res.status(404).json({code: 404, msg: '任务不存在或无权限删除'});
        }

        // 删除任务
        const result = await db.query(
            'DELETE FROM project_tasks WHERE id = ?',
            [taskId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({code: 404, msg: '任务删除失败'});
        }

        res.status(200).json({
            code: 200,
            msg: '任务删除成功'
        });
    } catch (error) {
        console.error("删除任务错误:", error);
        res.status(500).json({code: 500, msg: '服务器错误'});
    }
});

// 更新任务状态
router.put('/:taskId/status', verifyAndRefreshTokens, async (req, res) => {
    try {
        const {taskId} = req.params;
        const {status} = req.body;
        const userId = req.user.id;

        // 检查任务是否存在且属于当前用户
        const [task] = await db.query(
            'SELECT * FROM project_tasks WHERE id = ? AND user_id = ?',
            [taskId, userId]
        );

        if (!task) {
            return res.status(404).json({code: 404, msg: '任务不存在或无权限更新'});
        }

        // 更新任务状态
        const result = await db.query(
            'UPDATE project_tasks SET status = ? WHERE id = ?',
            [status, taskId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({code: 404, msg: '任务状态更新失败'});
        }

        res.status(200).json({
            code: 200,
            msg: '任务状态更新成功'
        });
    } catch (error) {
        console.error("更新任务状态错误:", error);
        res.status(500).json({code: 500, msg: '服务器错误'});
    }
});
// 取消任务
router.put('/:taskId/cancel', verifyAndRefreshTokens, async (req, res) => {
    try {
        const {taskId} = req.params;
        const userId = req.user.id;

        // 检查任务是否存在且属于当前用户
        const [task] = await db.query(
            'SELECT * FROM project_tasks WHERE id = ? AND user_id = ?',
            [taskId, userId]
        );

        if (!task) {
            return res.status(404).json({code: 404, msg: '任务不存在或无权限取消'});
        }

        // 只有待处理或处理中的任务可以取消
        if (!['pending', 'processing'].includes(task.status)) {
            return res.status(400).json({code: 400, msg: '当前状态的任务无法取消'});
        }

        // 更新任务状态为已取消
        const result = await db.query(
            'UPDATE project_tasks SET status = "cancelled" WHERE id = ?',
            [taskId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({code: 404, msg: '任务取消失败'});
        }

        res.status(200).json({
            code: 200,
            msg: '任务取消成功'
        });
    } catch (error) {
        console.error("取消任务错误:", error);
        res.status(500).json({code: 500, msg: '服务器错误'});
    }
});

module.exports = router;
