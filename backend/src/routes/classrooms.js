const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const router = express.Router();
const { Classroom, Schedule } = require('../models');
const logger = require('../logger');

router.get('/', async (req, res) => {
  try {
    const building = (req.query.building || '').trim();
    const minCapacity = req.query.minCapacity ? parseInt(req.query.minCapacity, 10) : null;
    const where = {};
    if (building) where.building = building;
    if (minCapacity && !Number.isNaN(minCapacity)) where.capacity = { [Op.gte]: minCapacity };
    const list = await Classroom.findAll({
      where,
      order: [['id']],
    });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: list });
  } catch (e) {
    logger.error('List classrooms error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.get('/buildings', async (req, res) => {
  try {
    const rows = await Classroom.findAll({
      attributes: ['building'],
      group: ['building'],
      raw: true,
    });
    const buildings = rows.map((r) => r.building).filter(Boolean);
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: buildings });
  } catch (e) {
    logger.error('List buildings error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

const classroomValidators = [
  body('building').trim().notEmpty().withMessage('教学楼不能为空'),
  body('roomNumber').trim().notEmpty().withMessage('房间号不能为空'),
  body('capacity').isInt({ min: 0 }).withMessage('容量必须为非负整数'),
  body('isMultimedia').optional().isBoolean().withMessage('是否多媒体格式错误'),
];

router.post('/', classroomValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const { building, roomNumber, capacity, isMultimedia } = req.body;
  try {
    const row = await Classroom.create({
      building: building.trim(),
      roomNumber: roomNumber.trim(),
      capacity: Number(capacity),
      isMultimedia: isMultimedia === true || isMultimedia === 1,
    });
    return res.status(201).set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: row });
  } catch (e) {
    logger.error('Create classroom error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.put('/:id', param('id').isInt({ min: 1 }), classroomValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ ok: false, message: errors.array()[0].msg });
  const id = parseInt(req.params.id, 10);
  const { building, roomNumber, capacity, isMultimedia } = req.body;
  try {
    const [n] = await Classroom.update(
      {
        building: building.trim(),
        roomNumber: roomNumber.trim(),
        capacity: Number(capacity),
        isMultimedia: isMultimedia === true || isMultimedia === 1,
      },
      { where: { id } }
    );
    if (n === 0) return res.status(404).json({ ok: false, message: '教室不存在' });
    const updated = await Classroom.findByPk(id);
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, data: updated });
  } catch (e) {
    logger.error('Update classroom error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

router.delete('/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await Schedule.destroy({ where: { classroomId: id } });
    const n = await Classroom.destroy({ where: { id } });
    if (n === 0) return res.status(404).json({ ok: false, message: '教室不存在' });
    return res.set('Content-Type', 'application/json; charset=utf-8').json({ ok: true, message: '已删除' });
  } catch (e) {
    logger.error('Delete classroom error', { error: e.message });
    return res.status(500).json({ ok: false, message: '服务器错误' });
  }
});

module.exports = router;
