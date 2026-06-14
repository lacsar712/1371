const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'ClassInfo',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(128), allowNull: false },
      majorId: { type: DataTypes.INTEGER, allowNull: false, field: 'major_id' },
      createdAt: {
        type: DataTypes.STRING,
        field: 'created_at',
        defaultValue: DataTypes.NOW,
      },
    },
    { tableName: 'class', timestamps: false, indexes: [{ fields: ['major_id'] }] }
  );
};
