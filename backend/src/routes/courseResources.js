const path = require('path');
const fs = require('fs');
const express = require('express');
const { Op } = require('sequelize');
const multer = require('multer');
const router = express.Router();
const { CourseResource, Course, Teacher, Admin } = require('../models');
const logger = require('../logger');

const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const courseId = req.body.courseId || req.params.courseId || '0';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname);
    const safeName = `${courseId}_${timestamp}_${random}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

async function resolveUploaderName(uploadedBy, role) {
  try {
    if (role === 'teacher') {
      const t = await Teacher.findByPk(uploadedBy, { attributes: ['name'] });
      if (t) return t.name;
    } else if (role === 'admin') {
      const a = await Admin.findByPk(uploadedBy, { attributes: ['username'] });
      if (a) return a.username;
    }
  } catch (_) {}
  return null;
}

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const courseId = parseInt(req.body.courseId, 10);
    const uploadedBy = parseInt(req.body.uploadedBy, 10);
    const uploaderRole = (req.body.uploaderRole || '').trim();
    const originalName = req.file ? req.file.originalname : '';

    if (!courseId || Number.isNaN(courseId)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, message: '无效的课程 ID' });
    }
    if (!uploadedBy || Number.isNaN(uploadedBy)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ ok: false, message: '无效的上传者 ID' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, message: '未接收到文件' });
    }

    const course = await Course.findByPk(courseId);
    if (!course) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ ok: false, message: '课程不存在' });
    }

    const uploaderName = await resolveUploaderName(uploadedBy, uploaderRole);
    const resource = await CourseResource.create({
      courseId,
      fileName: originalName,
      storagePath: req.file.filename,
      uploadedBy,
      uploaderName,
      uploadTime: new Date(),
      fileSize: req.file.size,
      downloadCount: 0,
    });

    return res
      .status(201)
      .set('Content-Type', 'application/json; charset=utf-8')
      .json({ ok: true, data: resource.toJSON() });
  } catch (e) {
    logger.error('Upload resource error', { error: e.message });
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get('/course/:courseId', async (req, res) => {
  try {
    const courseId = parseInt(req.params.courseId, 10);
    if (Number.isNaN(courseId)) return res.status(400).json({ ok: false, message: '无效的课程 ID' });

    const keyword = (req.query.keyword || '').trim();
    const where = { courseId };
    if (keyword) {
      where.fileName = { [Op.like]: `%${keyword}%` };
    }

    const list = await CourseResource.findAll({
      where,
      order: [['uploadTime', 'DESC']],
      attributes: ['id', 'fileName', 'storagePath', 'uploadedBy', 'uploaderName', 'uploadTime', 'fileSize', 'downloadCount'],
    });

    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: list });
  } catch (e) {
    logger.error('List resources error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get('/download/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ ok: false, message: '无效的资源 ID' });

    const resource = await CourseResource.findByPk(id);
    if (!resource) return res.status(404).json({ ok: false, message: '资源不存在' });

    const filePath = path.join(UPLOAD_DIR, resource.storagePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, message: '文件已丢失' });
    }

    await CourseResource.update(
      { downloadCount: resource.downloadCount + 1 },
      { where: { id } }
    );

    const encodedFileName = encodeURIComponent(resource.fileName);
    res.setHeader('Content-Disposition', `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', resource.fileSize);

    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      logger.error('File stream error', { error: err.message });
      res.status(500).end();
    });
    stream.pipe(res);
  } catch (e) {
    logger.error('Download resource error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.put('/:id/rename', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ ok: false, message: '无效的资源 ID' });

    const newFileName = (req.body.fileName || '').trim();
    if (!newFileName) return res.status(400).json({ ok: false, message: '文件名不能为空' });

    const resource = await CourseResource.findByPk(id);
    if (!resource) return res.status(404).json({ ok: false, message: '资源不存在' });

    resource.fileName = newFileName;
    await resource.save();

    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: resource.toJSON() });
  } catch (e) {
    logger.error('Rename resource error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ ok: false, message: '无效的资源 ID' });

    const resource = await CourseResource.findByPk(id);
    if (!resource) return res.status(404).json({ ok: false, message: '资源不存在' });

    const filePath = path.join(UPLOAD_DIR, resource.storagePath);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    await CourseResource.destroy({ where: { id } });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete resource error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = { router, UPLOAD_DIR };
