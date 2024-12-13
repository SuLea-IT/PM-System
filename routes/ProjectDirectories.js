const express = require('express');
// const { checkAdmin } = require('../middleware/checkRole');
const db = require('../config/db');
const path = require("path");
const fs = require('fs').promises; // 引入 fs 模块
const multer = require('multer'); // 用于文件上传的中间件
const fsExtra = require('fs-extra');
const {handleFileUpload} = require('../utils/fileUpload'); // 引入处理文件上传的逻辑
const {isValidDirectoryName} = require('../utils/rule');
const router = express.Router();

// 设置上传文件的存储方式
const upload = multer({
    dest: (req, file, cb) => {
        const projectId = req.body.projectId;
        const tempDir = path.join('public/projects/temp', String(projectId));
        // 确保目录存在
        fsExtra.ensureDirSync(tempDir);
        cb(null, tempDir);
    }
});

// 批量上传文件接口
router.post('/files/batch-upload', upload.array('files'), async (req, res) => {
    try {
        const {projectId, userId, directoryId, fileName, fileSize, totalChunks, index} = req.body;
        // 检查必需的参数
        if (!projectId || !userId || !directoryId) {
            return res.status(400).json({message: '项目ID、用户ID和目录ID是必需的'});
        }
        // 检查文件是否存在
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({message: '没有接收到文件'});
        }

        // 递归获取目录路径的函数
        async function getDirectoryPath(dirId) {
            const result = await db.query('SELECT id, parent_id, name FROM directories WHERE id = ?', [dirId]);
            if (result.length === 0) return null;
            const dir = result[0];
            if (dir.parent_id) {
                const parentPath = await getDirectoryPath(dir.parent_id);
                return parentPath ? path.join(parentPath, dir.name) : dir.name;
            }
            return dir.name;
        }

        // 获取目录信息，确保目标目录存在
        const directoryResult = await db.query(
            'SELECT * FROM directories WHERE id = ? AND project_id = ?',
            [directoryId, projectId]
        );
        if (directoryResult.length === 0) {
            return res.status(404).json({message: '目录未找到或不属于指定项目'});
        }
        // 获取完整的目录路径
        const relativePath = await getDirectoryPath(directoryId);
        if (!relativePath) {
            return res.status(404).json({message: '无法构建目录路径'});
        }
        // 构建最终的目标路径
        const projectDirectoryPath = path.join(__dirname, '..', 'public', 'projects', String(projectId));
        const targetDirectoryPath = path.join(projectDirectoryPath, relativePath);
        // 确保目标目录存在
        await fsExtra.ensureDir(targetDirectoryPath);
        // 处理文件上传并记录到数据库
        const uploadResults = [];
        for (const file of req.files) {
            try {
                // 处理单个文件上传
                const uploadResult = await handleFileUpload(req, file, targetDirectoryPath);

                if (uploadResult.code === 200) {
                    uploadResults.push({
                        code: 200,
                        message: '文件上传成功',
                        filename: file.originalname
                    });
                } else {
                    uploadResults.push({
                        code: 400,
                        message: '文件上传失败',
                        filename: file.originalname,
                        error: uploadResult.message
                    });
                }
            } catch (error) {
                uploadResults.push({
                    code: 500,
                    message: '文件处理失败',
                    filename: file.originalname,
                    error: error.message
                });
            }
        }
        console.log(totalChunks, index)
        if (Number(totalChunks) === Number(index) + 1) {

            await db.query(
                `INSERT INTO project_files
                     (project_id, user_id, directory_id, filename, filepath, file_size)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    projectId,
                    userId,
                    directoryId,
                    fileName,
                    path.join(targetDirectoryPath, fileName),
                    fileSize
                ]
            );
        }
        // 响应批量上传结果
        res.status(200).json({
            message: '文件批量上传处理完成',
            data: uploadResults
        });
    } catch (error) {
        console.error('批量上传失败:', error);
        res.status(500).json({
            message: '批量上传失败',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
// 查询项目的文件目录（树形结构，包含文件）
router.get('/:projectId', async (req, res) => {
    const {projectId} = req.params;
    try {
        // 获取项目下的所有目录
        const directoriesResult = await db.query(
            'SELECT * FROM directories WHERE project_id = ? ORDER BY parent_id, name',
            [projectId]
        );
        if (directoriesResult.length === 0) {
            return res.status(404).json({message: '未找到该项目的目录'});
        }
        // 获取项目下的所有文件
        const filesResult = await db.query(
            `SELECT *
             FROM project_files
             WHERE project_id = ?
               AND status = 'active'
             ORDER BY directory_id, filename`,
            [projectId]
        );
        // 构建目录树（包含文件）
        const directoryTree = buildDirectoryTreeWithFiles(directoriesResult, filesResult);
        // 返回目录树数据
        res.status(200).json({
            message: '项目目录查询成功',
            data: directoryTree
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: '查询目录失败'});
    }
});
// 查询项目的目录树（不包含文件）
router.get('/get/:projectId', async (req, res) => {
    const {projectId} = req.params;
    try {
        // 只获取项目下的所有目录
        const directoriesResult = await db.query(
            'SELECT * FROM directories WHERE project_id = ? ORDER BY parent_id, name',
            [projectId]
        );
        if (directoriesResult.length === 0) {
            return res.status(404).json({message: '未找到该项目的目录'});
        }
        // 构建纯目录树
        const directoryTree = buildDirectoryTree(directoriesResult);
        // 返回目录树数据
        res.status(200).json({
            message: '项目目录查询成功',
            data: directoryTree
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: '查询目录失败'});
    }
});

// 辅助函数：构建目录树（不包含文件）
function buildDirectoryTree(directories) {
    const directoryMap = new Map();

    // 初始化每个目录项
    directories.forEach(dir => {
        directoryMap.set(dir.id, {
            ...dir,
            type: 'directory',
            children: []
        });
    });
    const directoryTree = [];

    // 构建目录树结构
    directories.forEach(dir => {
        if (dir.parent_id) {
            // 如果有父目录，找到父目录并将当前目录加入它的子目录列表
            const parent = directoryMap.get(dir.parent_id);
            if (parent) {
                parent.children.push(directoryMap.get(dir.id));
            }
        } else {
            // 根目录直接加入到目录树中
            directoryTree.push(directoryMap.get(dir.id));
        }
    });
    return directoryTree;
}

// 辅助函数：构建包含文件的目录树
function buildDirectoryTreeWithFiles(directories, files) {
    const directoryMap = new Map();
    // 初始化每个目录项，并把它放入目录映射中
    directories.forEach(dir => {
        directoryMap.set(dir.id, {
            ...dir,
            type: 'directory',
            children: [],
            files: [] // 添加files数组存储文件
        });
    });
    // 将文件添加到对应的目录中
    files.forEach(file => {
        const directory = directoryMap.get(file.directory_id);
        if (directory) {
            directory.files.push({
                ...file,
                type: 'file'
            });
        }
    });
    const directoryTree = [];
    // 构建目录树结构
    directories.forEach(dir => {
        if (dir.parent_id) {
            // 如果有父目录，找到父目录并将当前目录加入它的子目录列表
            const parent = directoryMap.get(dir.parent_id);
            if (parent) {
                parent.children.push(directoryMap.get(dir.id));
            }
        } else {
            // 根目录直接加入到目录树中
            directoryTree.push(directoryMap.get(dir.id));
        }
    });
    return directoryTree;
}


// 新增目录
router.post('/create', async (req, res) => {
    const {projectId, parentId, name, userId} = req.body;

    if (!projectId || !name || !userId) {
        return res.status(400).json({message: '项目ID、目录名称和用户ID是必需的'});
    }

    // 检查目录名称是否合法
    if (!isValidDirectoryName(name)) {
        return res.status(400).json({message: '目录名称不符合操作系统命名规则'});
    }

    try {
        let parentDirectoryPath = null;

        // 优化父目录路径查询，确保仅获取所需字段
        if (parentId) {
            const parentResult = await db.query(
                'SELECT path FROM directories WHERE id = ? AND project_id = ?',
                [parentId, projectId]
            );

            if (parentResult.length === 0) {
                return res.status(400).json({message: '指定的父目录不存在'});
            }

            // 获取父目录的物理路径
            parentDirectoryPath = parentResult[0].path;
        }

        // 插入新的目录记录到数据库
        const result = await db.query(
            'INSERT INTO directories (project_id, parent_id, name, operation_user_id) VALUES (?, ?, ?, ?)',
            [projectId, parentId || null, name, userId]
        );

        if (result.affectedRows > 0) {
            const newDirectoryId = result.insertId;

            // 构建物理路径
            const projectDirectoryPath = path.join(__dirname, '..', 'public', 'projects', String(projectId));
            const newDirectoryPath = parentDirectoryPath
                ? path.join(parentDirectoryPath, name)
                : path.join(projectDirectoryPath, name);

            // 确保目录存在（递归创建父目录）
            await fs.mkdir(newDirectoryPath, {recursive: true});

            // 更新数据库中的目录路径
            await db.query(
                'UPDATE directories SET path = ? WHERE id = ?',
                [newDirectoryPath, newDirectoryId]
            );

            res.status(200).json({code: 200, message: '目录创建成功'});
        } else {
            res.status(500).json({code: 500, message: '创建目录失败'});
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({message: '创建目录失败'});
    }
});
router.delete('/:id', async (req, res) => {
    const {id} = req.params;
    try {
        // 获取目录信息
        const directoryResult = await db.query(
            'SELECT * FROM directories WHERE id = ?',
            [id]
        );

        if (directoryResult.length === 0) {
            return res.status(404).json({message: '未找到该目录'});
        }

        const directory = directoryResult[0];
        const directoryPath = directory.path;

        if (!directoryPath || !(await fs.stat(directoryPath).catch(() => false))) {
            return res.status(400).json({message: '目录不存在或路径无效'});
        }

        // 删除该目录下的所有文件记录
        await db.query(
            'UPDATE project_files SET status = ? WHERE directory_id = ?',
            ['deleted', id]
        );

        // 删除物理目录
        await fs.rmdir(directoryPath, {recursive: true});

        // 删除目录记录
        await db.query('DELETE FROM directories WHERE id = ?', [id]);

        res.status(200).json({code: 200, message: '目录及相关文件删除成功'});
    } catch (error) {
        console.error(error);
        res.status(500).json({code: 500, message: '删除目录失败'});
    }
});


// 重命名目录
router.put('/:id', async (req, res) => {
    const {id} = req.params;
    const {name} = req.body;

    if (!name) {
        return res.status(400).json({message: '目录名称是必需的'});
    }

    // 检查目录名称是否合法
    if (!isValidDirectoryName(name)) {
        return res.status(400).json({message: '目录名称不符合操作系统命名规则'});
    }

    try {
        // 获取当前目录的信息
        const directoryResult = await db.query('SELECT * FROM directories WHERE id = ?', [id]);
        if (directoryResult.length === 0) {
            return res.status(404).json({message: '未找到该目录'});
        }

        const directory = directoryResult[0];
        const projectDirectoryPath = path.join(__dirname, '..', 'public', 'projects', String(directory.project_id));
        const parentDirectoryPath = directory.parent_id
            ? path.join(projectDirectoryPath, String(directory.parent_id))
            : projectDirectoryPath;

        const oldDirectoryPath = path.join(parentDirectoryPath, directory.name); // 使用数据库中的旧目录名
        const newDirectoryPath = path.join(parentDirectoryPath, name); // 使用用户输入的新目录名

        // 检查目标目录是否已存在
        try {
            await fs.access(newDirectoryPath);
            return res.status(400).json({message: '目标目录已存在'});
        } catch (err) {
            // 如果没有找到目标目录，继续进行重命名操作
        }

        // 更新数据库中的目录名称
        const result = await db.query('UPDATE directories SET name = ? WHERE id = ?', [name, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({message: '未找到该目录'});
        }

        // 使用 fs.promises.rename 替代 fs.renameSync
        await fs.rename(oldDirectoryPath, newDirectoryPath);

        res.status(200).json({code: 200, message: '目录重命名成功'});
    } catch (error) {
        console.error(error);
        res.status(400).json({code: 400, message: '重命名目录失败'});
    }
});
module.exports = router;
