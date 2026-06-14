const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'College',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(128), allowNull: false, unique: true },
      createdAt: {
        type: DataTypes.STRING,
        field: 'created_at',
        defaultValue: DataTypes.NOW,
      },
    },
    { tableName: 'college', timestamps: false }
  );
};
