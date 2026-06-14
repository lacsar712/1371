const path = require('path');
const { Sequelize } = require('sequelize');
const logger = require('../logger');

// SQLite 存储路径，支持中文（SQLite 3 默认 UTF-8 编码）
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

// SQLite 3 默认使用 UTF-8 编码，完整支持中文

const Admin = require('./Admin')(sequelize);
const Student = require('./Student')(sequelize);
const Course = require('./Course')(sequelize);
const Enrollment = require('./Enrollment')(sequelize);
const Teacher = require('./Teacher')(sequelize);
const CourseTeacher = require('./CourseTeacher')(sequelize);

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

module.exports = {
  sequelize,
  Admin,
  Student,
  Course,
  Enrollment,
  Teacher,
  CourseTeacher,
};
