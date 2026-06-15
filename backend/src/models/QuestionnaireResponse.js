const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'QuestionnaireResponse',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      questionnaireId: { type: DataTypes.INTEGER, allowNull: false, field: 'questionnaire_id' },
      studentId: { type: DataTypes.INTEGER, allowNull: false, field: 'student_id' },
      submittedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'submitted_at' },
    },
    {
      tableName: 'questionnaire_response',
      timestamps: false,
      indexes: [
        { unique: true, fields: ['questionnaire_id', 'student_id'] },
        { fields: ['student_id'] },
      ],
    }
  );
};
