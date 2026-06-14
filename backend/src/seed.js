const crypto = require('crypto');
const logger = require('./logger');
const { Admin, Student, Course, Enrollment, Teacher, CourseTeacher, College, Major, ClassInfo, Classroom, Schedule, Semester, sequelize } = require('./models');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password, 'utf8').digest('hex');
}

const TEST_PASSWORD_HASH = hashPassword('123456');

/** 每次启动都确保测试账号存在且密码为 123456，避免旧库导致登录失败 */
async function ensureOrgStructure() {
  const [college1] = await College.findOrCreate({ where: { name: '计算机学院' }, defaults: { name: '计算机学院' } });
  const [college2] = await College.findOrCreate({ where: { name: '数学学院' }, defaults: { name: '数学学院' } });

  const [major1] = await Major.findOrCreate({
    where: { name: '软件工程', collegeId: college1.id },
    defaults: { name: '软件工程', collegeId: college1.id },
  });
  const [major2] = await Major.findOrCreate({
    where: { name: '计算机科学与技术', collegeId: college1.id },
    defaults: { name: '计算机科学与技术', collegeId: college1.id },
  });
  const [major3] = await Major.findOrCreate({
    where: { name: '应用数学', collegeId: college2.id },
    defaults: { name: '应用数学', collegeId: college2.id },
  });

  const [cls1] = await ClassInfo.findOrCreate({
    where: { name: '软工2401班', majorId: major1.id },
    defaults: { name: '软工2401班', majorId: major1.id },
  });
  const [cls2] = await ClassInfo.findOrCreate({
    where: { name: '软工2402班', majorId: major1.id },
    defaults: { name: '软工2402班', majorId: major1.id },
  });
  const [cls3] = await ClassInfo.findOrCreate({
    where: { name: '计科2401班', majorId: major2.id },
    defaults: { name: '计科2401班', majorId: major2.id },
  });
  const [cls4] = await ClassInfo.findOrCreate({
    where: { name: '应数2401班', majorId: major3.id },
    defaults: { name: '应数2401班', majorId: major3.id },
  });

  return { cls1, cls2, cls3, cls4 };
}

async function ensureTestAccounts() {
  const [admin] = await Admin.findOrCreate({
    where: { username: 'admin' },
    defaults: { passwordHash: TEST_PASSWORD_HASH },
  });
  if (admin && admin.passwordHash !== TEST_PASSWORD_HASH) {
    await admin.update({ passwordHash: TEST_PASSWORD_HASH });
  }

  const { cls1, cls2, cls3 } = await ensureOrgStructure();

  const testStudents = [
    { studentNo: 'S2024001', name: '张三', classId: cls1.id },
    { studentNo: 'S2024002', name: '李四', classId: cls1.id },
    { studentNo: 'S2024003', name: '王五', classId: cls2.id },
  ];
  for (const s of testStudents) {
    const [student, created] = await Student.findOrCreate({
      where: { studentNo: s.studentNo },
      defaults: { name: s.name, passwordHash: TEST_PASSWORD_HASH, classId: s.classId },
    });
    if (!created) {
      const updates = { passwordHash: TEST_PASSWORD_HASH, name: s.name };
      if (!student.classId) updates.classId = s.classId;
      await student.update(updates);
    }
  }
  const testTeachers = [
    { teacherNo: 'T2024001', name: '李教授', title: '教授', college: '计算机学院' },
    { teacherNo: 'T2024002', name: '王副教授', title: '副教授', college: '计算机学院' },
    { teacherNo: 'T2024003', name: '张讲师', title: '讲师', college: '数学学院' },
  ];
  for (const t of testTeachers) {
    const [teacher, created] = await Teacher.findOrCreate({
      where: { teacherNo: t.teacherNo },
      defaults: { name: t.name, title: t.title, college: t.college, passwordHash: TEST_PASSWORD_HASH },
    });
    if (!created && teacher.passwordHash !== TEST_PASSWORD_HASH) {
      await teacher.update({ passwordHash: TEST_PASSWORD_HASH, name: t.name, title: t.title, college: t.college });
    }
  }
  logger.info('Test accounts ensured');
}

async function seed() {
  await ensureTestAccounts();

  const semesterCount = await Semester.count();
  let defaultSemester;
  if (semesterCount === 0) {
    defaultSemester = await Semester.create({
      academicYear: '2025-2026',
      semesterNumber: 2,
      startDate: '2026-02-16',
      endDate: '2026-07-05',
      isCurrent: true,
    });
    logger.info('Default semester seeded');
  } else {
    defaultSemester = await Semester.findOne({ where: { isCurrent: true } });
    if (!defaultSemester) {
      defaultSemester = await Semester.findOne({ order: [['id', 'DESC']] });
    }
  }

  const classroomCount = await Classroom.count();
  if (classroomCount === 0) {
    await Classroom.bulkCreate([
      { building: '教学楼A', roomNumber: '101', capacity: 60, isMultimedia: true },
      { building: '教学楼A', roomNumber: '201', capacity: 80, isMultimedia: true },
      { building: '教学楼A', roomNumber: '301', capacity: 120, isMultimedia: true },
      { building: '教学楼B', roomNumber: '102', capacity: 50, isMultimedia: false },
      { building: '教学楼B', roomNumber: '202', capacity: 100, isMultimedia: true },
      { building: '教学楼C', roomNumber: '101', capacity: 40, isMultimedia: false },
    ]);
    logger.info('Classrooms seeded');
  }

  const courseCount = await Course.count();
  if (courseCount > 0) {
    logger.info('Seed already applied, skip');
    return;
  }

  if (!defaultSemester) {
    logger.warn('No semester available, skip course seeding');
    return;
  }

  const courses = await Course.bulkCreate([
    { code: 'CS101', name: '数据结构', credit: 4, capacity: 60, semesterId: defaultSemester.id },
    { code: 'CS102', name: '计算机网络', credit: 3, capacity: 50, semesterId: defaultSemester.id },
    { code: 'CS103', name: '操作系统', credit: 4, capacity: 55, semesterId: defaultSemester.id },
    { code: 'MATH201', name: '高等数学', credit: 5, capacity: 80, semesterId: defaultSemester.id },
    { code: 'ENG101', name: '大学英语', credit: 2, capacity: 100, semesterId: defaultSemester.id },
  ]);
  await Enrollment.bulkCreate([
    { studentId: 1, courseId: 1, semesterId: defaultSemester.id },
    { studentId: 1, courseId: 2, semesterId: defaultSemester.id },
    { studentId: 2, courseId: 1, semesterId: defaultSemester.id },
  ]);
  const teachers = await Teacher.findAll();
  const teacherMap = Object.fromEntries(teachers.map((t) => [t.teacherNo, t.id]));
  if (courses.length >= 5 && teacherMap['T2024001'] && teacherMap['T2024002'] && teacherMap['T2024003']) {
    await CourseTeacher.bulkCreate([
      { courseId: courses[0].id, teacherId: teacherMap['T2024001'] },
      { courseId: courses[0].id, teacherId: teacherMap['T2024002'] },
      { courseId: courses[1].id, teacherId: teacherMap['T2024002'] },
      { courseId: courses[2].id, teacherId: teacherMap['T2024001'] },
      { courseId: courses[3].id, teacherId: teacherMap['T2024003'] },
    ]);
  }
  logger.info('Seed completed');
}

module.exports = { seed, hashPassword };

if (require.main === module) {
  const { sequelize } = require('./models');
  (async () => {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    await seed();
    process.exit(0);
  })().catch((e) => {
    logger.error('Seed failed', { error: e.message });
    process.exit(1);
  });
}
