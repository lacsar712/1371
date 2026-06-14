const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'CourseEvaluation',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      studentId: { type: DataTypes.INTEGER, allowNull: false, field: 'student_id' },
      courseId: { type: DataTypes.INTEGER, allowNull: false, field: 'course_id' },
      rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
      comment: { type: DataTypes.TEXT, allowNull: true, defaultValue: '' },
      isAnonymous: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_anonymous' },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
    },
    {
      tableName: 'course_evaluation',
      timestamps: false,
      indexes: [
        { unique: true, fields: ['student_id', 'course_id'] },
        { fields: ['course_id'] },
        { fields: ['student_id'] },
      ],
    }
  );
};
