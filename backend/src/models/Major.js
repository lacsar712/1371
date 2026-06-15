const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Major',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(128), allowNull: false },
      collegeId: { type: DataTypes.INTEGER, allowNull: false, field: 'college_id' },
      createdAt: {
        type: DataTypes.DATE,
        field: 'created_at',
        defaultValue: DataTypes.NOW,
      },
    },
    { tableName: 'major', timestamps: false, indexes: [{ fields: ['college_id'] }] }
  );
};
