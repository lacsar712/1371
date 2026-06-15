process.env.SQLITE_PATH = ':memory:';

const request = require('supertest');
const express = require('express');
const {
  sequelize,
  Course,
  Enrollment,
  Semester,
  Student,
  Teacher,
  CourseTeacher,
  Schedule,
  Classroom,
} = require('../src/models');
const adminRouter = require('../src/routes/admin');
const coursesRouter = require('../src/routes/courses');

function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/admin', adminRouter);
  app.use('/api/courses', coursesRouter);
  return app;
}

let app;
let semesterId;
let studentId;
let teacherId;
let classroomId;

beforeAll(async () => {
  app = createApp();
  await sequelize.sync({ force: true });
  const sem = await Semester.create({
    academicYear: '2025-2026',
    semesterNumber: 1,
    startDate: '2025-09-01',
    endDate: '2026-01-15',
    isCurrent: true,
  });
  semesterId = sem.id;
  const stu = await Student.create({
    studentNo: 'TEST001',
    name: '测试学生',
    passwordHash: 'a'.repeat(64),
  });
  studentId = stu.id;
  const tch = await Teacher.create({
    teacherNo: 'T001',
    name: '测试教师',
    passwordHash: 'a'.repeat(64),
    title: '教授',
    college: '计算机学院',
  });
  teacherId = tch.id;
  const room = await Classroom.create({
    building: '教学楼A',
    roomNumber: '101',
    capacity: 60,
    isMultimedia: 1,
  });
  classroomId = room.id;
});

afterEach(async () => {
  await Enrollment.destroy({ where: {} });
  await CourseTeacher.destroy({ where: {} });
  await Schedule.destroy({ where: {} });
  await Course.destroy({ where: {} });
});

afterAll(async () => {
  await sequelize.close();
});

function makeCourse(overrides = {}) {
  return {
    code: 'CS101',
    name: '计算机导论',
    credit: 3,
    capacity: 50,
    semesterId,
    ...overrides,
  };
}

describe('课程管理接口测试', () => {
  describe('POST /api/admin/courses - 新建课程', () => {
    test('新建课程成功', async () => {
      const res = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse());
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toMatchObject({
        code: 'CS101',
        name: '计算机导论',
        credit: 3,
        capacity: 50,
      });
    });

    test('新建课程并关联教师', async () => {
      const res = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'CS102', teacherIds: [teacherId] }));
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.teachers).toBeDefined();
      expect(res.body.data.teachers.length).toBe(1);
      expect(res.body.data.teachers[0].id).toBe(teacherId);
    });

    test('新建课程时传入空教师数组', async () => {
      const res = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'CS103', teacherIds: [] }));
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });

    test('学分为负数时拒绝', async () => {
      const res = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ credit: -1 }));
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/学分/);
    });

    test('学分为非整数时拒绝', async () => {
      const res = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ credit: 1.5 }));
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test('容量为负数时拒绝', async () => {
      const res = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ capacity: -1 }));
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/容量/);
    });

    test('容量为非整数时拒绝', async () => {
      const res = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ capacity: 1.5 }));
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test('课程代码在同一学期重复时拒绝', async () => {
      await request(app)
        .post('/api/admin/courses')
        .send(makeCourse());
      const res = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse());
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/课程代码已存在/);
    });

    test('缺少课程代码时拒绝', async () => {
      const res = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: '' }));
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test('缺少课程名称时拒绝', async () => {
      const res = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ name: '' }));
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test('缺少学期时拒绝', async () => {
      const res = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ semesterId: undefined }));
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test('teacherIds 字段格式错误时拒绝', async () => {
      const res = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'CS104', teacherIds: 'not-array' }));
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('PUT /api/admin/courses/:id - 修改课程', () => {
    test('修改课程成功', async () => {
      const createRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse());
      const id = createRes.body.data.id;

      const res = await request(app)
        .put(`/api/admin/courses/${id}`)
        .send(makeCourse({ code: 'CS101-UPD', name: '计算机导论（更新）', credit: 4, capacity: 60 }));
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toMatchObject({
        code: 'CS101-UPD',
        name: '计算机导论（更新）',
        credit: 4,
        capacity: 60,
      });
    });

    test('修改课程并替换教师列表', async () => {
      const createRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ teacherIds: [teacherId] }));
      const id = createRes.body.data.id;

      const res = await request(app)
        .put(`/api/admin/courses/${id}`)
        .send(makeCourse({ teacherIds: [teacherId] }));
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.teachers.length).toBe(1);
    });

    test('修改课程时清空教师列表', async () => {
      const createRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ teacherIds: [teacherId] }));
      const id = createRes.body.data.id;

      const res = await request(app)
        .put(`/api/admin/courses/${id}`)
        .send(makeCourse({ teacherIds: [] }));
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('容量改到比已选人数更小时拒绝', async () => {
      const createRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ capacity: 50 }));
      const courseId = createRes.body.data.id;

      await Enrollment.create({ studentId, courseId, semesterId });

      const res = await request(app)
        .put(`/api/admin/courses/${courseId}`)
        .send(makeCourse({ capacity: 0 }));
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/容量不能小于已选人数/);
    });

    test('修改不存在的课程返回404', async () => {
      const res = await request(app)
        .put('/api/admin/courses/99999')
        .send(makeCourse({ code: 'CS999', name: '不存在' }));
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/课程不存在/);
    });

    test('修改时课程代码重复返回400', async () => {
      await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'CS200' }));

      const createRes2 = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'CS201' }));
      const id2 = createRes2.body.data.id;

      const res = await request(app)
        .put(`/api/admin/courses/${id2}`)
        .send(makeCourse({ code: 'CS200' }));
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/课程代码已存在/);
    });

    test('修改时学分为负数返回400', async () => {
      const createRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse());
      const id = createRes.body.data.id;

      const res = await request(app)
        .put(`/api/admin/courses/${id}`)
        .send(makeCourse({ credit: -1 }));
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test('修改时参数 id 非法返回400', async () => {
      const res = await request(app)
        .put('/api/admin/courses/abc')
        .send(makeCourse());
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('DELETE /api/admin/courses/:id - 删除课程', () => {
    test('删除课程成功并清理选课关系和教师关联', async () => {
      const createRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse());
      const courseId = createRes.body.data.id;

      await Enrollment.create({ studentId, courseId, semesterId });
      await CourseTeacher.create({ courseId, teacherId });

      const res = await request(app).delete(`/api/admin/courses/${courseId}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.message).toMatch(/已删除/);

      const enrollments = await Enrollment.findAll({ where: { courseId } });
      expect(enrollments.length).toBe(0);
      const ct = await CourseTeacher.findAll({ where: { courseId } });
      expect(ct.length).toBe(0);
      const course = await Course.findByPk(courseId);
      expect(course).toBeNull();
    });

    test('删除不存在的课程返回404', async () => {
      const res = await request(app).delete('/api/admin/courses/99999');
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/课程不存在/);
    });
  });

  describe('GET /api/courses - 课程列表（公开接口）', () => {
    test('获取课程列表成功', async () => {
      await request(app)
        .post('/api/admin/courses')
        .send(makeCourse());

      const res = await request(app).get('/api/courses');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('按关键词搜索课程（名称匹配）', async () => {
      await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'MATH101', name: '高等数学' }));

      const res = await request(app).get('/api/courses?keyword=高等');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].name).toMatch(/高等/);
    });

    test('按关键词搜索课程（代码匹配）', async () => {
      await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'PHY201', name: '大学物理' }));

      const res = await request(app).get('/api/courses?keyword=PHY');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].code).toMatch(/PHY/);
    });

    test('按学期筛选课程', async () => {
      await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'ENG101', name: '大学英语' }));

      const res = await request(app).get(`/api/courses?semesterId=${semesterId}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('无匹配关键词返回空列表', async () => {
      const res = await request(app).get('/api/courses?keyword=不存在的课程XYZ');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.length).toBe(0);
    });

    test('课程列表中包含选课人数', async () => {
      const createRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'HIST101', name: '历史' }));
      const courseId = createRes.body.data.id;
      await Enrollment.create({ studentId, courseId, semesterId });

      const res = await request(app).get('/api/courses');
      const target = res.body.data.find((c) => c.id === courseId);
      expect(target).toBeDefined();
      expect(target.enrolled).toBe(1);
    });

    test('课程列表包含排课和教室信息', async () => {
      const createRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'SCHED101', name: '排课测试' }));
      const courseId = createRes.body.data.id;
      await Schedule.create({
        courseId,
        classroomId,
        dayOfWeek: 1,
        startPeriod: 1,
        endPeriod: 2,
        semesterId,
      });

      const res = await request(app).get('/api/courses');
      const target = res.body.data.find((c) => c.id === courseId);
      expect(target).toBeDefined();
      expect(target.location).toMatch(/周一/);
      expect(target.location).toMatch(/教学楼A/);
    });

    test('排课 dayOfWeek 超出范围时回退为空', async () => {
      const createRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'SCHED102', name: '排课边界' }));
      const courseId = createRes.body.data.id;
      await Schedule.create({
        courseId,
        classroomId,
        dayOfWeek: 0,
        startPeriod: 1,
        endPeriod: 2,
        semesterId,
      });

      const res = await request(app).get('/api/courses');
      const target = res.body.data.find((c) => c.id === courseId);
      expect(target).toBeDefined();
      expect(target.location).toContain('第1-2节');
    });

    test('无当前学期时课程列表不按学期筛选', async () => {
      await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'NOSEM101', name: '无学期测试' }));
      await Semester.update({ isCurrent: false }, { where: {} });
      const res = await request(app).get('/api/courses');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      await Semester.update({ isCurrent: true }, { where: { id: semesterId } });
    });
  });

  describe('GET /api/courses/:id - 课程详情（公开接口）', () => {
    test('获取课程详情成功', async () => {
      const createRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse());
      const id = createRes.body.data.id;

      const res = await request(app).get(`/api/courses/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.id).toBe(id);
      expect(res.body.data.enrolled).toBe(0);
    });

    test('获取课程详情包含选课人数', async () => {
      const createRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'ART101', name: '艺术鉴赏' }));
      const id = createRes.body.data.id;
      await Enrollment.create({ studentId, courseId: id, semesterId });

      const res = await request(app).get(`/api/courses/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.enrolled).toBe(1);
    });

    test('无效课程ID返回400', async () => {
      const res = await request(app).get('/api/courses/abc');
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/无效/);
    });

    test('课程不存在返回404', async () => {
      const res = await request(app).get('/api/courses/99999');
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/课程不存在/);
    });
  });

  describe('GET /api/admin/courses - 管理员课程列表', () => {
    test('获取管理员课程列表成功', async () => {
      await request(app)
        .post('/api/admin/courses')
        .send(makeCourse());

      const res = await request(app).get('/api/admin/courses');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('管理员列表按学期筛选', async () => {
      await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'CHEM101', name: '化学' }));

      const res = await request(app).get(`/api/admin/courses?semesterId=${semesterId}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('管理员列表不传学期参数时返回全部', async () => {
      await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'BIO101', name: '生物' }));

      const res = await request(app).get('/api/admin/courses');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('管理员课程列表中包含选课人数和教师信息', async () => {
      const createRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'LIT101', name: '文学', teacherIds: [teacherId] }));
      const courseId = createRes.body.data.id;
      await Enrollment.create({ studentId, courseId, semesterId });

      const res = await request(app).get('/api/admin/courses');
      const target = res.body.data.find((c) => c.id === courseId);
      expect(target).toBeDefined();
      expect(target.enrolled).toBe(1);
      expect(target.teachers).toBeDefined();
      expect(target.teachers.length).toBe(1);
    });

    test('管理员课程列表中课程无教师时返回空数组', async () => {
      const createRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'NOTCHR101', name: '无教师课程' }));
      const courseId = createRes.body.data.id;

      const res = await request(app).get('/api/admin/courses');
      const target = res.body.data.find((c) => c.id === courseId);
      expect(target).toBeDefined();
      expect(target.teachers).toBeDefined();
      expect(target.teachers.length).toBe(0);
    });
  });

  describe('学生管理接口（支撑课程测试覆盖）', () => {
    test('获取学生列表', async () => {
      const res = await request(app).get('/api/admin/students');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('新建学生成功', async () => {
      const res = await request(app)
        .post('/api/admin/students')
        .send({ studentNo: 'S002', name: '新学生', password: '123456' });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.studentNo).toBe('S002');
    });

    test('新建学生学号重复', async () => {
      await request(app)
        .post('/api/admin/students')
        .send({ studentNo: 'S003', name: '学生A', password: '123456' });
      const res = await request(app)
        .post('/api/admin/students')
        .send({ studentNo: 'S003', name: '学生B', password: '123456' });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/学号已存在/);
    });

    test('新建学生验证失败', async () => {
      const res = await request(app)
        .post('/api/admin/students')
        .send({ studentNo: '', name: '学生', password: '123456' });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test('修改学生成功', async () => {
      const createRes = await request(app)
        .post('/api/admin/students')
        .send({ studentNo: 'S004', name: '原始名', password: '123456' });
      const id = createRes.body.data.id;
      const res = await request(app)
        .put(`/api/admin/students/${id}`)
        .send({ studentNo: 'S004', name: '修改名', password: '' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.name).toBe('修改名');
    });

    test('修改学生时更新密码', async () => {
      const createRes = await request(app)
        .post('/api/admin/students')
        .send({ studentNo: 'S005', name: '学生', password: '123456' });
      const id = createRes.body.data.id;
      const res = await request(app)
        .put(`/api/admin/students/${id}`)
        .send({ studentNo: 'S005', name: '学生', password: 'newpass' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('修改不存在的学生返回404', async () => {
      const res = await request(app)
        .put('/api/admin/students/99999')
        .send({ studentNo: 'S999', name: '不存在', password: '' });
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });

    test('修改学生时学号重复返回400', async () => {
      await request(app)
        .post('/api/admin/students')
        .send({ studentNo: 'S006', name: '学生A', password: '123456' });
      const createRes2 = await request(app)
        .post('/api/admin/students')
        .send({ studentNo: 'S007', name: '学生B', password: '123456' });
      const id2 = createRes2.body.data.id;
      const res = await request(app)
        .put(`/api/admin/students/${id2}`)
        .send({ studentNo: 'S006', name: '学生B', password: '' });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/学号已存在/);
    });

    test('修改学生验证失败', async () => {
      const createRes = await request(app)
        .post('/api/admin/students')
        .send({ studentNo: 'S008', name: '学生', password: '123456' });
      const id = createRes.body.data.id;
      const res = await request(app)
        .put(`/api/admin/students/${id}`)
        .send({ studentNo: '', name: '学生', password: '' });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test('删除学生成功并清理选课关系', async () => {
      const createRes = await request(app)
        .post('/api/admin/students')
        .send({ studentNo: 'S009', name: '待删除', password: '123456' });
      const id = createRes.body.data.id;
      const courseRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse());
      const courseId = courseRes.body.data.id;
      await Enrollment.create({ studentId: id, courseId, semesterId });

      const res = await request(app).delete(`/api/admin/students/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      const enrollments = await Enrollment.findAll({ where: { studentId: id } });
      expect(enrollments.length).toBe(0);
    });

    test('删除不存在的学生返回404', async () => {
      const res = await request(app).delete('/api/admin/students/99999');
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('教师管理接口（支撑课程测试覆盖）', () => {
    test('获取教师列表', async () => {
      const res = await request(app).get('/api/admin/teachers');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('按关键词搜索教师', async () => {
      const res = await request(app).get('/api/admin/teachers?keyword=测试');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('按学院筛选教师', async () => {
      const res = await request(app).get('/api/admin/teachers?college=计算机学院');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('获取教师学院列表', async () => {
      const res = await request(app).get('/api/admin/teachers/colleges');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('新建教师成功', async () => {
      const res = await request(app)
        .post('/api/admin/teachers')
        .send({ teacherNo: 'T002', name: '新教师', password: '123456', title: '副教授', college: '数学学院' });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.teacherNo).toBe('T002');
    });

    test('新建教师工号重复', async () => {
      await request(app)
        .post('/api/admin/teachers')
        .send({ teacherNo: 'T003', name: '教师A', password: '123456' });
      const res = await request(app)
        .post('/api/admin/teachers')
        .send({ teacherNo: 'T003', name: '教师B', password: '123456' });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/工号已存在/);
    });

    test('新建教师验证失败', async () => {
      const res = await request(app)
        .post('/api/admin/teachers')
        .send({ teacherNo: '', name: '教师', password: '123456' });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test('修改教师成功', async () => {
      const createRes = await request(app)
        .post('/api/admin/teachers')
        .send({ teacherNo: 'T004', name: '原始名', password: '123456' });
      const id = createRes.body.data.id;
      const res = await request(app)
        .put(`/api/admin/teachers/${id}`)
        .send({ teacherNo: 'T004', name: '修改名', password: '' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.name).toBe('修改名');
    });

    test('修改教师时更新密码', async () => {
      const createRes = await request(app)
        .post('/api/admin/teachers')
        .send({ teacherNo: 'T005', name: '教师', password: '123456' });
      const id = createRes.body.data.id;
      const res = await request(app)
        .put(`/api/admin/teachers/${id}`)
        .send({ teacherNo: 'T005', name: '教师', password: 'newpass' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('修改不存在的教师返回404', async () => {
      const res = await request(app)
        .put('/api/admin/teachers/99999')
        .send({ teacherNo: 'T999', name: '不存在', password: '' });
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });

    test('修改教师时工号重复返回400', async () => {
      await request(app)
        .post('/api/admin/teachers')
        .send({ teacherNo: 'T006', name: '教师A', password: '123456' });
      const createRes2 = await request(app)
        .post('/api/admin/teachers')
        .send({ teacherNo: 'T007', name: '教师B', password: '123456' });
      const id2 = createRes2.body.data.id;
      const res = await request(app)
        .put(`/api/admin/teachers/${id2}`)
        .send({ teacherNo: 'T006', name: '教师B', password: '' });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/工号已存在/);
    });

    test('修改教师验证失败', async () => {
      const createRes = await request(app)
        .post('/api/admin/teachers')
        .send({ teacherNo: 'T008', name: '教师', password: '123456' });
      const id = createRes.body.data.id;
      const res = await request(app)
        .put(`/api/admin/teachers/${id}`)
        .send({ teacherNo: '', name: '教师', password: '' });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test('删除教师成功并清理课程关联', async () => {
      const createRes = await request(app)
        .post('/api/admin/teachers')
        .send({ teacherNo: 'T009', name: '待删除', password: '123456' });
      const id = createRes.body.data.id;
      const courseRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ teacherIds: [id] }));
      const courseId = courseRes.body.data.id;

      const res = await request(app).delete(`/api/admin/teachers/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      const ct = await CourseTeacher.findAll({ where: { teacherId: id } });
      expect(ct.length).toBe(0);
    });

    test('删除不存在的教师返回404', async () => {
      const res = await request(app).delete('/api/admin/teachers/99999');
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('异常处理覆盖', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('GET /api/courses 数据库异常返回500', async () => {
      jest.spyOn(Course, 'findAll').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app).get('/api/courses');
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('GET /api/courses/:id 数据库异常返回500', async () => {
      jest.spyOn(Course, 'findByPk').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app).get('/api/courses/1');
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('GET /api/admin/courses 数据库异常返回500', async () => {
      jest.spyOn(Course, 'findAll').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app).get('/api/admin/courses');
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('POST /api/admin/courses 非唯一约束异常返回500', async () => {
      jest.spyOn(sequelize, 'transaction').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse({ code: 'ERR101' }));
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('PUT /api/admin/courses 非唯一约束非NOT_FOUND异常返回500', async () => {
      const createRes = await request(app)
        .post('/api/admin/courses')
        .send(makeCourse());
      const id = createRes.body.data.id;
      jest.spyOn(sequelize, 'transaction').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app)
        .put(`/api/admin/courses/${id}`)
        .send(makeCourse());
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('DELETE /api/admin/courses 数据库异常返回500', async () => {
      jest.spyOn(Enrollment, 'destroy').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app).delete('/api/admin/courses/1');
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('GET /api/admin/students 数据库异常返回500', async () => {
      jest.spyOn(Student, 'findAll').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app).get('/api/admin/students');
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('POST /api/admin/students 非唯一约束异常返回500', async () => {
      jest.spyOn(Student, 'create').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app)
        .post('/api/admin/students')
        .send({ studentNo: 'SX', name: 'X', password: '123456' });
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('PUT /api/admin/students 非唯一约束异常返回500', async () => {
      const createRes = await request(app)
        .post('/api/admin/students')
        .send({ studentNo: 'SY', name: 'Y', password: '123456' });
      const id = createRes.body.data.id;
      jest.spyOn(Student, 'findByPk').mockResolvedValueOnce({ id });
      jest.spyOn(Student, 'update').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app)
        .put(`/api/admin/students/${id}`)
        .send({ studentNo: 'SY', name: 'Y2', password: '' });
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('DELETE /api/admin/students 数据库异常返回500', async () => {
      jest.spyOn(Enrollment, 'destroy').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app).delete('/api/admin/students/1');
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('GET /api/admin/teachers 数据库异常返回500', async () => {
      jest.spyOn(Teacher, 'findAll').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app).get('/api/admin/teachers');
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('GET /api/admin/teachers/colleges 数据库异常返回500', async () => {
      jest.spyOn(Teacher, 'findAll').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app).get('/api/admin/teachers/colleges');
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('POST /api/admin/teachers 非唯一约束异常返回500', async () => {
      jest.spyOn(Teacher, 'create').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app)
        .post('/api/admin/teachers')
        .send({ teacherNo: 'TX', name: 'X', password: '123456' });
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('PUT /api/admin/teachers 非唯一约束异常返回500', async () => {
      const createRes = await request(app)
        .post('/api/admin/teachers')
        .send({ teacherNo: 'TY', name: 'Y', password: '123456' });
      const id = createRes.body.data.id;
      jest.spyOn(Teacher, 'findByPk').mockResolvedValueOnce({ id });
      jest.spyOn(Teacher, 'update').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app)
        .put(`/api/admin/teachers/${id}`)
        .send({ teacherNo: 'TY', name: 'Y2', password: '' });
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('DELETE /api/admin/teachers 数据库异常返回500', async () => {
      jest.spyOn(CourseTeacher, 'destroy').mockRejectedValueOnce(new Error('DB'));
      const res = await request(app).delete('/api/admin/teachers/1');
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });
  });
});
