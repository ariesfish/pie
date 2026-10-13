# Paseo UI 复用分析（P2 前置决策）

> 日期：2025-10-12 · 状态：已评审采纳
> 结论先行：**UI 主战场从 daemon 演示页迁至 `@pie/app`（Expo），Paseo 组件按 A/B/C 三级复用，技术底座「四件套 + 手势系 + Skia」整体采纳而非剥离。**

---

## 1. 调研结论：Paseo UI 的真实面貌

### 1.1 技术栈（复用的前提条件）

| 技术 | 版本/形态 | Paseo 内渗透度 | 结论 |
|---|---|---|---|
| **react-native-unistyles** | 样式系统（主题 token 化） | 335 个文件 | **采纳**——剥离成本远高于配置成本 |
| **i18next / react-i18next** | 多语言 | 205 个文件 `useTranslation` | **采纳**——中文/英文双语正好是需求 |
| **zustand** | 状态（+ vanilla store） | stores/ 40+ 文件 | 采纳（store 本身**重写**，库保留） |
| **lucide-react-native** | 图标 | 全局 | 采纳 |
| **手势系**：gesture-handler + reanimated + worklets + @gorhom/bottom-sheet | 交互动效 | mobile-panels/桌面布局 | 采纳 |
| **Skia** (@shopify/react-native-skia) | diff 渲染器、终端 native 渲染器 | git/diff-document、terminal/native-renderer | 采纳 |
| **xterm.js** | web 端终端 | terminal/webview | 采纳（web/desktop） |
| **CodeMirror 6** | 文件查看/编辑 | file-pane/source | 采纳（P2b） |
| **@getpaseo/highlight** | 语法高亮 | 独立 npm 包 | 直接安装（已在架构文档计划内） |

### 1.2 耦合度实测（抽检核心文件 imports）

- `agent-stream/bottom-anchor-controller.ts`：仅 React + 自家 strategy ——**零数据耦合**
- `usage/meter.tsx`：仅 RN + unistyles + 自家 format ——**零数据耦合**
- `composer/index.tsx`：zustand + i18n + `@/stores/session-store` + `@/runtime/host-runtime`——**中等耦合**（渲染层可移植，数据 hooks 需替换）
- `panels/diff-panel.tsx`：`@/git/*`（B 类可移植子集）+ `@/stores/session-store` + panel 体系——**中等耦合**
- `terminal/`：xterm/Skia 渲染器自包含；数据耦合点是 `@getpaseo/protocol` 的 `TerminalState/TerminalCell` 消息类型——**适配层定构后可移植**
- `timeline/session-stream-reducers.ts`：他们线性时间线模型的核心——**不复用**（我们是树模型）

---

## 2. 分级复用清单

### A 级：直接搬运（预期改动 <10%，基本只做 import 路径 + 主题 token 对接）

| Paseo 资产 | 内容 | 用途（Pie 侧落地） |
|---|---|---|
| `components/ui/*`（26 项） | button/alert/combobox/dropdown/context-menu/autocomplete/anchor/control-geometry… | 全部基础控件 |
| `components/adaptive-modal-sheet(-layout)`、`adaptive-text-input` | 桌面 Sheet/移动 Sheet 双形态 | 全局弹层基座 |
| `components/context-window-meter(+details/sheet)` | 上下文窗口仪表 | P1「上下文仪表盘」正式版 |
| `components/attachment-pill`、`attachment-lightbox`、`diff-stat(-pill)`、`agent-status-dot`、`loading-spinner`、`draggable-list` | 独立展示件 | 零散直接用 |
| `usage/*`（31 文件，除 host 相关） | meter/format/card/controls/balance-bar | 用量与成本面板 |
| `agent-stream/bottom-anchor-controller` + `strategy` | 滚动锚定（流式聊天刚需力学） | 聊天流滚动控制 |
| `agent-stream/history-start-pagination` 系列 | 历史顶端分页加载 | 会话历史分页（配合树快照分页） |
| `agent-stream/turn-liveness`、`turn-time` | 轮次活跃判定/计时 | 工具卡状态徽章 |
| `mobile-panels/model.ts`、`gesture-intent` | 面板手势交互模型 | 移动端面板（手势系回调部分进 B 级） |

### B 级：移植适配（保留渲染/力学核心，替换数据源）——P2 的主战场

| Paseo 资产 | 保留什么 | 换什么 |
|---|---|---|
| **`composer/`（32 文件）** | draft 管理（input-draft）、submission 流、attachments、键盘 scope、input 高度自适应、剪切板图片、task-list、after-paint publication（性能防抖） | `create-agent-request.ts`/`workspace-tab` 数据层 → 我们的 `PieConnection.request` + SessionTreeStore；forge-auto-attach 不移植 |
| ~~`terminal/`~~ | **废除（ADR-0004）**：终端 cell 流移动端传输与可读性双输；工具输出走会话事件（tool/bashDelta），用户 shell 回归 TUI/桌面终端 | — |
| **`git/diff-document` + `diff-tree` + `diff-order` + `commits-section` + `changed-files-tree`** | Skia diff 渲染（含 hit-testing、横向滚动、header layout——全部自带测试） | commit/diff 数据查询 hooks → 我们的 git 命令（P2b daemon 补 git 命令面） |
| **`file-pane/`** | CodeMirror 集成、markdown-preview、live-file、find、html-preview（含 CSP 测试） | live-file 订阅协议 → 我们的文件观察事件 |
| **`panels/`（registry/manifest/pane-context/load-state）+ `workspace-tabs`** | 面板注册器/布局持久化/tab 布局 | panel-store → 我们的 zustand 版 |
| **`agent-stream/`（除 A 级外）** | history window/replica 骨架 | `session-stream-reducers` → **SessionTreeStore 派生层重写**（树→线性时间线投影） |
| **`composer/dock`、`workspace-tabs`、`sidebar-nav`** | 工作区导航/tabs 骨架 | 数据源替换 |
| **`dictation/` + `@getpaseo/expo-two-way-audio`** | 语音输入 | P2 后期评估（依赖我们的 composer 先落地） |

### C 级：只参考设计（逻辑/概念与我们模型冲突，重写更快）

| Paseo 资产 | 原因 | Pie 侧替代 |
|---|---|---|
| `timeline/` 全部 reducers、sync-plan | 线性时间线同步 vs 我们树同步 | `@pie/client` SessionTreeStore（已有，13 测试） |
| `subagents/`（24 文件） | 绑他们的 provider-subagent 模型 | 我们的扩展语义（P2d 子代理面板） |
| `provider-selection`（6 文件）+ `combined-model-selector` 部分 | 多 Agent provider 抽象 | `models.list` + 虚拟模型（P1 已有雏形，加上传送门） |
| `paseo/packages/server` 的 agent/timeline 数据层全部 | —— | daemon 自有（已建成） |
| `hosts/`、`agent-profiles`、`relay` UI | P3 远程场景 | P3 对齐时再看（设计可参考） |
| forge-auto-attach、schedule 自动化 UI | 绑 forge/schedule 后端 | P2d 之后 |

### 明确不复用

- `agent-controls`、`agent-stream` 的事件重放 reducers（见 C 级首行）
- **多 provider 语义的全部 UI**（agent 列表按 provider 分组、provider 图标映射表、`providers-snapshot`）——我们的会话列表按 workspace 分组（树模型），provider 只在模型选择器出现

---

## 3. 关键工程决策（本分析确定的三件事）

1. **UI 平台迁移**：P2 起正式 UI 在 `@pie/app`（Expo Router）里生长，daemon 演示页降级为「无构建冒烟页」长期保留（给 `pie-smoke` 和零依赖调试用）。理由：A/B 级资产全部是 RN 组件。
2. **底座整备先行**（P2a）：装 unistyles + i18next(中/英) + zustand + lucide + 手势系 + Skia；建 theme token 表（对齐 Paseo 的 `styles/theme` 结构）；建 `components/ui` 目录骨架 + A 级首批搬运。**这是解锁一切复用的前置开关。**
3. ~~**Terminal wire 类型先定**~~ **已废弃（ADR-0004）**：终端通道整体不做；该决策同时消解了二进制帧的头号需求，JSONL 阶段足够走很远。

## 4. License 与搬运流程（每个 PR 都照此执行）

1. Apache-2.0 文件：**保留原文件头注释**（若原件有）+ 在文件顶部追加一行 `// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/<原路径>`；
2. 仓库根 `NOTICE` 文件汇总清单（来源仓库、路径映射、日期）；
3. 移植 PR 标题带 `[port]` 前缀，正文列源文件路径与改动点；
4. 每季度跑 `git log --grep='[port]'` 审计一次。

## 5. P2 UI 排期（与架构文档 §11 P2 对齐后的细化）

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P2a 底座 + 聊天正式版** | 四件套 + 主题 + A 级首批（ui 基元、bottom-anchor、usage、context-meter）+ composer 移植 + agent-stream 骨架替换 | `@pie/app` 可完整聊天（steer/follow/附件/上下文仪表），`expo start --web` 与 iOS 模拟器可用 |
| **P2b 面板系统 + 文件/diff** | panels registry + workspace-tabs + file-pane（CodeMirror/markdown/live-file）+ diff-document + daemon 补 git 命令面 | 桌面三栏布局；diff/文件面板真实可用 |
| **P2c 富组件**（终端通道已废弃，ADR-0004） | typed widgets、扩展/包管理页、MCP 页、子代理面板、Skills 浏览器 | ACP 对照表 §A-C 行全部点亮 |
| ~~P2c 终端 + 二进制帧~~ | ADR-0004 废弃；`file-transfer` 通道仅在真实带宽瓶颈出现后设计 | — |

---

## 附：本分析的原始测量记录

```
paseo/packages/app/src: 204 个 components 文件
  composer 32 / git 72 / usage 31 / subagents 24 / terminal 7 顶层目录
  panels/ 12 面板类型（agent/diff/file/files/terminal/PR/draft/provider-subagent…）
i18n 钩子渗透：205 个 tsx
unistyles 渲透：335 个 ts/tsx
抽检耦合 imports：
  bottom-anchor-controller → [react, ./strategy]            零耦合
  usage/meter              → [react-native, unistyles, ./format] 零耦合
  composer/index           → [zustand, i18next, @/stores/session-store, @/runtime/host-runtime] 中
  panels/diff-panel        → [@/git/*, @/stores/session-store, @/panels/*] 中
  terminal/runtime         → [xterm/skia 自家, @getpaseo/protocol/messages] 中（协议层可适配）
```
