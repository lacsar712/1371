const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const {
  Questionnaire,
  Question,
  QuestionnaireResponse,
  QuestionAnswer,
  Student,
  sequelize,
} = require('../models');
const logger = require('../logger');

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

function computeStatus(q) {
  const now = new Date();
  if (q.status === 'draft') return 'draft';
  const start = new Date(q.startTime);
  const end = new Date(q.endTime);
  if (now < start) return 'pending';
  if (now > end) return 'closed';
  return 'active';
}

// ========== 管理端: 问卷列表 ==========
router.get('/admin', async (req, res) => {
  try {
    const list = await Questionnaire.findAll({
      order: [['id', 'DESC']],
      include: [{ model: Question, as: 'questions', attributes: ['id'] }],
    });
    const data = list.map((q) => {
      const item = q.toJSON();
      item.questionCount = item.questions ? item.questions.length : 0;
      item.computedStatus = computeStatus(item);
      delete item.questions;
      return item;
    });
    return sendJson(res, 200, { ok: true, data });
  } catch (e) {
    logger.error('Admin list questionnaires error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// ========== 管理端: 问卷详情 (含题目) ==========
router.get('/admin/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  try {
    const q = await Questionnaire.findByPk(id, {
      include: [{ model: Question, as: 'questions', order: [['sortOrder', 'ASC'], ['id', 'ASC']] }],
    });
    if (!q) return sendJson(res, 404, { ok: false, message: '问卷不存在' });
    const data = q.toJSON();
    data.questions = (data.questions || []).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    data.questions.forEach((qItem) => {
      try { qItem.options = JSON.parse(qItem.options || '[]'); } catch (_) { qItem.options = []; }
    });
    data.computedStatus = computeStatus(data);
    return sendJson(res, 200, { ok: true, data });
  } catch (e) {
    logger.error('Admin get questionnaire error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// ========== 管理端: 新增问卷 ==========
router.post(
  '/admin',
  body('title').trim().notEmpty().withMessage('问卷标题不能为空'),
  body('startTime').notEmpty().withMessage('开始时间不能为空'),
  body('endTime').notEmpty().withMessage('结束时间不能为空'),
  body('description').optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const { title, description, startTime, endTime } = req.body;
    try {
      const row = await Questionnaire.create({
        title: title.trim(),
        description: description ? description.trim() : '',
        startTime,
        endTime,
        status: 'draft',
      });
      return sendJson(res, 201, { ok: true, data: { id: row.id, title: row.title, status: row.status } });
    } catch (e) {
      logger.error('Create questionnaire error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

// ========== 管理端: 编辑问卷基本信息 ==========
router.put(
  '/admin/:id',
  param('id').isInt({ min: 1 }),
  body('title').trim().notEmpty().withMessage('问卷标题不能为空'),
  body('startTime').notEmpty().withMessage('开始时间不能为空'),
  body('endTime').notEmpty().withMessage('结束时间不能为空'),
  body('description').optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const id = parseInt(req.params.id, 10);
    const { title, description, startTime, endTime } = req.body;
    try {
      const row = await Questionnaire.findByPk(id);
      if (!row) return sendJson(res, 404, { ok: false, message: '问卷不存在' });
      if (row.status === 'published') return sendJson(res, 400, { ok: false, message: '已发布的问卷不能编辑' });
      await Questionnaire.update(
        { title: title.trim(), description: description ? description.trim() : '', startTime, endTime },
        { where: { id } }
      );
      return sendJson(res, 200, { ok: true, message: '更新成功' });
    } catch (e) {
      logger.error('Update questionnaire error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

// ========== 管理端: 删除问卷 ==========
router.delete('/admin/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const row = await Questionnaire.findByPk(id);
    if (!row) return sendJson(res, 404, { ok: false, message: '问卷不存在' });
    const responseIds = (await QuestionnaireResponse.findAll({ where: { questionnaireId: id }, attributes: ['id'] })).map((r) => r.id);
    if (responseIds.length > 0) {
      await QuestionAnswer.destroy({ where: { responseId: { [Op.in]: responseIds } } });
    }
    await QuestionnaireResponse.destroy({ where: { questionnaireId: id } });
    await Question.destroy({ where: { questionnaireId: id } });
    await Questionnaire.destroy({ where: { id } });
    return sendJson(res, 200, { ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete questionnaire error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// ========== 管理端: 发布问卷 ==========
router.put('/admin/:id/publish', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const row = await Questionnaire.findByPk(id, {
      include: [{ model: Question, as: 'questions' }],
    });
    if (!row) return sendJson(res, 404, { ok: false, message: '问卷不存在' });
    if (row.status === 'published') return sendJson(res, 400, { ok: false, message: '问卷已发布' });
    if (!row.questions || row.questions.length === 0) return sendJson(res, 400, { ok: false, message: '问卷至少需要一道题目' });
    await Questionnaire.update({ status: 'published' }, { where: { id } });
    return sendJson(res, 200, { ok: true, message: '发布成功' });
  } catch (e) {
    logger.error('Publish questionnaire error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// ========== 管理端: 保存题目 (整体覆盖) ==========
router.put(
  '/admin/:id/questions',
  param('id').isInt({ min: 1 }),
  body('questions').isArray({ min: 0 }).withMessage('题目列表格式错误'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const id = parseInt(req.params.id, 10);
    const questions = req.body.questions;
    try {
      const row = await Questionnaire.findByPk(id);
      if (!row) return sendJson(res, 404, { ok: false, message: '问卷不存在' });
      if (row.status === 'published') return sendJson(res, 400, { ok: false, message: '已发布的问卷不能编辑题目' });
      await sequelize.transaction(async (transaction) => {
        await Question.destroy({ where: { questionnaireId: id }, transaction });
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          const opts = (q.type === 'single' || q.type === 'multiple') ? JSON.stringify(q.options || []) : '[]';
          await Question.create({
            questionnaireId: id,
            type: q.type || 'single',
            title: (q.title || '').trim(),
            options: opts,
            required: !!q.required,
            sortOrder: i,
          }, { transaction });
        }
      });
      return sendJson(res, 200, { ok: true, message: '题目保存成功' });
    } catch (e) {
      logger.error('Save questions error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

// ========== 管理端: 问卷聚合统计 ==========
router.get('/admin/:id/stats', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const q = await Questionnaire.findByPk(id, {
      include: [{ model: Question, as: 'questions', order: [['sortOrder', 'ASC'], ['id', 'ASC']] }],
    });
    if (!q) return sendJson(res, 404, { ok: false, message: '问卷不存在' });
    const questions = (q.questions || []).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    const responses = await QuestionnaireResponse.findAll({ where: { questionnaireId: id } });
    const totalResponses = responses.length;
    const responseIds = responses.map((r) => r.id);
    const allAnswers = responseIds.length > 0
      ? await QuestionAnswer.findAll({ where: { responseId: { [Op.in]: responseIds } } })
      : [];
    const answerMap = {};
    allAnswers.forEach((a) => {
      if (!answerMap[a.questionId]) answerMap[a.questionId] = [];
      answerMap[a.questionId].push(a);
    });
    const questionStats = questions.map((qItem) => {
      const qData = qItem.toJSON();
      try { qData.options = JSON.parse(qData.options || '[]'); } catch (_) { qData.options = []; }
      const answers = answerMap[qItem.id] || [];
      if (qItem.type === 'single') {
        const counts = {};
        qData.options.forEach((_, idx) => { counts[idx] = 0; });
        answers.forEach((a) => {
          try {
            const val = JSON.parse(a.answer);
            if (typeof val === 'number' && counts[val] !== undefined) counts[val]++;
          } catch (_) {}
        });
        return { ...qData, stats: { counts, total: answers.length } };
      } else if (qItem.type === 'multiple') {
        const counts = {};
        qData.options.forEach((_, idx) => { counts[idx] = 0; });
        answers.forEach((a) => {
          try {
            const vals = JSON.parse(a.answer);
            if (Array.isArray(vals)) vals.forEach((v) => { if (counts[v] !== undefined) counts[v]++; });
          } catch (_) {}
        });
        return { ...qData, stats: { counts, total: answers.length } };
      } else {
        const textAnswers = answers.map((a) => a.answer || '');
        return { ...qData, stats: { answers: textAnswers, total: answers.length } };
      }
    });
    return sendJson(res, 200, {
      ok: true,
      data: {
        id: q.id,
        title: q.title,
        description: q.description,
        computedStatus: computeStatus(q),
        totalResponses,
        questions: questionStats,
      },
    });
  } catch (e) {
    logger.error('Get questionnaire stats error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// ========== 学生端: 按学生查询问卷列表 (可填/已填/已截止) ==========
router.get('/student/:studentId', param('studentId').isInt({ min: 1 }), async (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  try {
    const published = await Questionnaire.findAll({
      where: { status: 'published' },
      order: [['id', 'DESC']],
      include: [{ model: Question, as: 'questions', attributes: ['id'] }],
    });
    const filled = await QuestionnaireResponse.findAll({
      where: { studentId },
      attributes: ['questionnaireId'],
    });
    const filledSet = new Set(filled.map((r) => r.questionnaireId));
    const now = new Date();
    const available = [];
    const answered = [];
    const expired = [];
    published.forEach((q) => {
      const item = q.toJSON();
      item.questionCount = item.questions ? item.questions.length : 0;
      delete item.questions;
      const start = new Date(q.startTime);
      const end = new Date(q.endTime);
      if (filledSet.has(q.id)) {
        item.answeredAt = filled.find((f) => f.questionnaireId === q.id) || null;
        answered.push(item);
      } else if (now > end) {
        expired.push(item);
      } else if (now < start) {
        available.push({ ...item, pending: true });
      } else {
        available.push(item);
      }
    });
    return sendJson(res, 200, { ok: true, data: { available, answered, expired, unfilledCount: available.filter((a) => !a.pending).length } });
  } catch (e) {
    logger.error('Student list questionnaires error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// ========== 学生端: 获取问卷详情 (含题目) 用于填写 ==========
router.get('/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const studentId = parseInt(req.query.studentId, 10);
  try {
    const q = await Questionnaire.findByPk(id, {
      include: [{ model: Question, as: 'questions', order: [['sortOrder', 'ASC'], ['id', 'ASC']] }],
    });
    if (!q) return sendJson(res, 404, { ok: false, message: '问卷不存在' });
    const computed = computeStatus(q);
    if (computed === 'draft') return sendJson(res, 400, { ok: false, message: '问卷未发布' });
    let submitted = false;
    if (studentId) {
      const existing = await QuestionnaireResponse.findOne({ where: { questionnaireId: id, studentId } });
      if (existing) submitted = true;
    }
    const data = q.toJSON();
    data.questions = (data.questions || []).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    data.questions.forEach((qItem) => {
      try { qItem.options = JSON.parse(qItem.options || '[]'); } catch (_) { qItem.options = []; }
    });
    data.computedStatus = computed;
    data.submitted = submitted;
    return sendJson(res, 200, { ok: true, data });
  } catch (e) {
    logger.error('Get questionnaire detail error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// ========== 学生端: 提交作答 ==========
router.post(
  '/:id/submit',
  param('id').isInt({ min: 1 }),
  body('studentId').isInt({ min: 1 }).withMessage('无效的学生 ID'),
  body('answers').isArray({ min: 1 }).withMessage('作答不能为空'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const id = parseInt(req.params.id, 10);
    const { studentId, answers } = req.body;
    try {
      const q = await Questionnaire.findByPk(id, {
        include: [{ model: Question, as: 'questions' }],
      });
      if (!q) return sendJson(res, 404, { ok: false, message: '问卷不存在' });
      const computed = computeStatus(q);
      if (computed === 'draft') return sendJson(res, 400, { ok: false, message: '问卷未发布' });
      if (computed === 'closed') return sendJson(res, 400, { ok: false, message: '问卷已截止' });
      const existing = await QuestionnaireResponse.findOne({ where: { questionnaireId: id, studentId } });
      if (existing) return sendJson(res, 400, { ok: false, message: '您已填写过此问卷' });
      const questionMap = {};
      (q.questions || []).forEach((qItem) => { questionMap[qItem.id] = qItem; });
      for (const a of answers) {
        const qItem = questionMap[a.questionId];
        if (!qItem) return sendJson(res, 400, { ok: false, message: `题目 ID ${a.questionId} 不存在` });
        if (qItem.required) {
          if (a.answer === undefined || a.answer === null || a.answer === '' || (Array.isArray(a.answer) && a.answer.length === 0)) {
            return sendJson(res, 400, { ok: false, message: `必填题目「${qItem.title}」未作答` });
          }
        }
      }
      const response = await QuestionnaireResponse.create({ questionnaireId: id, studentId });
      const answerRows = answers.map((a) => ({
        responseId: response.id,
        questionId: a.questionId,
        answer: typeof a.answer === 'string' ? a.answer : JSON.stringify(a.answer),
      }));
      await QuestionAnswer.bulkCreate(answerRows);
      return sendJson(res, 201, { ok: true, message: '提交成功', data: { responseId: response.id } });
    } catch (e) {
      if (e.name === 'SequelizeUniqueConstraintError') {
        return sendJson(res, 400, { ok: false, message: '您已填写过此问卷' });
      }
      logger.error('Submit questionnaire error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

module.exports = router;
