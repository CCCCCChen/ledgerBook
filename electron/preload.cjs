const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * 获取后端 API 基础地址
   * 主进程启动 Express 服务后通过 IPC 返回实际端口
   * @returns {Promise<string>} 如 'http://127.0.0.1:34567'
   */
  getApiBaseUrl: () => ipcRenderer.invoke('get-api-base-url'),

  /**
   * 在系统文件管理器中打开数据目录
   * 方便用户找到 SQLite 数据库文件进行备份
   * @returns {Promise<void>}
   */
  openDataDirectory: () => ipcRenderer.invoke('open-data-directory'),

  /**
   * 导出数据库文件到用户指定位置
   * 弹出保存对话框，将 SQLite 数据库文件复制到目标路径
   * @returns {Promise<{success: boolean, filePath?: string, error?: string}>}
   */
  exportDatabase: () => ipcRenderer.invoke('export-database'),

  /**
   * 从用户指定位置导入数据库文件
   * 弹出打开对话框，将选中的 SQLite 文件替换当前数据库
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  importDatabase: () => ipcRenderer.invoke('import-database'),

  /**
   * 获取应用版本号
   * @returns {Promise<string>}
   */
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  /**
   * 获取用户数据目录路径
   * @returns {Promise<string>}
   */
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),

  /**
   * 设置窗口关闭行为
   * @param {'quit' | 'tray'} behavior - quit: 直接退出, tray: 最小化到托盘
   */
  setCloseBehavior: (behavior) => ipcRenderer.send('set-close-behavior', behavior),

  /**
   * 设置开机自启
   * @param {boolean} enabled
   * @returns {Promise<boolean>}
   */
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),

  /**
   * 获取开机自启状态
   * @returns {Promise<boolean>}
   */
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),

  /**
   * 监听主进程发送的消息
   * @param {string} channel
   * @param {(...args: any[]) => void} callback
   */
  on: (channel, callback) => {
    const validChannels = ['api-base-url-ready', 'deep-link'];
    if (validChannels.includes(channel)) {
      const subscription = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
    return () => {};
  },

  /**
   * 移除主进程消息监听
   * @param {string} channel
   * @param {(...args: any[]) => void} callback
   */
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },
});
