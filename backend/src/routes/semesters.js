const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const { Semester, Course, Enrollment, sequelize } = require('../models');
const logger = require('../logger');

router.get('/', async (req, res) => {
  try {
    const list = await Semester.findAll({ order: [['id']] });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: list });
  } catch (e) {
    logger.error('List semesters error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get('/current', async (req, res) => {
  try {
    const current = await Semester.findOne({ where: { isCurrent: true } });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: current });
  } catch (e) {
    logger.error('Get current semester error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const semesterValidators = [
  body('academicYear').trim().notEmpty().withMessage('学年不能为空'),
  body('semesterNumber').isInt({ min: 1, max: 4 }).withMessage('学期序号需在1-4之间'),
  body('startDate').isISO8601().withMessage('开始日期格式错误'),
  body('endDate').isISO8601().withMessage('结束日期格式错误'),
];

router.post('/', semesterValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const { academicYear, semesterNumber, startDate, endDate, isCurrent } = req.body;
  if (new Date(startDate) >= new Date(endDate)) {
    return res.status(400).json({ ok: false, message: '开始日期必须早于结束日期' });
  }
  const t = await sequelize.transaction();
  try {
    if (isCurrent) {
      await Semester.update({ isCurrent: false }, { where: { isCurrent: true }, transaction: t });
    }
    const row = await Semester.create({
      academicYear: academicYear.trim(),
      semesterNumber: Number(semesterNumber),
      startDate,
      endDate,
      isCurrent: !!isCurrent,
    }, { transaction: t });
    await t.commit();
    return res.status(201).set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: row });
  } catch (e) {
    await t.rollback();
    if (e.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ ok: false, message: '该学年学期已存在' });
    }
    logger.error('Create semester error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.put('/:id', [param('id').isInt({ min: 1 }), ...semesterValidators], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  const { academicYear, semesterNumber, startDate, endDate, isCurrent } = req.body;
  if (new Date(startDate) >= new Date(endDate)) {
    return res.status(400).json({ ok: false, message: '开始日期必须早于结束日期' });
  }
  const t = await sequelize.transaction();
  try {
    const existing = await Semester.findByPk(id, { transaction: t });
    if (!existing) {
      await t.rollback();
      return res.status(404).json({ ok: false, message: '学期不存在' });
    }
    if (isCurrent) {
      await Semester.update({ isCurrent: false }, { where: { isCurrent: true, id: { [require('sequelize').Op.ne]: id } }, transaction: t });
    }
    await Semester.update({
      academicYear: academicYear.trim(),
      semesterNumber: Number(semesterNumber),
      startDate,
      endDate,
      isCurrent: isCurrent !== undefined ? !!isCurrent : existing.isCurrent,
    }, { where: { id }, transaction: t });
    await t.commit();
    const updated = await Semester.findByPk(id);
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: updated });
  } catch (e) {
    await t.rollback();
    if (e.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ ok: false, message: '该学年学期已存在' });
    }
    logger.error('Update semester error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const semester = await Semester.findByPk(id);
    if (!semester) return res.status(404).json({ ok: false, message: '学期不存在' });
    if (semester.isCurrent) return res.status(400).json({ ok: false, message: '不能删除当前学期，请先切换当前学期' });
    const courseCount = await Course.count({ where: { semesterId: id } });
    if (courseCount > 0) {
      return res.status(400).json({
        ok: false,
        message: `该学期下存在 ${courseCount} 门课程，请先处理相关课程`,
        cascade: { courses: courseCount },
      });
    }
    const n = await Semester.destroy({ where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '学期不存在' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete semester error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.post('/:id/set-current', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const t = await sequelize.transaction();
  try {
    const semester = await Semester.findByPk(id, { transaction: t });
    if (!semester) {
      await t.rollback();
      return res.status(404).json({ ok: false, message: '学期不存在' });
    }
    await Semester.update({ isCurrent: false }, { where: { isCurrent: true }, transaction: t });
    await Semester.update({ isCurrent: true }, { where: { id }, transaction: t });
    await t.commit();
    const updated = await Semester.findByPk(id);
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: updated });
  } catch (e) {
    await t.rollback();
    logger.error('Set current semester error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get('/:id/impact', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const semester = await Semester.findByPk(id);
    if (!semester) return res.status(404).json({ ok: false, message: '学期不存在' });
    const currentSemester = await Semester.findOne({ where: { isCurrent: true } });
    if (!currentSemester || currentSemester.id === id) {
      return res.set('Content-Type', 'application/json; charset=utf-8').json({
        ok: true,
        data: { courses: 0, enrollments: 0, isCurrentTarget: currentSemester && currentSemester.id === id },
      });
    }
    const currentCourses = await Course.count({ where: { semesterId: currentSemester.id } });
    const currentEnrollments = await Enrollment.count({ where: { semesterId: currentSemester.id } });
    const targetCourses = await Course.count({ where: { semesterId: id } });
    const targetEnrollments = await Enrollment.count({ where: { semesterId: id } });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({
      ok: true,
      data: {
        currentSemesterId: currentSemester.id,
        currentSemesterLabel: `${currentSemester.academicYear} 第${currentSemester.semesterNumber}学期`,
        targetSemesterId: id,
        targetSemesterLabel: `${semester.academicYear} 第${semester.semesterNumber}学期`,
        coursesLeavingDefault: currentCourses,
        enrollmentsLeavingDefault: currentEnrollments,
        coursesEnteringDefault: targetCourses,
        enrollmentsEnteringDefault: targetEnrollments,
      },
    });
  } catch (e) {
    logger.error('Get semester impact error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = router;
