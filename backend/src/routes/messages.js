const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const {
  Message,
  Student,
  Teacher,
  Admin,
} = require('../models');
const logger = require('../logger');

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

function parseUser(headerValue) {
  if (!headerValue) return null;
  try {
    return JSON.parse(decodeURIComponent(headerValue));
  } catch (e) {
    return null;
  }
}

function getUserFromReq(req) {
  const user = parseUser(req.headers['x-user']);
  if (!user || !user.id || !user.role) {
    return null;
  }
  return user;
}

function getRoleName(type) {
  switch (type) {
    case 'student': return '学生';
    case 'teacher': return '教师';
    case 'admin': return '管理员';
    default: return '未知';
  }
}

async function findRecipientByIdAndType(id, type) {
  if (type === 'student') {
    return await Student.findByPk(id, { attributes: ['id', 'studentNo', 'name'] });
  } else if (type === 'teacher') {
    return await Teacher.findByPk(id, { attributes: ['id', 'teacherNo', 'name'] });
  } else if (type === 'admin') {
    return await Admin.findByPk(id, { attributes: ['id', 'username'] });
  }
  return null;
}

function formatRecipient(recipient, type) {
  if (!recipient) return null;
  if (type === 'student') {
    return {
      id: recipient.id,
      type: 'student',
      no: recipient.studentNo,
      name: recipient.name,
      display: `${recipient.name} (学号: ${recipient.studentNo})`,
    };
  } else if (type === 'teacher') {
    return {
      id: recipient.id,
      type: 'teacher',
      no: recipient.teacherNo,
      name: recipient.name,
      display: `${recipient.name} (工号: ${recipient.teacherNo})`,
    };
  } else if (type === 'admin') {
    return {
      id: recipient.id,
      type: 'admin',
      no: recipient.username,
      name: recipient.username,
      display: `${recipient.username} (管理员)`,
    };
  }
  return null;
}

router.get(
  '/recipients/search',
  query('keyword').trim().notEmpty().withMessage('搜索关键词不能为空'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit 必须在 1-50 之间'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const keyword = `%${req.query.keyword}%`;
    const limit = parseInt(req.query.limit || '20', 10);
    try {
      const results = [];
      const students = await Student.findAll({
        where: {
          [Op.or]: [
            { studentNo: { [Op.like]: keyword } },
            { name: { [Op.like]: keyword } },
          ],
        },
        attributes: ['id', 'studentNo', 'name'],
        limit,
      });
      for (const s of students) {
        results.push(formatRecipient(s, 'student'));
      }
      const remainingForTeachers = limit - results.length;
      if (remainingForTeachers > 0) {
        const teachers = await Teacher.findAll({
          where: {
            [Op.or]: [
              { teacherNo: { [Op.like]: keyword } },
              { name: { [Op.like]: keyword } },
            ],
          },
          attributes: ['id', 'teacherNo', 'name'],
          limit: remainingForTeachers,
        });
        for (const t of teachers) {
          results.push(formatRecipient(t, 'teacher'));
        }
      }
      const remainingForAdmins = limit - results.length;
      if (remainingForAdmins > 0) {
        const admins = await Admin.findAll({
          where: {
            username: { [Op.like]: keyword },
          },
          attributes: ['id', 'username'],
          limit: remainingForAdmins,
        });
        for (const a of admins) {
          results.push(formatRecipient(a, 'admin'));
        }
      }
      return sendJson(res, 200, { ok: true, data: results.slice(0, limit) });
    } catch (e) {
      logger.error('Search recipients error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.post(
  '/send',
  body('recipientId').isInt({ min: 1 }).withMessage('无效的接收人 ID'),
  body('recipientType').isIn(['student', 'teacher', 'admin']).withMessage('无效的接收人类型'),
  body('title').trim().notEmpty().withMessage('标题不能为空'),
  body('content').trim().notEmpty().withMessage('内容不能为空'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const sender = getUserFromReq(req);
    if (!sender) return sendJson(res, 401, { ok: false, message: '未登录' });
    const { recipientId, recipientType, title, content } = req.body;
    try {
      const recipient = await findRecipientByIdAndType(recipientId, recipientType);
      if (!recipient) return sendJson(res, 404, { ok: false, message: '接收人不存在' });
      let senderNo = '';
      let senderName = '';
      if (sender.role === 'student') {
        const s = await Student.findByPk(sender.id, { attributes: ['studentNo', 'name'] });
        if (!s) return sendJson(res, 404, { ok: false, message: '发送人不存在' });
        senderNo = s.studentNo;
        senderName = s.name;
      } else if (sender.role === 'teacher') {
        const t = await Teacher.findByPk(sender.id, { attributes: ['teacherNo', 'name'] });
        if (!t) return sendJson(res, 404, { ok: false, message: '发送人不存在' });
        senderNo = t.teacherNo;
        senderName = t.name;
      } else if (sender.role === 'admin') {
        const a = await Admin.findByPk(sender.id, { attributes: ['username'] });
        if (!a) return sendJson(res, 404, { ok: false, message: '发送人不存在' });
        senderNo = a.username;
        senderName = a.username;
      }
      const recipientFormatted = formatRecipient(recipient, recipientType);
      const msg = await Message.create({
        senderId: sender.id,
        senderType: sender.role,
        senderName,
        senderNo,
        recipientId,
        recipientType,
        recipientName: recipientFormatted.name,
        recipientNo: recipientFormatted.no,
        title: title.trim(),
        content: content.trim(),
        isRead: false,
        isDraft: false,
        sentAt: new Date(),
      });
      return sendJson(res, 200, { ok: true, message: '发送成功', data: { id: msg.id } });
    } catch (e) {
      logger.error('Send message error', { error: e.message, stack: e.stack });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.post(
  '/draft',
  body('id').optional().isInt({ min: 1 }).withMessage('无效的草稿 ID'),
  body('recipientId').optional().isInt({ min: 1 }).withMessage('无效的接收人 ID'),
  body('recipientType').optional().isIn(['student', 'teacher', 'admin']).withMessage('无效的接收人类型'),
  body('title').optional().default('').isString(),
  body('content').optional().default('').isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const sender = getUserFromReq(req);
    if (!sender) return sendJson(res, 401, { ok: false, message: '未登录' });
    const { id, recipientId, recipientType, title, content } = req.body;
    try {
      let senderNo = '';
      let senderName = '';
      if (sender.role === 'student') {
        const s = await Student.findByPk(sender.id, { attributes: ['studentNo', 'name'] });
        if (!s) return sendJson(res, 404, { ok: false, message: '发送人不存在' });
        senderNo = s.studentNo;
        senderName = s.name;
      } else if (sender.role === 'teacher') {
        const t = await Teacher.findByPk(sender.id, { attributes: ['teacherNo', 'name'] });
        if (!t) return sendJson(res, 404, { ok: false, message: '发送人不存在' });
        senderNo = t.teacherNo;
        senderName = t.name;
      } else if (sender.role === 'admin') {
        const a = await Admin.findByPk(sender.id, { attributes: ['username'] });
        if (!a) return sendJson(res, 404, { ok: false, message: '发送人不存在' });
        senderNo = a.username;
        senderName = a.username;
      }
      let recipientName = '';
      let recipientNo = '';
      let finalRecipientId = recipientId || 0;
      let finalRecipientType = recipientType || 'student';
      if (recipientId && recipientType) {
        const recipient = await findRecipientByIdAndType(recipientId, recipientType);
        if (recipient) {
          const rf = formatRecipient(recipient, recipientType);
          recipientName = rf.name;
          recipientNo = rf.no;
        }
      }
      if (id) {
        const existing = await Message.findOne({
          where: { id, senderId: sender.id, senderType: sender.role, isDraft: true },
        });
        if (!existing) return sendJson(res, 404, { ok: false, message: '草稿不存在' });
        await existing.update({
          recipientId: finalRecipientId,
          recipientType: finalRecipientType,
          recipientName,
          recipientNo,
          title: title || '(无标题)',
          content: content || '',
        });
        return sendJson(res, 200, { ok: true, message: '草稿已保存', data: { id: existing.id } });
      }
      const msg = await Message.create({
        senderId: sender.id,
        senderType: sender.role,
        senderName,
        senderNo,
        recipientId: finalRecipientId,
        recipientType: finalRecipientType,
        recipientName,
        recipientNo,
        title: title || '(无标题)',
        content: content || '',
        isRead: false,
        isDraft: true,
        sentAt: new Date(),
      });
      return sendJson(res, 200, { ok: true, message: '草稿已保存', data: { id: msg.id } });
    } catch (e) {
      logger.error('Save draft error', { error: e.message, stack: e.stack });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/unread-count',
  async (req, res) => {
    const user = getUserFromReq(req);
    if (!user) return sendJson(res, 401, { ok: false, message: '未登录' });
    try {
      const count = await Message.count({
        where: {
          recipientId: user.id,
          recipientType: user.role,
          isRead: false,
          isDraft: false,
        },
      });
      return sendJson(res, 200, { ok: true, data: { count } });
    } catch (e) {
      logger.error('Unread count error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/inbox',
  query('page').optional().isInt({ min: 1 }).withMessage('page 必须为正整数'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('pageSize 必须在 1-100 之间'),
  async (req, res) => {
    const user = getUserFromReq(req);
    if (!user) return sendJson(res, 401, { ok: false, message: '未登录' });
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const page = parseInt(req.query.page || '1', 10);
    const pageSize = parseInt(req.query.pageSize || '10', 10);
    try {
      const where = {
        recipientId: user.id,
        recipientType: user.role,
        isDraft: false,
      };
      const { count, rows } = await Message.findAndCountAll({
        where,
        order: [['sentAt', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      const data = rows.map((r) => ({
        id: r.id,
        senderId: r.senderId,
        senderType: r.senderType,
        senderName: r.senderName,
        senderNo: r.senderNo,
        senderRoleName: getRoleName(r.senderType),
        title: r.title,
        content: r.content,
        isRead: r.isRead,
        readAt: r.readAt,
        sentAt: r.sentAt,
      }));
      return sendJson(res, 200, {
        ok: true,
        data,
        pagination: {
          total: count,
          page,
          pageSize,
          totalPages: Math.ceil(count / pageSize),
        },
      });
    } catch (e) {
      logger.error('Inbox error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/sent',
  query('page').optional().isInt({ min: 1 }).withMessage('page 必须为正整数'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('pageSize 必须在 1-100 之间'),
  async (req, res) => {
    const user = getUserFromReq(req);
    if (!user) return sendJson(res, 401, { ok: false, message: '未登录' });
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const page = parseInt(req.query.page || '1', 10);
    const pageSize = parseInt(req.query.pageSize || '10', 10);
    try {
      const where = {
        senderId: user.id,
        senderType: user.role,
        isDraft: false,
      };
      const { count, rows } = await Message.findAndCountAll({
        where,
        order: [['sentAt', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      const data = rows.map((r) => ({
        id: r.id,
        recipientId: r.recipientId,
        recipientType: r.recipientType,
        recipientName: r.recipientName,
        recipientNo: r.recipientNo,
        recipientRoleName: getRoleName(r.recipientType),
        title: r.title,
        content: r.content,
        isRead: r.isRead,
        readAt: r.readAt,
        sentAt: r.sentAt,
      }));
      return sendJson(res, 200, {
        ok: true,
        data,
        pagination: {
          total: count,
          page,
          pageSize,
          totalPages: Math.ceil(count / pageSize),
        },
      });
    } catch (e) {
      logger.error('Sent messages error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/drafts',
  query('page').optional().isInt({ min: 1 }).withMessage('page 必须为正整数'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('pageSize 必须在 1-100 之间'),
  async (req, res) => {
    const user = getUserFromReq(req);
    if (!user) return sendJson(res, 401, { ok: false, message: '未登录' });
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const page = parseInt(req.query.page || '1', 10);
    const pageSize = parseInt(req.query.pageSize || '10', 10);
    try {
      const where = {
        senderId: user.id,
        senderType: user.role,
        isDraft: true,
      };
      const { count, rows } = await Message.findAndCountAll({
        where,
        order: [['sentAt', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      const data = rows.map((r) => ({
        id: r.id,
        recipientId: r.recipientId,
        recipientType: r.recipientType,
        recipientName: r.recipientName,
        recipientNo: r.recipientNo,
        recipientRoleName: getRoleName(r.recipientType),
        title: r.title,
        content: r.content,
        sentAt: r.sentAt,
      }));
      return sendJson(res, 200, {
        ok: true,
        data,
        pagination: {
          total: count,
          page,
          pageSize,
          totalPages: Math.ceil(count / pageSize),
        },
      });
    } catch (e) {
      logger.error('Drafts error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('无效的消息 ID'),
  async (req, res) => {
    const user = getUserFromReq(req);
    if (!user) return sendJson(res, 401, { ok: false, message: '未登录' });
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const id = parseInt(req.params.id, 10);
    try {
      const msg = await Message.findByPk(id);
      if (!msg) return sendJson(res, 404, { ok: false, message: '消息不存在' });
      const isRecipient = msg.recipientId === user.id && msg.recipientType === user.role;
      const isSender = msg.senderId === user.id && msg.senderType === user.role;
      if (!isRecipient && !isSender) {
        return sendJson(res, 403, { ok: false, message: '无权查看该消息' });
      }
      if (isRecipient && !msg.isRead && !msg.isDraft) {
        await msg.update({ isRead: true, readAt: new Date() });
      }
      const data = {
        id: msg.id,
        senderId: msg.senderId,
        senderType: msg.senderType,
        senderName: msg.senderName,
        senderNo: msg.senderNo,
        senderRoleName: getRoleName(msg.senderType),
        recipientId: msg.recipientId,
        recipientType: msg.recipientType,
        recipientName: msg.recipientName,
        recipientNo: msg.recipientNo,
        recipientRoleName: getRoleName(msg.recipientType),
        title: msg.title,
        content: msg.content,
        isRead: msg.isRead,
        readAt: msg.readAt,
        isDraft: msg.isDraft,
        sentAt: msg.sentAt,
      };
      return sendJson(res, 200, { ok: true, data });
    } catch (e) {
      logger.error('Get message detail error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.put(
  '/:id/read',
  param('id').isInt({ min: 1 }).withMessage('无效的消息 ID'),
  async (req, res) => {
    const user = getUserFromReq(req);
    if (!user) return sendJson(res, 401, { ok: false, message: '未登录' });
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const id = parseInt(req.params.id, 10);
    try {
      const msg = await Message.findOne({
        where: { id, recipientId: user.id, recipientType: user.role },
      });
      if (!msg) return sendJson(res, 404, { ok: false, message: '消息不存在' });
      if (!msg.isRead) {
        await msg.update({ isRead: true, readAt: new Date() });
      }
      return sendJson(res, 200, { ok: true, message: '已标记为已读' });
    } catch (e) {
      logger.error('Mark read error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.delete(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('无效的消息 ID'),
  async (req, res) => {
    const user = getUserFromReq(req);
    if (!user) return sendJson(res, 401, { ok: false, message: '未登录' });
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const id = parseInt(req.params.id, 10);
    try {
      const msg = await Message.findByPk(id);
      if (!msg) return sendJson(res, 404, { ok: false, message: '消息不存在' });
      const isSender = msg.senderId === user.id && msg.senderType === user.role;
      if (!isSender) return sendJson(res, 403, { ok: false, message: '无权删除该消息' });
      await msg.destroy();
      return sendJson(res, 200, { ok: true, message: '已删除' });
    } catch (e) {
      logger.error('Delete message error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

module.exports = router;
