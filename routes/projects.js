//routes/projects.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const crypto = require('crypto');
const {handleFileUpload} = require('../utils/fileUpload');
const multer = require('multer');
const {sendEmail} = require("../utils/emailSender");
const {verifyAndRefreshTokens} = require("../utils/tokenManager");
const multerUpload = multer({dest: 'uploads/'});
const {upload, uploadAvatar} = require('../utils/avatarUpload');
const {
    createProjectApplication,
    findProjectApplications,
    updateApplicationStatus,
    isUserProjectMember,
    hasPendingApplication,
    isProjectCreator
} = require('../utils/projectHelpers');
const path = require("path");
// 上传项目头像
router.post('/upload-avatar/:id', verifyAndRefreshTokens, upload.single('avatar'), uploadAvatar('project'));


// 获取项目信息
router.get('/:projectId/info', verifyAndRefreshTokens, async (req, res) => {
    try {
        const {projectId} = req.params;

        // 获取项目基本信息
        const [project] = await db.query('SELECT avatar,name, description, created_by, created_at FROM projects WHERE' +
            ' id' +
            ' = ?', [projectId]);
        if (!project) {
            return res.status(404).json({code: 404, msg: '项目未找到'});
        }

        // 获取项目管理员信息
        const [adminResult] = await db.query('SELECT users.id, users.name, users.email FROM users JOIN project_members ON users.id = project_members.user_id WHERE project_members.project_id = ? AND project_members.role = "admin"', [projectId]);
        const admin = adminResult[0];

        // 获取所有项目成员信息
        const members = await db.query('SELECT users.id,users.username, users.name, users.email, project_members.role' +
            ' FROM' +
            ' users JOIN project_members ON users.id = project_members.user_id WHERE project_members.project_id = ?', [projectId]);

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
router.post('/create', verifyAndRefreshTokens, async (req, res) => {
    try {
        const {name, description} = req.body;
        const userId = req.user.id;
        let avatarUrl = process.env.APP_URL
        avatarUrl = path.join(avatarUrl, 'uploads', 'avatar', 'default.jpg');
        const defaultAvatar = avatarUrl;
        // 插入项目数据
        const result = await db.query('INSERT INTO projects (name, description, created_by,avatar) VALUES (?, ?,' +
            ' ?,?)', [name, description, userId, defaultAvatar]);

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
router.put('/:projectId', verifyAndRefreshTokens, async (req, res) => {
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
router.delete('/:projectId', verifyAndRefreshTokens, async (req, res) => {
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
router.get('/:projectId/files', verifyAndRefreshTokens, async (req, res) => {
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

// 用户申请加入项目
router.post('/:projectId/apply', verifyAndRefreshTokens, async (req, res) => {
    try {
        const {projectId} = req.params;
        const userId = req.user.id;

        // 检查用户是否已经是项目成员
        const isMember = await isUserProjectMember(projectId, userId);
        if (isMember) {
            return res.status(400).json({code: 400, msg: '您已经是该项目的成员'});
        }
        // 检查用户是否是项目创建者
        const isCreator = await isProjectCreator(projectId, userId);
        if (isCreator) {
            return res.status(400).json({code: 400, msg: '您是该项目的创建者，不能申请加入'});
        }

        // 检查是否已有待处理的申请
        const hasPending = await hasPendingApplication(projectId, userId);
        if (hasPending) {
            return res.status(400).json({code: 400, msg: '您已提交过申请，正在等待审核'});
        }

        // 创建新的申请记录
        const applicationId = await createProjectApplication(projectId, userId);

        res.status(201).json({code: 201, data: {applicationId}, msg: '申请已提交'});
    } catch (error) {
        console.error("Project application error:", error);
        res.status(500).json({code: 500, data: null, msg: '服务出错'});
    }
});

// 获取项目的所有申请
router.get('/:projectId/applications', verifyAndRefreshTokens, async (req, res) => {
    try {
        const {projectId} = req.params;

        // 获取所有申请
        const applications = await findProjectApplications(projectId);

        res.status(200).json({code: 200, data: applications, msg: '获取申请成功'});
    } catch (error) {
        console.error("Get project applications error:", error);
        res.status(500).json({code: 500, data: null, msg: '服务出错'});
    }
});

// 审核项目申请
router.put('/applications/:applicationId', verifyAndRefreshTokens, async (req, res) => {
    try {
        const {applicationId} = req.params;
        const {status} = req.body; // 'approved' or 'rejected'

        // 更新申请状态
        const success = await updateApplicationStatus(applicationId, status);

        if (success) {
            res.status(200).json({code: 200, msg: '申请状态更新成功'});
        } else {
            res.status(404).json({code: 404, msg: '申请未找到'});
        }
    } catch (error) {
        console.error("Update application status error:", error);
        res.status(500).json({code: 500, data: null, msg: '服务出错'});
    }
});

// 发送邀请链接
router.post('/:projectId/invite', verifyAndRefreshTokens, async (req, res) => {
    try {
        const {projectId} = req.params;
        const {email} = req.body;
        const userId = req.body.userid;

        // 获取用户信息
        const [user] = await db.query('SELECT username FROM users WHERE id = ? AND email = ?', [userId, email]);

        if (user == undefined) {
            return res.status(404).json({code: 404, msg: '用户未找到或邮箱不匹配'});
        }

        const username = user.username;

        // 获取项目信息
        const [project] = await db.query('SELECT name, created_by FROM projects WHERE id = ?', [projectId]);
        if (project == undefined) {
            return res.status(404).json({code: 404, msg: '项目未找到'});
        }

        const projectName = project.name;
        const projectOwnerId = project.created_by;

        // 获取项目管理者的用户名
        const [projectOwner] = await db.query('SELECT username FROM users WHERE id = ?', [projectOwnerId]);
        if (projectOwner == undefined) {
            return res.status(404).json({code: 404, msg: '项目管理者未找到'});
        }

        const projectOwnerUsername = projectOwner.username;

        // 生成唯一令牌
        const token = crypto.randomBytes(16).toString('hex');

        // 存储邀请信息
        await db.query('INSERT INTO project_invitations (project_id, email, token) VALUES (?, ?, ?)', [projectId, email, token]);

        // 发送邀请邮件
        const inviteLink = `${process.env.APP_URL}/api/projects/${projectId}/accept-invite?token=${token}`;
        const topLink = `${process.env.APP_URL}/api/projects/${projectId}/accept-invite?`
        const tokenLink = `token=${token}`
        setImmediate(() => {
            sendEmail(email, '项目邀请', 'invitation', {
                title: '项目邀请',
                inviteLink: inviteLink,
                tokenLink: tokenLink,
                topLink: topLink,
                username: username,
                projectName: projectName,
                projectOwnerUsername: projectOwnerUsername
            }).catch(error => console.error("Error sending email:", error));
        });

        res.status(201).json({
            code: 201,
            msg: '邀请链接已发送到成员邮箱'
        });
    } catch (error) {
        console.error("Send invite link error:", error);
        res.status(500).json({code: 500, data: null, msg: '服务出错'});
    }
});

// 接受邀请链接
router.get('/:projectId/accept-invite', async (req, res) => {
    try {
        const {projectId} = req.params;
        const {token} = req.query;

        // 验证邀请令牌
        const [invitation] = await db.query('SELECT * FROM project_invitations WHERE project_id = ? AND token = ?', [projectId, token]);
        if (invitation == undefined) {
            return res.status(400).json({code: 400, msg: '无效的邀请链接'});
        }

        // 获取成员邮箱
        const {email} = invitation;

        // 检查成员是否已经存在
        const [user] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (user == undefined) {
            return res.status(404).json({code: 404, msg: '用户未找到'});
        }

        const userId = user.id;

        // 检查成员是否已经在项目中
        const [existingMember] = await db.query('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
        if (existingMember !== undefined) {
            return res.status(400).json({code: 400, msg: '成员已经在项目中'});
        }

        // 添加成员到项目
        await db.query('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', [projectId, userId, 'member']);

        // 删除邀请记录
        await db.query('DELETE FROM project_invitations WHERE project_id = ? AND token = ?', [projectId, token]);

        res.status(200).json({
            code: 200,
            msg: '成员已成功加入项目'
        });
    } catch (error) {
        console.error("Accept invite link error:", error);
        res.status(500).json({code: 500, data: null, msg: '服务出错'});
    }
});

// 移除项目成员
router.delete('/:projectId/remove-member', verifyAndRefreshTokens, async (req, res) => {
    try {
        const {projectId} = req.params;
        const userId = req.body.userid;

        // 检查成员是否存在
        const [existingMember] = await db.query('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
        if (!existingMember) {
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
router.post('/:projectId/upload', verifyAndRefreshTokens, multerUpload.array('file', 10), async (req, res) => {
    req.body.projectId = req.params.projectId;
    req.body.userId = req.user.id;

    try {
        const uploadResults = [];
        let Fdata = "所有文件上传成功";
        let FCode = 200;

        for (const file of req.files) {
            req.file = file;
            const result = await handleFileUpload(req);

            if (result.msg === "分片上传成功，等待其他分片") {
                uploadResults.push(result.data);
            } else if (result.msg === '文件已经存在') {
                Fdata = "文件已经存在";
                FCode = 400;
                break;  // 终止后续文件上传
            }
        }

        res.status(FCode).json({
            code: FCode,
            msg: Fdata,
            data: uploadResults
        });
    } catch (error) {
        console.error('File upload error:', error);
        res.status(500).json({
            code: 500,
            msg: '文件上传失败',
            data: error.message
        });
    }
});


module.exports = router;


