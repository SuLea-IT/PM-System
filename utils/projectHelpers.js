const db = require('../config/db');

async function findUserById(userId) {
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    return users.length > 0 ? users[0] : null;
}

async function findProjectById(projectId) {
    const [projects] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);
    return projects.length > 0 ? projects[0] : null;
}

// 查找用户的项目申请
async function findUserApplications(userId) {
    const [applications] = await db.query('SELECT * FROM project_applications WHERE user_id = ?', [userId]);
    return applications;
}

// 查找项目的所有申请
async function findProjectApplications(projectId) {
    const [applications] = await db.query('SELECT * FROM project_applications WHERE project_id = ?', [projectId]);
    return applications;
}

// 检查用户是否是项目创建者
async function isProjectCreator(projectId, userId) {
    const projects = await db.query('SELECT created_at FROM projects WHERE id = ? AND created_by = ?', [projectId, userId]);
    return projects.length > 0;
}

// 检查用户是否已经是项目成员
async function isUserProjectMember(projectId, userId) {
    const members = await db.query('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    return members.length > 0;
}

// 检查用户是否已经提交了申请
async function hasPendingApplication(projectId, userId) {
    const applications = await db.query('SELECT * FROM project_applications WHERE project_id = ? AND user_id = ? AND status = "pending"', [projectId, userId]);
    return applications.length > 0;
}

// 创建新的项目申请
async function createProjectApplication(projectId, userId) {
    const result = await db.query('INSERT INTO project_applications (project_id, user_id) VALUES (?, ?)', [projectId, userId]);
    return result.insertId;
}


// 更新项目申请状态
async function updateApplicationStatus(applicationId, status) {
    const result = await db.query('UPDATE project_applications SET status = ? WHERE id = ?', [status, applicationId]);
    return result.affectedRows > 0;
}


module.exports = {
    findUserById,
    findProjectById,
    findUserApplications,
    findProjectApplications,
    createProjectApplication,
    updateApplicationStatus,
    isUserProjectMember,
    hasPendingApplication,
    isProjectCreator
};
