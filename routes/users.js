const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../config/db');
const crypto = require('crypto');
const {generateTokens, verifyAndRefreshTokens} = require('../utils/tokenManager');
const {sendEmail} = require('../utils/emailSender');

const {upload, uploadAvatar} = require('../utils/avatarUpload');
const path = require("path");

// 上传用户头像
router.post('/upload-avatar/:id', verifyAndRefreshTokens, upload.single('avatar'), uploadAvatar('user'));

// POST: 发送邮箱验证码
router.post('/send-confirmation-code', async (req, res) => {
  try {
    const {username, email} = req.body;

    if (!email) {
      return res.status(400).json({code: 400, data: null, msg: '缺少必要的字段'});
    }

    const confirmationCode = crypto.randomBytes(2).toString('hex');
    await db.query('INSERT INTO email_confirmations (email, confirmation_code) VALUES (?, ?)', [email, confirmationCode]);
    // 发送确认邮件
    setImmediate(() => {
      sendEmail(email, '确认你的邮箱', 'confirmation', {title: '邮箱确认', code: confirmationCode, username: username})
          .catch(error => console.error("Error sending email:", error));
    });

    res.status(200).json({
      code: 200,
      msg: '确认码已发送到您的邮箱'
    });
  } catch (error) {
    console.error("Generate confirmation code error:", error);
    res.status(500).json({code: 500, data: null, msg: '服务出错'});
  }
});

// POST: 用户注册
router.post('/register', async (req, res) => {
  try {
    const {username, password, name, email, confirmationCode, avatar} = req.body;

    // 验证请求体是否包含所有必要字段
    if (!username || !password || !name || !email || !confirmationCode) {
      return res.status(400).json({code: 400, data: null, msg: '缺少必要的字段'});
    }

    const [existingUsers] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUsers !== undefined) {
      return res.status(400).json({code: 400, data: null, msg: '用户名已存在'});
    }

    // 验证确认码
    const [confirmation] = await db.query('SELECT * FROM email_confirmations WHERE email = ? AND confirmation_code = ?', [email, confirmationCode]);
    if (confirmation == undefined) {
      return res.status(400).json({code: 400, data: null, msg: '无效的确认码'});
    }

    // 检查确认码是否已过期
    const confirmationTime = new Date(confirmation.created_at);
    const currentTime = new Date();
    const timeDiff = (currentTime - confirmationTime) / 1000 / 60; // 计算时间差（以分钟为单位）
    if (timeDiff > 30) {
      // 删除过期的确认码
      await db.query('DELETE FROM email_confirmations WHERE email = ?', [email]);
      return res.status(400).json({code: 400, data: null, msg: '确认码已过期'});
    }

    // 删除确认码
    await db.query('DELETE FROM email_confirmations WHERE email = ?', [email]);

    const hashedPassword = await bcrypt.hash(password, 10);
    let avatarUrl = process.env.APP_URL
    avatarUrl = path.join(avatarUrl, 'uploads', 'avatar', 'default.jpg');
    // 设置默认头像
    const defaultAvatar = avatar || avatarUrl;
    await db.query('INSERT INTO users (username, password, name, email, email_confirmed,avatar) VALUES (?, ?, ?, ?,' +
        ' ?,?)', [username, hashedPassword, name, email, 1, defaultAvatar]);

    res.status(200).json({
      code: 200,
      data: {username, email, name},
      msg: '用户注册成功'
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({code: 500, data: null, msg: '服务出错'});
  }
});
// POST: 用户登录
router.post('/login', async (req, res) => {
  try {
    const {username, password} = req.body;

    // 验证请求体是否包含所有必要字段
    if (!username || !password) {
      return res.status(400).json({code: 400, data: null, msg: '缺少必要的字段'});
    }

    // 查询用户信息
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows; // 这里应该获取 rows 的第一个元素

    if (!user) {
      return res.status(404).json({code: 404, data: null, msg: '用户未找到'});
    }

    // 检查邮箱是否确认
    if (user.email_confirmed !== 1) {
      return res.status(400).json({code: 403, data: null, msg: '邮箱未确认'});
    }

    // 检查用户的 status 是否为 1，若不为 1 则阻止登录
    if (user.status !== 1) {
        return res.status(400).json({code: 403, data: null, msg: '因操作原因已被封禁，请联系管理员'});
    }

    // 验证密码
    if (await bcrypt.compare(password, user.password)) {
      const {accessToken, refreshToken} = generateTokens({id: user.id, role: user.role});

      // 设置 Refresh Token 的过期时间
      const offset = 8; // 东八区是UTC+8
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const expiresAtGMT8 = new Date(expiresAt.getTime() + offset * 3600 * 1000);

      // 保存 Refresh Token
      await db.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, refreshToken, expiresAt]);

      // 返回登录成功信息
      res.json({
        code: 200,
        data: {
          accessToken,
          refreshToken,
          refreshTokenExpiresAt: expiresAtGMT8,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            role: user.role,
            avatar: user.avatar
          }
        },
        msg: '登录成功'
      });
    } else {
      // 密码不匹配
      res.status(401).json({code: 401, data: null, msg: '用户名或密码错误'});
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({code: 500, data: null, msg: '服务器出错'});
  }
});


// POST: 请求邮箱验证码
router.post('/request-login-code', async (req, res) => {
  try {
    const {username} = req.body;

    if (!username) {
      return res.status(400).json({code: 400, data: null, msg: '用户名是必需的。'});
    }

    // 从数据库中查找用户的 email
    const [rows] = await db.query('SELECT email, username FROM users WHERE username = ?', [username]);
    const user = rows; // 假设rows是一个数组

    if (!user) {
      return res.status(404).json({code: 404, data: null, msg: '用户未找到。'});
    }

    const email = user.email;

    // 生成验证码并保存到数据库
    const loginCode = crypto.randomBytes(2).toString('hex');
    await db.query('INSERT INTO email_confirmations (email, confirmation_code) VALUES (?, ?)', [email, loginCode]);

    // 准备模板数据
    const templateData = {
      title: '登录验证码',
      code: loginCode,
      username: user.username // 从数据库中获取的用户名
    };

    // 发送验证码到用户的邮箱
    setImmediate(() => {
      sendEmail(email, '您的登录验证码', 'confirmation', templateData)
          .catch(error => console.error("发送验证码邮件时出错:", error));
    });

    res.status(200).json({
      code: 200,
      msg: '验证码已发送到您的邮箱'
    });
  } catch (error) {
    console.error("请求验证码出错:", error);
    res.status(500).json({code: 500, data: null, msg: '服务出错'});
  }
});


// POST: 验证码登录
router.post('/login-with-code', async (req, res) => {
  try {
    const {username, confirmationCode} = req.body;

    if (!username || !confirmationCode) {
      return res.status(400).json({code: 400, data: null, msg: '缺少用户名或验证码。'});
    }

    // 查找用户
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows;

    if (!user) {
      return res.status(404).json({code: 404, data: null, msg: '用户未找到。'});
    }

    // 验证验证码
    const [confirmation] = await db.query('SELECT * FROM email_confirmations WHERE email = ? AND confirmation_code = ?', [user.email, confirmationCode]);

    if (!confirmation) {
      return res.status(400).json({code: 400, data: null, msg: '无效的验证码。'});
    }

    // 检查验证码是否过期（30分钟过期）
    const confirmationTime = new Date(confirmation.created_at);
    const currentTime = new Date();
    const timeDiff = (currentTime - confirmationTime) / 1000 / 60; // 分钟为单位
    if (timeDiff > 30) {
      await db.query('DELETE FROM email_confirmations WHERE email = ?', [user.email]);
      return res.status(400).json({code: 400, data: null, msg: '验证码已过期。'});
    }

    // 删除已验证的验证码
    await db.query('DELETE FROM email_confirmations WHERE email = ?', [user.email]);

    // 检查用户是否被封禁
    if (user.status !== 1) {
      return res.status(403).json({code: 403, data: null, msg: '用户已被封禁，请联系管理员。'});
    }

    // 生成访问令牌和刷新令牌
    const {accessToken, refreshToken} = generateTokens({id: user.id, role: user.role});

    // 设置 Refresh Token 的过期时间
    const offset = 8; // 东八区是UTC+8
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7天
    const expiresAtGMT8 = new Date(expiresAt.getTime() + offset * 3600 * 1000);

    // 保存 Refresh Token
    await db.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, refreshToken, expiresAt]);

    // 登录成功，返回令牌
    res.json({
      code: 200,
      data: {
        accessToken,
        refreshToken,
        refreshTokenExpiresAt: expiresAtGMT8,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar
        }
      },
      msg: '登录成功'
    });
  } catch (error) {
    console.error("验证码登录出错:", error);
    res.status(500).json({code: 500, data: null, msg: '服务器出错'});
  }
});

// GET: 获取用户个人资料
router.get('/profile', verifyAndRefreshTokens, async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({msg: '用户ID未提供'});
    }

    const user = await db.findUserById(userId);
    if (!user) {
      return res.status(404).json({msg: '用户不存在'});
    }


    res.json({
      code: 200,
      data: {
        user: {id: user.id, username: user.username, name: user.name, email: user.email, role: user.role}
      },
      msg: '获取成功'
    });
  } catch (error) {
    console.error('Profile retrieval error:', error);
    res.status(500).json({msg: '服务器错误', error: error.message});
  }
});
// 获取排除自己所有用户信息
router.get('/exclude-self', verifyAndRefreshTokens, async (req, res) => {
  try {
    const userId = req.user.id; // 当前用户的ID
    const projectId = req.query.project_id; // 从请求中获取项目ID，假设传递在 query 参数中

    console.log(req.user.id, projectId);

    // 查询所有用户，排除当前用户和当前项目的成员
    const users = await db.query(
        `SELECT id, username, name, email, role, avatar 
       FROM users 
       WHERE id != ? 
         AND id NOT IN (
           SELECT user_id 
           FROM project_members 
           WHERE project_id = ?
         )`,
        [userId, projectId]
    );

    // 检查是否有用户数据
    if (users.length === 0) {
      return res.status(404).json({code: 404, msg: '没有其他用户'});
    }

    // 返回用户信息
    res.status(200).json({
      code: 200,
      data: users,
      msg: '获取用户信息成功',
    });
  } catch (error) {
    console.error('获取用户信息出错:', error);
    res.status(500).json({code: 500, msg: '服务器错误', error: error.message});
  }
});

// GET: 根据name或邮箱搜索用户
router.get('/search-users', async (req, res) => {
  try {
    const {name, email} = req.query; // 获取查询参数

    if (!name && !email) {
      return res.status(400).json({code: 400, msg: '缺少必要的查询字段（name或email）'});
    }

    // 构建查询条件
    let query = 'SELECT id, username, name, email, role, avatar FROM users WHERE';
    let queryParams = [];

    if (name) {
      query += ' name LIKE ?';  // 模糊查询name
      queryParams.push(`%${name}%`);
    }

    if (email) {
      if (name) query += ' AND';  // 如果有name查询，添加AND条件
      query += ' email LIKE ?';  // 模糊查询email
      queryParams.push(`%${email}%`);
    }

    // 执行查询
    const [users] = await db.query(query, queryParams);

    // 检查是否有用户数据
    if (users.length === 0) {
      return res.status(404).json({code: 404, msg: '没有找到符合条件的用户'});
    }

    // 返回查询结果
    res.status(200).json({
      code: 200,
      data: users,
      msg: '搜索成功'
    });
  } catch (error) {
    console.error('搜索用户时出错:', error);
    res.status(500).json({code: 500, msg: '服务器错误', error: error.message});
  }
});

// GET: 获取用户ID个人资料
router.get('/userprofile', async (req, res) => {
  try {
    const {userId} = req.query;
    if (!userId) {
      return res.status(400).json({msg: '用户ID未提供'});
    }

    const user = await db.findUserById(userId);
    if (!user) {
      return res.status(404).json({msg: '用户不存在'});
    }


    res.json({
      code: 200,
      data: {
        user: {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          name: user.name,
          email: user.email,
          role: user.role
        }
      },
      msg: '获取成功'
    });
  } catch (error) {
    console.error('Profile retrieval error:', error);
    res.status(500).json({msg: '服务器错误', error: error.message});
  }
});
module.exports = router;
