const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const { Course, Enrollment, Student, Teacher, CourseTeacher, resolveSemesterId, Semester } = require('../models');
const { hashPassword } = require('../db');
const logger = require('../logger');

// ========== 学生管理 ==========
router.get('/students', async (req, res) => {
  try {
    const list = await Student.findAll({
      order: [['id']],
      attributes: ['id', 'studentNo', 'name'],
    });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: list });
  } catch (e) {
    logger.error('Admin students list error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const studentValidators = [
  body('studentNo').trim().notEmpty().withMessage('学号不能为空'),
  body('name').trim().notEmpty().withMessage('姓名不能为空'),
  body('password').trim().notEmpty().withMessage('密码不能为空'),
];

router.post('/students', studentValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const { studentNo, name, password } = req.body;
  try {
    const row = await Student.create({
      studentNo: studentNo.trim(),
      name: name.trim(),
      passwordHash: hashPassword(password),
    });
    return res
      .status(201)
      .set('Content-Type', 'application/json; charset=utf-8')
      .json({ ok: true, data: { id: row.id, studentNo: row.studentNo, name: row.name } });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: '学号已存在' });
    logger.error('Create student error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const studentUpdateValidators = [
  body('studentNo').trim().notEmpty().withMessage('学号不能为空'),
  body('name').trim().notEmpty().withMessage('姓名不能为空'),
  body('password').optional().trim(),
];

router.put('/students/:id', param('id').isInt({ min: 1 }), studentUpdateValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  const { studentNo, name, password } = req.body;
  try {
    const row = await Student.findByPk(id);
    if (!row) return res.status(404).json({ ok: false, message: '学生不存在' });
    const updates = { studentNo: studentNo.trim(), name: name.trim() };
    if (password && String(password).trim()) {
      updates.passwordHash = hashPassword(password);
    }
    await Student.update(updates, { where: { id } });
    const updated = await Student.findByPk(id, { attributes: ['id', 'studentNo', 'name'] });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: updated });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: '学号已存在' });
    logger.error('Update student error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/students/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await Enrollment.destroy({ where: { studentId: id } });
    const n = await Student.destroy({ where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '学生不存在' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete student error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

// ========== 教师管理 ==========
router.get('/teachers', async (req, res) => {
  try {
    const keyword = (req.query.keyword || '').trim();
    const college = (req.query.college || '').trim();
    const where = {};
    if (keyword) {
      where[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { teacherNo: { [Op.like]: `%${keyword}%` } },
      ];
    }
    if (college) {
      where.college = college;
    }
    const list = await Teacher.findAll({
      where,
      order: [['id']],
      attributes: ['id', 'teacherNo', 'name', 'title', 'college'],
    });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: list });
  } catch (e) {
    logger.error('Admin teachers list error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get('/teachers/colleges', async (req, res) => {
  try {
    const rows = await Teacher.findAll({
      attributes: ['college'],
      group: ['college'],
      where: { college: { [Op.not]: null } },
      raw: true,
    });
    const colleges = rows.map((r) => r.college).filter(Boolean);
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: colleges });
  } catch (e) {
    logger.error('Admin teachers colleges error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const teacherValidators = [
  body('teacherNo').trim().notEmpty().withMessage('工号不能为空'),
  body('name').trim().notEmpty().withMessage('姓名不能为空'),
  body('password').trim().notEmpty().withMessage('密码不能为空'),
  body('title').optional().trim(),
  body('college').optional().trim(),
];

router.post('/teachers', teacherValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const { teacherNo, name, password, title, college } = req.body;
  try {
    const row = await Teacher.create({
      teacherNo: teacherNo.trim(),
      name: name.trim(),
      passwordHash: hashPassword(password),
      title: title ? title.trim() : null,
      college: college ? college.trim() : null,
    });
    return res
      .status(201)
      .set('Content-Type', 'application/json; charset=utf-8')
      .json({ ok: true, data: { id: row.id, teacherNo: row.teacherNo, name: row.name, title: row.title, college: row.college } });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: '工号已存在' });
    logger.error('Create teacher error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const teacherUpdateValidators = [
  body('teacherNo').trim().notEmpty().withMessage('工号不能为空'),
  body('name').trim().notEmpty().withMessage('姓名不能为空'),
  body('password').optional().trim(),
  body('title').optional().trim(),
  body('college').optional().trim(),
];

router.put('/teachers/:id', param('id').isInt({ min: 1 }), teacherUpdateValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  const { teacherNo, name, password, title, college } = req.body;
  try {
    const row = await Teacher.findByPk(id);
    if (!row) return res.status(404).json({ ok: false, message: '教师不存在' });
    const updates = {
      teacherNo: teacherNo.trim(),
      name: name.trim(),
      title: title ? title.trim() : null,
      college: college ? college.trim() : null,
    };
    if (password && String(password).trim()) {
      updates.passwordHash = hashPassword(password);
    }
    await Teacher.update(updates, { where: { id } });
    const updated = await Teacher.findByPk(id, { attributes: ['id', 'teacherNo', 'name', 'title', 'college'] });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: updated });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: '工号已存在' });
    logger.error('Update teacher error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/teachers/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await CourseTeacher.destroy({ where: { teacherId: id } });
    const n = await Teacher.destroy({ where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '教师不存在' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete teacher error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

// ========== 课程管理 ==========
router.get('/courses', async (req, res) => {
  const { sequelize } = require('../models');
  try {
    const semesterId = await resolveSemesterId(req.query.semesterId);
    const where = {};
    if (semesterId) where.semesterId = semesterId;
    const list = await Course.findAll({
      where,
      order: [['id']],
      attributes: ['id', 'code', 'name', 'credit', 'capacity', 'semesterId'],
      include: [{ model: Teacher, as: 'teachers', attributes: ['id', 'teacherNo', 'name', 'title', 'college'], through: { attributes: [] } }],
    });
    const enrollWhere = semesterId ? { semesterId } : {};
    const enrollCounts = await Enrollment.findAll({
      where: enrollWhere,
      attributes: ['courseId', [sequelize.fn('COUNT', sequelize.col('id')), 'enrolled']],
      group: ['courseId'],
      raw: true,
    });
    const countMap = Object.fromEntries(
      enrollCounts.map((r) => [r.courseId, Number(r.enrolled) || 0])
    );
    const data = list.map((c) => ({
      ...c.toJSON(),
      enrolled: countMap[c.id] ?? 0,
      teachers: c.teachers ? c.teachers.map((t) => ({ id: t.id, teacherNo: t.teacherNo, name: t.name, title: t.title, college: t.college })) : [],
    }));
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Admin courses list error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const courseValidators = [
  body('code').trim().notEmpty().withMessage('课程代码不能为空'),
  body('name').trim().notEmpty().withMessage('课程名称不能为空'),
  body('credit').isInt({ min: 0 }).withMessage('学分必须为非负整数'),
  body('capacity').isInt({ min: 0 }).withMessage('容量必须为非负整数'),
  body('semesterId').isInt({ min: 1 }).withMessage('请选择学期'),
  body('teacherIds').optional().isArray({ min: 0 }).withMessage('教师列表格式错误'),
];

router.post('/courses', courseValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const { code, name, credit, capacity, semesterId, teacherIds } = req.body;
  const t = require('../models').sequelize.transaction;
  try {
    const result = await require('../models').sequelize.transaction(async (transaction) => {
      const row = await Course.create(
        { code: code.trim(), name: name.trim(), credit: Number(credit), capacity: Number(capacity), semesterId: Number(semesterId) },
        { transaction }
      );
      if (Array.isArray(teacherIds) && teacherIds.length > 0) {
        const validIds = teacherIds.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id) && id > 0);
        if (validIds.length > 0) {
          const pairs = validIds.map((tid) => ({ courseId: row.id, teacherId: tid }));
          await CourseTeacher.bulkCreate(pairs, { transaction, ignoreDuplicates: true });
        }
      }
      return row;
    });
    const row = await Course.findByPk(result.id, {
      include: [{ model: Teacher, as: 'teachers', attributes: ['id', 'teacherNo', 'name', 'title', 'college'], through: { attributes: [] } }],
    });
    return res.status(201).set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: row.toJSON() });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: '课程代码已存在' });
    logger.error('Create course error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.put('/courses/:id', param('id').isInt({ min: 1 }), courseValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  const { code, name, credit, capacity, semesterId, teacherIds } = req.body;
  const cap = Number(capacity);
  try {
    const enrolled = await Enrollment.count({ where: { courseId: id } });
    if (enrolled > cap) return res.status(400).json({ ok: false, message: '容量不能小于已选人数' });
    await require('../models').sequelize.transaction(async (transaction) => {
      const [n] = await Course.update(
        { code: code.trim(), name: name.trim(), credit: Number(credit), capacity: cap, semesterId: Number(semesterId) },
        { where: { id }, transaction }
      );
      if (n === 0) throw new Error('NOT_FOUND');
      if (Array.isArray(teacherIds)) {
        await CourseTeacher.destroy({ where: { courseId: id }, transaction });
        const validIds = teacherIds.map((tid) => parseInt(tid, 10)).filter((tid) => !Number.isNaN(tid) && tid > 0);
        if (validIds.length > 0) {
          const pairs = validIds.map((tid) => ({ courseId: id, teacherId: tid }));
          await CourseTeacher.bulkCreate(pairs, { transaction, ignoreDuplicates: true });
        }
      }
    });
    const row = await Course.findByPk(id, {
      include: [{ model: Teacher, as: 'teachers', attributes: ['id', 'teacherNo', 'name', 'title', 'college'], through: { attributes: [] } }],
    });
    if (!row) return res.status(404).json({ ok: false, message: '课程不存在' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: row.toJSON() });
  } catch (e) {
    if (e.message === 'NOT_FOUND') return res.status(404).json({ ok: false, message: '课程不存在' });
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: '课程代码已存在' });
    logger.error('Update course error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/courses/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await Enrollment.destroy({ where: { courseId: id } });
    await CourseTeacher.destroy({ where: { courseId: id } });
    const n = await Course.destroy({ where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '课程不存在' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete course error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = router;
