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
const Semester = require('./Semester')(sequelize);
const Grade = require('./Grade')(sequelize);
const CourseEvaluation = require('./CourseEvaluation')(sequelize);
const Message = require('./Message')(sequelize);
const CourseResource = require('./CourseResource')(sequelize);
const Announcement = require('./Announcement')(sequelize);
const Questionnaire = require('./Questionnaire')(sequelize);
const Question = require('./Question')(sequelize);
const QuestionnaireResponse = require('./QuestionnaireResponse')(sequelize);
const QuestionAnswer = require('./QuestionAnswer')(sequelize);

Semester.hasMany(Course, { foreignKey: 'semesterId', as: 'courses' });
Course.belongsTo(Semester, { foreignKey: 'semesterId', as: 'semester' });

Semester.hasMany(Enrollment, { foreignKey: 'semesterId', as: 'enrollments' });
Enrollment.belongsTo(Semester, { foreignKey: 'semesterId', as: 'semester' });

Semester.hasMany(Schedule, { foreignKey: 'semesterId', as: 'schedules' });
Schedule.belongsTo(Semester, { foreignKey: 'semesterId', as: 'semester' });

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

Student.hasMany(Grade, { foreignKey: 'studentId', as: 'grades' });
Grade.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
Course.hasMany(Grade, { foreignKey: 'courseId', as: 'grades' });
Grade.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
Semester.hasMany(Grade, { foreignKey: 'semesterId', as: 'grades' });
Grade.belongsTo(Semester, { foreignKey: 'semesterId', as: 'semester' });
Teacher.hasMany(Grade, { foreignKey: 'enteredBy', as: 'enteredGrades' });
Grade.belongsTo(Teacher, { foreignKey: 'enteredBy', as: 'enteredTeacher' });

Student.hasMany(CourseEvaluation, { foreignKey: 'studentId', as: 'evaluations' });
CourseEvaluation.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
Course.hasMany(CourseEvaluation, { foreignKey: 'courseId', as: 'evaluations' });
CourseEvaluation.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

Course.hasMany(CourseResource, { foreignKey: 'courseId', as: 'resources' });
CourseResource.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

Questionnaire.hasMany(Question, { foreignKey: 'questionnaireId', as: 'questions' });
Question.belongsTo(Questionnaire, { foreignKey: 'questionnaireId', as: 'questionnaire' });
Questionnaire.hasMany(QuestionnaireResponse, { foreignKey: 'questionnaireId', as: 'responses' });
QuestionnaireResponse.belongsTo(Questionnaire, { foreignKey: 'questionnaireId', as: 'questionnaire' });
Student.hasMany(QuestionnaireResponse, { foreignKey: 'studentId', as: 'questionnaireResponses' });
QuestionnaireResponse.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
QuestionnaireResponse.hasMany(QuestionAnswer, { foreignKey: 'responseId', as: 'answers' });
QuestionAnswer.belongsTo(QuestionnaireResponse, { foreignKey: 'responseId', as: 'response' });
Question.hasMany(QuestionAnswer, { foreignKey: 'questionId', as: 'answers' });
QuestionAnswer.belongsTo(Question, { foreignKey: 'questionId', as: 'question' });

async function getCurrentSemester() {
  return await Semester.findOne({ where: { isCurrent: true } });
}

async function resolveSemesterId(semesterIdParam) {
  if (semesterIdParam) {
    const id = parseInt(semesterIdParam, 10);
    if (!Number.isNaN(id) && id > 0) return id;
  }
  const current = await getCurrentSemester();
  return current ? current.id : null;
}

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
  Semester,
  Grade,
  CourseEvaluation,
  Message,
  CourseResource,
  Announcement,
  Questionnaire,
  Question,
  QuestionnaireResponse,
  QuestionAnswer,
  getCurrentSemester,
  resolveSemesterId,
};
