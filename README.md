# <img width="32" alt="Pie" src="https://pi.dev/logo-auto.svg" valign="middle" /> Pie

> **Pie**（π·e）—— 专属于 [Pi coding agent](https://pi.dev) 的跨设备应用：桌面（Electron）+ 移动（iOS/Android, Expo）+ Web。
> 以 [Paseo](https://github.com/getpaseo/paseo) 的产品形态为蓝本，以 Pi 官方 SDK（`@earendil-works/pi-coding-agent`）为原生内核，**不走 ACP 等通用 Agent 抽象**。

- 架构设计：[`docs/architecture.md`](docs/architecture.md)
- 协议决策：[`docs/adr/0001-wire-protocol.md`](docs/adr/0001-wire-protocol.md) · [`docs/adr/0002-permission-layer.md`](docs/adr/0002-permission-layer.md)

## Packages

| 包 | 说明 |
|---|---|
| `@pie/protocol` | Wire 协议类型、编解码、能力协商（daemon 与客户端共享） |
| `@pie/client` | 类型化 daemon 客户端：连接、请求关联、事件重放、会话树同步状态机 |
| `@pie/daemon` | 内嵌 Pi SDK 的本地守护进程 + WebSocket 服务 + 内置聊天演示页 |
| `@pie/desktop` | Electron 壳 + sidecar daemon（P2 收官：arm64 dmg 打包 + 打包后烟测） |
| `@pie/app` | 正式 UI 主战场（iOS/Android/Web，Expo Router，中/英双语，P2c-3 + 桌面 Wave 1） |

## 快速开始（演示页：聊天 + 会话树 + 权限卡）

前置：Node ≥ 22.19，且 `pi` 已在本机配置好模型（`~/.pi/agent/auth.json` / `models.json`）。

```bash
npm install
npm run daemon            # 启动 daemon，默认 127.0.0.1:8760
open http://127.0.0.1:8760
```

浏览器页面即演示客户端：选择/创建会话 → 流式对话（Steer / Follow-up 双队列）、分支时间线（切换/分叉）、审批卡。
daemon 与 `pi` TUI / CLI 共享同一 `~/.pi/agent` 存储：**手机发的会话，终端里 `pi --continue` 能接着聊**。

## 桌面（Electron）

```bash
npm run smoke:packaged -w @pie/desktop    # 打包 .app/.dmg + 打包后冒烟（dev 依赖 electron-builder）
```

打包形态（P2 收官）：
- **窗口 = `@pie/app` 正式 UI**（Expo web 构建随 Resources 分发，`loadFile` + query 注入 sidecar `ws://host:port`+token+workspace，app 端自动连接）——P0 演示页仅保留为 smoke 面板
- **sidecar 运行时**：`Resources/pie-runtime.tgz`（protocol/client/daemon 源 + 生产依赖树）首启解压到 userData（按档案哈希失效重解），`ELECTRON_RUN_AS_NODE` spawn 逻辑与 dev 完全一致
- dev（`npm run dev`）零变化：项目根 + tsx 直跑

```bash
npm i -w @pie/desktop electron        # 首次安装（可选依赖）
npm run dev -w @pie/desktop           # 启动窗口 + 托管 sidecar daemon
npm run smoke -w @pie/desktop         # 无头烟测：sidecar 生命周期 + 页面加载
```

## 移动端（Expo）

```bash
npm run app                           # expo start（扫码在 Expo Go / 模拟器运行）
npm run app -- --web                  # 浏览器中运行
npm run app:build:web                 # 静态 web 构建输出 packages/app/dist
```

App 输入 daemon 的 `ws://<host>:8760` + token 即可连接（与演示页相同的 wire 协议；支持 `pie://open?url=…&token=…` 深链形态，参数名同演示页）。

## 开发

```bash
npm run check             # 五个包 typecheck + 101 个 vitest 用例
npm run smoke             # 无 LLM 的端到端烟测（临时 agent dir，不写 ~/.pi/agent）
npm run daemon            # 前台启动 daemon（首次运行会打印浏览器入口 URL）
```

进度记录（逐轮）：
- **会话树命令全落地**：`session.tree` / `session.entries` / `session.forkAt`（at/before 两种语义）/ `session.forkPreview` / `session.navigate`（navigate 后广播重同步快照）
- **权限协议**：`--permission=off|annotations|ask`（默认 off，与 pi TUI 信任模型一致，见 [ADR-0002](docs/adr/0002-permission-layer.md)）；页面上有完整审批卡（拒绝/本次允许/本会话始终允许）
- **P1 其余命令**：compaction.run/setAuto、exportHtml、retry.abort、bash.abort、scope.set、commands.list、resources.overview
- **演示页**：分支时间线（⎇ 分支点 pill → 切换/分叉菜单）、上下文占用实时徽章、扩展部件与通知
- **desktop 包**：Electron 壳已实装验证（sidecar 用 `ELECTRON_RUN_AS_NODE` spawn、动态端口、崩溃清理；`npm run smoke -w @pie/desktop` 无头跑通页面加载）
- **app 包**：Expo Router 移动端已初始化（monorepo Metro 配置 + NodeNext `.js`→`.ts` 解析垫片；连接屏 + 会话/流式/steer/follow 最小聊天；web 1.04MB / iOS 2.56MB bundle 均导出成功）
- **协议类型修正**：`EventEnvelope` 改为 mapped union（switch 窄化 data）、新增 `isMessageEntry` 守卫——由第一个 TS 客户端（app 包）实战暴露并修复
- **ADR-0003**：移除 `session.switch`（daemon 并发多会话，无「当前会话」概念，attach 即切换）
- **P2a 底座 + 聊天正式版**（`docs/paseo-ui-reuse.md` 分级清单执行）：
  - 数学底座：react-native-unistyles + i18next（en/zh-CN）+ zustand + lucide + 手势系 + Skia，全部采纳
  - 主题 token 全套（`src/styles/theme.ts`：semantic builders + scales + status 色，Pie 蓝紫 tint、Paseo 结构 [port]）
  - A 级搬运（零改动编译通过）：`ui/button` `ui/alert` `ui/loading-spinner` `ui/control-geometry` `utils/color` `format-token-count`（详见根 `NOTICE` 台账）
  - B 级适配：context-meter（环形仪表 + 展开，吃 `session.contextUsage.changed` 事件）、chat-list（bottom-anchor nearBottom 语义薄移植）、composer（draft→submit 状态机，流式期间强制 ⚡steer / ⏱followUp 显式决策——拒绝瞎猜）
  - 数据层：`stores/connection-store.ts`（zustand：连接/会话/流式增量/队列/用量/错误，树 mutation 以 revision 驱动派生）
  - `src/app/` 目录结构（expo-router src layout），与 Paseo `@/` 别名体系对齐

回归基线（P2a）：5 包 typecheck × 0 错误、71/71 测试、pie-smoke ALL GREEN、Expo web（4.5MB）/ iOS（hbc）双导出。

- **P2b-1 工作区观察面 + 面板系统**：
  - 协议新增：`fs.list` / `fs.read`（字节上限 + 二进制探测）/ `fs.watch` / `fs.unwatch`、`git.status`（porcelain -z 解析，rename 双段语义）/ `git.diff`（可含 untracked 合成补丁）、事件 `workspace.fs.changed`（150ms 防抖批量）
  - daemon 新增 `services/fs-service`（层级列表 + 观察器，workspace 级订阅复用 connection.subscribed）与 `services/git-service`（spawn git、错误分类 not_a_repo/git_unavailable/timeout）
  - app 三个工作区面板：会话（P2a 聊天）、文件（目录导航 + 等宽查看）、变更（git status 列表 + 单文件 unified diff 着色展开；变更刷新由 fs.changed 事件驱动）
  - `workspace-store`（zustand）：fs/git 数据 + watch 失效联动；smoke 新增 fs/git/事件流端到端 9 步断言
  - 已知限制（P2b-2 补齐）：文件查看无 CodeMirror/编辑/markdown 预览；diff 无 Skia 渲染器；桌面三栏布局与 tab 拖拽未做
- **P2b-2 文件查看/编辑正式版**（CM 展示与 markdown 预览针对性超越 Paseo 同期形态）：
  - Web/桌面：**CodeMirror 6 完整集成**（`@getpaseo/highlight` 语言映射，lezer 语系覆盖广）——阅读优化的行高/边距测度、active line + gutter 高亮、主题热切换（compartment 重配不重挂载）、live-file 内容热替换（pristine 编辑态才覆盖，dirty 不吞用户输入）
  - Native：tokens 化自绘查看器（行号 gutter + 逐 token 着色），大文件降级纯文本
  - **Markdown 预览**（markdown-it → RN 组件树，全主题化）：标题层级字号、任务无关列表、引用块、**代码块（语言标签头 + `@getpaseo/highlight` 逐行高亮 + 横向滚动）**、表格（表头强调）、链接可点、图片安全降级 chip
  - **编辑模式**：铅笔入口 → CM 同实例编辑（history keymap）→ 保存走 `fs.write`（daemon 侧原子 tmp+rename、2MB 上限、路径穿越防护）→ 关闭编辑回归查看；dirty 徽章 + 防误覆盖
  - **live-file**：`workspace.fs.changed` 命中打开文件（或父目录）且编辑器 pristine 时自动重拉
  - 协议新增 `fs.write`；daemon 17 个 services 测试（原子性 + 遍历拒绝）
- **P2b-3 桌面三栏 + tab 系统 + diff 深化**：
  - `app-shell`：≥720px 三栏（sidebar 会话/入口 + explorer 文件树/变更列表 + 主区 tabs），<720px 单栏 tab 栏（explorer 可收起弹出）；面板组件两种形态零改动复用
  - `tabs-store`：tab 目标即数据（paseo workspace-tabs 模型缩放）——chat 单例 + files/changes 共享 workspace 全局态，explorer 导航即时联动主区
  - explorer 文件树：懒加载逐级展开（fs.list 每目录一次），文件点击直开查看；变更列表紧凑版（kind 色点）点击联动 changes tab 的 diff
  - **diff-view 重写**：结构化模型 `diff-model`（unified patch → 双行号行流）+ **词级 intra-line 高亮**（del/add 行组配对 + LCS 逐 token，改动词加强调下划线）+ 未变区块折叠（±3 上下文保留，中段静默省略可点击展开）+ 横向滚动对齐双行号 gutter；9 个纯函数单测（行号推算/配对/折叠边界/intraLine/病态长行降级）
- **P2c-1 资源面（包 + 技能，MCP 页跳过）**：
  - 协议新增：`packages.list / install / remove / update`（直译 pi `pi install/remove/update/list`，经 DefaultPackageManager——与 CLI 同引擎同 settings）、`skills.list / read`（session 级 resourceLoader，含 origin/scope 元数据；read 强校验只允许已载入技能的路径）
  - **关键缺陷修复**：HostSession 从未 `setProjectTrusted(true)` —— pi 的 resourceLoader 在 trust=false 时**静默丢弃全部项目级资源**（`.pi/extensions`、`.pi/skills`）。daemon 语义上用户显式打开的 workspace 即受信（TUI 是交互问询，daemon 不能挂在这一半）。修复后项目资源与全局（`~/.agents/skills` 等）同载入
  - 资源页（第四 tab）：包段（安装源 npm/git/local + user/project 切换 + 移除 + 全量更新）+ 技能段（搜索 + 名称/描述/origin + 点击全文 MdViewer 查看）
  - smoke 34 步全绿（含 packages local 安装闭环、skills 发现/读取/未知路径拒绝）；101 tests
- **P2c-2 工具卡 + typed widgets + 聊天 markdown**：
  - **聊天块级渲染**：assistant 文本走 MdViewer（聊天气泡内嵌 markdown：代码块/列表/表格全量）；`tool_use` 块 = 可展开工具卡（名称 + 参数摘要一行，展开 JSON）；user 消息内 `tool_result` 块 = 结果卡（错误红边 + 长输出折叠展开）；thinking 块 = 轻量折叠行（Pi 本体 SessionEntry 无独立 tool 节点——工具调用即 message content blocks，渲染层按块分发是唯一正确位）
  - **typed widgets 启发式（§6.5）**：`session.ext.widget` 行集 → 形状识别：连续 checkbox 行聚合成 plan 块（☑/☐ + 完成态划线）、`NN%` 进度行抽成进度条组件、其余归一化 markdown 走 MdViewer；widgets store 化（session+key、clear 语义），聊天流上方按 placement 渲染
  - 数据零协议变更（全部用既有 message blocks 与 ext.widget v1 行集）
- **P2c-3 嵌套调用树（原「子代理面板」重定义）**：
  - 语义查证：Pi 主线**无 first-class 子代理**（experimental/durable 的 Subagent 扩展是 chord 运行时 demo，非部署面）；主线的子任务形态是 **nested tool calls**（`parentToolCallId` 链，core/nested-tool-calls.ts）。Paseo 的 provider_subagent 概念不适用。据此「子代理面板」重定义为嵌套调用树视图
  - 数据层：connection-store 新增 `toolCalls` record（`session.tool.started/ended` 全量路由；running/ok/error 状态、durationMs、args/result 归档）
  - 渲染：工具卡与事件流**实时联动**（pi-ai 语义下 `tool_use` block.id === toolCallId）——运行中 spinner / 完成 duration 徽章 / 错误红；子调用数徽章；展开区渲染递归子树（参数摘要 + 结果 + 各自状态），树深度缩进
  - 零协议变更（P1 的 tool 事件本就透传 parentToolCallId）
- **P2 桌面 UI Wave 1（Paseo 结构复刻）**：桌面主界面对齐 Paseo 的核心心智——**会话即 tab**：
  - 侧栏 = 真实会话列表（`session.list`，Today/Yesterday/本周/本月/更早 日期分组，搜索，相对时间；底部「新会话」入口）——替代旧「面板启动器」
  - 主区 = workspace 标题头 + 会话 tabs 行（一 tab 一会话，可关闭；「+」tab = 新会话创建面板）+ agent panel（聊天流 + composer；tab 切换走 `switchSession`：重置单会话面 + attach 快照重建）
  - 文件树/变更列表/资源收进左侧 explorer 栏（可折叠），不再占主区 tab
- **策略裁决（P2c 收尾）**：沙箱会话与凭证面缓议、挪 P3 附条件触发——沙箱的真实威胁模型属于 relay/公网远程（本地显式 open 的信任语义已由 P2c-1 的 setProjectTrusted 承接，与 Pi 本体一致）；凭证面的价值等 relay 接入
- **ADR-0004：不提供终端通道**——终端 cell 流移动端传输与可读性双输；「看 Pi 干了什么」由会话事件（tool/bashDelta）+ 文件/diff 面板承担；用户 shell 体验回归 Pi TUI（本体完整保留）。协议 `terminal` capability 移除，P2c 重定义为富组件（typed widgets/扩展页/MCP/子代理/Skills）
- 回归基线（P2c 收官）：5 包 typecheck × 0 错误、101/101 测试、pie-smoke 34 步 ALL GREEN、Electron 无头烟测 OK；真实环境已验证 118 个真实会话、2791 消息会话的 fork 链路
- **基础功能接线（2026-10-13）**：workspace 管理（workspaces 屏：daemon `workspace.list` ∪ 本地注册表 + 添加项目，daemon 侧目录校验）、磁盘会话导入（`switchSession` 传 path，TUI/CLI 会话可直接打开）、右侧 explorer 栏（files/changes/resources 模式切换）+ FilesPanel/ChangesPanel 挂载到中央共享 tab（修复孤儿面板问题）、new-session 面板快选化；102 测试
- **ADR-0005：UI 复用策略升级为「分层整目录搬运」**（2026-10-13，含技术栈联网核查与 AI 时代评估）：骨骼/皮肤层整目录搬（SplitContainer/mobile-panels/workspace-tabs/components），数据层不搬；W1–W4 锁 paseo 钉版（Expo 54/RN 0.81/RNGH 2.28），markdown-it 保持 15、Electron 升 44，W4 后立项 SDK 57；W1 起 React Compiler 1.0 + oxlint 提级，不引入 web-only AI UI 库（assistant-ui RN 绑定入观察名单）
- **W1 骨骼层收官**（2026-10-13，7 提交）：① W1a 基础依赖（react-query[本地 daemon 场景关闭网络态/keyboard-controller/floating-ui）+ React Compiler 1.0 开启（web 导出验证）；② W1b mobile-panels 手势面板系整目录搬运（+13 测试；compact 双抽屉 + 边缘滑动）；③ W1c tab 系与布局引擎：WorkspaceTabTarget 身份语义（+8 测试）、panel-manifest/registry 接缝、RetainedPanel 保活面板宿主、per-workspace 布局持久化（v2 树形记录，v1 平铺读取时迁移）、完整 SplitNode 分栏树（paseo workspace-layout-actions 2533 行忠实子集 +13 语义测试：同向插入不加深/深度上限/关闭级联/placement 规则）、dnd 拖拽（平台分叉 .web/.native：tab 重排/跨栏移动/拖拽开栏，iOS hbc 零泄漏）；141/141 测试，typecheck × 0 错，web+iOS 双导出。桌面手写 layout 全面被替换为注册表驱动的分栏引擎

## 状态

**P0–P2c-3 已完成**（路线图：architecture.md §11）：

- **协议 / daemon**：Wire v1 全命令集落地（会话树、steer/followUp 双队列、fs/git 观察面、packages/skills 资源面）；审批策略 `off|annotations|ask`；34 步无 LLM 端到端烟测全绿
- **@pie/app 正式 UI**：P2a 底座（四件套 + 主题 token + i18n 中/英）→ P2b 文件查看/编辑 + diff + 桌面三栏/tab → P2c 富组件（工具卡、typed widgets、嵌套调用树、资源页）→ 桌面 Wave 1（Paseo 结构复刻：会话即 tab）
- **@pie/desktop**：Electron 壳 + sidecar（`ELECTRON_RUN_AS_NODE` spawn、动态端口、崩溃清理），arm64 dmg 打包 + `smoke:packaged` 通过
- **决策存档**：ADR-0003（移除 session.switch）、ADR-0004（不提供终端通道）；沙箱/凭证面缓议挪 P3 附条件触发；MCP 页跳过

**下一站**：P2 收尾（diff Skia 渲染器升级、语音输入评估）→ P3（relay E2E 公网中继 + 推送、CLI、pi-server 演进观察）。
