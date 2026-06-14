const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Grade',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      studentId: { type: DataTypes.INTEGER, allowNull: false, field: 'student_id' },
      courseId: { type: DataTypes.INTEGER, allowNull: false, field: 'course_id' },
      semesterId: { type: DataTypes.INTEGER, allowNull: false, field: 'semester_id' },
      regularScore: { type: DataTypes.FLOAT, allowNull: true, field: 'regular_score' },
      finalScore: { type: DataTypes.FLOAT, allowNull: true, field: 'final_score' },
      totalScore: { type: DataTypes.FLOAT, allowNull: true, field: 'total_score' },
      grade: { type: DataTypes.STRING(2), allowNull: true, field: 'grade' },
      enteredBy: { type: DataTypes.INTEGER, allowNull: true, field: 'entered_by' },
      enteredAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'entered_at' },
    },
    { tableName: 'grade', timestamps: false, indexes: [
      { unique: true, fields: ['student_id', 'course_id', 'semester_id'] },
      { fields: ['student_id'] },
      { fields: ['course_id'] },
      { fields: ['semester_id'] },
    ]}
  );
};
