# CONSTRAINTS — Pie quality bar

质量门槛写成数字或可判定命令。**底线**不满足即不得合并；**目标**是当前 UI/UX 波次
要还清的债，允许暂时不达标，但必须在票上点名、逐票消账。

测量命令都从仓库根执行。

## 底线（任何合并都必须满足）

| # | 维度 | 门槛 | 怎么测 |
|---|---|---|---|
| C1 | 类型 | 五个包 0 error | `npm run typecheck` |
| C2 | 测试 | vitest 0 failure；新增行为有断言覆盖 | `npx vitest run` |
| C3 | 真实面 | UI 改动：walkthrough 全步绿；daemon/protocol 改动：smoke 全绿 | `npm run ui-walkthrough` / `npm run smoke` |
| C4 | 断言纪律 | 修 bug 不得放宽断言；确需放宽须在票上写明理由并经人确认 | diff 自查 + review |
| C5 | token 纪律 | 新增 UI 代码只引用 `theme.ts` 的 token；字面量 hex/rgba 只允许在 `styles/theme.ts`、`components/material-file-icons.ts`、`utils/color.ts`、平台文件（`*.platform.*` / `*.web.*` / `*.native.*`）、`components/error-boundary.tsx`（主题注册表本身崩溃时仍须渲染）、`app/+html.tsx`（WS 前的 HTML 底色） | `git diff` + grep `#[0-9a-fA-F]{3,8}` |
| C6 | 无障碍 | 图标按钮都有 `accessibilityLabel`；键盘焦点可见 | 代码自查 + walkthrough |
| C7 | 文案边界 | 用户可见字符串只出现在 app 的 i18n 资源里；daemon/protocol 不得硬编码展示文案 | grep + review |
| C8 | 唯一真源 | 同一语义只有一个实现（无重复组件、无死主题、无未使用常量） | review |

## 设计门槛（UI 改动）

| # | 维度 | 门槛 | 怎么测 |
|---|---|---|---|
| D1 | 正文对比度 | 正文小字 ≥ **4.5:1**；大字（≥24px 或 ≥18.66px 粗体）与图标/控件 ≥ **3:1**；测「实际底色 vs 前景」，不靠肉眼 | 计算 hex 对比度并写进票 |
| D2 | 字号 | 最小 **12px**；正文 14–16；只用声明过的字号档位 | 代码自查 |
| D3 | 表面阶梯 | 相邻表面差 ≥ 1 个明确档位；分隔结构不能只靠 <1.5:1 的细线 | 截图 + token 值 |
| D4 | 强调预算 | 每个视口 ≤ 2 处墨色强调（主操作 + 焦点/运行状态）；彩色只允许语义状态与代码语法；导航选中态不用强调填充 | 截图自查 |
| D5 | 选中态 | 每类控件只有一种选中语汇（背景抬升 / 左侧条 / 字重），不得同类控件两套 | 组件代码 |
| D6 | 导航唯一性 | 每类对象（会话、文件、变更、用量）只有一个主入口；次要入口必须是从主入口进入的上下文视图 | IA 评审 |
| D7 | 触控 | compact 布局下可点区域 ≥ 44×44 | 组件 + 真机 |

## 当前基线（2026-10-23，UI 波次 T-018…T-025 + 重构波次 T-026…T-029 之后）

本轮残债已清零，没有挂账的"以后再说"：

- **D2/C5/C8（T-025）**：chrome 屏的 9–11px 字号全部升到 12+；代码块 / 工具卡
  header / diff 纸面走 `surfaceCode`；原始 `baseColors` 调色盘删除；右栏时间走
  `relativeTimeLabel`；检查器宽度回到 300 / 264–520。
- **C8（T-026）**：会话级事件按 `sessionId` 隔离；切换会话先 detach 旧会话，
  旧会话的 delta / entry / snapshot 不再写进当前会话树（`session-scope.test.ts`）。
- **C8（T-027）**：工作区 store 不再持有第二份编辑缓冲；FilesPanel 只有一个
  `FileEditorModel`，保存只走 ADR-0006 的 CAS 路径。
- **C8（T-028）**：33 组无生产 importer 的 port 模块删除（约 7k 行含测试），
  `strategy-fallback` 透传层内联；import 图扫描只余 type-only 声明文件。
- **D1/D4（T-029）**：`accent` 改为 ink（#14161A），删除 `accentBright` 与
  `statusMerged`；彩色只剩语义状态与代码语法。墨色填充白字 18.1:1，链接改为
  ink + 常驻下划线。

已还清（保留在此以免被重新引入）：

- **D1**：三级文本 `#5D6678`，四档表面实测 5.77 / 5.39 / 5.06 / 4.57（T-018）；
  状态色作为小字被限制在 canvas/sub 档，tool chip 改用 tint + 状态点 + ink 文本（T-020）；
  soft 底固定为 DESIGN 值，warning 文字在 raise 上仍只用于图标/形状（T-025）。
- **D2**：会话行 13px、正文 15px、时间戳 12px、tab 12px；全部 app 源码无 9/10/11px
  （T-019/T-020/T-025）。
- **D3**：表面阶梯 canvas/sub/raise/strong/code + 两级细线，结构不再靠 1.4:1 细线
  （T-018/T-025）。
- **D4**：导航选中不再用强调填充；每视口墨色强调 ≤2，主操作 ≤1（T-019/T-020/T-029）。
- **D5**：选中态一套语汇（`surface2` + `ink`），四套旧实现删除（T-019）。
- **D6**：新会话一个入口（tab 行尾 `+`）、检查器一个开关 + 一条分段控件、
  无 rail 模式条（T-019）。
- **D7**：compact 触控目标 44×44（header 控件、发送按钮）（T-021）。
- **C5**：代码 / diff 纸面走 `surfaceCode`；组件不引用原始调色盘；字面量只留在
  theme 与白名单平台文件（T-025）。
- **C7**：daemon 不发展示文案；会话占位与相对时间都走 i18n（T-022/T-024）。
- **C8**：`accent` 与 ink 同源（`accentBright` 已合并）、dark 主题删除、
  `SIDEBAR_WIDTH` 单一真源、`RailMode` 重复图标删除（T-018/T-019/T-029）；
  检查器宽度常量收敛到 `constants/layout.ts`，`clockOf` 删除（T-025）。

## 不可协商项

- 不删测试换绿。
- 不绕过 `verify-pie` 拿"应该能跑"当证据。
- 不在 `.dev/feature-*/plan.md` 里改写别人的票；只追加自己的结案行。
- 不 push、不 squash、不改写已入库的历史记录。
