const express = require('express');
const {checkAdmin} = require('../middleware/checkRole');
const db = require('../config/db');
const path = require("path"); // 假设你有一个数据库连接模块
const bcrypt = require('bcryptjs');
const router = express.Router();
const {exec} = require('child_process');

// 获取系统资源使用情况
function getSystemUsage() {
    return new Promise((resolve, reject) => {
        exec("top -b -n1 | grep 'Cpu(s)'", (err, cpuStdout) => {
            if (err) {
                return reject(err);
            }
            exec("free -m", (err, memStdout) => {
                if (err) {
                    return reject(err);
                }

                // 解析CPU利用率
                const cpuUsage = cpuStdout.match(/(\d+\.\d+)\s+id/);
                const cpuUtilization = cpuUsage ? (100 - parseFloat(cpuUsage[1])) : null;

                // 解析内存和交换使用情况
                const memLines = memStdout.split('\n');
                const memInfo = memLines[1].match(/\d+/g);
                const swapInfo = memLines[2].match(/\d+/g);

                const memoryUsage = {
                    total: parseInt(memInfo[0]),
                    used: parseInt(memInfo[1]),
                    free: parseInt(memInfo[2])
                };

                const swapUsage = {
                    total: parseInt(swapInfo[0]),
                    used: parseInt(swapInfo[1]),
                    free: parseInt(swapInfo[2])
                };

                resolve({
                    cpuUtilization,
                    memoryUsage,
                    swapUsage
                });
            });
        });
    });
}

// GET: 获取管理员仪表板数据
router.get('/dashboard', async (req, res) => {
    try {
        // 1. 基础统计数据
        const [userStats] = await db.query(`
            SELECT 
                COUNT(*) as total_users,
                SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as active_users,
                SUM(CASE WHEN email_confirmed = 1 THEN 1 ELSE 0 END) as verified_users
            FROM users
        `);

        const [projectStats] = await db.query(`
            SELECT COUNT(*) as total_projects
            FROM projects
        `);

        // 2. 任务统计
        const [taskStats] = await db.query(`
            SELECT 
                COUNT(*) as total_tasks,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_tasks,
                SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_tasks,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_tasks
            FROM project_tasks
        `);

        // 3. 存储使用统计
        const [storageStats] = await db.query(`
            SELECT 
                COUNT(*) as total_files,
                SUM(file_size) as total_storage
            FROM project_files
            WHERE status = 'active'
        `);

        // 4. 最近活动
        const recentTasks = await db.query(`
            SELECT 
                pt.id, pt.name, pt.status, pt.created_at,
                u.username as creator,
                p.name as project_name
            FROM project_tasks pt
            LEFT JOIN users u ON pt.user_id = u.id
            LEFT JOIN projects p ON pt.project_id = p.id
            ORDER BY pt.created_at DESC
            LIMIT 5
        `);

        // 5. 项目活跃度排名
        const activeProjects = await db.query(`
            SELECT 
                p.id, p.name,
                COUNT(DISTINCT pm.user_id) as member_count,
                COUNT(DISTINCT pt.id) as task_count,
                COUNT(DISTINCT pf.id) as file_count
            FROM projects p
            LEFT JOIN project_members pm ON p.id = pm.project_id
            LEFT JOIN project_tasks pt ON p.id = pt.project_id
            LEFT JOIN project_files pf ON p.id = pf.project_id
            GROUP BY p.id
            ORDER BY task_count DESC
            LIMIT 5
        `);

        // 6. 每月任务趋势
        const monthlyTasks = await db.query(`
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m') as month,
                COUNT(*) as task_count
            FROM project_tasks
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
            ORDER BY month
        `);

// 获取系统资源使用情况
        const systemUsage = await getSystemUsage();


        res.status(200).json({
            code: 200,
            data: {
                overview: {
                    users: userStats,
                    projects: projectStats,
                    tasks: taskStats,
                    storage: {
                        totalFiles: storageStats.total_files,
                        totalStorage: storageStats.total_storage,
                        storageUnit: 'bytes'
                    }
                },
                activities: {
                    recentTasks,
                    activeProjects
                },
                trends: {
                    monthlyTasks
                },
                system: systemUsage // 添加系统资源使用情况
            },
            msg: '获取仪表板数据成功'
        });

    } catch (error) {
        console.error("获取仪表板数据错误:", error);
        res.status(500).json({
            code: 500,
            msg: '服务器错误'
        });
    }
});

module.exports = router;
