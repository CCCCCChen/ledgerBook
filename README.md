# 💰 个人预算与花销管理

一站式个人财务管理工具，支持多账户收支流水记录、灵活预算管控、多维度消费统计分析。

---

## ✨ 功能特性

- 💰 **多账户管理** — 支持支付宝花呗、支付宝余额、微信余额、信用卡、储蓄卡等多种账户类型，可自定义账单日
- 📊 **交易记录** — 收入/支出记录，支持分类（餐饮/购物/交通/娱乐/住房/其他）、备注、预算关联，按日期倒序排列
- 🎯 **预算管理** — 支持临时预算、每周固定、每月固定、每年固定四种周期类型，实时追踪已使用金额与剩余额度
- ⚠️ **超支预警** — 预算使用率超过 80% 黄色警告，超过 100% 红色超支标识
- 📈 **多维度统计** — 账单周期对比、分类支出环形图、时间趋势折线图、账户支出柱状图、预算执行对比
- 💾 **数据持久化** — 基于 localStorage 的本地数据存储，数据完全掌握在自己手中
- 📥 **导入导出** — 支持 JSON 格式的数据导出备份与导入恢复
- 📱 **响应式设计** — 桌面端、平板、手机全适配，移动端抽屉式导航

---

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 样式方案 | Tailwind CSS v4 |
| UI 组件库 | shadcn/ui（new-york 风格，57 个组件） |
| 图表可视化 | ECharts（echarts-for-react） |
| 图标 | lucide-react |
| 路由 | react-router-dom v7 |
| 动画 | framer-motion |
| 数据存储 | localStorage（scopedStorage 封装） |
| 构建工具 | Vite 8 |
| 包管理 | npm |

---

## 🚀 快速开始

### 前置要求

- **Node.js** >= 18
- **npm** >= 9

### 本地开发

```bash
# 1. 克隆项目
git clone <your-repo-url>
cd <project-directory>

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`，支持热更新。

### 生产构建

```bash
# 构建生产版本
npm run build

# 构建产物在 dist/ 目录，可直接部署到任意静态服务器
```

---

## 📁 目录结构

```
├── src/
│   ├── index.tsx                  # 应用入口（勿修改）
│   ├── app.tsx                    # 路由配置
│   ├── index.css                  # 全局样式入口
│   ├── tailwind-theme.css         # 主题变量（蓝绿色系）
│   ├── components/
│   │   ├── Layout.tsx             # 全局布局（Header + 内容区）
│   │   ├── Header.tsx             # 顶部导航栏
│   │   └── ui/                    # shadcn/ui 组件库（57 个）
│   ├── pages/
│   │   ├── TransactionsPage/      # 总账目表页
│   │   │   └── TransactionsPage.tsx
│   │   ├── BudgetsPage/           # 预算管理页
│   │   │   └── BudgetsPage.tsx
│   │   ├── StatisticsPage/        # 统计分析页
│   │   │   └── StatisticsPage.tsx
│   │   ├── AccountsPage/          # 账户管理页
│   │   │   └── AccountsPage.tsx
│   │   └── NotFoundPage/          # 404 页面
│   │       └── NotFoundPage.tsx
│   ├── types/
│   │   └── finance.ts             # 业务类型定义
│   ├── data/
│   │   └── finance.ts             # Mock 数据与常量
│   ├── lib/
│   │   ├── storage.ts             # localStorage 工具封装
│   │   ├── chart-colors.ts        # 图表配色常量
│   │   └── utils.ts               # 通用工具函数
│   └── hooks/
│       └── use-mobile.ts          # 移动端检测 Hook
├── public/                        # 静态资源
├── index.html                     # HTML 入口
├── vite.config.ts                 # Vite 配置
├── tsconfig.json                  # TypeScript 配置
└── package.json                   # 项目依赖
```

---

## 🗄 数据模型

### 交易记录（ITransaction）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `date` | `string` | 交易日期（ISO 格式） |
| `accountId` | `string` | 关联账户 ID |
| `amount` | `number` | 金额（正数=收入，负数=支出） |
| `category` | `TransactionCategory` | 分类：餐饮/购物/交通/娱乐/住房/其他 |
| `note` | `string` | 备注 |
| `isBudgeted` | `boolean` | 是否计入预算 |
| `budgetId` | `string?` | 关联预算项目 ID |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | 更新时间 |

### 预算项目（IBudget）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `name` | `string` | 预算名称（如"奶茶支出"） |
| `amount` | `number` | 预算金额 |
| `cycleType` | `BudgetCycleType` | 周期类型：once/weekly/monthly/yearly |
| `startDate` | `string` | 开始日期 |
| `endDate` | `string?` | 结束日期（临时预算必填） |
| `category` | `TransactionCategory?` | 关联分类 |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | 更新时间 |

### 账户（IAccount）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识 |
| `name` | `string` | 账户名称 |
| `type` | `AccountType` | 账户类型 |
| `billingDay` | `number?` | 账单日（1-28，仅信用卡/花呗） |
| `note` | `string` | 备注 |
| `createdAt` | `string` | 创建时间 |
| `updatedAt` | `string` | 更新时间 |

---

## 📡 数据存储

应用使用浏览器 `localStorage` 进行数据持久化，通过 `scopedStorage`（来自 `@lark-apaas/client-toolkit-lite`）封装实现应用级隔离。

| 存储键 | 数据类型 | 说明 |
|--------|----------|------|
| `__budget_transactions` | `ITransaction[]` | 交易记录列表 |
| `__budget_budgets` | `IBudget[]` | 预算项目列表 |
| `__budget_accounts` | `IAccount[]` | 账户列表 |

### 数据导入导出

- **导出**：点击页面顶部"导出数据"按钮，下载包含全部交易、预算、账户数据的 JSON 文件
- **导入**：点击"导入数据"按钮选择 JSON 文件，数据将合并到现有数据中（不会覆盖）

> ⚠️ **数据备份建议**：定期使用导出功能备份数据到本地，避免浏览器缓存清理导致数据丢失。

---

## 🎨 主题配色

采用清爽的**薄荷绿 + 青灰**配色方案，传递"健康财务"的积极信号。

| 角色 | 色值 | 用途 |
|------|------|------|
| 主色（Primary） | `hsl(175 55% 38%)` | CTA 按钮、进度条、激活态 |
| 背景（Background） | `hsl(180 20% 98%)` | 页面底色 |
| 卡片（Card） | `hsl(0 0% 100%)` | 卡片与弹层背景 |
| 文字（Foreground） | `hsl(200 15% 15%)` | 正文文字 |
| 辅助文字（Muted） | `hsl(195 8% 50%)` | 占位符、元信息 |
| 强调底（Accent） | `hsl(200 50% 92%)` | hover/选中态背景 |
| 收入绿 | `hsl(150 50% 40%)` | 收入金额与标识 |
| 支出红 | `hsl(0 84% 60%)` | 支出金额与删除操作 |
| 预警琥珀 | `hsl(35 90% 48%)` | 预算超支警告 |

---

## 🔧 配置说明

### 路由配置

路由定义在 `src/app.tsx` 的 `<Routes>` 内：

| 页面 | 路由 | 导航标签 |
|------|------|----------|
| 总账目表 | `/` | 总账目 |
| 预算管理 | `/budgets` | 预算 |
| 统计分析 | `/statistics` | 统计 |
| 账户管理 | `/accounts` | 账户 |

### 导航配置

导航项定义在 `src/components/Header.tsx` 的 `NAV_ITEMS` 数组中，修改标签、图标或路径在此处操作。

### 分类配置

交易分类定义在 `src/data/finance.ts` 的 `DEFAULT_CATEGORIES` 数组中，可自行增删分类项。

---

## ❓ 常见问题

### 数据存在哪里？

所有数据存储在浏览器的 `localStorage` 中，不会上传到任何服务器。清除浏览器缓存或数据会导致数据丢失，请定期使用导出功能备份。

### 如何迁移数据到新设备？

1. 在旧设备上点击"导出数据"下载 JSON 文件
2. 将 JSON 文件传输到新设备
3. 在新设备上打开应用，点击"导入数据"选择该文件

### 支持多用户吗？

当前版本为单用户设计，所有数据存储在浏览器本地。如需多用户支持，可升级为后端版本。

### 如何修改配色？

编辑 `src/tailwind-theme.css` 中 `:root` 块内的 HSL 颜色变量，保存后自动生效。

### 如何添加新的交易分类？

编辑 `src/data/finance.ts`，在 `DEFAULT_CATEGORIES` 数组中添加新分类，同时更新 `src/types/finance.ts` 中的 `TransactionCategory` 类型。

---

## 📝 更新日志

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
