const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Questionnaire',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      title: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true, defaultValue: '' },
      startTime: { type: DataTypes.DATE, allowNull: false, field: 'start_time' },
      endTime: { type: DataTypes.DATE, allowNull: false, field: 'end_time' },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft', field: 'status' },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
    },
    {
      tableName: 'questionnaire',
      timestamps: false,
      indexes: [
        { fields: ['status'] },
      ],
    }
  );
};
