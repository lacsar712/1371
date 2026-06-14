const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const { College, Major, ClassInfo, Student } = require('../models');
const logger = require('../logger');

// ========== 学院管理 ==========
router.get('/colleges', async (req, res) => {
  try {
    const list = await College.findAll({ order: [['id']] });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({
      ok: true,
      data: list.map((c) => ({ id: c.id, name: c.name })),
    });
  } catch (e) {
    logger.error('List colleges error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.post('/colleges', body('name').trim().notEmpty().withMessage('学院名称不能为空'), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const { name } = req.body;
  try {
    const row = await College.create({ name: name.trim() });
    return res.status(201).set('Content-Type', 'application/json; charset=utf-8').json({
      ok: true,
      data: { id: row.id, name: row.name },
    });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: '学院名称已存在' });
    logger.error('Create college error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.put('/colleges/:id', param('id').isInt({ min: 1 }), body('name').trim().notEmpty().withMessage('学院名称不能为空'), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  const { name } = req.body;
  try {
    const [n] = await College.update({ name: name.trim() }, { where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '学院不存在' });
    const updated = await College.findByPk(id, { attributes: ['id', 'name'] });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: updated });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ ok: false, message: '学院名称已存在' });
    logger.error('Rename college error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/colleges/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const majorCount = await Major.count({ where: { collegeId: id } });
    if (majorCount > 0) {
      return res.status(400).json({
        ok: false,
        message: `该学院下存在 ${majorCount} 个专业，请先删除或迁移专业`,
        cascade: { majors: majorCount },
      });
    }
    const n = await College.destroy({ where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '学院不存在' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete college error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

// ========== 专业管理 ==========
router.get('/majors', async (req, res) => {
  try {
    const collegeId = req.query.collegeId ? parseInt(req.query.collegeId, 10) : null;
    const where = {};
    if (collegeId) where.collegeId = collegeId;
    const list = await Major.findAll({ where, order: [['id']], include: [{ model: College, as: 'college', attributes: ['id', 'name'] }] });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({
      ok: true,
      data: list.map((m) => ({
        id: m.id,
        name: m.name,
        collegeId: m.collegeId,
        collegeName: m.college ? m.college.name : null,
      })),
    });
  } catch (e) {
    logger.error('List majors error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.post('/majors', [
  body('name').trim().notEmpty().withMessage('专业名称不能为空'),
  body('collegeId').isInt({ min: 1 }).withMessage('请选择所属学院'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const { name, collegeId } = req.body;
  try {
    const college = await College.findByPk(collegeId);
    if (!college) return res.status(400).json({ ok: false, message: '所属学院不存在' });
    const row = await Major.create({ name: name.trim(), collegeId: parseInt(collegeId, 10) });
    return res.status(201).set('Content-Type', 'application/json; charset=utf-8').json({
      ok: true,
      data: { id: row.id, name: row.name, collegeId: row.collegeId },
    });
  } catch (e) {
    logger.error('Create major error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.put('/majors/:id', [
  param('id').isInt({ min: 1 }),
  body('name').trim().notEmpty().withMessage('专业名称不能为空'),
  body('collegeId').optional().isInt({ min: 1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  const { name, collegeId } = req.body;
  try {
    const updates = { name: name.trim() };
    if (collegeId) {
      const college = await College.findByPk(collegeId);
      if (!college) return res.status(400).json({ ok: false, message: '所属学院不存在' });
      updates.collegeId = parseInt(collegeId, 10);
    }
    const [n] = await Major.update(updates, { where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '专业不存在' });
    const updated = await Major.findByPk(id, { attributes: ['id', 'name', 'collegeId'] });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: updated });
  } catch (e) {
    logger.error('Rename major error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/majors/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const classCount = await ClassInfo.count({ where: { majorId: id } });
    if (classCount > 0) {
      return res.status(400).json({
        ok: false,
        message: `该专业下存在 ${classCount} 个班级，请先删除或迁移班级`,
        cascade: { classes: classCount },
      });
    }
    const n = await Major.destroy({ where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '专业不存在' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete major error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

// ========== 班级管理 ==========
router.get('/classes', async (req, res) => {
  try {
    const majorId = req.query.majorId ? parseInt(req.query.majorId, 10) : null;
    const where = {};
    if (majorId) where.majorId = majorId;
    const list = await ClassInfo.findAll({
      where,
      order: [['id']],
      include: [
        { model: Major, as: 'major', attributes: ['id', 'name'], include: [{ model: College, as: 'college', attributes: ['id', 'name'] }] },
      ],
    });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({
      ok: true,
      data: list.map((c) => ({
        id: c.id,
        name: c.name,
        majorId: c.majorId,
        majorName: c.major ? c.major.name : null,
        collegeId: c.major && c.major.college ? c.major.college.id : null,
        collegeName: c.major && c.major.college ? c.major.college.name : null,
      })),
    });
  } catch (e) {
    logger.error('List classes error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.post('/classes', [
  body('name').trim().notEmpty().withMessage('班级名称不能为空'),
  body('majorId').isInt({ min: 1 }).withMessage('请选择所属专业'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const { name, majorId } = req.body;
  try {
    const major = await Major.findByPk(majorId);
    if (!major) return res.status(400).json({ ok: false, message: '所属专业不存在' });
    const row = await ClassInfo.create({ name: name.trim(), majorId: parseInt(majorId, 10) });
    return res.status(201).set('Content-Type', 'application/json; charset=utf-8').json({
      ok: true,
      data: { id: row.id, name: row.name, majorId: row.majorId },
    });
  } catch (e) {
    logger.error('Create class error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.put('/classes/:id', [
  param('id').isInt({ min: 1 }),
  body('name').trim().notEmpty().withMessage('班级名称不能为空'),
  body('majorId').optional().isInt({ min: 1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  const { name, majorId } = req.body;
  try {
    const updates = { name: name.trim() };
    if (majorId) {
      const major = await Major.findByPk(majorId);
      if (!major) return res.status(400).json({ ok: false, message: '所属专业不存在' });
      updates.majorId = parseInt(majorId, 10);
    }
    const [n] = await ClassInfo.update(updates, { where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '班级不存在' });
    const updated = await ClassInfo.findByPk(id, { attributes: ['id', 'name', 'majorId'] });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: updated });
  } catch (e) {
    logger.error('Rename class error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/classes/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const studentCount = await Student.count({ where: { classId: id } });
    if (studentCount > 0) {
      return res.status(400).json({
        ok: false,
        message: `该班级下存在 ${studentCount} 名学生，请先删除或迁移学生`,
        cascade: { students: studentCount },
      });
    }
    const n = await ClassInfo.destroy({ where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '班级不存在' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete class error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

// ========== 班级学生查询 ==========
router.get('/classes/:id/students', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const cls = await ClassInfo.findByPk(id);
    if (!cls) return res.status(404).json({ ok: false, message: '班级不存在' });
    const students = await Student.findAll({
      where: { classId: id },
      order: [['id']],
      attributes: ['id', 'studentNo', 'name'],
    });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: students });
  } catch (e) {
    logger.error('List class students error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

// ========== 学生调班 ==========
router.post('/students/:studentId/move', [
  param('studentId').isInt({ min: 1 }),
  body('classId').isInt({ min: 1 }).withMessage('请选择目标班级'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const studentId = parseInt(req.params.studentId, 10);
  const classId = parseInt(req.body.classId, 10);
  try {
    const student = await Student.findByPk(studentId);
    if (!student) return res.status(404).json({ ok: false, message: '学生不存在' });
    const cls = await ClassInfo.findByPk(classId);
    if (!cls) return res.status(400).json({ ok: false, message: '目标班级不存在' });
    await Student.update({ classId }, { where: { id: studentId } });
    const updated = await Student.findByPk(studentId, { attributes: ['id', 'studentNo', 'name', 'classId'] });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: updated, message: '调班成功' });
  } catch (e) {
    logger.error('Move student error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

// ========== 整树查询 ==========
router.get('/tree', async (req, res) => {
  try {
    const colleges = await College.findAll({
      order: [['id']],
      include: [
        {
          model: Major,
          as: 'majors',
          order: [['id']],
          include: [
            {
              model: ClassInfo,
              as: 'classes',
              order: [['id']],
              include: [
                {
                  model: Student,
                  as: 'students',
                  order: [['id']],
                  attributes: ['id', 'studentNo', 'name'],
                },
              ],
            },
          ],
        },
      ],
    });

    const tree = colleges.map((college) => ({
      id: college.id,
      type: 'college',
      name: college.name,
      children: (college.majors || []).map((major) => ({
        id: major.id,
        type: 'major',
        name: major.name,
        collegeId: college.id,
        children: (major.classes || []).map((cls) => ({
          id: cls.id,
          type: 'class',
          name: cls.name,
          majorId: major.id,
          collegeId: college.id,
          children: (cls.students || []).map((stu) => ({
            id: stu.id,
            type: 'student',
            name: stu.name,
            studentNo: stu.studentNo,
            classId: cls.id,
          })),
        })),
      })),
    }));

    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: tree });
  } catch (e) {
    logger.error('Get org tree error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = router;
