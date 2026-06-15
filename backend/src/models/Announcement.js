const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Announcement',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      title: { type: DataTypes.STRING(200), allowNull: false },
      content: { type: DataTypes.TEXT, allowNull: false },
      category: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'system' },
      publisherId: { type: DataTypes.INTEGER, allowNull: false, field: 'publisher_id' },
      publisherName: { type: DataTypes.STRING(64), allowNull: false, field: 'publisher_name' },
      isPinned: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_pinned' },
      viewCount: { type: DataTypes.INTEGER, defaultValue: 0, field: 'view_count' },
      publishedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'published_at' },
    },
    { tableName: 'announcement', timestamps: false }
  );
};
