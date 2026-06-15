const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const logger = require('./logger');

// 确保 SQLite 数据目录存在
const dataDir = path.resolve(
  __dirname,
  '..',
  'data'
);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const { sequelize } = require('./models');
const authRouter = require('./routes/auth');
const coursesRouter = require('./routes/courses');
const enrollmentRouter = require('./routes/enrollment');
const adminRouter = require('./routes/admin');
const teachersRouter = require('./routes/teachers');
const organizationRouter = require('./routes/organization');
const classroomsRouter = require('./routes/classrooms');
const schedulesRouter = require('./routes/schedules');
const semestersRouter = require('./routes/semesters');
const gradesRouter = require('./routes/grades');
const evaluationsRouter = require('./routes/evaluations');
const messagesRouter = require('./routes/messages');
const announcementsRouter = require('./routes/announcements');
const { router: courseResourcesRouter, UPLOAD_DIR } = require('./routes/courseResources');
const questionnairesRouter = require('./routes/questionnaires');
const seed = require('./seed').seed;

const PORT = parseInt(process.env.PORT || '8137', 10);

const app = express();
app.use(cors({ origin: true, credentials: true }));

let isShuttingDown = false;
let httpServer = null;

app.use((req, res, next) => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
    res.status(503).json({ ok: false, message: '服务正在关闭，请稍后重试' });
    return;
  }
  next();
});

app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true, status: 'alive' });
});

app.get('/readyz', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.status(200).json({ ok: true, status: 'ready', db: 'connected' });
  } catch (e) {
    res.status(503).json({ ok: false, status: 'not_ready', db: 'disconnected', error: e.message });
  }
});

app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/students', enrollmentRouter);
app.use('/api/admin', adminRouter);
app.use('/api/teachers', teachersRouter);
app.use('/api/admin/org', organizationRouter);
app.use('/api/admin/classrooms', classroomsRouter);
app.use('/api/admin/schedules', schedulesRouter);
app.use('/api/semesters', semestersRouter);
app.use('/api/admin/semesters', semestersRouter);
app.use('/api/grades', gradesRouter);
app.use('/api/evaluations', evaluationsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/resources', courseResourcesRouter);
app.use('/api/questionnaires', questionnairesRouter);
app.use('/uploads', express.static(UPLOAD_DIR));

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ ok: false, message: err.message || '服务器错误' });
});

async function waitDb(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await sequelize.authenticate();
      return;
    } catch (e) {
      logger.warn('Database not ready, retry', { attempt: i + 1, error: e.message });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Database connect timeout');
}

async function start() {
  try {
    await waitDb();
    logger.info('Database connected');
  } catch (e) {
    logger.error('Database connect failed', { error: e.message });
    process.exit(1);
  }
  try {
    await sequelize.sync({ alter: true });
  } catch (e) {
    logger.warn('Sync warning (continuing)', { error: e.message });
  }
  try {
    await seed();
  } catch (e) {
    logger.error('Seed failed, server will still start', { error: e.message });
  }
  httpServer = app.listen(PORT, '0.0.0.0', () => {
    logger.info('Server listening', { port: PORT, url: `http://0.0.0.0:${PORT}` });
  });
}

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('Graceful shutdown started', { signal });

  const forceTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);
  forceTimeout.unref();

  const shutdownSteps = [];

  if (httpServer) {
    shutdownSteps.push(new Promise((resolve) => {
      logger.info('Closing HTTP server (stopping accepting new requests)');
      httpServer.close((err) => {
        if (err) {
          logger.warn('HTTP server close error', { error: err.message });
        } else {
          logger.info('HTTP server closed (all in-flight requests completed)');
        }
        resolve();
      });
    }));
  }

  Promise.all(shutdownSteps)
    .then(() => {
      logger.info('Closing database connection');
      return sequelize.close();
    })
    .then(() => {
      logger.info('Database connection closed');
      clearTimeout(forceTimeout);
      logger.info('Graceful shutdown completed');
      process.exit(0);
    })
    .catch((e) => {
      logger.error('Error during graceful shutdown', { error: e.message });
      clearTimeout(forceTimeout);
      process.exit(1);
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

start().catch((e) => {
  logger.error('Start failed', { error: e.message });
  process.exit(1);
});
