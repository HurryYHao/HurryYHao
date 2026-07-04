import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { globalQueue } from './worker/queue';
import { processor } from './worker/processor';
import { initDatabase, migrateFromLocalStorage } from './storage/database/local-storage';

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
    console.log('[DB] 数据库连接成功');
    
    // 迁移 storage.json 中的历史数据到数据库
    try {
      await migrateFromLocalStorage();
    } catch (e) {
      console.warn('[DB] 数据迁移跳过:', (e as Error).message);
    }
  } catch (e) {
    console.error('[DB] 数据库初始化失败:', (e as Error).message);
    console.warn('[DB] 将使用降级模式运行');
  }
  // 启动后台队列和处理器
  await globalQueue.start();
  processor.start();

  // 启动监控任务
  await globalQueue.enqueue('monitor', {}, 3);

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.COZE_PROJECT_ENV
      }`,
    );
  });
});
