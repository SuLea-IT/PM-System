const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../config/db');
const crypto = require('crypto');
const {generateTokens, verifyAndRefreshTokens} = require('../utils/tokenManager');
const {sendEmail} = require('../utils/emailSender');
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

    res.status(201).json({
      code: 201,
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
    const {username, password, name, email, confirmationCode} = req.body;

    // 验证请求体是否包含所有必要字段
    if (!username || !password || !name || !email || !confirmationCode) {
      return res.status(400).json({code: 400, data: null, msg: '缺少必要的字段'});
    }

    const [existingUsers] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUsers !== undefined) {
      return res.status(409).json({code: 409, data: null, msg: '用户名已存在'});
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
    await db.query('INSERT INTO users (username, password, name, email, email_confirmed) VALUES (?, ?, ?, ?, ?)', [username, hashedPassword, name, email, 1]);

    res.status(201).json({
      code: 201,
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


    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows;

    if (!user) {
      return res.status(404).json({code: 404, data: null, msg: '用户未找到'});
    }
    if (user.email_confirmed !== 1) {
      return res.status(403).json({code: 403, data: null, msg: '邮箱未确认'});
    }

    if (await bcrypt.compare(password, user.password)) {
      const {accessToken, refreshToken} = generateTokens({id: user.id});
      const offset = 8; // 东八区是UTC+8
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const expiresAtGMT8 = new Date(expiresAt.getTime() + offset * 3600 * 1000);

      await db.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, refreshToken, expiresAt]);

      res.json({
        code: 200,
        data: {
          accessToken,
          refreshToken,
          refreshTokenExpiresAt: expiresAtGMT8,
          user: {id: user.id, username: user.username, name: user.name, email: user.email, role: user.role}
        },
        msg: '登录成功'
      });
    } else {
      res.status(401).json({code: 401, data: null, msg: '用户名或密码错误'});
    }
  } catch (error) {
    console.error("Login error:", error);
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

module.exports = router;
