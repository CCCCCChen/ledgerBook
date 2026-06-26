# 个人预算与花销管理 - 需求拆解文档

## 产品概述

- **产品类型**: 个人财务管理应用
- **场景类型**: <scene_type>prototype-app</scene_type>
- **目标用户**: 希望精细化管理个人财务、追踪多账户收支、控制预算的个人用户
- **核心价值**: 一站式管理多账户收支流水，灵活设置预算并实时追踪执行情况，通过多维度统计洞察消费习惯
- **界面语言**: 中文
- **主题偏好**: 浅色（清爽蓝绿色系）
- **导航模式**: 路径导航
- **导航布局**: Topbar（消费者前台工具类应用，面向个人用户）

---

## 页面结构总览

| 页面名称 | 文件名 | 路由 | 页面类型 | 入口来源 |
|---------|-------|------|---------|---------|
| 总账目表 | `TransactionsPage.tsx` | `/` | 一级 | 导航 |
| 预算管理 | `BudgetsPage.tsx` | `/budgets` | 一级 | 导航 |
| 统计分析 | `StatisticsPage.tsx` | `/statistics` | 一级 | 导航 |
| 账户管理 | `AccountsPage.tsx` | `/accounts` | 一级 | 导航 |

---

## 页面布局建议

- **布局模式**: 上下分区（Topbar + 主内容区），主内容区根据页面功能采用不同内部布局
- **视觉重心**: 列表/表格为主（交易记录列表、预算列表），图表为辅（统计页）
- **结果承载区**: 各页面均有明确的数据承载区域（交易列表、预算列表、统计图表），初始态为空状态引导

---

## 导航配置

- **导航布局**: Topbar（顶部固定）
- **导航项**（仅一级页面）:
  | 导航文字 | 路由 | 图标(可选) |
  |---------|------|-----------|
  | 总账目 | `/` | Receipt |
  | 预算 | `/budgets` | PiggyBank |
  | 统计 | `/statistics` | BarChart3 |
  | 账户 | `/accounts` | Wallet |

---

## 数据来源声明

| 数据/操作 | 来源类型 | 实现要求 | mock 兜底 |
|---|---|---|---|
| 交易记录 CRUD | local-persist | localStorage key=`__budget_transactions`，JSON 序列化存储，支持增删改查 | 初始 5 条示例交易记录（含不同账户、分类、预算关联） |
| 预算项目 CRUD | local-persist | localStorage key=`__budget_budgets`，JSON 序列化存储，支持增删改查 | 初始 3 条示例预算（临时/每周/每月各一） |
| 账户列表管理 | local-persist | localStorage key=`__budget_accounts`，JSON 序列化存储，支持增删改查 | 初始 5 个默认账户（支付宝花呗、支付宝余额、微信余额、信用卡1、储蓄卡1） |
| 数据导出 | import-export | Blob + a.click 触发 JSON/CSV 下载，包含交易记录和预算数据 | 无 |
| 数据导入 | import-export | FileReader 读取 JSON 文件，解析后写入 localStorage | 无 |
| 统计图表数据 | local-persist | 从 localStorage 读取交易和预算数据，前端实时计算统计指标 | 基于 mock 初始数据生成示例图表 |

---

## 功能列表

### 页面: 总账目表 (`/`)
- **页面目标**: 查看、筛选和管理所有账户的收支交易记录
- **功能点**:
  - **交易记录列表展示**: 以表格形式展示所有交易记录，列包含日期、账户、金额（收入绿色/支出红色）、分类、备注、预算关联标识，支持按日期倒序排列
  - **添加交易记录**: 点击"添加记录"按钮弹出 Dialog 表单，包含日期选择器、账户下拉选择、金额输入（带收入/支出切换）、分类选择、备注输入、是否预算内开关（开启后显示关联预算项目下拉选择），提交后写入 localStorage 并刷新列表
  - **编辑交易记录**: 点击行操作菜单中的"编辑"，弹出预填数据的 Dialog 表单，修改后更新 localStorage 并刷新列表
  - **删除交易记录**: 点击行操作菜单中的"删除"，弹出确认 Dialog，确认后从 localStorage 移除并刷新列表
  - **筛选功能**: 顶部筛选栏支持按账户下拉多选、日期范围选择器、分类下拉筛选，筛选条件实时过滤列表数据
  - **数据导入导出**: 顶部操作区提供"导出数据"按钮（下载 JSON 文件）和"导入数据"按钮（上传 JSON 文件合并到现有数据）

### 页面: 预算管理 (`/budgets`)
- **页面目标**: 创建和管理支出预算，追踪预算执行情况
- **功能点**:
  - **预算项目列表展示**: 以卡片或表格形式展示所有预算项目，每项显示预算名称、预算金额、周期类型标签（临时/每周/每月/每年）、已使用金额进度条、剩余金额、使用率百分比
  - **添加预算项目**: 点击"新建预算"按钮弹出 Dialog 表单，包含预算名称输入、预算金额输入、周期类型选择（临时/每周固定/每月固定/每年固定）、开始日期选择、结束日期选择（临时预算必填）、关联分类选择，提交后写入 localStorage
  - **编辑预算项目**: 点击预算卡片上的编辑按钮，弹出预填 Dialog 表单，修改后更新 localStorage
  - **删除预算项目**: 点击预算卡片上的删除按钮，弹出确认 Dialog（提示关联交易记录将解除关联），确认后从 localStorage 移除
  - **预算执行统计**: 每个预算项目实时计算已使用金额（汇总关联交易记录中该预算的支出金额）、剩余金额（预算金额-已使用）、使用率（已使用/预算金额×100%），进度条颜色随使用率变化（<80% 绿色，80-100% 黄色，>100% 红色）
  - **超支预警**: 当预算使用率超过 80% 时，预算卡片显示黄色警告标识；超过 100% 时显示红色超支标识

### 页面: 统计分析 (`/statistics`)
- **页面目标**: 通过多维度图表分析消费数据，洞察消费习惯
- **功能点**:
  - **账单周期统计**: 支持为每个信用卡/花呗账户设置账单日，按账单周期（如6月15日-7月14日）统计该账户的支出总额，以柱状图对比各账户账单周期支出
  - **预算执行统计图**: 按预算项目展示已使用金额 vs 预算金额的对比柱状图，超预算项目高亮红色
  - **分类支出分布**: 环形图展示各分类（餐饮、购物、交通、娱乐等）的支出占比
  - **时间趋势分析**: 折线图展示每日/每周/每月支出趋势，支持切换时间粒度
  - **账户支出对比**: 分组柱状图对比各账户的总支出金额
  - **超支预警提示**: 页面顶部醒目展示超预算项目列表（使用率>100%），点击可跳转至预算管理页

### 页面: 账户管理 (`/accounts`)
- **页面目标**: 管理支付账户列表，设置账单日等账户属性
- **功能点**:
  - **账户列表展示**: 以卡片或列表形式展示所有账户，每项显示账户名称、账户类型标签（支付宝/微信/信用卡/储蓄卡）、账单日（信用卡/花呗显示）、当前余额（可选）
  - **添加账户**: 点击"添加账户"按钮弹出 Dialog 表单，包含账户名称输入、账户类型选择（支付宝花呗/支付宝余额/微信余额/信用卡/储蓄卡）、账单日输入（仅信用卡和花呗类型显示）、备注输入，提交后写入 localStorage
  - **编辑账户**: 点击账户卡片上的编辑按钮，弹出预填 Dialog 表单，修改后更新 localStorage
  - **删除账户**: 点击账户卡片上的删除按钮，弹出确认 Dialog（提示关联交易记录将保留但账户字段清空），确认后从 localStorage 移除
  - **默认账户初始化**: 首次使用时自动创建 5 个默认账户（支付宝花呗、支付宝余额、微信余额、信用卡、储蓄卡），用户可自行编辑或删除

---

## 数据共享配置

| 存储键名 | 数据说明 | 使用页面 |
|---------|---------|---------|
| `__budget_transactions` | 交易记录列表，类型为 `ITransaction[]` | 总账目表、统计分析 |
| `__budget_budgets` | 预算项目列表，类型为 `IBudget[]` | 预算管理、统计分析 |
| `__budget_accounts` | 账户列表，类型为 `IAccount[]` | 总账目表、账户管理、统计分析 |

```ts
interface ITransaction {
  id: string;
  date: string; // ISO 日期字符串
  accountId: string; // 关联账户 ID
  amount: number; // 正数为收入，负数为支出
  category: string; // 分类：餐饮、购物、交通、娱乐、住房、其他
  note: string;
  isBudgeted: boolean;
  budgetId?: string; // 关联预算项目 ID，isBudgeted=true 时必填
  createdAt: string;
  updatedAt: string;
}

interface IBudget {
  id: string;
  name: string; // 预算名称，如"奶茶支出"
  amount: number; // 预算金额
  cycleType: 'once' | 'weekly' | 'monthly' | 'yearly'; // 周期类型
  startDate: string; // 开始日期 ISO 字符串
  endDate?: string; // 结束日期（临时预算必填）
  category?: string; // 关联分类
  createdAt: string;
  updatedAt: string;
}

interface IAccount {
  id: string;
  name: string; // 账户名称
  type: 'alipay_huabei' | 'alipay_balance' | 'wechat_balance' | 'credit_card' | 'debit_card';
  billingDay?: number; // 账单日（1-28），仅信用卡和花呗类型
  note: string;
  createdAt: string;
  updatedAt: string;
}

-------

<scene_type>prototype-app</scene_type>

# UI 设计指南

## 1. 设计推导依据

- **参考意图**: Free Direction —— 无参考材料，从产品语义与个人财务管理场景自主建立视觉方向
- **核心情绪 / 应用类型**: 个人预算与花销管理工具 —— 理性克制、轻量透明、给用户"掌控感"而非压迫感
- **独特记忆点**: 账单日周期色带 —— 每个账户的账单周期在时间轴上呈现为一段柔和的色带，让"6月15日-7月14日"这种非自然月周期可视化，而非生硬的日期选择器

## 2. Art Direction

- **方向名**: Soft Ledger 柔和账本
- **Design Style**: Swiss Minimalist 瑞士极简 + Soft Blocks 柔色块 —— 瑞士极简提供清晰的网格秩序和信息层级，柔色块为个人财务场景注入温暖和低压力感，避免冰冷的数据工具感
- **DNA 参数**: 圆角 subtle（rounded-md ~ rounded-lg）/ 阴影 subtle（shadow-sm，仅卡片微浮）/ 间距 standard（gap-4 / p-6）/ 字体方向 无衬线清晰阅读 / 装饰手法 账户色标 + 预算进度条 + 账单周期色带
- **应用类型**: Tool —— 以任务流（记账）和数据流（统计看板）为主，布局倾向单栏内容区 + 底部导航

## 3. Color System

**色彩关系**: 薄荷绿主色 + 低饱和青灰底 + 暖白卡片 + 深墨文字
**配色设计理由**: primary 使用清爽的薄荷绿，承担主行动按钮、预算进度条、激活态标签，传递"健康财务"的积极信号；bg 使用极浅青灰，比纯白更柔和，适合长时间记账和查看报表；accent 使用更淡的薄荷底，用于 hover 和选中态，保持色温一致
**主色推导**: 用户明确要求"清爽的蓝绿色系"，选择偏绿的薄荷方向而非偏蓝的青色，因为绿色天然关联"收支平衡""健康""成长"，比蓝色更贴合个人理财的情绪诉求
**使用比例**: 60% 中性（bg/card/border）/ 30% 辅助（accent 浅底、语义色）/ 10% primary（CTA、进度条、激活态）

| 角色 | CSS 变量 | Tailwind Class | HSL 值 | 设计说明 |
|---|---|---|---|---|
| bg | `--background` | `bg-background` | hsl(160 20% 96%) | 极浅青灰底，比纯白柔和 |
| card | `--card` | `bg-card` | hsl(0 0% 100%) | 纯白卡片，与青灰底形成清晰分层 |
| text | `--foreground` | `text-foreground` | hsl(200 15% 15%) | 深墨色，高对比正文 |
| textMuted | `--muted-foreground` | `text-muted-foreground` | hsl(180 8% 45%) | 青灰色辅助文字，占位符和元信息 |
| primary | `--primary` | `bg-primary` / `text-primary` | hsl(165 55% 42%) | 薄荷绿主色，CTA、进度条、激活态 |
| primaryForeground | `--primary-foreground` | `text-primary-foreground` | hsl(0 0% 100%) | primary 上的白色文字和图标 |
| accent | `--accent` | `bg-accent` | hsl(162 40% 92%) | 极浅薄荷底，hover/focus/选中态 |
| accentForeground | `--accent-foreground` | `text-accent-foreground` | hsl(165 45% 30%) | accent 上的深薄荷文字 |
| border | `--border` | `border-border` | hsl(170 12% 88%) | 浅青灰边界，轻量分隔 |

**语义色提示**:
- 收入/盈余: `hsl(155 50% 45%)` — bg `hsl(155 40% 92%)` / border `hsl(155 35% 78%)` / text `hsl(155 50% 35%)`，与 primary 同色温、饱和度对齐
- 支出/超支: `hsl(5 60% 52%)` — bg `hsl(5 50% 94%)` / border `hsl(5 45% 82%)` / text `hsl(5 55% 40%)`，暖红与薄荷绿形成互补，饱和度与 primary 对齐（±10%）
- 预算预警: `hsl(38 85% 50%)` — bg `hsl(38 80% 93%)` / border `hsl(38 75% 80%)` / text `hsl(38 80% 35%)`，琥珀色用于使用率 >80% 的预算项目，饱和度略高于 primary 以引起注意

## 4. 字体与节奏

- **font-display**: Noto Sans SC —— 中文个人工具场景，清晰现代，Google Fonts 可用，避免 Inter 的英文工具感
- **font-body**: Noto Sans SC —— 与 display 统一，保持记账界面的一致性和阅读舒适度
- **字号**: H1 text-2xl ~ text-3xl（页面标题）；H2 text-lg ~ text-xl（区块标题）；body text-sm ~ text-base（交易列表、表单）；muted text-xs（时间戳、账户标签）
- **圆角**: subtle — `rounded-md`（卡片、按钮、输入框）/ `rounded-lg`（弹层、图表容器），保持柔和但不幼稚

## 5. 全局布局契约

- **Reference Layout Use**: 按需求结构推导 —— 总账目表、预算表、统计看板三个主视图，移动端底部 Tab 导航切换
- **Page / Section Order**: ① 总账目表（交易列表 + 筛选 + 添加入口）→ ② 预算表（预算项目列表 + 执行统计）→ ③ 统计看板（账单周期视图 + 预算执行图表 + 多维度筛选）
- **Standard Content Zone**: `max-w-4xl mx-auto`，适合个人工具的信息密度，交易列表和图表不拥挤
- **Shell / Frame Alignment**: 内容容器与底部导航同宽，桌面端导航收起到侧边或顶部
- **Padding & Rhythm**: `px-4 md:px-6 py-6 md:py-8`，卡片内 `p-4`，列表项 `py-3`，保持 8px 节奏
- **Full-bleed Zones**: 统计看板的图表区可 `w-full` 突破内容区宽度，但图表内文字和图例仍受内容区约束
- **Local Narrowing**: 添加/编辑交易的表单弹层收窄至 `max-w-md`；设置页 `max-w-2xl`
- **Overflow Strategy**: 交易列表在移动端横向字段过多时使用 `overflow-x-auto`；预算周期时间轴使用横向滚动
- **Flexibility Boundary**: 允许移动端调整卡片内边距和图表高度；全局 max-w-4xl、圆角系统、薄荷绿主色和阴影语言保持一致

## 6. 视觉与动效

- **装饰**: 账户色标（每个账户一个 8px 圆点色标）+ 预算进度条（圆角填充条，使用率 >80% 切换为琥珀预警色）
- **阴影/边界**: 轻 — `shadow-sm` 仅用于卡片微浮，列表和表单用 `border` 分隔，避免阴影堆叠
- **动效**: 克制 — 交易列表项入场使用 `opacity + translateY(4px)` 微动效（stagger 30ms）；预算进度条填充使用 `transition-all duration-500`；弹层使用 `scale(0.95) → scale(1)` + opacity；页面切换无转场，保持工具效率感

## 7. 组件原则

- 按钮: Primary 填充薄荷绿用于"添加交易""保存预算"等主行动；Secondary 使用 `border + transparent bg` 用于筛选、导出等次级操作；Ghost 用于列表项内操作（编辑、删除图标按钮），hover 时使用 accent 底
- 表单: 输入框使用 `border + rounded-md`，focus 时 `ring-2 ring-primary/30`；日期选择器和下拉菜单与输入框风格统一
- 卡片: 预算项目卡片使用 `bg-card + border + rounded-md + shadow-sm`，内含预算名称、金额、进度条、周期标签
- 交易列表: 每条交易使用 `flex + border-b`，左侧账户色标 + 中间分类和备注 + 右侧金额（收入绿色/支出红色）
- 加载与空状态: 空账目表显示"还没有交易记录"插画 + "添加第一笔"引导按钮；预算空状态显示"创建预算项目"入口；均使用 accent 浅底 + muted 文字，不退回默认灰色

## 8. Image Direction

- **Image Role**: 无强制图片需求，优先通过排版、色彩和局部图形建立视觉记忆点
- **Image Art Direction**: 空状态插画如需添加，使用柔和线条插画风格，主题为"个人财务记录"——如一个打开的小账本、一支笔和几枚硬币的极简线稿，单色薄荷绿着色，保持与 UI 一致的克制感
- **Image Prompt Keywords**: 无（当前阶段不生成图片）
- **Image Avoidance**: 避免通用金融图标（金币堆、计算器、饼图剪影）、商务人物插画、3D 渲染钱包或银行卡素材图

## 9. Anti-patterns

- **Split personality**: 账目表用薄荷绿、统计看板用蓝色、预算表用紫色 —— 全站统一薄荷绿主色，语义色仅用于收入/支出/预警
- **Phantom tokens**: 使用 `--success` `--warning` 等未定义 CSS 变量 —— 语义色通过 Tailwind 的 `text-red-*` `text-amber-*` 等工具类直接表达，或在主题中补齐 token
- **Default SaaS drift**: 退回 Inter 字体 + 默认蓝按钮 + 灰色空状态 —— 坚持 Noto Sans SC + 薄荷绿 + 柔和空状态引导
- **Invisible interaction**: 列表项操作图标只有 hover 变色，无 focus-visible 轮廓 —— 所有图标按钮添加 `focus-visible:ring-2 focus-visible:ring-primary/40`
- **Mono-hue tyranny**: 主按钮、Tab 激活、图标、链接、进度条全部使用 primary 薄荷绿 —— 进度条使用 primary，Tab 激活使用 primary 底 + primaryForeground 文字，图标和链接使用 textMuted 或 accentForeground
- **Status color drift**: 支出红色 `hsl(0 90% 50%)` 刺眼，与克制的薄荷绿主色冲突 —— 支出红饱和度控制在 60%，与 primary 饱和度（55%）对齐
- **Over-decorated empty states**: 空状态使用复杂插画或动效，加载 2 秒以上 —— 空状态保持轻量线条 + 文字引导，首屏加载 < 500ms