const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Message',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      senderId: { type: DataTypes.INTEGER, allowNull: false, field: 'sender_id' },
      senderType: { type: DataTypes.STRING(16), allowNull: false, field: 'sender_type' },
      senderName: { type: DataTypes.STRING(64), allowNull: false, field: 'sender_name' },
      senderNo: { type: DataTypes.STRING(32), allowNull: true, field: 'sender_no' },
      recipientId: { type: DataTypes.INTEGER, allowNull: false, field: 'recipient_id' },
      recipientType: { type: DataTypes.STRING(16), allowNull: false, field: 'recipient_type' },
      recipientName: { type: DataTypes.STRING(64), allowNull: false, field: 'recipient_name' },
      recipientNo: { type: DataTypes.STRING(32), allowNull: true, field: 'recipient_no' },
      title: { type: DataTypes.STRING(200), allowNull: false },
      content: { type: DataTypes.TEXT, allowNull: false },
      isRead: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_read' },
      readAt: { type: DataTypes.DATE, allowNull: true, field: 'read_at' },
      isDraft: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_draft' },
      sentAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'sent_at' },
    },
    { tableName: 'message', timestamps: false }
  );
};
