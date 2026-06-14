const path = require('path');
const { Sequelize } = require('sequelize');
const logger = require('../logger');

const SQLITE_PATH =
  process.env.SQLITE_PATH ||
  path.resolve(__dirname, '../../data/course.sqlite');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: SQLITE_PATH,
  define: {
    timestamps: false,
  },
  logging: (msg) => logger.debug(msg),
});

const Admin = require('./Admin')(sequelize);
const Student = require('./Student')(sequelize);
const Course = require('./Course')(sequelize);
const Enrollment = require('./Enrollment')(sequelize);
const Teacher = require('./Teacher')(sequelize);
const CourseTeacher = require('./CourseTeacher')(sequelize);
const College = require('./College')(sequelize);
const Major = require('./Major')(sequelize);
const ClassInfo = require('./ClassInfo')(sequelize);
const Classroom = require('./Classroom')(sequelize);
const Schedule = require('./Schedule')(sequelize);

Student.hasMany(Enrollment, { foreignKey: 'studentId' });
Enrollment.belongsTo(Student, { foreignKey: 'studentId' });
Course.hasMany(Enrollment, { foreignKey: 'courseId' });
Enrollment.belongsTo(Course, { foreignKey: 'courseId' });

Course.belongsToMany(Teacher, { through: CourseTeacher, foreignKey: 'courseId', otherKey: 'teacherId', as: 'teachers' });
Teacher.belongsToMany(Course, { through: CourseTeacher, foreignKey: 'teacherId', otherKey: 'courseId', as: 'courses' });
Course.hasMany(CourseTeacher, { foreignKey: 'courseId' });
CourseTeacher.belongsTo(Course, { foreignKey: 'courseId' });
Teacher.hasMany(CourseTeacher, { foreignKey: 'teacherId' });
CourseTeacher.belongsTo(Teacher, { foreignKey: 'teacherId' });

College.hasMany(Major, { foreignKey: 'collegeId', as: 'majors' });
Major.belongsTo(College, { foreignKey: 'collegeId', as: 'college' });
Major.hasMany(ClassInfo, { foreignKey: 'majorId', as: 'classes' });
ClassInfo.belongsTo(Major, { foreignKey: 'majorId', as: 'major' });
ClassInfo.hasMany(Student, { foreignKey: 'classId', as: 'students' });
Student.belongsTo(ClassInfo, { foreignKey: 'classId', as: 'classInfo' });

Course.hasMany(Schedule, { foreignKey: 'courseId', as: 'schedules' });
Schedule.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
Classroom.hasMany(Schedule, { foreignKey: 'classroomId', as: 'schedules' });
Schedule.belongsTo(Classroom, { foreignKey: 'classroomId', as: 'classroom' });

module.exports = {
  sequelize,
  Admin,
  Student,
  Course,
  Enrollment,
  Teacher,
  CourseTeacher,
  College,
  Major,
  ClassInfo,
  Classroom,
  Schedule,
};
