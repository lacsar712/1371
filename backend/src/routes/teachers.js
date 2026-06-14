const express = require('express');
const { param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const { Teacher, Course, CourseTeacher, Enrollment, Student, sequelize, resolveSemesterId } = require('../models');
const logger = require('../logger');

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

router.get('/:id/courses', param('id').isInt({ min: 1 }).withMessage('无效的教师 ID'), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  const teacherId = parseInt(req.params.id, 10);
  try {
    const semesterId = await resolveSemesterId(req.query.semesterId);
    const courseWhere = {};
    if (semesterId) courseWhere.semesterId = semesterId;
    const rows = await CourseTeacher.findAll({
      where: { teacherId },
      include: [{ model: Course, as: 'Course', attributes: ['id', 'code', 'name', 'credit', 'capacity', 'semesterId'], where: courseWhere }],
      order: [['id', 'ASC']],
    });
    const enrollWhere = semesterId ? { semesterId } : {};
    const enrollCounts = await Enrollment.findAll({
      where: enrollWhere,
      attributes: ['courseId', [sequelize.fn('COUNT', sequelize.col('id')), 'enrolled']],
      group: ['courseId'],
      raw: true,
    });
    const countMap = Object.fromEntries(enrollCounts.map((r) => [r.courseId, Number(r.enrolled) || 0]));
    const data = rows.map((r) => ({
      ...r.Course.toJSON(),
      enrolled: countMap[r.Course.id] ?? 0,
    }));
    return sendJson(res, 200, { ok: true, data });
  } catch (e) {
    logger.error('Teacher courses error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

router.get(
  '/:id/courses/:courseId/students',
  param('id').isInt({ min: 1 }).withMessage('无效的教师 ID'),
  param('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const teacherId = parseInt(req.params.id, 10);
    const courseId = parseInt(req.params.courseId, 10);
    const keyword = (req.query.keyword || '').trim();
    try {
      const semesterId = await resolveSemesterId(req.query.semesterId);
      const teach = await CourseTeacher.findOne({ where: { teacherId, courseId } });
      if (!teach) return sendJson(res, 403, { ok: false, message: '您无权查看该课程的学生' });
      const where = { courseId };
      if (semesterId) where.semesterId = semesterId;
      let studentWhere = {};
      if (keyword) {
        studentWhere = {
          [Op.or]: [
            { name: { [Op.like]: `%${keyword}%` } },
            { studentNo: { [Op.like]: `%${keyword}%` } },
          ],
        };
      }
      const rows = await Enrollment.findAll({
        where,
        include: [{ model: Student, as: 'Student', where: studentWhere, attributes: ['id', 'studentNo', 'name'] }],
        order: [['enrolledAt', 'ASC']],
      });
      const data = rows.map((r) => ({
        studentId: r.Student.id,
        studentNo: r.Student.studentNo,
        name: r.Student.name,
        enrolledAt: r.enrolledAt,
      }));
      return sendJson(res, 200, { ok: true, data });
    } catch (e) {
      logger.error('Teacher course students error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/:id/courses/:courseId/students/export',
  param('id').isInt({ min: 1 }).withMessage('无效的教师 ID'),
  param('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const teacherId = parseInt(req.params.id, 10);
    const courseId = parseInt(req.params.courseId, 10);
    try {
      const semesterId = await resolveSemesterId(req.query.semesterId);
      const teach = await CourseTeacher.findOne({ where: { teacherId, courseId } });
      if (!teach) return sendJson(res, 403, { ok: false, message: '您无权导出该课程的学生' });
      const course = await Course.findByPk(courseId, { attributes: ['id', 'code', 'name'] });
      if (!course) return sendJson(res, 404, { ok: false, message: '课程不存在' });
      const where = { courseId };
      if (semesterId) where.semesterId = semesterId;
      const rows = await Enrollment.findAll({
        where,
        include: [{ model: Student, as: 'Student', attributes: ['id', 'studentNo', 'name'] }],
        order: [['enrolledAt', 'ASC']],
      });
      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '';
        const s = String(val);
        if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };
      const header = ['学号', '姓名', '选课时间'];
      const lines = [header.join(',')];
      for (const r of rows) {
        const enrolledAt = r.enrolledAt ? new Date(r.enrolledAt).toLocaleString('zh-CN', { hour12: false }) : '';
        lines.push([escapeCsv(r.Student.studentNo), escapeCsv(r.Student.name), escapeCsv(enrolledAt)].join(','));
      }
      const bom = '\uFEFF';
      const csvContent = bom + lines.join('\r\n');
      const filename = encodeURIComponent(`${course.code}_${course.name}_学生名单.csv`);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(200).send(csvContent);
    } catch (e) {
      logger.error('Teacher export students error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

module.exports = router;
