const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const { resolveSemesterId } = require('../models');
const { getStudentCourses, enrollStudent, dropCourse } = require('../services/enrollmentService');
const logger = require('../logger');

router.get('/:id/courses', param('id').isInt({ min: 1 }).withMessage('无效的学生 ID'), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const studentId = parseInt(req.params.id, 10);
  try {
    const semesterId = await resolveSemesterId(req.query.semesterId);
    const data = await getStudentCourses(studentId, semesterId);
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data });
  } catch (e) {
    logger.error('Student courses error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const enrollValidators = [
  param('id').isInt({ min: 1 }).withMessage('无效的学生 ID'),
  body('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
];

router.post('/:id/enroll', enrollValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const studentId = parseInt(req.params.id, 10);
  const courseId = parseInt(req.body.courseId, 10);
  try {
    const result = await enrollStudent(studentId, courseId);
    return res.status(result.status).set('Content-Type', 'application/json; charset=utf-8').json({ ok: result.ok, message: result.message });
  } catch (e) {
    logger.error('Enroll error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/:id/enroll/:courseId', param('id').isInt({ min: 1 }), param('courseId').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const studentId = parseInt(req.params.id, 10);
  const courseId = parseInt(req.params.courseId, 10);
  try {
    const semesterId = await resolveSemesterId(req.query.semesterId);
    const result = await dropCourse(studentId, courseId, semesterId);
    return res.status(result.status).set('Content-Type', 'application/json; charset=utf-8').json({ ok: result.ok, message: result.message });
  } catch (e) {
    logger.error('Drop course error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = router;
