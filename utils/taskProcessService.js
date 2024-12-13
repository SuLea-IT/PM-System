// utils/taskProcessService.js
const axios = require('axios');
const path = require("path");

class TaskProcessService {
    constructor() {
        this.baseURL = process.env.PROCESS_SERVICE_URL || 'http://127.0.0.1:3178/api';
        this.instance = axios.create({
            baseURL: this.baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    // 发送任务到处理服务
    async sendTaskToProcess(data) {
        try {
            if (data.filePaths) {
                // 分割文件路径成数组
                const files = data.filePaths.split(';').filter(path => path.trim());
                console.log('Files:', files);

                // 构造新的请求数据
                const requestData = {
                    ...data,
                    // 根据文件名匹配对应的字段
                };
                const matrixFile = files.find(path => path.toLowerCase().includes('matrix.mtx.gz'));
                console.log('Matrix File:', matrixFile);
                const mat_path = matrixFile ? path.dirname(matrixFile) : undefined;

                // 查找 barcodes_pos_path 和 npy_path
                const barcodesPosPath = files.find(path => path.toLowerCase().includes('barcodes_pos.tsv'));
                const npyPath = files.find(path => path.toLowerCase().endsWith('.npy'));
                const H5Path = files.find(path => path.toLowerCase().endsWith('.h5'));
                const H5ADPath = files.find(path => path.toLowerCase().endsWith('.h5ad'));
                const CSVGZPath = files.find(path => path.toLowerCase().includes('.csv.gz'));
                if (mat_path) {
                    requestData.mat_path = mat_path;
                }
                // 如果存在，则添加到请求数据中
                if (barcodesPosPath) {
                    requestData.barcodes_pos_path = barcodesPosPath;
                }
                if (npyPath) {
                    requestData.npy_path = npyPath;
                }
                if (H5Path) {
                    requestData.H5Path = H5Path;
                }
                if (H5ADPath) {
                    requestData.H5ADPath = H5ADPath;
                }
                if (CSVGZPath) {
                    requestData.CSVGZPath = CSVGZPath;
                }

                // 删除原始的 filePaths 字段
                delete requestData.filePaths;

                const response = await this.instance.post('/process', requestData);
                return response.data;
            } else {
                // 其他格式直接发送原始数据
                const response = await this.instance.post('/process', data);
                return response.data;
            }
        } catch (error) {
            console.error('发送任务失败:', error.response?.data || error.message);
            throw error;
        }
    }
}

const taskProcessService = new TaskProcessService();

module.exports = taskProcessService;
