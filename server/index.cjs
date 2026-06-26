const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./db.cjs');
const accountsRouter = require('./routes/accounts.cjs');
const transactionsRouter = require('./routes/transactions.cjs');
const budgetsRouter = require('./routes/budgets.cjs');
const statisticsRouter = require('./routes/statistics.cjs');

/**
 * 创建 Express 应用实例
 * @param {object} options
 * @param {string} options.dbPath - SQLite 数据库文件路径
 * @param {number} options.port - 监听端口（0 表示随机端口）
 * @param {string} [options.staticDir] - 前端静态文件目录（生产模式）
 * @returns {Promise<{ app: import('express').Express, server: import('http').Server, port: number }>}
 */
async function createServer({ dbPath, port, staticDir }) {
  const app = express();

  // 初始化数据库
  initDatabase(dbPath);

  // CORS
  app.use(cors({
    origin: true,
    credentials: true,
  }));

  // 解析 JSON 请求体
  app.use(express.json({ limit: '5mb' }));

  // 健康检查
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 挂载业务路由
  app.use('/api/accounts', accountsRouter);
  app.use('/api/transactions', transactionsRouter);
  app.use('/api/budgets', budgetsRouter);
  app.use('/api/statistics', statisticsRouter);

  // 生产模式：托管前端静态文件
  if (staticDir) {
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  // 全局错误处理
  app.use((err, _req, res, _next) => {
    console.error('[Server Error]', err.message);
    res.status(err.status || 500).json({
      error: err.message || '服务器内部错误',
    });
  });

  // 启动监听
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const actualPort = server.address().port;
      console.log(`[Server] 后端服务已启动，端口: ${actualPort}`);
      resolve({ app, server, port: actualPort });
    });
    server.on('error', reject);
  });
}

module.exports = { createServer };
