// 文件名合法性检查函数
const isValidDirectoryName = (name) => {
    // Windows 不允许以下字符
    const invalidCharsWindows = /[<>:"/\\|?*]/;
    // Linux 不允许 / 字符
    const invalidCharsLinux = /\/|\\0/;

    // 检查文件名是否合法
    if (invalidCharsWindows.test(name) || invalidCharsLinux.test(name)) {
        return false;
    }

    // 不能以空格或句点结尾
    if (/\s$|[.]$/.test(name)) {
        return false;
    }

    // 文件名长度限制
    if (name.length > 255) {
        return false;
    }

    return true;
}

module.exports = {
    isValidDirectoryName
};
