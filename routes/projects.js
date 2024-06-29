//routes/projects.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const {verifyAndRefreshTokens} = require('../utils/tokenManager');
const {handleFileUpload} = require('../utils/fileUpload');
const multer = require('multer');
const upload = multer({dest: 'uploads/'});
// 获取项目信息
router.get('/:projectId/info', async (req, res) => {
    try {
        const {projectId} = req.params;

        // 获取项目基本信息
        const [project] = await db.query('SELECT name, description, created_by, created_at FROM projects WHERE id = ?', [projectId]);
        if (!project) {
            return res.status(404).json({code: 404, msg: '项目未找到'});
        }

        // 获取项目管理员信息
        const [adminResult] = await db.query('SELECT users.id, users.name, users.email FROM users JOIN project_members ON users.id = project_members.user_id WHERE project_members.project_id = ? AND project_members.role = "admin"', [projectId]);
        const admin = adminResult[0];

        // 获取所有项目成员信息
        const members = await db.query('SELECT users.id, users.name, users.email, project_members.role FROM users JOIN project_members ON users.id = project_members.user_id WHERE project_members.project_id = ?', [projectId]);

        res.status(200).json({
            code: 200,
            data: {
                project,
                admin,
                members
            },
            msg: '项目信息获取成功'
        });
    } catch (error) {
        console.error("Get project info error:", error);
        res.status(500).json({code: 500, data: null, msg: '服务出错'});
    }
});
// 创建新项目并设定创建用户为管理员
router.post('/create', async (req, res) => {
    try {
        const {name, description} = req.body;
        const userId = req.user.id;

        // 插入项目数据
        const result = await db.query('INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)', [name, description, userId]);

        if (!result || !result.insertId) {
            throw new Error('项目创建失败');
        }

        const projectId = result.insertId;
        // 插入项目成员数据
        await db.query('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', [projectId, userId, 'admin']);
        res.status(201).json({code: 201, data: {projectId}, msg: '项目创建成功'});
    } catch (error) {
        console.error("Project creation error:", error);
        res.status(500).json({code: 500, data: null, msg: '服务出错'});
    }
});

// 修改项目信息
router.put('/:projectId', async (req, res) => {
    try {
        const {projectId} = req.params;
        const {name, description} = req.body;

        // 更新项目数据
        const result = await db.query('UPDATE projects SET name = ?, description = ? WHERE id = ?', [name, description, projectId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({code: 404, msg: '项目未找到'});
        }

        res.status(200).json({code: 200, msg: '项目更新成功'});
    } catch (error) {
        console.error("Project update error:", error);
        res.status(500).json({code: 500, data: null, msg: '服务出错'});
    }
});

// 删除项目
router.delete('/:projectId', async (req, res) => {
    try {
        const {projectId} = req.params;

        // 删除项目成员
        await db.query('DELETE FROM project_members WHERE project_id = ?', [projectId]);

        // 删除项目相关的文件
        await db.query('DELETE FROM files WHERE project_id = ?', [projectId]);

        // 删除项目
        const result = await db.query('DELETE FROM projects WHERE id = ?', [projectId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({code: 404, msg: '项目未找到'});
        }

        res.status(200).json({code: 200, msg: '项目删除成功'});
    } catch (error) {
        console.error("Project deletion error:", error);
        res.status(500).json({code: 500, data: null, msg: '服务出错'});
    }
});
// 获取项目文件信息
router.get('/:projectId/files', async (req, res) => {
    try {
        const {projectId} = req.params;

        // 获取项目文件信息
        const files = await db.query('SELECT files.filename, files.filepath, files.file_size, files.uploaded_at, users.id as uploader_id, users.name as uploader_name FROM files JOIN users ON files.user_id = users.id WHERE files.project_id = ?', [projectId]);

        res.status(200).json({
            code: 200,
            data: files,
            msg: '项目文件信息获取成功'
        });
    } catch (error) {
        console.error("Get project files error:", error);
        res.status(500).json({code: 500, data: null, msg: '服务出错'});
    }
});

// 添加成员到项目
router.post('/:projectId/add-member', async (req, res) => {
    try {
        const {projectId} = req.params;
        const {userId, role} = req.body;

        const [project] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);
        if (!project.length) {
            return res.status(404).json({code: 404, msg: '项目未找到'});
        }

        // 检查成员是否已经存在
        const [existingMember] = await db.query('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
        if (existingMember.length) {
            return res.status(400).json({code: 400, msg: '成员已经存在'});
        }

        await db.query('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', [projectId, userId, role]);

        res.status(200).json({code: 200, msg: '成员添加成功'});
    } catch (error) {
        console.error("Add member error:", error);
        res.status(500).json({code: 500, data: null, msg: '服务出错'});
    }
});

// 移除项目成员
router.delete('/:projectId/remove-member', async (req, res) => {
    try {
        const {projectId} = req.params;
        const {userId} = req.body;

        // 检查成员是否存在
        const [existingMember] = await db.query('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
        if (!existingMember.length) {
            return res.status(404).json({code: 404, msg: '成员未找到'});
        }

        // 删除项目成员
        const result = await db.query('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({code: 404, msg: '成员未找到'});
        }

        res.status(200).json({code: 200, msg: '成员移除成功'});
    } catch (error) {
        console.error("Remove member error:", error);
        res.status(500).json({code: 500, data: null, msg: '服务出错'});
    }
});

// 上传文件到项目
router.post('/:projectId/upload', upload.single('file'), async (req, res) => {
    req.body.projectId = req.params.projectId;
    req.body.userId = req.user.id;

    await handleFileUpload(req, res);
});

module.exports = router;


