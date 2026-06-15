const { sequelize, Course, Enrollment, Schedule, Classroom } = require('../models');

async function getStudentCourses(studentId, semesterId) {
  const where = { studentId };
  if (semesterId) where.semesterId = semesterId;

  const rows = await Enrollment.findAll({
    where,
    include: [{
      model: Course,
      as: 'Course',
      attributes: ['id', 'code', 'name', 'credit', 'capacity'],
      include: [{
        model: Schedule,
        as: 'schedules',
        attributes: ['id', 'dayOfWeek', 'startPeriod', 'endPeriod'],
        include: [{ model: Classroom, as: 'classroom', attributes: ['id', 'building', 'roomNumber'] }],
      }],
    }],
    order: [['enrolledAt', 'ASC']],
  });

  return rows.map((r) => {
    const obj = { ...r.Course.toJSON(), enrolled_at: r.enrolledAt };
    obj.location = (obj.schedules || []).map((s) => {
      const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      const day = dayNames[s.dayOfWeek] || '';
      const room = s.classroom ? `${s.classroom.building} ${s.classroom.roomNumber}` : '';
      return `${day} 第${s.startPeriod}-${s.endPeriod}节 ${room}`;
    }).join('；');
    return obj;
  });
}

async function enrollStudent(studentId, courseId) {
  const transaction = await sequelize.transaction();

  try {
    const course = await Course.findByPk(courseId, {
      attributes: ['id', 'capacity', 'semesterId'],
      lock: true,
      transaction,
    });

    if (!course) {
      await transaction.rollback();
      return { ok: false, status: 404, message: '课程不存在' };
    }

    const semesterId = course.semesterId;

    const enrolled = await Enrollment.count({
      where: { courseId, semesterId },
      transaction,
    });

    if (enrolled >= course.capacity) {
      await transaction.rollback();
      return { ok: false, status: 400, message: '课程已满' };
    }

    const exists = await Enrollment.findOne({
      where: { studentId, courseId, semesterId },
      transaction,
    });

    if (exists) {
      await transaction.rollback();
      return { ok: false, status: 400, message: '已选过该课程' };
    }

    await Enrollment.create(
      { studentId, courseId, semesterId },
      { transaction }
    );

    await transaction.commit();
    return { ok: true, status: 200, message: '选课成功' };
  } catch (e) {
    await transaction.rollback();
    if (e.name === 'SequelizeUniqueConstraintError') {
      return { ok: false, status: 400, message: '已选过该课程' };
    }
    throw e;
  }
}

async function dropCourse(studentId, courseId, semesterId) {
  const where = { studentId, courseId };
  if (semesterId) where.semesterId = semesterId;

  const n = await Enrollment.destroy({ where });

  if (n === 0) {
    return { ok: false, status: 404, message: '未找到选课记录' };
  }

  return { ok: true, status: 200, message: '退课成功' };
}

module.exports = {
  getStudentCourses,
  enrollStudent,
  dropCourse,
};
