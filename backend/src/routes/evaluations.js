const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const {
  CourseEvaluation,
  Student,
  Course,
  Enrollment,
  sequelize,
} = require('../models');
const logger = require('../logger');

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

router.post(
  '/',
  body('studentId').isInt({ min: 1 }).withMessage('无效的学生 ID'),
  body('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('评分必须在 1-5 之间'),
  body('comment').optional().isString().withMessage('评论必须是文本'),
  body('isAnonymous').optional().isBoolean().withMessage('匿名标志必须是布尔值'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const { studentId, courseId, rating, comment = '', isAnonymous = false } = req.body;
    try {
      const enrollment = await Enrollment.findOne({ where: { studentId, courseId } });
      if (!enrollment) return sendJson(res, 403, { ok: false, message: '您未选过该课程，无法评教' });
      const existing = await CourseEvaluation.findOne({ where: { studentId, courseId } });
      if (existing) return sendJson(res, 400, { ok: false, message: '您已评价过该课程' });
      const evaluation = await CourseEvaluation.create({
        studentId,
        courseId,
        rating,
        comment,
        isAnonymous,
      });
      return sendJson(res, 201, { ok: true, message: '评教提交成功', data: { id: evaluation.id } });
    } catch (e) {
      if (e.name === 'SequelizeUniqueConstraintError') {
        return sendJson(res, 400, { ok: false, message: '您已评价过该课程' });
      }
      logger.error('Submit evaluation error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/student/:studentId',
  param('studentId').isInt({ min: 1 }).withMessage('无效的学生 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const studentId = parseInt(req.params.studentId, 10);
    try {
      const rows = await CourseEvaluation.findAll({
        where: { studentId },
        attributes: ['id', 'courseId', 'rating', 'comment', 'isAnonymous', 'createdAt'],
        include: [{ model: Course, as: 'course', attributes: ['id', 'code', 'name'] }],
        order: [['createdAt', 'DESC']],
      });
      const data = rows.map((r) => ({
        id: r.id,
        courseId: r.courseId,
        courseCode: r.course ? r.course.code : '',
        courseName: r.course ? r.course.name : '',
        rating: r.rating,
        comment: r.comment,
        isAnonymous: r.isAnonymous,
        createdAt: r.createdAt,
      }));
      const evaluatedCourseIds = rows.map((r) => r.courseId);
      return sendJson(res, 200, { ok: true, data, evaluatedCourseIds });
    } catch (e) {
      logger.error('Get student evaluations error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/course/:courseId/summary',
  param('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const courseId = parseInt(req.params.courseId, 10);
    try {
      const rows = await CourseEvaluation.findAll({
        where: { courseId },
        include: [{ model: Student, as: 'student', attributes: ['id', 'studentNo', 'name'] }],
        order: [['createdAt', 'DESC']],
      });
      if (!rows.length) {
        return sendJson(res, 200, {
          ok: true,
          data: {
            courseId,
            averageRating: 0,
            totalCount: 0,
            distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            comments: [],
          },
        });
      }
      let totalRating = 0;
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const comments = [];
      for (const r of rows) {
        totalRating += r.rating;
        distribution[r.rating] = (distribution[r.rating] || 0) + 1;
        comments.push({
          id: r.id,
          rating: r.rating,
          comment: r.comment || '',
          isAnonymous: r.isAnonymous,
          studentNo: r.isAnonymous ? '匿名学生' : (r.student ? r.student.studentNo : ''),
          studentName: r.isAnonymous ? '匿名学生' : (r.student ? r.student.name : ''),
          createdAt: r.createdAt,
        });
      }
      const averageRating = Math.round((totalRating / rows.length) * 100) / 100;
      return sendJson(res, 200, {
        ok: true,
        data: {
          courseId,
          averageRating,
          totalCount: rows.length,
          distribution,
          comments,
        },
      });
    } catch (e) {
      logger.error('Get course evaluation summary error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/admin/course/:courseId',
  param('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const courseId = parseInt(req.params.courseId, 10);
    try {
      const rows = await CourseEvaluation.findAll({
        where: { courseId },
        include: [{ model: Student, as: 'student', attributes: ['id', 'studentNo', 'name'] }],
        order: [['createdAt', 'DESC']],
      });
      const data = rows.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        studentNo: r.student ? r.student.studentNo : '',
        studentName: r.student ? r.student.name : '',
        courseId: r.courseId,
        rating: r.rating,
        comment: r.comment || '',
        isAnonymous: r.isAnonymous,
        createdAt: r.createdAt,
      }));
      return sendJson(res, 200, { ok: true, data });
    } catch (e) {
      logger.error('Admin get course evaluations error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/admin/courses',
  async (req, res) => {
    try {
      const results = await CourseEvaluation.findAll({
        attributes: [
          'courseId',
          [sequelize.fn('COUNT', sequelize.col('CourseEvaluation.id')), 'evaluationCount'],
          [sequelize.fn('AVG', sequelize.col('rating')), 'avgRating'],
        ],
        group: ['courseId'],
        include: [{ model: Course, as: 'course', attributes: ['id', 'code', 'name'] }],
        raw: true,
      });
      const data = results.map((r) => ({
        courseId: r.courseId,
        courseCode: r['course.code'] || (r.course && r.course.code) || '',
        courseName: r['course.name'] || (r.course && r.course.name) || '',
        evaluationCount: parseInt(r.evaluationCount, 10) || 0,
        avgRating: r.avgRating ? Math.round(parseFloat(r.avgRating) * 100) / 100 : 0,
      }));
      return sendJson(res, 200, { ok: true, data });
    } catch (e) {
      logger.error('Admin get evaluation overview error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

module.exports = router;
