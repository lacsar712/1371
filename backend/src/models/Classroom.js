const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Classroom',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      building: { type: DataTypes.STRING(128), allowNull: false },
      roomNumber: { type: DataTypes.STRING(64), allowNull: false, field: 'room_number' },
      capacity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      isMultimedia: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_multimedia' },
    },
    { tableName: 'classroom' }
  );
};
