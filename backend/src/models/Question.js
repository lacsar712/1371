const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Question',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      questionnaireId: { type: DataTypes.INTEGER, allowNull: false, field: 'questionnaire_id' },
      type: { type: DataTypes.STRING(20), allowNull: false },
      title: { type: DataTypes.STRING(500), allowNull: false },
      options: { type: DataTypes.TEXT, allowNull: true, defaultValue: '[]' },
      required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_required' },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'sort_order' },
    },
    {
      tableName: 'question',
      timestamps: false,
      indexes: [
        { fields: ['questionnaire_id'] },
      ],
    }
  );
};
