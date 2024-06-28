const db = require('../config/db');

async function findUserById(userId) {
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    return users.length > 0 ? users[0] : null;
}

async function findProjectById(projectId) {
    const [projects] = await db.query('SELECT * FROM projects WHERE id = ?', [projectId]);
    return projects.length > 0 ? projects[0] : null;
}

module.exports = {
    findUserById,
    findProjectById
};
