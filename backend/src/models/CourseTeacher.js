const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'CourseTeacher',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      courseId: { type: DataTypes.INTEGER, allowNull: false, field: 'course_id' },
      teacherId: { type: DataTypes.INTEGER, allowNull: false, field: 'teacher_id' },
    },
    {
      tableName: 'course_teacher',
      timestamps: false,
      indexes: [
        { unique: true, fields: ['course_id', 'teacher_id'] },
      ],
    }
  );
};
