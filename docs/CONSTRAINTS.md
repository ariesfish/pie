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
| C5 | token 纪律 | 新增 UI 代码只引用 `theme.ts` 的 token；字面量 hex/rgba 只允许在 `styles/theme.ts`、`components/files/syntax-palette.ts`、`components/material-file-icons.ts`、`utils/color.ts`、平台文件（`*.platform.*` / `*.web.*` / `*.native.*`）、`components/error-boundary.tsx`（主题注册表本身崩溃时仍须渲染）、`app/+html.tsx`（WS 前的 HTML 底色） | `git diff` + grep `#[0-9a-fA-F]{3,8}` |
| C6 | 无障碍 | 图标按钮都有 `accessibilityLabel`；键盘焦点可见 | 代码自查 + walkthrough |
| C7 | 文案边界 | 用户可见字符串只出现在 app 的 i18n 资源里；daemon/protocol 不得硬编码展示文案 | grep + review |
| C8 | 唯一真源 | 同一语义只有一个实现（无重复组件、无死主题、无未使用常量） | review |

## 设计门槛（UI 改动）

| # | 维度 | 门槛 | 怎么测 |
|---|---|---|---|
| D1 | 正文对比度 | 正文小字 ≥ **4.5:1**；大字（≥24px 或 ≥18.66px 粗体）与图标/控件 ≥ **3:1**；测「实际底色 vs 前景」，不靠肉眼 | 计算 hex 对比度并写进票 |
| D2 | 字号 | 最小 **12px**；正文 14–16；只用声明过的字号档位 | 代码自查 |
| D3 | 表面阶梯 | 相邻表面差 ≥ 1 个明确档位；分隔结构不能只靠 <1.5:1 的细线 | 截图 + token 值 |
| D4 | 强调色预算 | 每个视口 ≤ 2 处彩色事件（主操作 + 焦点/状态）；导航选中态不用强调色填充 | 截图自查 |
| D5 | 选中态 | 每类控件只有一种选中语汇（背景抬升 / 左侧条 / 字重），不得同类控件两套 | 组件代码 |
| D6 | 导航唯一性 | 每类对象（会话、文件、变更、用量）只有一个主入口；次要入口必须是从主入口进入的上下文视图 | IA 评审 |
| D7 | 触控 | compact 布局下可点区域 ≥ 44×44 | 组件 + 真机 |

## 当前基线（2026-10-23，T-018/T-022 之后）

仍未达标项，属于 UI 重构波次的还债清单，不是"可以继续这样写"的许可：

- **D2**：组件层仍有 9/10/11px 字号（token 下限已是 12，组件尚未全部换用；T-019/T-020 收口）。
- **D4**：强调色仍被用于导航选中填充（header 图标、pane 下划线），超出 2 处/视口预算（T-019）。
- **D5/D6**：四套选中态、三套导航入口仍在（T-019；见 `docs/design/audit-2026-10.md`）。
- **C7（部分）**：`relativeTime()` 返回硬编码英文（`now` / `3m` / `1mo`），未走 i18n（T-024）。
- **C8**：`RailMode` 定义两份、usage tab 重复渲染图标（T-019）。

已还清（保留在此以免被重新引入）：

- **D1**：三级文本换成 `#5D6678`，每档表面 ≥ 4.57:1（T-018）。
- **D3**：表面阶梯改为 canvas/sub/raise/strong + 两级细线，`border` 不再独自承担结构（T-018）。
- **C7**：daemon 不再发送展示文案，会话占位由 `agentList.untitled` 解析（T-022）。
- **C8**：`accentBright` 恢复为独立的更深一档；不可达的 dark 主题与强制 `setTheme` 删除；`SIDEBAR_WIDTH` 单一真源（T-018）。

## 不可协商项

- 不删测试换绿。
- 不绕过 `verify-pie` 拿"应该能跑"当证据。
- 不在 `.dev/feature-*/plan.md` 里改写别人的票；只追加自己的结案行。
- 不 push、不 squash、不改写已入库的历史记录。
