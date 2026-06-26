/**
 * server/start.js — 后端服务独立入口（供 Electron fork 使用）
 * 启动后向 stdout 打印 SERVER_READY:<url> 信号，主进程据此获取端口
 */
const path = require('path');
const { createServer } = require('./index.cjs');

const PORT = parseInt(process.env.PORT || '0', 10);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'budget.db');

async function main() {
  try {
    const { port } = await createServer({
      dbPath: DB_PATH,
      port: PORT,
      staticDir: process.env.NODE_ENV === 'production'
        ? path.join(__dirname, '..', 'dist')
        : undefined,
    });

    // 向 stdout 打印就绪信号，Electron 主进程通过此信号获取端口
    console.log(`SERVER_READY:http://127.0.0.1:${port}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
