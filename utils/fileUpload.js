// utils/fileUpload.js
const fsExtra = require('fs-extra');
const path = require('path');
const db = require('../config/db');
const {
    checkChunkExists,
    mergeChunks,
    createMD5Incremental,
    updateMD5Incremental,
    finalizeMD5Incremental
} = require('./fileHelpers');

// 用于跟踪文件分片的上传状态
const uploadProgress = {};

// 处理文件上传和合并
async function handleFileUpload(req, res) {
    const {totalChunks, fileExtension} = req.body;
    const total = parseInt(totalChunks, 10); // 确保转换为整数
    if (isNaN(total) || total < 1) {
        return res.status(400).json({
            code: 400,
            msg: '无效的分片总数',
            data: null
        });
    }

    const projectId = req.body.projectId;
    const userId = req.body.userId;
    const uploadId = projectId + '_' + userId; // 创建唯一的 upload ID

    // 使用项目ID创建文件夹
    const projectDir = `uploads/${projectId}`;
    await fsExtra.ensureDir(projectDir);

    const chunkDir = path.join(projectDir, uploadId);
    await fsExtra.ensureDir(chunkDir);

    if (!uploadProgress[uploadId]) {
        uploadProgress[uploadId] = {chunks: new Array(total).fill(false), fileExtension, fileSize: 0};
        uploadProgress[uploadId].md5Incremental = createMD5Incremental(); // 初始化 MD5 增量对象
    }

    try {
        const files = req.files;
        if (!files || files.length === 0) {
            throw new Error('文件未提供');
        }

        for (const file of files) {
            const {index} = file.originalname.match(/(\d+)\.part$/).groups;
            const chunkPath = path.join(chunkDir, index.toString());

            if (await checkChunkExists(chunkDir, index)) {
                continue;
            }

            const fileSize = file.size;
            uploadProgress[uploadId].fileSize += fileSize; // 增加文件大小

            await fsExtra.move(file.path, chunkPath);
            const indexInt = parseInt(index, 10);
            if (isNaN(indexInt) || indexInt < 0 || indexInt >= uploadProgress[uploadId].chunks.length) {
                return res.status(400).json({
                    code: 400,
                    msg: '无效的索引值',
                    data: null
                });
            }

            // 读取分片数据并更新 MD5
            const chunkData = await fsExtra.readFile(chunkPath);
            updateMD5Incremental(uploadProgress[uploadId].md5Incremental, chunkData);

            uploadProgress[uploadId].chunks[indexInt] = true;  // 标记为已上传
        }

        // 检查是否所有分片都已上传
        const allUploaded = uploadProgress[uploadId].chunks.every(status => status === true);
        if (allUploaded) {
            const files = uploadProgress[uploadId].chunks.map((_, i) => path.join(chunkDir, i.toString()));
            const tempOutputPath = path.join(projectDir, `temp_${uploadId}${uploadProgress[uploadId].fileExtension}`);
            try {
                await mergeChunks(files, tempOutputPath);

                // 计算最终的 MD5
                const finalMD5 = finalizeMD5Incremental(uploadProgress[uploadId].md5Incremental);

                // 重命名合并后的文件为最终的 MD5 名称
                const finalOutputPath = path.join(projectDir, `${finalMD5}${uploadProgress[uploadId].fileExtension}`);
                await fsExtra.move(tempOutputPath, finalOutputPath);

                // 存储文件信息到数据库
                await db.query('INSERT INTO files (project_id, user_id, filename, filepath, file_size) VALUES (?, ?, ?, ?, ?)', [
                    projectId,
                    userId,
                    `${finalMD5}${uploadProgress[uploadId].fileExtension}`,
                    finalOutputPath,
                    uploadProgress[uploadId].fileSize
                ]);

                // 删除分片文件夹
                await fsExtra.remove(chunkDir);

                res.status(200).json({
                    code: 200,
                    msg: '文件合并成功并且分片文件夹已删除',
                    data: {md5: finalMD5}
                });
                delete uploadProgress[uploadId]; // 清除跟踪状态
            } catch (mergeError) {
                res.status(500).json({
                    code: 500,
                    msg: '合并文件时发生错误',
                    data: mergeError
                });
            }
        } else {
            res.status(200).json({
                code: 200,
                msg: '分片上传成功，等待其他分片',
                data: null
            });
        }
    } catch (error) {
        console.error(`移动文件分片错误: ${error.message}`, error);
        res.status(500).json({
            code: 500,
            msg: `服务器错误：无法移动文件分片 - ${error.message}`,
            data: error
        });
    }
}

module.exports = {
    handleFileUpload
};
