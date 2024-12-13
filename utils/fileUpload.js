const fsExtra = require('fs-extra');
const path = require('path');
const db = require('../config/db');

// 跟踪上传进度
const uploadProgress = new Map();

async function handleFileUpload(req, file, targetDirectoryPath) {
    const {index, totalChunks, fileName, projectId, userId} = req.body;
    const total = parseInt(totalChunks, 10);

    if (!file || isNaN(total) || total < 1) {
        throw new Error('Invalid file or chunk count');
    }

    const uploadId = `${projectId}_${userId}_${fileName}`;
    const chunkDir = path.join(targetDirectoryPath, uploadId);
    const chunkPath = path.join(chunkDir, index.toString());

    // 确保目录存在
    await fsExtra.ensureDir(chunkDir);

    try {
        // 初始化或获取上传进度
        if (!uploadProgress.has(uploadId)) {
            uploadProgress.set(uploadId, {
                chunks: new Array(total).fill(false),
                fileName,
                fileSize: 0,
                completed: false
            });
        }

        const progress = uploadProgress.get(uploadId);

        // 检查分片是否已存在
        if (await fsExtra.pathExists(chunkPath)) {
            await fsExtra.remove(file.path);
            return {code: 400, message: 'Chunk already exists'};
        }

        // 移动分片到目标位置
        await fsExtra.move(file.path, chunkPath);

        // 更新进度
        const chunkIndex = parseInt(index, 10);
        progress.fileSize += file.size;
        progress.chunks[chunkIndex] = true;

        // 检查是否所有分片都已上传
        const isComplete = progress.chunks.every(Boolean);

        if (isComplete && !progress.completed) {
            progress.completed = true;

            // 生成最终文件名和路径
            const finalPath = path.join(targetDirectoryPath, fileName);

            // 合并所有分片
            await mergeChunks(
                progress.chunks.map((_, i) => path.join(chunkDir, i.toString())),
                finalPath
            );

            // 保存文件信息到数据库
            await db.query(
                'INSERT INTO files (project_id, user_id, filename, filepath, file_size) VALUES (?, ?, ?, ?, ?)',
                [projectId, userId, fileName, finalPath, progress.fileSize]
            );

            // 清理临时文件
            await fsExtra.remove(chunkDir);
            uploadProgress.delete(uploadId);

            return {
                code: 200,
                message: 'File upload completed',
                data: {fileName}
            };
        }

        return {
            code: 200,
            message: 'Chunk uploaded successfully',
            data: {chunkIndex}
        };

    } catch (error) {
        console.error('File upload error:', error);
        await fsExtra.remove(chunkDir).catch(console.error);
        await fsExtra.remove(file.path).catch(console.error);
        throw new Error(`Upload failed: ${error.message}`);
    }
}

// 合并文件分片
async function mergeChunks(chunkPaths, outputPath) {
    const writeStream = fsExtra.createWriteStream(outputPath);

    for (const chunkPath of chunkPaths) {
        await new Promise((resolve, reject) => {
            const readStream = fsExtra.createReadStream(chunkPath);
            readStream.pipe(writeStream, {end: false});
            readStream.on('end', resolve);
            readStream.on('error', reject);
        });
    }

    writeStream.end();
    return new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
    });
}

module.exports = {
    handleFileUpload
};
