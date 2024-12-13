// utils/taskProcessor.js
const cron = require('node-cron');
const db = require('../config/db');

// 资源监控类
class ResourceMonitor {
    constructor() {
        this.memoryThreshold = 0.8; // 80% 内存阈值
    }

    checkResources() {
        const used = process.memoryUsage();
        return {
            heapUsed: used.heapUsed / 1024 / 1024,
            heapTotal: used.heapTotal / 1024 / 1024,
            external: used.external / 1024 / 1024,
            isOverloaded: used.heapUsed / used.heapTotal > this.memoryThreshold
        };
    }
}

// 主任务队列类
class TaskQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.MAX_RETRIES = 3;
        this.retryMap = new Map();
        this.CHUNK_SIZE = 1024 * 1024 * 100; // 100MB 分块
        this.MAX_CONCURRENT_TASKS = 3; // 最大并发数
        this.activeTaskCount = 0;
        this.resourceMonitor = new ResourceMonitor();
    }

    // 计算任务权重
    calculateTaskWeight(task, fileSize) {
        const BASE_WEIGHT = 1;
        const SIZE_FACTOR = 0.3;
        const PRIORITY_FACTOR = 0.4;
        const TIME_FACTOR = 0.3;

        // 文件大小评分 (logarithmic scale)
        const sizeScore = Math.log10(fileSize / (1024 * 1024)); // MB为单位

        // 优先级评分
        const priorityScore = task.priority;

        // 等待时间评分
        const waitTime = (Date.now() - new Date(task.created_at).getTime()) / 1000;
        const timeScore = Math.log10(1 + waitTime / 3600); // 小时为单位

        return BASE_WEIGHT +
            (sizeScore * SIZE_FACTOR) +
            (priorityScore * PRIORITY_FACTOR) +
            (timeScore * TIME_FACTOR);
    }

    // 添加任务到队列
    addTask(task) {
        this.queue.push(task);
        this.sortTasks();

        if (!this.isProcessing && this.activeTaskCount < this.MAX_CONCURRENT_TASKS) {
            this.processQueue();
        }
    }

    // 任务排序
    sortTasks() {
        this.queue.sort((a, b) => {
            const weightA = this.calculateTaskWeight(a, a.totalSize || 0);
            const weightB = this.calculateTaskWeight(b, b.totalSize || 0);
            return weightB - weightA;
        });
    }

    // 处理队列
    async processQueue() {
        if (this.queue.length === 0 || this.activeTaskCount >= this.MAX_CONCURRENT_TASKS) {
            this.isProcessing = false;
            return;
        }

        const resources = this.resourceMonitor.checkResources();
        if (resources.isOverloaded) {
            console.log('系统资源紧张，延迟处理任务');
            setTimeout(() => this.processQueue(), 5000);
            return;
        }

        this.isProcessing = true;
        this.activeTaskCount++;
        const task = this.queue.shift();

        try {
            const fileIds = task.file_paths.split(';');
            const filesInfo = await db.query(
                'SELECT id, file_size FROM project_files WHERE id IN (?)',
                [fileIds]
            );

            const totalSize = filesInfo.reduce((sum, file) => sum + file.file_size, 0);

            // 记录任务开始
            await db.query(
                `INSERT INTO task_execution_logs
                     (task_id, task_type, total_file_size, file_sizes)
                 VALUES (?, ?, ?, ?)`,
                [
                    task.id,
                    task.task_type,
                    totalSize,
                    JSON.stringify(filesInfo)
                ]
            );

            await db.query(
                'UPDATE project_tasks SET status = "processing" WHERE id = ?',
                [task.id]
            );

            // 根据文件大小选择处理策略
            if (totalSize > 5 * 1024 * 1024 * 1024) { // 5GB
                const chunks = await this.splitFileIntoChunks(task.file_paths, totalSize);
                await this.processLargeFile(task, chunks);
            } else {
                await this.processRegularTask(task);
            }

            // 更新成功完成的任务记录
            await this.updateTaskCompletion(task, true);

        } catch (error) {
            console.error(`处理任务 ${task.id} 失败:`, error);
            await this.handleTaskError(task, error);
        } finally {
            this.activeTaskCount--;
            this.processQueue();
        }
    }

    // 文件分块
    async splitFileIntoChunks(filePath, totalSize) {
        const chunks = [];
        const numChunks = Math.ceil(totalSize / this.CHUNK_SIZE);

        for (let i = 0; i < numChunks; i++) {
            const start = i * this.CHUNK_SIZE;
            const end = Math.min(start + this.CHUNK_SIZE, totalSize);
            chunks.push({
                start,
                end,
                index: i,
                filePath
            });
        }
        return chunks;
    }

    // 处理大文件
    async processLargeFile(task, chunks) {
        const BATCH_SIZE = 3; // 并发处理的块数

        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(chunk => this.processChunk(task, chunk)));

            // 更新进度
            const progress = Math.floor((i + batch.length) / chunks.length * 100);
            await db.query(
                'UPDATE project_tasks SET progress = ? WHERE id = ?',
                [progress, task.id]
            );
        }
    }

    // 处理常规任务
    async processRegularTask(task) {
        return this.processTaskWithRetry(task, task.file_paths.split(';'));
    }

    // 处理单个分块
    async processChunk(task, chunk) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (Math.random() < 0.9) {
                    resolve();
                } else {
                    reject(new Error(`Chunk ${chunk.index} processing failed`));
                }
            }, 1000);
        });
    }

    // 更新任务完成状态
    async updateTaskCompletion(task, success, errorMessage = null) {
        await db.query(
            `UPDATE task_execution_logs
             SET end_time       = CURRENT_TIMESTAMP,
                 execution_time = TIMESTAMPDIFF(SECOND, start_time, CURRENT_TIMESTAMP),
                 success        = ?,
                 error_message  = ?
             WHERE task_id = ? ORDER BY id DESC LIMIT 1`,
            [success, errorMessage, task.id]
        );

        await db.query(
            'UPDATE project_tasks SET status = ? WHERE id = ?',
            [success ? "completed" : "failed", task.id]
        );
    }

    // 任务错误处理
    async handleTaskError(task, error) {
        const retryCount = this.retryMap.get(task.id) || 0;

        if (retryCount >= this.MAX_RETRIES) {
            await this.updateTaskCompletion(task, false, error.message);
            this.retryMap.delete(task.id);
        } else {
            this.retryMap.set(task.id, retryCount + 1);
            const delay = Math.pow(2, retryCount) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            this.addTask(task);
        }
    }
}

// 创建任务队列实例
const taskQueue = new TaskQueue();

// 定时任务调度
const schedulePendingTasks = () => {
    // 每5分钟检查一次，但只在22:00-06:00之间添加新任务
    cron.schedule('*/5 * * * *', async () => {
        try {
            // 检查当前是否在工作时间内
            const now = new Date();
            const hour = now.getHours();

            // 如果不在22点到第二天6点之间，则不添加新任务
            if (hour >= 6 && hour < 22) {
                console.log('当前不在任务处理时间范围内(22:00-06:00)，不添加新任务');
                return;
            }

            // 检查系统资源
            const resources = taskQueue.resourceMonitor.checkResources();
            if (resources.isOverloaded) {
                console.log('系统资源紧张，跳过本次调度');
                return;
            }

            console.log('开始检查待处理任务...');

            // 获取待处理任务
            const pendingTasks = await db.query(
                `SELECT *
                 FROM project_tasks
                 WHERE status = 'pending'
                   AND created_at <= NOW() - INTERVAL 5 MINUTE
                 ORDER BY priority DESC, created_at ASC
                     LIMIT 10`
            );

            if (pendingTasks.length === 0) {
                console.log('没有待处理的任务');
                return;
            }

            console.log(`找到 ${pendingTasks.length} 个待处理任务`);

            // 检查是否接近结束时间（早上6点）
            const isNearEndTime = hour === 5 && now.getMinutes() >= 45;
            if (isNearEndTime) {
                console.log('接近工作时间结束，不添加新任务');
                return;
            }

            pendingTasks.forEach(task => {
                taskQueue.addTask(task);
            });

        } catch (error) {
            console.error('处理待处理任务时出错:', error);
        }
    }, {
        timezone: "Asia/Shanghai"
    });

    // 在每天晚上22点自动开始处理任务
    cron.schedule('0 22 * * *', async () => {
        try {
            console.log('工作时间开始，开始处理任务...');

            // 获取待处理的任务
            const pendingTasks = await db.query(
                `SELECT *
                 FROM project_tasks
                 WHERE status = 'pending'
                 ORDER BY priority DESC, created_at ASC LIMIT 10`
            );

            if (pendingTasks.length > 0) {
                console.log(`加载 ${pendingTasks.length} 个待处理任务`);
                pendingTasks.forEach(task => {
                    taskQueue.addTask(task);
                });
            }

        } catch (error) {
            console.error('开始任务处理时出错:', error);
        }
    }, {
        timezone: "Asia/Shanghai"
    });
};


// 启动定时任务
schedulePendingTasks();

module.exports = {
    taskQueue,
    schedulePendingTasks
};
