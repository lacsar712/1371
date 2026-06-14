const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const {
  Grade,
  Student,
  Course,
  Teacher,
  CourseTeacher,
  Enrollment,
  Semester,
  sequelize,
  resolveSemesterId,
} = require('../models');
const logger = require('../logger');

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

function calculateGrade(totalScore) {
  if (totalScore === null || totalScore === undefined) return null;
  if (totalScore >= 90) return 'A';
  if (totalScore >= 80) return 'B';
  if (totalScore >= 70) return 'C';
  if (totalScore >= 60) return 'D';
  return 'F';
}

function calculateTotalScore(regularScore, finalScore) {
  const regular = regularScore !== null && regularScore !== undefined ? Number(regularScore) : null;
  const final = finalScore !== null && finalScore !== undefined ? Number(finalScore) : null;
  if (regular === null && final === null) return null;
  let total = 0;
  let hasValue = false;
  if (regular !== null) {
    total += regular * 0.4;
    hasValue = true;
  }
  if (final !== null) {
    total += final * 0.6;
    hasValue = true;
  }
  return hasValue ? Math.round(total * 100) / 100 : null;
}

function gpaFromGrade(grade) {
  switch (grade) {
    case 'A': return 4.0;
    case 'B': return 3.0;
    case 'C': return 2.0;
    case 'D': return 1.0;
    case 'F': return 0.0;
    default: return null;
  }
}

function validateScore(value) {
  if (value === null || value === undefined || value === '') return true;
  const num = Number(value);
  if (Number.isNaN(num)) return false;
  return num >= 0 && num <= 100;
}

router.get(
  '/teacher/:teacherId/courses/:courseId/grades',
  param('teacherId').isInt({ min: 1 }).withMessage('无效的教师 ID'),
  param('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const teacherId = parseInt(req.params.teacherId, 10);
    const courseId = parseInt(req.params.courseId, 10);
    try {
      const semesterId = await resolveSemesterId(req.query.semesterId);
      const teach = await CourseTeacher.findOne({ where: { teacherId, courseId } });
      if (!teach) return sendJson(res, 403, { ok: false, message: '您无权查看该课程的成绩' });
      const course = await Course.findByPk(courseId, { attributes: ['id', 'code', 'name', 'credit', 'semesterId'] });
      if (!course) return sendJson(res, 404, { ok: false, message: '课程不存在' });
      const semId = semesterId || course.semesterId;
      const where = { courseId };
      if (semId) where.semesterId = semId;
      const enrollmentRows = await Enrollment.findAll({
        where,
        include: [{ model: Student, as: 'Student', attributes: ['id', 'studentNo', 'name'] }],
        order: [['enrolledAt', 'ASC']],
      });
      const gradeWhere = { courseId };
      if (semId) gradeWhere.semesterId = semId;
      const gradeRows = await Grade.findAll({ where: gradeWhere, raw: true });
      const gradeMap = new Map();
      for (const g of gradeRows) {
        gradeMap.set(g.student_id, g);
      }
      const data = enrollmentRows.map((r) => {
        const grade = gradeMap.get(r.Student.id) || {};
        return {
          studentId: r.Student.id,
          studentNo: r.Student.studentNo,
          name: r.Student.name,
          regularScore: grade.regular_score !== undefined ? grade.regular_score : null,
          finalScore: grade.final_score !== undefined ? grade.final_score : null,
          totalScore: grade.total_score !== undefined ? grade.total_score : null,
          grade: grade.grade !== undefined ? grade.grade : null,
          enrolledAt: r.enrolledAt,
        };
      });
      return sendJson(res, 200, { ok: true, data });
    } catch (e) {
      logger.error('Teacher course grades error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.post(
  '/teacher/:teacherId/courses/:courseId/grades/batch',
  param('teacherId').isInt({ min: 1 }).withMessage('无效的教师 ID'),
  param('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
  body('grades').isArray({ min: 1 }).withMessage('成绩数据不能为空'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const teacherId = parseInt(req.params.teacherId, 10);
    const courseId = parseInt(req.params.courseId, 10);
    const gradesInput = req.body.grades || [];
    try {
      const semesterId = await resolveSemesterId(req.query.semesterId);
      const teach = await CourseTeacher.findOne({ where: { teacherId, courseId } });
      if (!teach) return sendJson(res, 403, { ok: false, message: '您无权录入该课程的成绩' });
      const course = await Course.findByPk(courseId, { attributes: ['id', 'semesterId'] });
      if (!course) return sendJson(res, 404, { ok: false, message: '课程不存在' });
      const semId = semesterId || course.semesterId;
      for (let i = 0; i < gradesInput.length; i++) {
        const g = gradesInput[i];
        if (!g.studentId) {
          return sendJson(res, 400, { ok: false, message: `第 ${i + 1} 条记录缺少学生 ID` });
        }
        if (!validateScore(g.regularScore)) {
          return sendJson(res, 400, { ok: false, message: `第 ${i + 1} 条记录平时分必须在 0-100 之间` });
        }
        if (!validateScore(g.finalScore)) {
          return sendJson(res, 400, { ok: false, message: `第 ${i + 1} 条记录期末分必须在 0-100 之间` });
        }
      }
      const validStudentIds = gradesInput.map((g) => g.studentId);
      const enrollments = await Enrollment.findAll({
        where: { courseId, semesterId: semId, studentId: { [Op.in]: validStudentIds } },
        attributes: ['studentId'],
        raw: true,
      });
      const enrolledStudentIds = new Set(enrollments.map((e) => e.studentId));
      const now = new Date();
      const results = [];
      for (const g of gradesInput) {
        if (!enrolledStudentIds.has(g.studentId)) continue;
        const regularScore = g.regularScore !== '' && g.regularScore !== null && g.regularScore !== undefined
          ? Number(g.regularScore)
          : null;
        const finalScore = g.finalScore !== '' && g.finalScore !== null && g.finalScore !== undefined
          ? Number(g.finalScore)
          : null;
        const totalScore = calculateTotalScore(regularScore, finalScore);
        const gradeLetter = totalScore !== null ? calculateGrade(totalScore) : null;
        const [grade, created] = await Grade.findOrCreate({
          where: { studentId: g.studentId, courseId, semesterId: semId },
          defaults: {
            studentId: g.studentId,
            courseId,
            semesterId: semId,
            regularScore,
            finalScore,
            totalScore,
            grade: gradeLetter,
            enteredBy: teacherId,
            enteredAt: now,
          },
        });
        if (!created) {
          await grade.update({
            regularScore,
            finalScore,
            totalScore,
            grade: gradeLetter,
            enteredBy: teacherId,
            enteredAt: now,
          });
        }
        results.push({
          studentId: g.studentId,
          regularScore,
          finalScore,
          totalScore,
          grade: gradeLetter,
        });
      }
      return sendJson(res, 200, { ok: true, message: `成功保存 ${results.length} 条成绩记录`, data: results });
    } catch (e) {
      logger.error('Batch save grades error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.post(
  '/teacher/:teacherId/courses/:courseId/grades/import',
  param('teacherId').isInt({ min: 1 }).withMessage('无效的教师 ID'),
  param('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
  body('rows').isArray({ min: 1 }).withMessage('导入数据不能为空'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const teacherId = parseInt(req.params.teacherId, 10);
    const courseId = parseInt(req.params.courseId, 10);
    const rows = req.body.rows || [];
    try {
      const semesterId = await resolveSemesterId(req.query.semesterId);
      const teach = await CourseTeacher.findOne({ where: { teacherId, courseId } });
      if (!teach) return sendJson(res, 403, { ok: false, message: '您无权导入该课程的成绩' });
      const course = await Course.findByPk(courseId, { attributes: ['id', 'semesterId'] });
      if (!course) return sendJson(res, 404, { ok: false, message: '课程不存在' });
      const semId = semesterId || course.semesterId;
      const studentNos = rows.map((r) => String(r.studentNo || r['学号'] || '')).filter(Boolean);
      if (!studentNos.length) {
        return sendJson(res, 400, { ok: false, message: '未找到有效的学号信息' });
      }
      const students = await Student.findAll({
        where: { studentNo: { [Op.in]: studentNos } },
        attributes: ['id', 'studentNo'],
        raw: true,
      });
      const studentNoMap = new Map(students.map((s) => [s.studentNo, s.id]));
      const enrollments = await Enrollment.findAll({
        where: { courseId, semesterId: semId },
        attributes: ['studentId'],
        raw: true,
      });
      const enrolledStudentIds = new Set(enrollments.map((e) => e.studentId));
      const gradesInput = [];
      const errors_list = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const studentNo = String(row.studentNo || row['学号'] || '').trim();
        const regularScoreRaw = row.regularScore !== undefined ? row.regularScore : row['平时分'];
        const finalScoreRaw = row.finalScore !== undefined ? row.finalScore : row['期末分'];
        if (!studentNo) {
          errors_list.push(`第 ${i + 1} 行：学号不能为空`);
          continue;
        }
        const studentId = studentNoMap.get(studentNo);
        if (!studentId) {
          errors_list.push(`第 ${i + 1} 行：学号 ${studentNo} 不存在`);
          continue;
        }
        if (!enrolledStudentIds.has(studentId)) {
          errors_list.push(`第 ${i + 1} 行：学号 ${studentNo} 未选该课程`);
          continue;
        }
        const regularScore = regularScoreRaw === '' || regularScoreRaw === null || regularScoreRaw === undefined
          ? null
          : Number(regularScoreRaw);
        const finalScore = finalScoreRaw === '' || finalScoreRaw === null || finalScoreRaw === undefined
          ? null
          : Number(finalScoreRaw);
        if (regularScore !== null && (Number.isNaN(regularScore) || regularScore < 0 || regularScore > 100)) {
          errors_list.push(`第 ${i + 1} 行：平时分必须在 0-100 之间`);
          continue;
        }
        if (finalScore !== null && (Number.isNaN(finalScore) || finalScore < 0 || finalScore > 100)) {
          errors_list.push(`第 ${i + 1} 行：期末分必须在 0-100 之间`);
          continue;
        }
        gradesInput.push({ studentId, regularScore, finalScore });
      }
      if (errors_list.length && !gradesInput.length) {
        return sendJson(res, 400, { ok: false, message: errors_list[0], errors: errors_list });
      }
      const now = new Date();
      let savedCount = 0;
      for (const g of gradesInput) {
        const totalScore = calculateTotalScore(g.regularScore, g.finalScore);
        const gradeLetter = totalScore !== null ? calculateGrade(totalScore) : null;
        const [grade, created] = await Grade.findOrCreate({
          where: { studentId: g.studentId, courseId, semesterId: semId },
          defaults: {
            studentId: g.studentId,
            courseId,
            semesterId: semId,
            regularScore: g.regularScore,
            finalScore: g.finalScore,
            totalScore,
            grade: gradeLetter,
            enteredBy: teacherId,
            enteredAt: now,
          },
        });
        if (!created) {
          await grade.update({
            regularScore: g.regularScore,
            finalScore: g.finalScore,
            totalScore,
            grade: gradeLetter,
            enteredBy: teacherId,
            enteredAt: now,
          });
        }
        savedCount++;
      }
      return sendJson(res, 200, {
        ok: true,
        message: `成功导入 ${savedCount} 条成绩记录${errors_list.length ? `，${errors_list.length} 条警告` : ''}`,
        savedCount,
        warnings: errors_list,
      });
    } catch (e) {
      logger.error('Import grades error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/teacher/:teacherId/courses/:courseId/grades/template',
  param('teacherId').isInt({ min: 1 }).withMessage('无效的教师 ID'),
  param('courseId').isInt({ min: 1 }).withMessage('无效的课程 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const teacherId = parseInt(req.params.teacherId, 10);
    const courseId = parseInt(req.params.courseId, 10);
    try {
      const semesterId = await resolveSemesterId(req.query.semesterId);
      const teach = await CourseTeacher.findOne({ where: { teacherId, courseId } });
      if (!teach) return sendJson(res, 403, { ok: false, message: '您无权下载该课程的模板' });
      const course = await Course.findByPk(courseId, { attributes: ['id', 'code', 'name', 'semesterId'] });
      if (!course) return sendJson(res, 404, { ok: false, message: '课程不存在' });
      const semId = semesterId || course.semesterId;
      const enrollments = await Enrollment.findAll({
        where: { courseId, semesterId: semId },
        include: [{ model: Student, as: 'Student', attributes: ['id', 'studentNo', 'name'] }],
        order: [['enrolledAt', 'ASC']],
      });
      const gradeWhere = { courseId };
      if (semId) gradeWhere.semesterId = semId;
      const gradeRows = await Grade.findAll({ where: gradeWhere, raw: true });
      const gradeMap = new Map();
      for (const g of gradeRows) {
        gradeMap.set(g.student_id, g);
      }
      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '';
        const s = String(val);
        if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };
      const header = ['学号', '姓名', '平时分', '期末分', '综合分', '等级'];
      const lines = [header.join(',')];
      for (const e of enrollments) {
        const grade = gradeMap.get(e.Student.id) || {};
        lines.push([
          escapeCsv(e.Student.studentNo),
          escapeCsv(e.Student.name),
          grade.regular_score !== undefined && grade.regular_score !== null ? grade.regular_score : '',
          grade.final_score !== undefined && grade.final_score !== null ? grade.final_score : '',
          grade.total_score !== undefined && grade.total_score !== null ? grade.total_score : '',
          grade.grade || '',
        ].join(','));
      }
      const bom = '\uFEFF';
      const csvContent = bom + lines.join('\r\n');
      const filename = encodeURIComponent(`${course.code}_${course.name}_成绩模板.csv`);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(200).send(csvContent);
    } catch (e) {
      logger.error('Grade template error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/student/:studentId/grades',
  param('studentId').isInt({ min: 1 }).withMessage('无效的学生 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const studentId = parseInt(req.params.studentId, 10);
    const semesterId = req.query.semesterId ? parseInt(req.query.semesterId, 10) : null;
    const gradeFilter = req.query.grade ? String(req.query.grade).toUpperCase() : null;
    try {
      const where = { studentId };
      if (semesterId) where.semesterId = semesterId;
      if (gradeFilter && ['A', 'B', 'C', 'D', 'F'].includes(gradeFilter)) {
        where.grade = gradeFilter;
      }
      const rows = await Grade.findAll({
        where,
        include: [
          { model: Course, as: 'course', attributes: ['id', 'code', 'name', 'credit'] },
          { model: Semester, as: 'semester', attributes: ['id', 'academicYear', 'semesterNumber'] },
        ],
        order: [['semesterId', 'DESC'], ['id', 'ASC']],
      });
      const data = rows.map((r) => ({
        id: r.id,
        courseId: r.courseId,
        courseCode: r.course ? r.course.code : '',
        courseName: r.course ? r.course.name : '',
        credit: r.course ? r.course.credit : 0,
        semesterId: r.semesterId,
        semesterName: r.semester ? `${r.semester.academicYear} 第${r.semester.semesterNumber}学期` : '',
        regularScore: r.regularScore,
        finalScore: r.finalScore,
        totalScore: r.totalScore,
        grade: r.grade,
        enteredAt: r.enteredAt,
      }));
      let totalCredits = 0;
      let weightedGpa = 0;
      let hasGrades = false;
      for (const d of data) {
        const gpa = gpaFromGrade(d.grade);
        if (gpa !== null && d.credit > 0) {
          totalCredits += d.credit;
          weightedGpa += gpa * d.credit;
          hasGrades = true;
        }
      }
      const gpa = hasGrades && totalCredits > 0 ? Math.round((weightedGpa / totalCredits) * 100) / 100 : 0;
      return sendJson(res, 200, { ok: true, data, gpa, totalCredits });
    } catch (e) {
      logger.error('Student grades error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

router.get(
  '/student/:studentId/grades/semester-stats',
  param('studentId').isInt({ min: 1 }).withMessage('无效的学生 ID'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
    const studentId = parseInt(req.params.studentId, 10);
    try {
      const rows = await Grade.findAll({
        where: { studentId },
        include: [
          { model: Course, as: 'course', attributes: ['id', 'credit'] },
          { model: Semester, as: 'semester', attributes: ['id', 'academicYear', 'semesterNumber'] },
        ],
        order: [['semesterId', 'ASC']],
      });
      const semesterMap = new Map();
      for (const r of rows) {
        if (!r.semester) continue;
        const key = r.semesterId;
        if (!semesterMap.has(key)) {
          semesterMap.set(key, {
            semesterId: key,
            semesterName: `${r.semester.academicYear} 第${r.semester.semesterNumber}学期`,
            academicYear: r.semester.academicYear,
            semesterNumber: r.semester.semesterNumber,
            totalCredits: 0,
            weightedGpa: 0,
            courseCount: 0,
            avgScore: 0,
            totalScore: 0,
            scoredCount: 0,
          });
        }
        const stats = semesterMap.get(key);
        stats.courseCount++;
        const gpa = gpaFromGrade(r.grade);
        if (gpa !== null && r.course && r.course.credit > 0) {
          stats.totalCredits += r.course.credit;
          stats.weightedGpa += gpa * r.course.credit;
        }
        if (r.totalScore !== null && r.totalScore !== undefined) {
          stats.totalScore += r.totalScore;
          stats.scoredCount++;
        }
      }
      const data = [];
      for (const stats of semesterMap.values()) {
        const gpa = stats.totalCredits > 0 ? Math.round((stats.weightedGpa / stats.totalCredits) * 100) / 100 : 0;
        const avgScore = stats.scoredCount > 0 ? Math.round((stats.totalScore / stats.scoredCount) * 100) / 100 : 0;
        data.push({
          ...stats,
          gpa,
          avgScore,
        });
      }
      data.sort((a, b) => {
        if (a.academicYear !== b.academicYear) return a.academicYear.localeCompare(b.academicYear);
        return a.semesterNumber - b.semesterNumber;
      });
      return sendJson(res, 200, { ok: true, data });
    } catch (e) {
      logger.error('Student semester stats error', { error: e.message });
      return sendJson(res, 500, { ok: false, message: '服务器错误' });
    }
  }
);

module.exports = router;
