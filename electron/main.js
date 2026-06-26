import { logger } from '@lark-apaas/client-toolkit-lite';
const { app, BrowserWindow, Tray, Menu, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const { fork } = require('child_process');

// ============================================================
// 常量
// ============================================================
const APP_NAME = '个人收支预算管家';
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const IS_DEV = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL;

// 后端服务端口：开发模式固定 3001，生产模式随机可用端口
const SERVER_PORT = IS_DEV ? 3001 : 0;

// ============================================================
// 全局引用
// ============================================================
let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverUrl = '';

// ============================================================
// 后端服务管理
// ============================================================
function startServer() {
  return new Promise((resolve, reject) => {
    const serverEntry = path.join(__dirname, '..', 'server', 'start.js');
    const userDataPath = app.getPath('userData');

    const env = {
      ...process.env,
      PORT: String(SERVER_PORT),
      DB_PATH: path.join(userDataPath, 'budget.db'),
      NODE_ENV: IS_DEV ? 'development' : 'production',
    };

    serverProcess = fork(serverEntry, [], {
      env,
      silent: true,
    });

    // 监听子进程 stdout 获取服务地址
    let started = false;
    const timeout = setTimeout(() => {
      if (!started) {
        reject(new Error('后端服务启动超时（15 秒）'));
      }
    }, 15000);

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      logger.info('[server]', String(msg));

      // 后端启动后会打印 SERVER_READY:http://localhost:PORT
      if (msg.startsWith('SERVER_READY:')) {
        started = true;
        clearTimeout(timeout);
        serverUrl = msg.replace('SERVER_READY:', '').trim();
        resolve(serverUrl);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      logger.error('[server:err]', String(data.toString().trim()));
    });

    serverProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      if (!started) {
        clearTimeout(timeout);
        reject(new Error(`后端进程异常退出，退出码: ${code}`));
      }
    });
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// ============================================================
// 窗口管理
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  // 窗口准备好后再显示，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 关闭窗口时最小化到托盘（而非退出）
  mainWindow.on('close', (event) => {
    if (tray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // 加载前端
  if (IS_DEV) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const distPath = path.join(__dirname, '..', 'dist');
    mainWindow.loadFile(path.join(distPath, 'index.html'));
  }

  return mainWindow;
}

// ============================================================
// 系统托盘
// ============================================================
function createTray() {
  // 使用 16x16 的简单图标（用 nativeImage 创建占位图标）
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = createDefaultTrayIcon();
    }
  } catch {
    trayIcon = createDefaultTrayIcon();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip(APP_NAME);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: '打开数据目录',
      click: () => {
        shell.openPath(app.getPath('userData'));
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // 双击托盘图标显示窗口
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createDefaultTrayIcon() {
  // 创建一个 16x16 的纯色图标作为兜底
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const offset = i * 4;
    canvas[offset] = 43;     // R
    canvas[offset + 1] = 167; // G
    canvas[offset + 2] = 160; // B
    canvas[offset + 3] = 255; // A
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

// ============================================================
// 应用生命周期
// ============================================================
app.isQuitting = false;

// 防止多实例
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  try {
    // 1. 启动后端服务
    logger.info('[main] 正在启动后端服务...');
    const url = await startServer();
    logger.info(`[main] 后端服务已启动: ${url}`);

    // 2. 创建主窗口
    createWindow();

    // 3. 创建系统托盘
    createTray();

    // 4. macOS: 点击 Dock 图标重新创建窗口
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else if (mainWindow) {
        mainWindow.show();
      }
    });
  } catch (err) {
    logger.error('[main] 启动失败:', String(err));
    dialog.showErrorBox('启动失败', `无法启动后端服务：\n${err.message}\n\n请检查端口是否被占用或数据库文件是否可写。`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // macOS 下不退出（除非 Cmd+Q）
  if (process.platform !== 'darwin' && !tray) {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopServer();
});

// ============================================================
// IPC 通信（暴露给渲染进程的能力）
// ============================================================
const { ipcMain } = require('electron');

// 获取后端 API 地址
ipcMain.handle('get-api-base-url', () => {
  return serverUrl;
});

// 获取应用版本
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// 获取用户数据目录
ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

// 打开数据目录
ipcMain.handle('open-data-directory', () => {
  shell.openPath(app.getPath('userData'));
  return true;
});

// 导出数据库文件
ipcMain.handle('export-database', async () => {
  const dbPath = path.join(app.getPath('userData'), 'budget.db');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出数据库',
    defaultPath: `budget-backup-${new Date().toISOString().slice(0, 10)}.db`,
    filters: [
      { name: 'SQLite 数据库', extensions: ['db'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });

  if (!result.canceled && result.filePath) {
    const fs = require('fs');
    fs.copyFileSync(dbPath, result.filePath);
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

// 导入数据库文件
ipcMain.handle('import-database', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入数据库',
    filters: [
      { name: 'SQLite 数据库', extensions: ['db'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const dbPath = path.join(app.getPath('userData'), 'budget.db');
    const fs = require('fs');

    // 先备份当前数据库
    const backupPath = dbPath + '.backup-' + Date.now();
    try {
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, backupPath);
      }
    } catch {
      // 备份失败不阻塞导入
    }

    fs.copyFileSync(result.filePaths[0], dbPath);
    return { success: true, path: result.filePaths[0] };
  }
  return { success: false };
});

// 获取开机自启状态
ipcMain.handle('get-auto-launch', () => {
  return app.getLoginItemSettings().openAtLogin;
});

// 设置开机自启
ipcMain.handle('set-auto-launch', (_event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
  });
  return app.getLoginItemSettings().openAtLogin;
});
