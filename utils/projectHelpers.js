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
    updateApplicationStatus
};
