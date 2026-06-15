const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'CourseResource',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      courseId: { type: DataTypes.INTEGER, allowNull: false, field: 'course_id' },
      fileName: { type: DataTypes.STRING(255), allowNull: false, field: 'file_name' },
      storagePath: { type: DataTypes.STRING(512), allowNull: false, field: 'storage_path' },
      uploadedBy: { type: DataTypes.INTEGER, allowNull: false, field: 'uploaded_by' },
      uploaderName: { type: DataTypes.STRING(128), allowNull: true, field: 'uploader_name' },
      uploadTime: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'upload_time' },
      fileSize: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, field: 'file_size' },
      downloadCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'download_count' },
    },
    {
      tableName: 'course_resource',
      timestamps: false,
      indexes: [
        { fields: ['course_id'] },
        { fields: ['uploaded_by'] },
      ],
    }
  );
};
