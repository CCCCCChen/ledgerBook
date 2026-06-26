# 💰 个人收支预算管家

一站式个人财务管理工具，支持多账户收支流水记录、灵活预算管控、多维度消费统计分析。提供 **Web 版**和 **Electron 桌面版（exe）** 两种使用方式。

---

## ✨ 功能特性

- 💰 **多账户管理** — 支持支付宝花呗、支付宝余额、微信余额、信用卡、储蓄卡等多种账户类型，可自定义账单日
- 📊 **交易记录** — 收入/支出记录，支持分类（餐饮/购物/交通/娱乐/住房/其他）、备注、预算关联，按日期倒序排列
- 🎯 **预算管理** — 支持临时预算、每周固定、每月固定、每年固定四种周期类型，实时追踪已使用金额与剩余额度
- ⚠️ **超支预警** — 预算使用率超过 80% 黄色警告，超过 100% 红色超支标识
- 📈 **多维度统计** — 账单周期对比、分类支出环形图、时间趋势折线图、账户支出柱状图、预算执行对比
- 💾 **数据持久化** — Web 版使用 localStorage，桌面版使用 SQLite 数据库，数据完全掌握在自己手中
- 📥 **导入导出** — 支持 JSON 格式的数据导出备份与导入恢复
- 🖥️ **Electron 桌面版** — 一键安装的 exe 程序，系统托盘、开机自启、数据目录直达
- 📱 **响应式设计** — 桌面端、平板、手机全适配

---

## 🛠 技术栈

| 层级 | Web 版 | 桌面版 |
|------|--------|--------|
| 前端框架 | React 19 + TypeScript | 同 Web 版 |
| 样式方案 | Tailwind CSS v4 | 同 Web 版 |
| UI 组件库 | shadcn/ui（new-york 风格） | 同 Web 版 |
| 图表可视化 | ECharts（echarts-for-react） | 同 Web 版 |
| 路由 | react-router-dom v7 | 同 Web 版 |
| 数据存储 | localStorage | SQLite（better-sqlite3） |
| 后端服务 | — | Node.js + Express |
| 桌面框架 | — | Electron |
| 打包工具 | Vite 8 | electron-builder |
| 包管理 | npm | npm |

---

## 🚀 快速开始（Web 版）

### 前置要求

- **Node.js** >= 18
- **npm** >= 9

### 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`，支持热更新。

### 生产构建

```bash
npm run build
```

构建产物在 `dist/` 目录，可直接部署到任意静态服务器。

---

## 🖥️ Electron 桌面版

### 前置要求

- **Node.js** >= 18
- **npm** >= 9
- Windows 10+ / macOS 11+ / Linux（打包对应平台即可）

### 开发模式运行

```bash
# 1. 安装依赖（含 Electron）
npm install

# 2. 启动 Electron 开发模式
# 同时启动 Vite 前端开发服务器 + Electron 窗口
npm run electron:dev
```

> 开发模式下，前端运行在 `http://localhost:5173`，Electron 窗口自动加载该地址。后端 Express 服务运行在固定端口 `3001`。

### 打包为 exe 安装包

```bash
# 打包 Windows 版本（nsis 安装包 + portable 便携版）
npm run electron:build:win

# 打包 macOS 版本（dmg）
npm run electron:build:mac

# 打包 Linux 版本（AppImage + deb）
npm run electron:build:linux

# 打包当前平台
npm run electron:build
```

### 打包产物说明

打包完成后，产物在 `release/` 目录：

| 文件 | 说明 |
|------|------|
| `个人收支预算管家-0.1.0-setup.exe` | Windows 安装包（NSIS），支持自定义安装路径 |
| `个人收支预算管家-0.1.0-portable.exe` | Windows 便携版，无需安装，双击即用 |
| `个人收支预算管家-0.1.0.dmg` | macOS 安装镜像 |
| `个人收支预算管家-0.1.0.AppImage` | Linux AppImage 便携版 |

### 桌面版特性

- **系统托盘**：关闭窗口时自动最小化到系统托盘，右键托盘图标可显示窗口、打开数据目录或退出
- **开机自启**：可在应用内设置是否开机自动启动
- **数据目录直达**：托盘菜单或应用内可一键打开数据目录（SQLite 数据库文件所在位置）
- **数据库备份/恢复**：支持导出和导入 SQLite 数据库文件
- **窗口大小**：默认 1200×800，可自由调整，最小 800×600

---

## 📁 目录结构

```
├── src/                            # 前端源码
│   ├── index.tsx                   # 应用入口
│   ├── app.tsx                     # 路由配置
│   ├── index.css                   # 全局样式入口
│   ├── tailwind-theme.css          # 主题变量（蓝绿色系）
│   ├── api/
│   │   ├── client.ts               # API 客户端（自动适配 Electron/浏览器）
│   │   └── index.ts                # 业务 API 封装
│   ├── components/
│   │   ├── Layout.tsx              # 全局布局
│   │   ├── Header.tsx              # 顶部导航栏
│   │   └── ui/                     # shadcn/ui 组件库
│   ├── pages/
│   │   ├── TransactionsPage/       # 总账目表页
│   │   ├── BudgetsPage/            # 预算管理页
│   │   ├── StatisticsPage/         # 统计分析页
│   │   ├── AccountsPage/           # 账户管理页
│   │   └── NotFoundPage/           # 404 页面
│   ├── types/
│   │   └── finance.ts              # 业务类型定义
│   ├── data/
│   │   └── finance.ts              # Mock 数据与常量
│   └── lib/
│       ├── storage.ts              # localStorage 工具封装
│       ├── data-service.ts         # 统一数据服务层（API / localStorage 自适应）
│       ├── chart-colors.ts         # 图表配色常量
│       └── utils.ts                # 通用工具函数
├── server/                         # 后端服务（Electron 桌面版使用）
│   ├── start.cjs                   # 服务入口（供 Electron fork）
│   ├── index.cjs                   # Express 应用工厂
│   ├── db.cjs                      # SQLite 数据库初始化
│   └── routes/
│       ├── accounts.cjs            # 账户 API
│       ├── transactions.cjs        # 交易记录 API
│       ├── budgets.cjs             # 预算 API
│       └── statistics.cjs          # 统计 API
├── electron/                       # Electron 主进程
│   ├── main.cjs                    # 主进程入口（窗口/托盘/IPC）
│   └── preload.cjs                 # 预加载脚本（暴露 IPC 接口）
├── main.cjs                        # Electron 入口（根目录）
├── electron-builder.yml            # electron-builder 打包配置
├── assets/                         # 应用图标等资源
├── index.html                      # HTML 入口
├── vite.config.ts                  # Vite 配置
└── package.json                    # 项目依赖
```

---

## 📡 API 接口文档（Electron 桌面版）

桌面版内置 Express 后端服务，提供以下 RESTful API：

### 健康检查

```
GET /api/health
```

返回示例：
```json
{ "status": "ok", "timestamp": "2026-06-26T12:00:00.000Z" }
```

### 账户相关

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/accounts` | 获取所有账户 |
| `GET` | `/api/accounts/:id` | 获取单个账户 |
| `POST` | `/api/accounts` | 创建账户 |
| `PUT` | `/api/accounts/:id` | 更新账户 |
| `DELETE` | `/api/accounts/:id` | 删除账户 |

### 交易记录相关

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/transactions` | 获取交易列表（支持筛选参数） |
| `GET` | `/api/transactions/:id` | 获取单条交易 |
| `POST` | `/api/transactions` | 创建交易记录 |
| `PUT` | `/api/transactions/:id` | 更新交易记录 |
| `DELETE` | `/api/transactions/:id` | 删除交易记录 |

筛选参数（Query String）：
- `accountId` — 按账户筛选
- `category` — 按分类筛选
- `dateFrom` / `dateTo` — 日期范围
- `keyword` — 关键词搜索（备注/分类）
- `sortOrder` — 排序方向（asc/desc）

### 预算相关

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/budgets` | 获取所有预算（含执行统计） |
| `GET` | `/api/budgets/:id` | 获取单个预算 |
| `POST` | `/api/budgets` | 创建预算项目 |
| `PUT` | `/api/budgets/:id` | 更新预算项目 |
| `DELETE` | `/api/budgets/:id` | 删除预算项目 |

### 统计相关

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/statistics/overview` | 总览统计 |
| `GET` | `/api/statistics/billing-cycle` | 账单周期统计 |
| `GET` | `/api/statistics/budget-execution` | 预算执行统计 |
| `GET` | `/api/statistics/category-distribution` | 分类支出分布 |
| `GET` | `/api/statistics/trend?granularity=daily` | 时间趋势（daily/weekly/monthly） |
| `GET` | `/api/statistics/account-comparison` | 账户支出对比 |
| `GET` | `/api/statistics/over-budget-alerts` | 超支预警 |

---

## 🗄 数据存储

### Web 版

使用浏览器 `localStorage` 进行数据持久化，通过 `scopedStorage` 封装实现应用级隔离。

### Electron 桌面版

使用 **SQLite** 数据库，文件存储在用户数据目录：

- **Windows**: `%APPDATA%/个人收支预算管家/budget.db`
- **macOS**: `~/Library/Application Support/个人收支预算管家/budget.db`
- **Linux**: `~/.config/个人收支预算管家/budget.db`

> 💡 在应用内点击"打开数据目录"即可在文件管理器中定位到数据库文件，方便备份。

### 数据导入导出

- **导出**：点击页面顶部"导出数据"按钮，下载包含全部交易、预算、账户数据的 JSON 文件
- **导入**：点击"导入数据"按钮选择 JSON 文件，数据将合并到现有数据中
- **桌面版额外支持**：系统托盘菜单提供"导出数据库"和"导入数据库"功能，直接操作 SQLite 文件

---

## 🎨 主题配色

采用清爽的**薄荷绿 + 青灰**配色方案。

| 角色 | 色值 | 用途 |
|------|------|------|
| 主色（Primary） | `hsl(175 55% 38%)` | CTA 按钮、进度条、激活态 |
| 背景（Background） | `hsl(180 20% 98%)` | 页面底色 |
| 卡片（Card） | `hsl(0 0% 100%)` | 卡片与弹层背景 |
| 文字（Foreground） | `hsl(200 15% 15%)` | 正文文字 |
| 收入绿 | `hsl(150 50% 40%)` | 收入金额与标识 |
| 支出红 | `hsl(0 84% 60%)` | 支出金额与删除操作 |
| 预警琥珀 | `hsl(35 90% 48%)` | 预算超支警告 |

---

## ❓ 常见问题

### Web 版数据存在哪里？

所有数据存储在浏览器的 `localStorage` 中，不会上传到任何服务器。清除浏览器缓存会导致数据丢失，请定期导出备份。

### 桌面版数据存在哪里？

SQLite 数据库文件存储在系统用户数据目录（见上方"数据存储"章节）。可通过托盘菜单或应用内"打开数据目录"找到。

### 如何迁移数据？

1. 在旧设备上点击"导出数据"下载 JSON 文件
2. 将 JSON 文件传输到新设备
3. 在新设备上打开应用，点击"导入数据"选择该文件

桌面版也可以直接复制 `budget.db` 文件到新设备的对应目录。

### 如何修改端口？

桌面版后端端口由 Electron 主进程自动分配（随机可用端口），无需手动配置。Web 开发模式后端固定使用 `3001` 端口。

### 支持多用户吗？

当前版本为单用户设计。桌面版每个系统用户拥有独立的数据库文件，天然隔离。

### 如何修改配色？

编辑 `src/tailwind-theme.css` 中 `:root` 块内的 HSL 颜色变量，重新构建即可。

---

## 📝 更新日志

### v0.2.0（2026-06-26）

- 🖥️ 新增 Electron 桌面版支持
- 🗄️ 后端改用 SQLite 数据库（better-sqlite3）
- 🔌 新增 Express RESTful API 服务
- 📦 支持 electron-builder 打包为 exe/dmg/AppImage
- 🖱️ 系统托盘支持（最小化到托盘、右键菜单）
- 🚀 开机自启选项
- 📂 数据目录直达、数据库备份/恢复

### v0.1.0（2026-06-26）

- 🎉 初始版本发布
- ✅ 总账目表：交易记录 CRUD、筛选、导入导出
- ✅ 预算管理：四种周期类型、进度追踪、超支预警
- ✅ 统计分析：账单周期、分类饼图、趋势折线、账户对比
- ✅ 账户管理：多类型账户、账单日设置
- ✅ 响应式布局：桌面端 + 移动端适配
- ✅ 蓝绿色系主题配色

---

## 📄 License

MIT
