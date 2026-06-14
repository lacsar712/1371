const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const { Schedule, Course, Classroom } = require('../models');
const logger = require('../logger');

router.get('/', async (req, res) => {
  try {
    const list = await Schedule.findAll({
      order: [['id']],
      include: [
        { model: Course, as: 'course', attributes: ['id', 'code', 'name', 'capacity'] },
        { model: Classroom, as: 'classroom', attributes: ['id', 'building', 'roomNumber', 'capacity', 'isMultimedia'] },
      ],
    });
    const data = list.map((s) => {
      const obj = s.toJSON();
      obj.capacityWarning = s.classroom && s.course ? s.classroom.capacity < s.course.capacity : false;
      return obj;
    });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('List schedules error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

function periodsOverlap(s1, e1, s2, e2) {
  return s1 <= e2 && s2 <= e1;
}

async function checkConflicts(classroomId, dayOfWeek, startPeriod, endPeriod, excludeId = null) {
  const where = {
    classroomId,
    dayOfWeek,
    startPeriod: { [Op.lte]: endPeriod },
    endPeriod: { [Op.gte]: startPeriod },
  };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const conflicts = await Schedule.findAll({ where, include: [{ model: Course, as: 'course', attributes: ['id', 'code', 'name'] }] });
  return conflicts;
}

router.post('/check', async (req, res) => {
  const { classroomId, dayOfWeek, startPeriod, endPeriod, excludeId } = req.body;
  if (!classroomId || !dayOfWeek || !startPeriod || !endPeriod) {
    return res.status(400).json({ ok: false, message: '参数不完整' });
  }
  try {
    const conflicts = await checkConflicts(classroomId, dayOfWeek, startPeriod, endPeriod, excludeId || null);
    const classroom = await Classroom.findByPk(classroomId);
    let capacityWarning = null;
    if (req.body.courseCapacity && classroom && classroom.capacity < req.body.courseCapacity) {
      capacityWarning = {
        classroomCapacity: classroom.capacity,
        courseCapacity: req.body.courseCapacity,
        message: `教室容量(${classroom.capacity})小于课程容量(${req.body.courseCapacity})`,
      };
    }
    return res.set('Content-Type', 'application/json; charset=utf-8').json({
      ok: true,
      data: {
        hasConflict: conflicts.length > 0,
        conflicts: conflicts.map((c) => ({
          id: c.id,
          courseId: c.courseId,
          dayOfWeek: c.dayOfWeek,
          startPeriod: c.startPeriod,
          endPeriod: c.endPeriod,
          course: c.course,
        })),
        capacityWarning,
      },
    });
  } catch (e) {
    logger.error('Check schedule conflict error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const scheduleValidators = [
  body('courseId').isInt({ min: 1 }).withMessage('请选择课程'),
  body('classroomId').isInt({ min: 1 }).withMessage('请选择教室'),
  body('dayOfWeek').isInt({ min: 1, max: 7 }).withMessage('周几需在1-7之间'),
  body('startPeriod').isInt({ min: 1, max: 12 }).withMessage('开始节次需在1-12之间'),
  body('endPeriod').isInt({ min: 1, max: 12 }).withMessage('结束节次需在1-12之间'),
];

router.post('/', scheduleValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const { courseId, classroomId, dayOfWeek, startPeriod, endPeriod } = req.body;
  if (startPeriod > endPeriod) return res.status(400).json({ ok: false, message: '开始节次不能大于结束节次' });
  try {
    const conflicts = await checkConflicts(classroomId, dayOfWeek, startPeriod, endPeriod);
    if (conflicts.length > 0) {
      return res.status(409).json({
        ok: false,
        message: '该教室在此时段已有排课，存在冲突',
        conflicts: conflicts.map((c) => ({ id: c.id, courseId: c.courseId, courseName: c.course ? c.course.name : '' })),
      });
    }
    const course = await Course.findByPk(courseId);
    const classroom = await Classroom.findByPk(classroomId);
    if (!course) return res.status(400).json({ ok: false, message: '课程不存在' });
    if (!classroom) return res.status(400).json({ ok: false, message: '教室不存在' });
    const row = await Schedule.create({
      courseId,
      classroomId,
      dayOfWeek: Number(dayOfWeek),
      startPeriod: Number(startPeriod),
      endPeriod: Number(endPeriod),
    });
    const result = await Schedule.findByPk(row.id, {
      include: [
        { model: Course, as: 'course', attributes: ['id', 'code', 'name', 'capacity'] },
        { model: Classroom, as: 'classroom', attributes: ['id', 'building', 'roomNumber', 'capacity', 'isMultimedia'] },
      ],
    });
    const data = result.toJSON();
    data.capacityWarning = classroom.capacity < course.capacity;
    return res.status(201).set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Create schedule error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.put('/:id', param('id').isInt({ min: 1 }), scheduleValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  const { courseId, classroomId, dayOfWeek, startPeriod, endPeriod } = req.body;
  if (startPeriod > endPeriod) return res.status(400).json({ ok: false, message: '开始节次不能大于结束节次' });
  try {
    const conflicts = await checkConflicts(classroomId, dayOfWeek, startPeriod, endPeriod, id);
    if (conflicts.length > 0) {
      return res.status(409).json({
        ok: false,
        message: '该教室在此时段已有排课，存在冲突',
        conflicts: conflicts.map((c) => ({ id: c.id, courseId: c.courseId, courseName: c.course ? c.course.name : '' })),
      });
    }
    const [n] = await Schedule.update(
      { courseId, classroomId, dayOfWeek: Number(dayOfWeek), startPeriod: Number(startPeriod), endPeriod: Number(endPeriod) },
      { where: { id } }
    );
    if (n === 0) return res.status(404).json({ ok: false, message: '排课记录不存在' });
    const result = await Schedule.findByPk(id, {
      include: [
        { model: Course, as: 'course', attributes: ['id', 'code', 'name', 'capacity'] },
        { model: Classroom, as: 'classroom', attributes: ['id', 'building', 'roomNumber', 'capacity', 'isMultimedia'] },
      ],
    });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: result });
  } catch (e) {
    logger.error('Update schedule error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const n = await Schedule.destroy({ where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '排课记录不存在' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete schedule error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = router;
