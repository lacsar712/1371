const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const { Announcement, Admin } = require('../models');
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
  if (!user || !user.id || !user.role) return null;
  return user;
}

const ALLOWED_TAGS = [
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'a', 'img', 'hr', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'sub', 'sup', 'del', 'ins',
];

const ALLOWED_ATTRS = {
  a: ['href', 'title', 'target'],
  img: ['src', 'alt', 'width', 'height'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  span: ['style'],
  div: ['style'],
  p: ['style'],
};

const ALLOWED_STYLE_PROPS = [
  'color', 'background-color', 'font-size', 'font-weight', 'font-style',
  'text-align', 'text-decoration', 'line-height', 'margin', 'margin-left',
  'margin-right', 'margin-top', 'margin-bottom', 'padding', 'padding-left',
  'padding-right', 'padding-top', 'padding-bottom',
];

const VALID_CATEGORIES = ['system', 'academic', 'activity'];

function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  let result = html;
  result = result.replace(/<script[\s\S]*?<\/script>/gi, '');
  result = result.replace(/<style[\s\S]*?<\/style>/gi, '');
  result = result.replace(/on\w+\s*=/gi, 'data-removed=');
  result = result.replace(/javascript\s*:/gi, '');
  result = result.replace(/vbscript\s*:/gi, '');
  result = result.replace(/data\s*:/gi, '');
  result = result.replace(/expression\s*\(/gi, '');
  result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g, (match, tagName) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.includes(tag)) return '';
    if (match.startsWith('</')) return `</${tag}>`;
    const attrMatch = match.match(/\s+([a-zA-Z][a-zA-Z0-9-]*)\s*(?:=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?/g);
    if (!attrMatch) return `<${tag}>`;
    const allowedForTag = ALLOWED_ATTRS[tag] || [];
    const filteredAttrs = [];
    for (const attrStr of attrMatch) {
      const attrNameMatch = attrStr.match(/\s+([a-zA-Z][a-zA-Z0-9-]*)/);
      if (!attrNameMatch) continue;
      const attrName = attrNameMatch[1].toLowerCase();
      if (!allowedForTag.includes(attrName)) continue;
      const valMatch = attrStr.match(/=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/);
      let val = valMatch ? (valMatch[1] !== undefined ? valMatch[1] : valMatch[2] !== undefined ? valMatch[2] : valMatch[3]) : '';
      if (attrName === 'href' && /^(javascript|vbscript|data)\s*:/i.test(val)) continue;
      if (attrName === 'src' && /^(javascript|vbscript)\s*:/i.test(val)) continue;
      if (attrName === 'style') {
        val = val.split(';').filter((decl) => {
          const prop = decl.split(':')[0].trim().toLowerCase();
          return ALLOWED_STYLE_PROPS.includes(prop);
        }).join(';');
      }
      filteredAttrs.push(`${attrName}="${val.replace(/"/g, '&quot;')}"`);
    }
    return `<${tag}${filteredAttrs.length ? ' ' + filteredAttrs.join(' ') : ''}>`;
  });
  result = result.replace(/<([a-zA-Z][a-zA-Z0-9]*)\s*\/>/g, (match, tagName) => {
    if (!ALLOWED_TAGS.includes(tagName.toLowerCase())) return '';
    return match;
  });
  return result;
}

const CATEGORY_LABELS = {
  system: '系统通知',
  academic: '教务通知',
  activity: '活动通知',
};

router.get(
  '/',
  query('page').optional().isInt({ min: 1 }).withMessage('page 必须为正整数'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('pageSize 必须在 1-100 之间'),
  query('category').optional().isIn(VALID_CATEGORIES).withMessage('无效的分类'),
  query('keyword').optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const page = parseInt(req.query.page || '1', 10);
    const pageSize = parseInt(req.query.pageSize || '10', 10);
    const { category, keyword } = req.query;
    try {
      const where = {};
      if (category) where.category = category;
      if (keyword) {
        where[Op.or] = [
          { title: { [Op.like]: `%${keyword}%` } },
          { publisherName: { [Op.like]: `%${keyword}%` } },
        ];
      }
      const { count, rows } = await Announcement.findAndCountAll({
        where,
        order: [
          ['isPinned', 'DESC'],
          ['publishedAt', 'DESC'],
        ],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      const data = rows.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        categoryLabel: CATEGORY_LABELS[r.category] || r.category,
        publisherId: r.publisherId,
        publisherName: r.publisherName,
        isPinned: r.isPinned,
        viewCount: r.viewCount,
        publishedAt: r.publishedAt,
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
      logger.error('List announcements error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('无效的公告 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const id = parseInt(req.params.id, 10);
    try {
      const announcement = await Announcement.findByPk(id);
      if (!announcement) return sendJson(res, 404, { ok: false, message: '公告不存在' });
      await announcement.increment('viewCount');
      const data = {
        id: announcement.id,
        title: announcement.title,
        content: announcement.content,
        category: announcement.category,
        categoryLabel: CATEGORY_LABELS[announcement.category] || announcement.category,
        publisherId: announcement.publisherId,
        publisherName: announcement.publisherName,
        isPinned: announcement.isPinned,
        viewCount: announcement.viewCount + 1,
        publishedAt: announcement.publishedAt,
      };
      return sendJson(res, 200, { ok: true, data });
    } catch (e) {
      logger.error('Get announcement detail error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.post(
  '/',
  body('title').trim().notEmpty().withMessage('标题不能为空'),
  body('content').trim().notEmpty().withMessage('正文不能为空'),
  body('category').isIn(VALID_CATEGORIES).withMessage('无效的分类'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const user = getUserFromReq(req);
    if (!user || user.role !== 'admin') return sendJson(res, 403, { ok: false, message: '无权操作' });
    const { title, content, category } = req.body;
    try {
      const admin = await Admin.findByPk(user.id, { attributes: ['id', 'username'] });
      if (!admin) return sendJson(res, 404, { ok: false, message: '管理员不存在' });
      const cleanContent = sanitizeHtml(content);
      const announcement = await Announcement.create({
        title: title.trim(),
        content: cleanContent,
        category,
        publisherId: admin.id,
        publisherName: admin.username,
        isPinned: false,
        viewCount: 0,
        publishedAt: new Date(),
      });
      return sendJson(res, 200, { ok: true, message: '发布成功', data: { id: announcement.id } });
    } catch (e) {
      logger.error('Create announcement error', { error: e.message, stack: e.stack });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.put(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('无效的公告 ID'),
  body('title').optional().trim().notEmpty().withMessage('标题不能为空'),
  body('content').optional().trim().notEmpty().withMessage('正文不能为空'),
  body('category').optional().isIn(VALID_CATEGORIES).withMessage('无效的分类'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const user = getUserFromReq(req);
    if (!user || user.role !== 'admin') return sendJson(res, 403, { ok: false, message: '无权操作' });
    const id = parseInt(req.params.id, 10);
    try {
      const announcement = await Announcement.findByPk(id);
      if (!announcement) return sendJson(res, 404, { ok: false, message: '公告不存在' });
      const updates = {};
      if (req.body.title !== undefined) updates.title = req.body.title.trim();
      if (req.body.content !== undefined) updates.content = sanitizeHtml(req.body.content);
      if (req.body.category !== undefined) updates.category = req.body.category;
      await announcement.update(updates);
      return sendJson(res, 200, { ok: true, message: '更新成功' });
    } catch (e) {
      logger.error('Update announcement error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.delete(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('无效的公告 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const user = getUserFromReq(req);
    if (!user || user.role !== 'admin') return sendJson(res, 403, { ok: false, message: '无权操作' });
    const id = parseInt(req.params.id, 10);
    try {
      const announcement = await Announcement.findByPk(id);
      if (!announcement) return sendJson(res, 404, { ok: false, message: '公告不存在' });
      await announcement.destroy();
      return sendJson(res, 200, { ok: true, message: '已删除' });
    } catch (e) {
      logger.error('Delete announcement error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.put(
  '/:id/pin',
  param('id').isInt({ min: 1 }).withMessage('无效的公告 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const user = getUserFromReq(req);
    if (!user || user.role !== 'admin') return sendJson(res, 403, { ok: false, message: '无权操作' });
    const id = parseInt(req.params.id, 10);
    try {
      const announcement = await Announcement.findByPk(id);
      if (!announcement) return sendJson(res, 404, { ok: false, message: '公告不存在' });
      await announcement.update({ isPinned: !announcement.isPinned });
      return sendJson(res, 200, {
        ok: true,
        message: announcement.isPinned ? '已取消置顶' : '已置顶',
        data: { isPinned: !announcement.isPinned },
      });
    } catch (e) {
      logger.error('Toggle pin error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

module.exports = router;
