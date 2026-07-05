import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { globalQueue } from './worker/queue';
import { processor } from './worker/processor';
import { initDatabase, migrateFromLocalStorage } from './storage/database/local-storage';
import { startRecordingCleanupScheduler } from './lib/server/recorder';
import { logger } from './lib/server/logger';

const dev = process.env.COZE_PROJECT_ENV !== 'PROD';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.DEPLOY_RUN_PORT || process.env.PORT || '3000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // 初始化数据库连接
  try {
    await initDatabase();
    logger.info('[DB] 数据库连接成功');
    
    // 迁移 storage.json 中的历史数据到数据库
    try {
      await migrateFromLocalStorage();
    } catch (e) {
      logger.warn('[DB] 数据迁移跳过:', (e as Error).message);
    }
  } catch (e) {
    logger.error('[DB] 数据库初始化失败:', (e as Error).message);
    logger.warn('[DB] 将使用降级模式运行');
  }
  // 启动后台队列和处理器
  await globalQueue.start();
  processor.start();

  // 启动监控任务
  await globalQueue.enqueue('monitor', {}, 3);

  // 启动录音文件定时清理
  startRecordingCleanupScheduler();

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      logger.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    logger.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    logger.info(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.COZE_PROJECT_ENV
      }`,
    );
  });
});
