const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Semester',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      academicYear: { type: DataTypes.STRING(16), allowNull: false, field: 'academic_year' },
      semesterNumber: { type: DataTypes.INTEGER, allowNull: false, field: 'semester_number' },
      startDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'start_date' },
      endDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'end_date' },
      isCurrent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_current' },
    },
    { tableName: 'semester', timestamps: false }
  );
};
