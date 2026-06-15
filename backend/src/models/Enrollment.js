const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Enrollment',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      studentId: { type: DataTypes.INTEGER, allowNull: false, field: 'student_id' },
      courseId: { type: DataTypes.INTEGER, allowNull: false, field: 'course_id' },
      semesterId: { type: DataTypes.INTEGER, allowNull: false, field: 'semester_id' },
      enrolledAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'enrolled_at' },
    },
    {
      tableName: 'enrollment',
      timestamps: false,
      indexes: [
        { unique: true, fields: ['student_id', 'course_id', 'semester_id'] },
      ],
    }
  );
};
