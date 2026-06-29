const { app, BrowserWindow, Tray, Menu, dialog, shell, nativeImage, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const APP_NAME = '个人收支预算管家';
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:8001';
const IS_DEV = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL;
const SERVER_PORT = IS_DEV ? 3001 : 0;

let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverInstance = null;
let serverUrl = '';
let serverStartPromise = null;

function getRendererEntryPath() {
  return path.join(__dirname, '..', 'dist', 'index.html');
}

function getDatabasePath() {
  return path.join(app.getPath('userData'), 'budget.db');
}

function createDefaultTrayIcon() {
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const offset = i * 4;
    canvas[offset] = 43;
    canvas[offset + 1] = 167;
    canvas[offset + 2] = 160;
    canvas[offset + 3] = 255;
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function attachWindowDebugHooks(window) {
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[main] 页面加载失败:', { errorCode, errorDescription, validatedURL });
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main] 渲染进程异常退出:', details);
  });
}

function loadRenderer(window) {
  if (IS_DEV) {
    window.loadURL(DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  window.loadFile(getRendererEntryPath());
}

function buildServerEnv() {
  return {
    ...process.env,
    PORT: String(SERVER_PORT),
    DB_PATH: getDatabasePath(),
    NODE_ENV: IS_DEV ? 'development' : 'production',
  };
}

function startServer() {
  return new Promise((resolve, reject) => {
    const env = buildServerEnv();

    if (app.isPackaged) {
      const { createServer } = require(path.join(__dirname, '..', 'server', 'index.cjs'));
      createServer({
        dbPath: env.DB_PATH,
        port: SERVER_PORT,
        staticDir: path.join(__dirname, '..', 'dist'),
      })
        .then(({ server, port }) => {
          serverInstance = server;
          serverUrl = `http://127.0.0.1:${port}`;
          resolve(serverUrl);
        })
        .catch(reject);
      return;
    }

    const serverEntry = path.join(__dirname, '..', 'server', 'start.cjs');
    serverProcess = fork(serverEntry, [], {
      env,
      silent: true,
    });

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) {
        reject(new Error('后端服务启动超时（15 秒）'));
      }
    }, 15000);

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      console.log('[server]', msg);
      if (msg.startsWith('SERVER_READY:')) {
        started = true;
        clearTimeout(timeout);
        serverUrl = msg.replace('SERVER_READY:', '').trim();
        resolve(serverUrl);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[server:err]', data.toString().trim());
    });

    serverProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    serverProcess.on('exit', (code) => {
      if (!started) {
        clearTimeout(timeout);
        reject(new Error(`后端进程异常退出，退出码: ${code}`));
      }
    });
  });
}

function ensureServerStarted() {
  if (serverUrl) {
    return Promise.resolve(serverUrl);
  }

  if (!serverStartPromise) {
    serverStartPromise = startServer()
      .then((url) => {
        console.log(`[main] 后端服务已启动: ${url}`);
        return url;
      })
      .catch((error) => {
        serverStartPromise = null;
        console.error('[main] 后端服务启动失败:', error);
        return '';
      });
  }

  return serverStartPromise;
}

function stopServer() {
  serverStartPromise = null;
  serverUrl = '';

  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
}

function copyDatabaseFile(sourcePath, targetPath) {
  fs.copyFileSync(sourcePath, targetPath);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  attachWindowDebugHooks(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (tray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  loadRenderer(mainWindow);
  return mainWindow;
}

function createTray() {
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
  tray.setContextMenu(Menu.buildFromTemplate([
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
  ]));

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  void ensureServerStarted();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopServer();
});

ipcMain.handle('get-api-base-url', async () => {
  return ensureServerStarted();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

ipcMain.handle('open-data-directory', () => {
  shell.openPath(app.getPath('userData'));
  return true;
});

ipcMain.handle('export-database', async () => {
  await ensureServerStarted();
  const dbPath = getDatabasePath();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出数据库',
    defaultPath: `budget-backup-${new Date().toISOString().slice(0, 10)}.db`,
    filters: [
      { name: 'SQLite 数据库', extensions: ['db'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return { success: false };
  }

  if (!fs.existsSync(dbPath)) {
    return { success: false, error: '数据库文件不存在' };
  }

  try {
    const { checkpointDatabase } = require(path.join(__dirname, '..', 'server', 'db.cjs'));
    checkpointDatabase();
  } catch {}

  stopServer();
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {}
    try {
      db.close();
    } catch {}
  } catch {}
  copyDatabaseFile(dbPath, result.filePath);
  void ensureServerStarted();
  return { success: true, path: result.filePath };
});

ipcMain.handle('import-database', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入数据库',
    filters: [
      { name: 'SQLite 数据库', extensions: ['db'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false };
  }

  const dbPath = getDatabasePath();
  const sourcePath = result.filePaths[0];
  const backupPath = `${dbPath}.backup-${Date.now()}`;

  stopServer();

  try {
    if (fs.existsSync(dbPath)) {
      copyDatabaseFile(dbPath, backupPath);
    }
  } catch {
    // 备份失败不阻塞导入
  }

  copyDatabaseFile(sourcePath, dbPath);
  void ensureServerStarted();
  return { success: true, path: sourcePath };
});

ipcMain.handle('get-auto-launch', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('set-auto-launch', (_event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
  });
  return app.getLoginItemSettings().openAtLogin;
});
