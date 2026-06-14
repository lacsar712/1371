const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Schedule',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      courseId: { type: DataTypes.INTEGER, allowNull: false, field: 'course_id' },
      classroomId: { type: DataTypes.INTEGER, allowNull: false, field: 'classroom_id' },
      semesterId: { type: DataTypes.INTEGER, allowNull: false, field: 'semester_id' },
      dayOfWeek: { type: DataTypes.INTEGER, allowNull: false, field: 'day_of_week' },
      startPeriod: { type: DataTypes.INTEGER, allowNull: false, field: 'start_period' },
      endPeriod: { type: DataTypes.INTEGER, allowNull: false, field: 'end_period' },
    },
    { tableName: 'schedule' }
  );
};
