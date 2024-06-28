const express = require('express');
const multer = require('multer');
const fsExtra = require('fs-extra');
const path = require('path');

// 设置上传文件大小限制为 1GB
const upload = multer({
    dest: 'uploads/',
    limits: {fileSize: 1024 * 1024 * 1024}
});

const router = express.Router();
const {checkChunkExists, mergeChunks} = require('../utils/fileHelpers');

// 用于跟踪文件分片的上传状态
const uploadProgress = {};

router.post('/upload', upload.single('file'), async (req, res) => {
    const {md5, index, totalChunks, fileExtension} = req.body;
    const total = parseInt(totalChunks, 10); // 确保转换为整数
    if (isNaN(total) || total < 1) {
        return res.status(400).json({
            code: 400,
            msg: '无效的分片总数',
            data: null
        });
    }
    const chunkDir = `uploads/${md5}`;
    const chunkPath = path.join(chunkDir, index.toString());
    await fsExtra.ensureDir(chunkDir);

    if (!uploadProgress[md5]) {
        uploadProgress[md5] = new Array(total).fill(false);
        uploadProgress[md5].fileExtension = fileExtension; // 存储文件扩展名
    }

    // 检查分片是否已经上传
    if (await checkChunkExists(chunkDir, index)) {
        return res.status(200).json({
            code: 200,
            msg: '分片已经上传',
            data: null
        });
    }

    try {
        if (!req.file) {
            throw new Error('File not provided');
        }

        await fsExtra.move(req.file.path, chunkPath);
        const indexInt = parseInt(index, 10);
        if (isNaN(indexInt) || indexInt < 0 || indexInt >= uploadProgress[md5].length) {
            return res.status(400).json({
                code: 400,
                msg: '无效的索引值',
                data: null
            });
        }

        uploadProgress[md5][indexInt] = true;  // 标记为已上传

        // 检查是否所有分片都已上传
        const allUploaded = uploadProgress[md5].every(status => status === true);
        if (allUploaded) {
            const files = uploadProgress[md5].map((_, i) => path.join(chunkDir, i.toString()));
            const outputPath = `uploads/${md5}${uploadProgress[md5].fileExtension}`;
            try {
                await mergeChunks(files, outputPath);

                // 删除分片文件夹
                await fsExtra.remove(chunkDir);

                res.status(200).json({
                    code: 200,
                    msg: '文件合并成功并且分片文件夹已删除',
                    data: null
                });
                delete uploadProgress[md5]; // 清除跟踪状态
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
        console.error(`Error moving file chunk: ${error.message}`, error);
        res.status(500).json({
            code: 500,
            msg: `服务器错误：无法移动文件分片 - ${error.message}`,
            data: error
        });
    }
});

module.exports = router;
