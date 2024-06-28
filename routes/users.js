const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../config/db');
const {generateTokens, verifyAndRefreshTokens} = require('../utils/tokenManager');

// POST: 注册新用户
router.post('/register', async (req, res) => {
  try {
    const {username, password, name, email} = req.body;

    // 验证请求体是否包含所有必要字段
    if (!username || !password || !name || !email) {
      return res.status(400).json({code: 400, data: null, msg: '缺少必要的字段'});
    }

    const [existingUsers] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUsers) {
      return res.status(409).json({code: 409, data: null, msg: '用户名已存在'});
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query('INSERT INTO users (username, password, name, email) VALUES (?, ?, ?, ?)', [username, hashedPassword, name, email]);
    const userId = result.insertId;

    const [userInfo] = await db.query('SELECT username, email, name, role FROM users WHERE id = ?', [userId]);
    const {username: DBusername, email: DBemail, name: DBname, role: DBrole} = userInfo;

    // 使用 tokenManager 生成令牌
    const {accessToken, refreshToken} = generateTokens({id: userId});
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', [userId, refreshToken, expiresAt]);

    res.status(201).json({
      code: 201,
      data: {
        accessToken,
        refreshToken,
        user: {id: userId, username: DBusername, email: DBemail, name: DBname, role: DBrole}
      },
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

    res.json({data: user});
  } catch (error) {
    console.error('Profile retrieval error:', error);
    res.status(500).json({msg: '服务器错误', error: error.message});
  }
});

module.exports = router;
