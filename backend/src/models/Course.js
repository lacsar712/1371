const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Course',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      code: { type: DataTypes.STRING(32), allowNull: false },
      name: { type: DataTypes.STRING(128), allowNull: false },
      credit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      capacity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      semesterId: { type: DataTypes.INTEGER, allowNull: false, field: 'semester_id' },
    },
    {
      tableName: 'course',
      timestamps: false,
      indexes: [
        { unique: true, fields: ['code', 'semester_id'] },
      ],
    }
  );
};
