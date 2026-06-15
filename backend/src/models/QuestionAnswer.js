const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'QuestionAnswer',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      responseId: { type: DataTypes.INTEGER, allowNull: false, field: 'response_id' },
      questionId: { type: DataTypes.INTEGER, allowNull: false, field: 'question_id' },
      answer: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    },
    {
      tableName: 'question_answer',
      timestamps: false,
      indexes: [
        { fields: ['response_id'] },
        { fields: ['question_id'] },
      ],
    }
  );
};
