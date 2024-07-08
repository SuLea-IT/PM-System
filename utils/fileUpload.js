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
async function handleFileUpload(req) {
    const {index, totalChunks, fileName, fileSize} = req.body;
    const total = parseInt(totalChunks, 10);
    if (isNaN(total) || total < 1) {
        throw new Error('无效的分片总数');
    }

    const projectId = req.body.projectId;
    const userId = req.body.userId;
    const uploadId = projectId + '_' + userId + '_' + fileName;

    const projectDir = `uploads/${projectId}`;
    await fsExtra.ensureDir(projectDir);

    const chunkDir = path.join(projectDir, uploadId);
    const chunkPath = path.join(chunkDir, index.toString());
    await fsExtra.ensureDir(chunkDir);

    if (!uploadProgress[uploadId]) {
        uploadProgress[uploadId] = {chunks: new Array(total).fill(false), fileName, fileSize: 0};
        uploadProgress[uploadId].md5Incremental = createMD5Incremental();
    }

    if (await checkChunkExists(chunkDir, index)) {
        return {code: 200, msg: '分片已经上传', data: null};
    }

    if (!req.file) {
        throw new Error('文件未提供');
    }

    try {
        const fileChunkSize = req.file.size;
        uploadProgress[uploadId].fileSize += fileChunkSize;

        await fsExtra.move(req.file.path, chunkPath);
        const indexInt = parseInt(index, 10);
        if (isNaN(indexInt) || indexInt < 0 || indexInt >= uploadProgress[uploadId].chunks.length) {
            throw new Error('无效的索引值');
        }

        const chunkData = await fsExtra.readFile(chunkPath);
        updateMD5Incremental(uploadProgress[uploadId].md5Incremental, chunkData);

        uploadProgress[uploadId].chunks[indexInt] = true;

        const allUploaded = uploadProgress[uploadId].chunks.every(status => status === true);
        if (allUploaded) {
            const files = uploadProgress[uploadId].chunks.map((_, i) => path.join(chunkDir, i.toString()));
            const tempOutputPath = path.join(projectDir, `temp_${uploadId}`);
            await mergeChunks(files, tempOutputPath);

            const finalMD5 = finalizeMD5Incremental(uploadProgress[uploadId].md5Incremental);
            const finalOutputPath = path.join(projectDir, `${finalMD5}${path.extname(fileName)}`);
            await fsExtra.move(tempOutputPath, finalOutputPath);

            await db.query('INSERT INTO files (project_id, user_id, filename, filepath, file_size) VALUES (?, ?, ?, ?, ?)', [
                projectId,
                userId,
                finalOutputPath,
                finalOutputPath,
                uploadProgress[uploadId].fileSize
            ]);

            await fsExtra.remove(chunkDir);

            delete uploadProgress[uploadId]; // 清除跟踪状态

            return {code: 200, msg: '文件合并成功并且分片文件夹已删除', data: {md5: finalMD5}};
        } else {
            return {code: 200, msg: '分片上传成功，等待其他分片', data: null};
        }
    } catch (error) {
        console.error(`移动文件分片错误: ${error.message}`, error);
        throw new Error(`服务器错误：无法移动文件分片 - ${error.message}`);
    }
}

module.exports = {
    handleFileUpload
};
