const multer = require('multer');
const path = require('path');
const fsExtra = require('fs-extra');
const db = require('../config/db');
const logger = require('../config/logger');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.params.type;
        const dir = type === 'user' ? 'uploads/avatars' : 'uploads/project_avatars';
        fsExtra.ensureDirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const id = req.params.id;
        const ext = path.extname(file.originalname);
        cb(null, `${id}${ext}`);
    }
});

const upload = multer({storage: storage});

const uploadAvatar = (type) => {
    return async (req, res) => {
        const id = req.params.id;
        const filePath = type === 'user' ? `uploads/avatars/${req.file.filename}` : `uploads/project_avatars/${req.file.filename}`;

        try {
            const table = type === 'user' ? 'users' : 'projects';
            const column = type === 'user' ? 'avatar' : 'avatar';
            const idColumn = type === 'user' ? 'id' : 'id';

            await db.query(`UPDATE ${table}
                            SET ${column} = ?
                            WHERE ${idColumn} = ?`, [filePath, id]);

            logger.info(`${type === 'user' ? 'User' : 'Project'} avatar uploaded for ${type} ${id} by user ${req.user.id}`);

            res.status(200).json({
                code: 200,
                msg: `${type === 'user' ? '用户' : '项目'}头像上传成功`,
                data: {filePath}
            });
        } catch (error) {
            console.error(`Error uploading ${type === 'user' ? 'user' : 'project'} avatar:`, error);
            res.status(500).json({code: 500, msg: '服务器错误', data: null});
        }
    };
};

module.exports = {
    upload,
    uploadAvatar
};
