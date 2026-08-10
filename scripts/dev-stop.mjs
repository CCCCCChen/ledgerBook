#!/usr/bin/env node
/**
 * dev:stop — 清理 npm run dev / electron:dev 残留进程，释放 8001 端口
 *
 * 用法：npm run dev:stop
 */

import { execSync } from 'node:child_process';
import process from 'node:process';

const PORT = process.env.CLIENT_DEV_PORT || '8001';

function log(msg) {
  console.log(`[dev:stop] ${msg}`);
}

function killByPortWindows(port) {
  try {
    const out = execSync(`netstat -ano | findstr ":${port}"`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (!out) {
      log(`no process found on port ${port}`);
      return [];
    }
    const pids = new Set();
    for (const line of out.split('\n').filter(Boolean)) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && pid !== String(process.pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        log(`killed pid=${pid} on port ${port}`);
      } catch {
        log(`failed to kill pid=${pid}`);
      }
    }
    return [...pids];
  } catch {
    log(`no process found on port ${port}`);
    return [];
  }
}

function killByPortUnix(port) {
  try {
    const out = execSync(`lsof -ti:${port}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (!out) {
      log(`no process found on port ${port}`);
      return [];
    }
    const pids = out.split('\n').filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGKILL');
        log(`killed pid=${pid} on port ${port}`);
      } catch {
        log(`failed to kill pid=${pid}`);
      }
    }
    return pids;
  } catch {
    log(`no process found on port ${port}`);
    return [];
  }
}

log('cleaning up dev processes...');
const killed = process.platform === 'win32'
  ? killByPortWindows(PORT)
  : killByPortUnix(PORT);

if (killed.length === 0) {
  log(`port ${PORT} is already free`);
} else {
  log(`port ${PORT} released (killed ${killed.length} process(es))`);
}
