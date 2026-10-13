# Pie 架构设计

> **Pie**（π·e）：一个专属于 Pi Coding Agent 的跨设备应用（桌面 + 移动 + Web），以 Paseo 的产品形态与交互设计为蓝本，以 Pi 官方 SDK 为原生内核，取代 ACP 等通用 Agent 抽象层。
> 包名空间 `@pie/*`，守护进程 `pie-daemon`，深链 `pie://`。（由工作名 `pi-companion` 于 P1 阶段正式定名。）

| 项 | 值 |
|---|---|
| 状态 | v1 草案（待评审） |
| 读者 | 架构 / 客户端 / 后台开发 |
| 上游依赖 | [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)（Pi SDK） |
| 参考项目 | [Paseo](https://github.com/getpaseo/paseo)（Apache-2.0，UI/架构蓝本）、[pi-mono](https://github.com/earendil-works/pi)（MIT） |
| 决策 | 已选定「方案 B」：Paseo 骨架 + Pi 原生内核（见 §2） |

---

## 目录

1. [背景与动机](#1-背景与动机)
2. [总体结论：方案 B](#2-总体结论方案-b)
3. [系统总体架构](#3-系统总体架构)
4. [内核层：Daemon 的 Pi 集成](#4-内核层daemon-的-pi-集成)
5. [Wire 协议 v1 规格](#5-wire-协议-v1-规格)
6. [客户端设计](#6-客户端设计)
7. [桌面发行与守护进程管理](#7-桌面发行与守护进程管理)
8. [远程访问与推送](#8-远程访问与推送)
9. [安全模型](#9-安全模型)
10. [Monorepo 结构](#10-monorepo-结构)
11. [路线图](#11-路线图)
12. [风险与对策](#12-风险与对策)
- [附录 A：能力映射总表（ACP 不支持 vs 本应用）](#附录-a能力映射总表)
- [附录 B：关键源码索引](#附录-b关键源码索引)

---

## 1. 背景与动机

### 1.1 为什么不用 Paseo 直接跑 Pi

通过代码研究确认（关键源码见附录 B），Paseo 对 Pi 的支持**并非 ACP**，而是自建的 Direct provider：`pi --mode rpc` 子进程 + 注入生成式集成扩展 + 直接扫描 JSONL 会话文件。即便如此，体验仍然被以下「补丁」拖累，而这些补丁每周都要跟随 Pi 演进重新维护：

| Pi 能力 | Paseo 的补丁方式 | 代价 |
|---|---|---|
| 会话树 / fork / rewind | `providers/pi/rewind.ts` 自建 rewind；分支树几乎不可用 | UI 上线性的时间线 ≠ Pi 的树形会话语义 |
| 扩展生态（子代理、ask_user 等） | `providers/pi/extensions/` 下 8 个适配器逐一猜测映射到自身时间线 | 新扩展无适配即降级为纯文本 |
| 工具调用富渲染 | `history-mapper.ts` / `tool-call-mapper.ts` 手工映射 | 结构化信息丢失 |
| steer / follow-up | 受 RPC 边界限制（slash 命令不能 steer、无消息 id） | 队列语义残缺 |
| 扩展 UI（select/editor/setWidget/setStatus） | 全部降级为「权限问答」桥接，ask_user 两段式对话有专门 hack | 交互上限被 `AgentClient` 抽象锁死 |
| 会话列表 | 直接读 `~/.pi/agent/sessions/*.jsonl` 扫描 | 无法可靠增量 |
| 用量统计 | `usage-poller.ts` 轮询 | 实时性差 |
| 图片输入 | 按 `model.input` 物化成本地文件传路径 | 多余的文件 IO |
| 系统提示注入 | 必须靠生成的集成扩展（`--append-system-prompt` 会禁用 `APPEND_SYSTEM.md` 发现） | 隐蔽且脆弱 |
| 长操作超时 | `rpcTimeoutMs` 默认 60s，需要配置覆盖 | 慢主机/慢扩展启动时边界情况直接卡死 |

**根本症结**：Paseo 的价值在多 provider 通吃，其 `AgentClient` 统一抽象以「最小公倍数」为边界；Pi 的价值在「极简 harness + 扩展补满」，其能力面是「最大公约数」的反面。两者天然冲突。

### 1.2 Pi 侧可用集成面（研究结论）

Pi 官方提供三种集成方式，均在 monorepo 中可直接复用：

| 集成面 | 入口 | 评价 |
|---|---|---|
| **In-process SDK**（推荐） | `@earendil-works/pi-coding-agent`：`createAgentSession()` / `AgentSessionRuntime` / `SessionManager` / `DefaultResourceLoader` | 权限、扩展运行时、会话树、模型目录、自定义工具全部为直接 TypeScript API，零序列化损耗 |
| **RPC 子进程** | `pi --mode rpc`（JSONL over stdio，见 `docs/rpc.md`） | 进程隔离好，但需自己装的 UI/审批桥接变厚（Paseo 现状） |
| **远程协议（实验）** | `@earendil-works/pi-protocol`（CBOR framed + routed envelopes + attachment）、`pi-client`、`pi-server` | 概念上最贴合「多客户端观察同一会话」，但官方明确 experimental、无兼容保证；作为演进观察项 |

### 1.3 目标

- **G1** Pi 原生语义零损耗：会话树（fork/switch/tree）、steer/follow-up 双队列、compaction、虚拟模型路由、thinking level、usage/cost 全部成为一等 UI。
- **G2** 扩展生态透出：任何用户安装的 Pi 扩展的 UI（select/confirm/input/editor/notify/setStatus/setWidget）在客户端原生渲染；Pi packages/skills/prompt templates/MCP 可在 App 内浏览与管理。
- **G3** 一套代码，三端开箱：iOS / Android（Expo RN）+ 桌面（Electron 包装 Expo Web）+ CLI（后续）。
- **G4** 移动优先体验：局域网直连、公网经 E2E 加密 relay、二维码配对、推送通知（对齐 Paseo）。
- **G5** 零遥测、本地优先、代码与凭据不出本机（且不碰 Pi 的 `auth.json`）。

### 1.4 非目标

- 不做多 Agent 通用平台（不接 Claude Code/Codex 等；ACP 仅在未来作为可选 ingress 评估）。
- 不 fork Pi 内核、不改其会话文件格式；**Pi 的 JSONL 即长期存储格式**，App 只是它的另一个「presentation」。
- 第一期不做协作/多人共享。

---

## 2. 总体结论：方案 B

| 方案 | 结论 | 原因 |
|---|---|---|
| A. Fork Paseo 深化 Pi provider | ❌ | 即使删掉 ACP，`AgentClient` 抽象层与 `pi --mode rpc` 进程边界仍在；扩展 UI / 树 / steer / usage 全要靠映射补丁长期跟随上游；且 Paseo 自有 wire 协议（`packages/protocol/messages.ts`）不为 Pi 语义设计 |
| **B. 新仓库：Paseo 骨架 + Pi 原生内核** | **✅ 采用** | 拿走已被 Paseo 验证的产品拓扑（daemon / Expo / Electron / relay / CLI）与 UI 交互模式，内核换成 in-process SDK，wire 协议自建且只为 Pi 语义设计 |
| C. 押注 `pi-client`/`pi-server` CBOR 协议 | ⏸ 观察项 | `attachment`/replicated state 模型正是「多设备看同一会话」的原生表达；等其 API 稳定后作为 wire 层的迁移候选（§5.12 预留对齐点） |

**方案 B 一句话**：*客户端像 Paseo 那样跨端；服务端像 Pi TUI 那样进程内驱动 Pi，把我们自己实现成 Pi 的第三个「UI mode」（interactive / rpc / companion）。*

---

## 3. 系统总体架构

### 3.1 拓扑

```
                          ┌──────────────────────────────────────┐
                          │      Electron 桌面壳 (desktop)        │
                          │  Expo Web export + daemon sidecar     │
                          │  自动安装/升级/守护 pie-daemon │
                          └───────────────┬──────────────────────┘
                                          │ localhost WS
   ┌──────────────────┐   LAN/direct WS   │
   │  iOS / Android    │◄──────────────┐  │
   │  (Expo RN app)    │               └──┴────────┐            ┌────────────────────────────────┐
   └────────┬─────────┘                            │            │      Relay (relay, P3)         │
            │         ┌─────────────────────────────┴──┐       │  E2E 加密转发 + 推送网关          │
            │  WAN    │        Daemon (daemon)          │◄──────┤  零知识：只见密文与目标地址        │
            └────────►│  ┌────────────────────────────┐ │       └────────────────────────────────┘
                      │  │ Pi 内核层 (§4)               │ │
   ┌──────────────┐   │  │  AgentSessionRuntime         │ │        ~ (任意客户端同时连接)
   │ Web / CLI(P3) │──►│  │  SessionManager ← sessions/  │ │
   └──────────────┘   │  │  Host ExtensionUIContext (§4.2)│ │      ~/.pi/agent/
                      │  │  Host Extension (§4.3)        │ │       ├── sessions/*.jsonl
                      │  │  模型目录 / auth / providers   │ │       ├── extensions/ skills/ themes/
                      │  │  MCP / codemode 运行时         │ │       ├── models.json  auth.json
                      │  └────────────────────────────┘ │ │       ├── settings.json
                      │  ┌────────────────────────────┐ │ └─►    ~/.pi/agent/mcp.json (兼容管理)
                      │  │ WS 服务 / 会话目录 / 审批策略 │ │
                      │  │ 终端面板引擎 / 文件传输 / relay │ │
                      │  └────────────────────────────┘ │
                      └────────────────────────────────┘
```

### 3.2 组件职责

| 组件 | 包名 | 职责 |
|---|---|---|
| **daemon** | `@pie/daemon` | 核心服务：内嵌 Pi SDK 驱动会话；暴露 WS 服务；实现宿主 ExtensionUIContext 与审批扩展；会话/工作区目录；终端与文件 IO；relay 客户端 |
| **protocol** | `@pie/protocol` | wire 协议类型、编解码、版本协商、二进制帧（P2）；daemon 与所有客户端共享；不依赖 daemon |
| **client** | `@pie/client` | 类型化 daemon 客户端 SDK：请求/响应关联、事件订阅、树同步状态机、断线重连（`sinceSeq` 增量重放） |
| **app** | `@pie/app` | Expo 应用（iOS/Android/Web），全部 UI；`os-variant` 文件分叉（`.ios.tsx/.web.tsx`，Paseo 模式） |
| **desktop** | `@pie/desktop` | Electron 壳：加载 app 的 web 导出、管理 sidecar daemon 生命周期、系统托盘、深链、自动更新 |
| **relay** | `@pie/relay` | （P3）公网 E2E 加密中继 + 移动推送网关 |
| **cli** | `@pie/cli` | （P3）终端/SSH 场景的头less daemon 控制器（衔接 `pi --mode rpc` 式用法） |
| **docs** | — | 本文档与后续 ADR |

### 3.3 进程与会话模型

- **一 daemon 多 workspace**：daemon 单 Node 进程，`workspaceId = 正规化项目 cwd 后的稳定哈希`（与 Pi `cwd` 选择语义一致）。
- **一会话一 `AgentSession`**：daemon 持有 `AgentSessionRuntime`，`switchSession()` 复现 Pi CLI 行为（切换 = 替换活跃 `AgentSession`，订阅重绑定）。
- **隔离取舍**：主进程=单点。崩溃恢复靠 Pi 会话持久化（JSONL 为权威状态，重启 attach 即恢复）。**沙箱模式（P2）**：每会话改用子进程 `pi --mode rpc` 驱动、走同一套 wire 协议，专用于不受信项目/CI 场景。
- **注意准则**：SDK 要求 prompt 在流式中必须二中择一（`steer`/`followUp`），daemon 不得代客户端猜测——直接把语义透传给 UI（故障安全）。

### 3.4 技术栈

| 层 | 选型 | 备注 |
|---|---|---|
| 语言/仓库 | TypeScript，npm workspaces（同 Paseo/Pi 生态习惯） | Node ≥ 22.19（Pi SDK 约束） |
| 内核 | `@earendil-works/pi-coding-agent`（+ `pi-agent-core` 类型） | 锁定 minor，patch 快跟 |
| 客户端 | Expo SDK（React Native + React 19）、react-navigation | 三端一份代码 |
| 桌面 | Electron（与 Paseo 同路线），打包 Web 导出 + sidecar | 备选 Tauri v2 在 P0 做一次打包体积 PoC，不阻塞 |
| daemon 服务 | 原生 `ws` WebSocket + Node HTTP | 127.0.0.1 默认；LAN 显式开启 |
| 状态 | 树同步状态机（protocol + client 层实现），app 内 zustand/valtio | 不引入 Redux |
| 终端面板 | xterm.js（web/desktop）+ RN Canvas 方案（Paseo 同款问题域） | P2 |
| 语法高亮 | 复用 Paseo `@getpaseo/highlight`（Apache-2.0，保留 LICENSE 页） | 或 Shiki，P0 做对比选型 |
| 语法/质量 | oxlint + oxfmt + tsc、vitest、playwright | 对齐 Paseo 工具链 |

---

## 4. 内核层：Daemon 的 Pi 集成

### 4.1 会话生命周期（in-process SDK）

```ts
// daemon 内核伪代码
import { createAgentSession, AgentSessionRuntime, SessionManager, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({ cwd, extensionFactories: [hostBridgeExtension] });
const { session, dispose } = await createAgentSession({
  cwd,
  resourceLoader: loader,
  // settingsManager / sessionManager 交给默认实现，直接复用 ~/.pi/agent 的真实存储
});

unsubscribe = session.subscribe((event: AgentSessionEvent) => {
  // 见 §5.7 事件映射表 —— AgentSessionEvent + AgentEvent 直接透传为 wire events
});

await session.prompt(text, { streamingBehavior: "followUp" /* 或 "steer"，由客户端选择；流式中必填 */ });
```

要点：

1. **存储零拷贝**：daemon 直接使用 Pi 的 `$PI_HOME`（默认 `~/.pi/agent`），与并存的其他 Pi 入口（TUI/CLI）共享 sessions、skills、extensions、settings、auth。**手机上发起的会话，终端里 `pi` 接着继续**，反之亦然。
   > 实现注记（P0 验证）：Pi 的会话文件是**惰性落盘**的——首次 append entry 前文件不存在于磁盘。因此 daemon 的 `session.list` 不能只扫磁盘，必须合并 registry 内存中持有的会话（见 daemon `core/daemon.ts listSessions`）。

2. **`AgentSessionRuntime`** 提供 `switchSession()` / `fork()` / `newSession()`，切换后重新订阅并给客户端发 `session.snapshot` 重同步。
3. **外部会话导入**：会话清单直接通过 `SessionManager` 枚举（不再需要 Paseo 的外部扫盘 + `nativeHandle` hack，因为同进程直接持有文件）。对由终端等其他进程正在持有的 JSONL 会话，daemon 提供**只读镜像**订阅：读文件 + 轮询/VFS watcher，仅支持 `get_entries` / `get_tree` 级的观察类 API。

### 4.2 宿主 UI 上下文 —— 「把 daemon 实现为 Pi 的一个 UI mode」

Pi 对扩展只暴露 `ExtensionUIContext`（`pi-mono/packages/coding-agent/src/core/extensions/types.ts:149`）：`select/confirm/input/notify/setStatus/setWidget/setTitle/set_editor_text/...`，**由当前 mode（interactive/rpc/print）提供实现**。

我们的 daemon 在创建会话后调用 `session.bindExtensions({ uiContext: <宿主实现> })` 注入（与 RPC 模式在 `rpc-mode.ts:320` 的做法同源：`AgentSessionConfig.uiContext` 只是构造配置，mode 级 UI 进入点在 `bindExtensions`）——于是**所有用户安装的第三方扩展**（包括 pi-subagents、ask_user、goal-x、任意未来的扩展）的 UI 自动通过 §5.8 的协议在客户端原生渲染，无需任何针对单个扩展的适配器（这正是 Paseo 那 8 个逐扩展适配器整个下线的位置）。

```
扩展 ctx.ui.setWidget("todo", [...])
  └─► daemon 的 ExtensionUIContext 实现
        └─► wire: session.ext.widget {key:"todo", lines[...], placement:"aboveEditor"}
              └─► 客户端按 key upsert 渲染持久部件（移动端样式映射，见 §6.5）
```

超时策略：与 RPC 模式一致的 `timeout` 毫秒→自动取消路径回 `cancelled: true`；客户端崩溃/掉线时 daemon 默认对所有未决 dialog 回 cancel（fault-safe）。

### 4.3 宿主扩展：审批策略与附加工具

Pi 本身「不逐调用审批」（`docs/security.md`），审批通过 `tool_call` 扩展事件实现。这一点直接成为我们的权限层的实现机制：

```ts
// hostBridgeExtension（daemon 内联注册，不落盘）
pi.on("tool_call", async (event, ctx) => {
  const decision = await daemonPolicy.decide(event, ctx);          // allowed/ask 规则引擎（§5.10）
  if (decision === "ask") {
    const answer = await daemonPermissionGate.request({            // → 客户端权限卡片
      toolName: event.toolName, args: event.args, annotations /* read-only 等提示 */,
    });
    // allow-session 则记入会话内 allowlist；deny 则返回 block
  }
  return utils.maybeMutate(event, decision);
});
```

- 策略默认对齐 Pi TUI 语义（`--yolo`/默认询问可配置），工具默认集合与 Pi `defaultTools` 设置一致。
- **附加工具**（P2）：跨会话/子代理编排工具（`create_agent` / `wait_for_agent` / `send_agent_prompt` 等）用 `pi.registerTool()` 直接注册成**原生工具**——与 Paseo 通过 MCP shim 的间接方案不同，零协议损耗、`renderCall` 直通客户端渲染。

### 4.4 模型与 Provider 目录

- `get_available_models` 语义由 daemon 直接从 `ModelRuntime`/模型注册表读取：包含自定义 provider（`models.json`）、OpenAI 兼容端点、llama.cpp 本地模型、OAuth 订阅源。
- **虚拟模型**：模型条目带 `route: virtual` 标记与展开信息（虚→实分派对），并在每次 `message_end` 的 usage/物理模型信息回填真实分派结果，客户端模型选择器显示 `auto • high → gpt-5.6 • medium`（对齐 Pi TUI footer 行为）。
- **登录流**（P2 OAuth）：daemon 起本地回调端口，客户端调 `daemon.auth.start(provider)` 后内置 WebView/系统浏览器完成 OAuth，结果写入 Pi 自己的 `auth.json`（凭据永不出 daemon）。
- 图片输入按 `model.input` 能力报告裁剪/composer 附件水位；纯文本模型自动物化成路径提示（复用 Pi 内建降级行为，由 daemon 打点给 UI「已物化为路径」提示）。

### 4.5 资源管理（extensions / skills / prompts / themes / MCP / packages）

| 订阅 | 能力 | 阶段 |
|---|---|---|
| `resource.extensions` | 列出扩展（路径、builtin 标记、注册的工具/命令/flags/虚拟模型清单）、启停（写 Pi settings）、`get_commands` 合并命令目录 | P1 |
| `resource.skills` | SKILL.md 清单、内容浏览、启用状态 | P1 |
| `resource.templates` | prompt templates 清单与参数模式；composer 模板选择器（`@file` 展开在 daemon 侧预演） | P1 |
| `resource.packages` | `pi install/list/remove/update --extensions` 的进程化封装（spawn `pi` CLI，非 SDK 面），操作日志流 | P2 |
| `resource.mcp` | `mcp.json` 服务器 CRUD、启停、OAuth 连接、`exposure`/`toolExposure` 设置；兼容 pi-mcp-adapter 第三方扩展的配置融合（读取其注册状态） | P2 |

### 4.6 终端面板 —— 不提供（ADR-0004）

原规划含 daemon 内建终端通道（xterm.js/Skia 消费）。**ADR-0004 决策废弃**：终端 cell 流在移动端传输与可读性双输；「看 Pi 干了什么」由会话事件（`tool.*` / `tool.bashDelta`）+ 文件/diff 观察面板承担；用户自己的 shell 体验归宿是 TUI/桌面终端，Pi 本体终端完整保留。若未来桌面端需求反转，重开 ADR 评估「桌面壳内只读终端面板」的单独实现。

### 4.7 与官方 pi-server / pi-protocol 的演进关系

- wire v1 自建（§5），命名与语义刻意对齐 pi-protocol 的概念（serverId、session attach、attachment 式多连接、seq 重放），使得若 `pi-server` 生产化，可平移向：**app 直连 pi-server；daemon 退化为 pi-server 的 launcher + 权限策略**。协议层隔离、客户端无感（§5.12）。

---

## 5. Wire 协议 v1 规格

> 本节是 P1 的实现契约。设计原则：
> ① **树形记忆**：客户端权威状态 = 会话树（entry 序列 + leaf），不是一条线性时间线——这是与 Paseo 数据模型的根本区别；
> ② **Pi 语义直译**：每个命令/事件映射到明确的 Pi SDK API，禁止发明第二语义；
> ③ **JSONL text 起步**；二进制帧按需引入（终端通道已由 ADR-0004 废弃，仅剩 file-transfer 一个候选需求）；
> ④ 客户端 seq 重放可恢复（离线降级为提示用户重连）。

### 5.1 传输与帧

- 传输：WebSocket（`ws`），默认 `wss://127.0.0.1:8760`（桌面） / `ws://<lan-ip>:8760`（局域网） / `wss://relay…`（公网）。
- **v1 控制帧 = 一行一 JSON（LF 结尾）**，与 Pi RPC 的 JSONL 习惯一致，便于抓包/回放调试。
- **二进制帧（按需，未启用）**：同一 WS 上的二进制帧（`0x50 0x49` magic、u8 channel、u16 frameType、u32 seq、payload）。ADR-0004 后仅剩候选 channel：`file-transfer`（附件上送/大文件分片拉取，设计可参考 Paseo 三段 chunk 协议，Apache-2.0）；出现真实带宽瓶颈时再设计。

### 5.2 握手 Hello（能力协商）

```jsonc
// client → daemon
{
  "hello": {
    "v": 1,                                   // 协议主版本
    "client": { "kind": "app|desktop|cli", "version": "0.1.0", "platform": "ios" },
    "caps": [                                  // 客户端能力
      "treeSync",      "extWidgets",  "typedWidgets",
      "binaryFrames",  "fileTransfer", "permissiveLargeFrames"
    ],
    "auth": { "method": "token", "token": "<host token>" }   // §9
  }
}

// daemon → client
{
  "helloAck": {
    "v": 1,
    "serverId": "8920……-uuid",                 // daemon 实例 id（对齐 pi-protocol 语义）
    "daemon": { "version": "0.1.0", "hostname": "mo", "os": "darwin" },
    "pi":     { "version": "0.9x.x", "agentDir": "~/.pi/agent" },
    "caps": [/* 双方交集 */],
    "eventSeq": 0                              // 事件序列起点
  }
}
// 版本不符 → daemon 回 {"fatal": {"code":"version_mismatch", "min":1, "max":1}} 并断开
```

### 5.3 资源地址模型

```
serverId                     // daemon 实例（一机一 daemon；relay 后仍可见）
└─ workspace: <workspaceId>  // = 正规化 cwd 的稳定 hash（同个 git 仓库换 shell cwd 仍同 id）
   └─ session: <sessionId>   // = Pi sessionId（JSONL 会话 id，稳定、跨 TUI/RPC 共存）
      └─ entryId             // = Pi entry id（树节点）
```

- **不引入 provider/agent 层**（对比 Paseo 的 agent 模型）：会话即 Pi 会话。多「任务并行」= 多会话（Pi 语义），App 的会话列表按 workspace 分组。
- 归档/标签等 App 私有元数据存 daemon 侧 `~/.pie/state.db`（SQLite），不污染 Pi 存储。

### 5.4 信封

```ts
// 请求（client → daemon；id 单调递增字符串）
{ "id": "c-42", "cmd": "session.prompt", "args": { /* … */ } }

// 成功响应
{ "id": "c-42", "ok": true, "data": { /* … */ } }

// 失败响应
{ "id": "c-42", "ok": false, "error": { "code": "session_streaming", "message": "…", "retryable": true } }

// 事件（daemon → client；seq 会话内单调递增，用于断线重放）
{ "ev": "session.entry.appended", "seq": 128, "data": { /* … */ } }
```

- **每个会话一条逻辑事件流**（`data.sessionId` 携带），客户端按订阅 mux/demux；`ev.since` 重放协议：重连后带最后的 seq，daemon 从环缓冲（默认保留 2h/10k 条）重放。
- 高频事件（text delta、bash delta）服务端**合流**后发出（下限 16ms/100ms，交互事件立即），客户端保证按 seq 顺序处理（合流只合并、不重排）。

### 5.5 命令目录（P1 全集）

| 命令 | 参数（要点） | → Pi SDK / RPC 对应 |
|---|---|---|
| `daemon.status` | — | 进程/Pi 版本/资源负载 |
| **工作区** | | |
| `workspace.list` / `workspace.recent` | — | daemon 扫描 sessions 分组 + 历史 |
| `workspace.open` | `{ path }` | 检查信任（Pi `project_trust` 语义透出为客户端确认卡） |
| **会话** | | |
| `session.list` | `{ workspaceId }` | `SessionManager` 枚举（含 CLI 起源会话，读模式） |
| `session.create` | `{ workspaceId, model?, thinking?, name? }` | `runtime.newSession()` |
| `session.attach` | `{ sessionId }` | 订阅 + 首帧 `session.snapshot` |
| `session.detach` | `{ sessionId }` | 释放订阅（保持后台运行） |
| **会话树** | | |
| `session.tree` | `{ sessionId }` | `get_tree` / SessionManager 树 |
| `session.entries` | `{ sessionId, since? }` | `get_entries`（服务器→客户端快照+增量） |
| `session.forkAt` | `{ entryId }` | `fork`（daemon 保证 live 会话为幂等 fork） |
| `session.forkPreview` | `{ entryId }` | `get_fork_messages`（预览，不落盘） |
| **输入流** | | |
| `session.prompt` | `{ message, images[], delivery: "auto"\|"steer"\|"followUp" }` | `prompt`（流式中 `auto` 拒绝→客户端重选，映射 SDK 拒猜原则） |
| `session.steer` / `session.followUp` | 同上 | `steer` / `follow_up` |
| `session.abort` | — | `abort`（原子清队列后中止） |
| `session.queue.clear` | — | `clear_queue`（返回被清空的 steering/followUp 两队列） |
| **模型** | | |
| `models.list` | `{ workspaceId }` | `get_available_models`（+ 虚拟模型展开路由信息） |
| `model.set` | `{ provider, modelId }` | `set_model` |
| `thinking.set` | `{ level }` | `set_thinking_level` |
| `scope.set` | `{ entries: [{model, thinking?}] }` | scoped cycle（`--models` 语义，快切列表） |
| **上下文** | | |
| `compaction.run` | `{ customInstructions? }` | `compact` |
| `compaction.setAuto` | `{ enabled }` | `set_auto_compaction` |
| `session.stats` | `{ sessionId }` | `get_session_stats` + usage 视图（token/成本/上下文水位，含物理模型归属） |
| **队列与杂项** | | |
| `rename` / `exportHtml` / `retry.abort` / `bash.abort` | … | `set_session_name` / `export_html` / `abort_retry` / `abort_bash` |
| **资源** | | |
| `resources.overview` | — | 扩展/skills/模板/命令的合并视图 |
| `commands.list` | `{ workspaceId }` | `get_commands`（含 `source: extension|prompt|skill`） |
| **审批** | | |
| `permission.respond` | `{ requestId, decision: "allow"\|"allowSession"\|"deny", mutatedArgs? }` | 见 §5.10 |

命名约定：`<ns>.<verb>`；事件用过去式（`session.entry.appended`），命令用祈使句。

> 已移除：`session.switch`（ADR-0003）——daemon 并发持有多个会话，无「当前会话」概念；客户端切换 = attach 目标会话。

### 5.6 事件目录与映射表（Pi → wire）

daemon 直接搬运 Pi SDK 事件（删改公开字段需 bump minor），四类：

**A. 运行生命周期**

| Pi 事件 (`AgentSessionEvent` / `AgentEvent`) | wire 事件 | 备注 |
|---|---|---|
| `agent_start` | `session.run.started` | |
| `turn_start` / `turn_end` | `session.turn.started` / `session.turn.ended` | `turn_end` 带完整消息+工具结果 |
| `message_start` / `message_end` | `session.message.started` / `session.message.ended` | |
| `message_update` + assistant `{type:"text_delta"}` | `session.partial.delta` | 合流 ≥16ms；binary 帧候选 |
| `message_update` 其他分支（thinking_start/…） | `session.partial.*` | 映射 `AssistantMessageEvent` 命名 |
| `agent_end {willRetry}` | `session.run.ended {willRetry}` | |
| `agent_settled` | `session.settled` | UI 的「真正空闲」信号 |

**B. 队列 / 压缩 / 重试**

| Pi 事件 | wire 事件 |
|---|---|
| `queue_update {steering, followUp}` | `session.queue.changed`（两数组） |
| `compaction_start` / `compaction_end` | `session.compaction.started/ended`（条目 entry 亦走 `entry.appended`） |
| `auto_retry_*` / `summarization_retry_*` | `session.retry.*` |

**C. 工具执行**

| Pi 事件 | wire 事件 |
|---|---|
| `tool_execution_start {toolCallId, toolName, args}` | `session.tool.started` |
| `tool_execution_update {partialResult}` | `session.tool.updated` |
| `tool_execution_end {result, isError, durationMs, nestedCalls?}` | `session.tool.ended`（`parentToolCallId` 保留→父子卡片） |
| `bash_execution_update`（带命令 id） | `session.tool.bashDelta`（P2 二进制帧） |

**D. 会话树与附件（树同步核心）**

| Pi 来源 | wire 事件 |
|---|---|
| `entry_appended {entry}` | `session.entry.appended`（含 `parentId`；权威树状态增量） |
| leaf 切换（仅观察分支切换，非 fork） | `session.leaf.changed`（data: `{leafId}`；展示路径切换） |
| fork/switch 后 | `session.snapshot`（全量：tree、entries、leafId、state、queues、run 标志） |
| `session_info_changed` | `session.renamed` |
| `thinking_level_changed` | `session.thinking.changed` |

> **树同步状态机（client 侧）**：`snapshot` 建立（entries 表 + tree 图 + currentLeaf），之后所有 `entry.appended` 插树；`leaf.changed` 切换展示路径；分支重叠段去重按 `entryId`。窗口收敛：检测到缺口（seq 跳变）→ `sync` 重放请求 → 缺 lastSeq 超 2h → 全量 `snapshot`。

### 5.7 会话树订阅协议（示例：手机围观桌面会话）

```jsonc
// ① 手机 attach
{ "id": "c-1", "cmd": "session.attach", "args": { "sessionId": "…" } }
{ "id": "c-1", "ok": true, "data": { "leafId": "…", "runState": "streaming" } }

// ② 首帧快照（data 精简示意）
{ "ev": "session.snapshot", "seq": 400, "data": {
    "sessionId": "…", "leafId": "…", "branches": [ /* SessionTreeNode[] 同 Pi 形状 */ ],
    "entries": [ /* 活跃路径的 entries（按需；分页） */ ],
    "state": { "model": {"provider":"router","id":"auto"} /* 虚拟选择 */,
                "thinkingLevel": "high", "isStreaming": true,
                "steering": [], "followUp": [], "autoCompaction": true },
    "usage": { "contextPct": 62, "cost": "1.82" }
}}

// ③ 附件下游为只读时（正在被桌面持有输入权），daemon 标记 attach.presentation: "readonly"
//    请求写入命令返回 error { code: "presentation_readonly" }
```

多 attach 并发安全：Pi SDK 单 `AgentSession` 多订阅者天然支持事件流；**写入权限互斥**由 daemon 管理的「presentation attachment」锁决定（先持有者可写，其余只读）——对齐 pi-server 的 attachment 语义（§4.7）。

### 5.8 扩展 UI 协议（本项目旗舰能力）

Pi 扩展的 UI 请求在 daemon 的 `ExtensionUIContext` 中转为下列 wire 事件（映射实现见 §4.2）：

```jsonc
// 1) 阻塞式对话框（必须响应或超时；扩展侧拿到与 RPC 模式一致的返回）
{ "ev": "session.ext.dialog", "seq": 412, "data": {
    "requestId": "d-9",
    "kind": "select" | "confirm" | "input" | "editor",
    "select":   { "title": "Pick slot", "options": ["a","b"], "timeoutMs": 30000 },
    "confirm":  { "title": "Deploy?", "message": "…" },
    "input":    { "title": "Branch name", "placeholder": "" },
    "editor":   { "title": "Refactor plan", "prefill": "…" }
}}
// 响应（client → daemon）
{ "id": "c-5", "cmd": "ext.dialog.respond", "args": {
    "requestId": "d-9",
    "value": "b"  |  { "confirmed": true }  |  { "cancelled": true }   // 按 kind
}}

// 2) 持久部件（upsert by key；移动端映射见 §6.5）
{ "ev": "session.ext.widget", "seq": 413, "data": {
    "key": "todo", "placement": "aboveEditor",
    "lines": ["[x] call", "[ ] …"],        // v1：终端行（升级为 typed 结构见 P2）
    "clear": false                         // true = 移除
}}

// 3) 状态栏 / 通知 / 标题 / 编辑器注入
{ "ev": "session.ext.status",  "seq": 414, "data": { "key": "deploy", "text": "↑ 3 tasks" } }
{ "ev": "session.ext.notify",  "seq": 415, "data": { "message": "…", "type": "info|warning|error" } }
{ "ev": "session.ext.title",   "seq": 416, "data": { "title": "Sprint 42" } }
{ "ev": "session.ext.setEditorText", "seq": 417, "data": { "text": "…"} }
//   （set_editor_text 仅在客户端持有 Composer 编辑权时生效，见 §5.7 写入权限互斥）
```

**Compose 联动**（ask_user 类扩展的两段式体验，本项目反过来实现）：扩展的 `select` 后往往还跟一个可选 `input`（收集批注），daemon 按 `allowComment` 元数据将两段请求归并为**一张带批注框的选择卡**一次性呈现（一次 UI 操作，daemon 代答第二个 dialog）——这正是 Paseo 退化成两张权限卡的交互死角。

**typed widgets（P2）**：`session.ext.typedWidget {kind: "progress|stats|checklist|chart|cells", payload}`。v1 阶段不强制扩展作者改写——他们仍像在 TUI 侧一样直接用字符串行集，客户端提供「行集→常见形状」的自动猜测（进度条、计数、checklist）保证零适配。

### 5.9 权限协议

```jsonc
// daemon → client（由宿主扩展 tool_call 拦截驱动，§4.3）
{ "ev": "session.permission.request", "seq": 501, "data": {
    "requestId": "p-7", "sessionId": "…",
    "toolName": "bash",
    "argsPreview": { "command": "rm -rf build && make", "timeout": 120000 },
    "annotations": { "readOnlyHint": false, "destructiveHint": true },
    "reason": "policy.ask",                      // 默认策略命中原因
    "timeoutMs": 600000                          // 默认 10min；超时 = deny
}}
// client → daemon
{ "id": "c-9", "cmd": "permission.respond", "args": {
    "requestId": "p-7",
    "decision": "allow" | "allowSession" | "deny" | "alwaysAllowTool",
    "mutatedArgs?"
}}
```

- daemon 维护三级级联：**daemon 全局策略（工具 allowlist/asklist）> 会话内 allowSession/alwaysAllowTool > 单次决策**；任何下方冲突取最严格。
  > 实现注记（P1/ADR-0002）：默认策略为 `off`（与 Pi TUI 的信任模型一致，不为既有本机工作流引入额外审批），`--permission=annotations|ask` 显式开启。
- 超时/掉线 = **deny 并中止流等待**（fail-safe；`tool_call` handler 返回 block，模型在下一轮看到拒绝原因）。
- ACP 对比：ACP 只有文本选项单（`request_permission` options），无 annotation、无会话级记忆、无参数 mutation。

### 5.10 bash 输出与文件传输（按需；终端通道已废弃）

- **无终端通道**（ADR-0004）：无 `terminal.*` 命令族、无 `bash-output`/`terminal` 二进制 channel。Pi 会话内的 bash 工具输出照常走会话事件流（`session.tool.started/updated/bashDelta/ended`），客户端以工具卡/代码块视图呈现。
- `file-transfer`（唯一候选二进制 channel，未启用）：composer 附件上送（图片/PDF → Pi `ImageContent`/路径物化）与大文件正文按需拉取；分片 FileBegin/Chunk/End 协议可参考 Paseo 实现（Apache-2.0）。启用前先用 JSONL + 压缩验证流量假设。

### 5.11 版本兼容策略

- Hello 协商 `v` major；minor 能力全走 `caps` 字符串。
- daemon 与客户端**同仓同版本发布**（monorepo 锁步），协议仅在跨大版本时保证兼容。第三方（如 CLI 单独升）场景：daemon 对未知 `caps` 求交集，新事件字段按「未知字段忽略」原则向后兼容。
- **Pi SDK 锁版本**：`package.json` 精确 pin + `pi-test` 式烟测（起会话→fork→steer→compact→断开重连）集成在 CI，Pi minor 升级作为独立 PR 走全量测试。

---

## 6. 客户端设计

### 6.1 三端策略（照抄 Paseo 骨架）

- 一套 Expo app：`ios/`（Fastlane 出 TestFlight/App Store）、`android/`（Play + F-Droid 可选）、`web/`（`expo export --platform web` 产出即桌面壳内容）。
- 桌面 = Electron 壳：加载 web 导出、spawn/管理 sidecar daemon（本地 stdio+健康检查）、系统托盘、全局快捷键、深链 `pie://session/…`。
- 平台分叉代码走 `.web.tsx / .ios.tsx / .native.tsx` 文件后缀（Paseo 已验证此模式在这样的 app 里是可维护的）；统一 `components/adaptive-*` 双形态组件（Sheet/Modal、TextInput、面板布局）。

### 6.2 状态管理

- **权威模型**：`TreeSnapshotRepo`（per-session：entries map、tree graph、currentLeafId、runState、queues、widgets map、dialogs queue、permissions queue）——由 `@pie/client` 维护，向 UI 暴露 selector 订阅（zustand store 树）。
- **派生模型**：`timeline = path(root→currentLeaf)` 的 entry walk；模型路由徽章、上下文水位、usage 全部从 entry 流派生（`ModelChangeEntry`/`UsageEntry`/`CompactionEntry`）。
- 断线：UI 状态保留 + 顶部重连横幅；重连成功按 `sinceSeq` 重放后自动收起。

### 6.3 布局蓝图

**桌面**：
```
┌──────┬───────────────────────────────────┬───────────────┐
│      │  Chat Stream (分支时间线)            │  Right Dock    │
│ Work │  ├ branch switcher strip            │  ├ 终端面板     │
│ space│  ├ entry cards                     │  ├ Diff/文件树  │
│ 侧栏 │  │  user/assistant/tool/widget/…      │  ├ 扩展部件     │
│      │  ├ streams(per-branch badges)        │  ├ 会话统计     │
│ 会话 │  Composer                            │  └ ⌘K 命令面板  │
│ 列表 │  ├ [Steer|Follow] 流中模式条           │               │
│      │  ├ 附件/模板/skill 选择器              │               │
└──────┴───────────────────────────────────┴───────────────┘
```

**移动**：单栈 + 底部 Tab：`对话 / 文件 / 终端 / 会话`；工具卡片、扩展部件、权限卡全部在时间线内联渲染（Paseo 的 mobile-panels 模式），分支切换放顶部下拉。

### 6.4 从 Paseo 复用资产清单

> 许可：Paseo 为 Apache-2.0。整体照搬需在仓库 `NOTICE` 保留版权与 LICENSE 申明；「参考设计」不构成衍生作品。以下分级决定每件资产的处理方式。

| Paseo 资产 | 处理 | 说明 |
|---|---|---|
| composer 交互形态（autoresizing 输入、附件/语音/斜杠命令面板、稳定键盘高度条） | 参考设计 | `app/src/composer/**` 的 UX 拆分是最好的速成参考 |
| `@getpaseo/highlight` 语法高亮 | 直接复用 | 独立 npm 包，Apache-2.0 NOTICE |
| `binary-frames/`（file-transfer 三段、terminal demux） | 直接复用 | 二进制帧期 adopt |
| relay 密码学与配对流程（E2E、二维码配对） | 参考设计 → 自研对齐 | 复核实现后决定 copy/adapt |
| `expo-two-way-audio`（语音） | P2 调研复用 | |
| panels/dock 架构（manifest/registry/load-state） | 参考设计 | 面板注册器模式直接借用概念 |
| mobile 交互细则（mobile-panels、bottom-panels、键盘工具条） | 参考设计 | 尺寸/动效参数可直接取 |
| 树形 diff/文件浏览器/PR 面板 | P2 移植 | 与 provider 无关，可整体搬 |
| agent 生命周期/timeline 权益论 | **不复用** | 我们用 session 树模型取代（§5.1 原则①） |
| ACP 栈、multi-provider 全链路 | **不复用** | 本项目的存在理由 |

### 6.5 Pi 特有的 UI 增补（对应 §1 能力清单）

1. **分支时间线**：`tree strip` 显示分支缩略图（Paseo `branch-switcher.tsx` 的强化版）；每个 entry 可悬停预览 `fork here / fork preview`；被压缩段折叠显示（`CompactionEntry` 折叠卡：点击展开原文，并提示这是不可逆概括）。
2. **Steer / Follow 二模式 Composer**：流式中始终呈现 `[⏱ Follow] [⚡ Steer]`；队列徽标在流式卡下方展开（可逐条移除——`session.queue.clear` 返回内容用于生成撤销 toast）。
3. **模型路由徽章 + thinking picker**：模型名即路由（`auto • high`），每次响应后短暂闪现 `→ gpt-5.6 • medium`；scoped cycle 快切（Cmd+P 同构）。
4. **上下文仪表盘**：常驻 sidebar footer：水位条（逼近压缩阈值动画）、自动压缩开关、手动压缩按钮、连续等待重试（`summarization_retry_*`）的计时显示。
5. **扩展面板**：Settings→Extensions：已装扩展/命令/flags/虚拟模型清单（从 `resources.overview` 读）；Skill 浏览器内嵌渲染 markdown；`pi packages` 安装页（spawn CLI + 进度流）。
6. **扩展部件原生化**：`session.ext.widget` 渲染为 sticky 卡片（桌面驻留右侧 dock / 移动端条上面的小部件行）；「行集→常见形状」启发式（progress/counter/checklist）。
7. **Codemode 单元格渲染**（P2）：tool 卡上若为 codemode 执行，渲染 cell（code + stdout/stderr 折叠 + value/image 结论）。
8. **Usage 卡**：per-会话、per-物理模型统计 + 虚拟分派路径饼图（数据来自 `session.stats`）。
9. **权限卡**：annotation 驱动的警示样式（destructive=红、readOnly=蓝）、批量预演（同一命令的先后样式缓存对比）、「本会话始终允许」三个操作位。

---

## 7. 桌面发行与守护进程管理

- **sidecar 模式（默认）**：desktop 包捆 `pie-daemon`（Node ≥22 运行时。macOS 用 embedded binary / win-linux 用 pkg-style 自解压（P0 做技术选型：caxa vs node21+sea vs 依赖系统 Node 提示））。Electron 主进程职责：spawn → wait healthcheck（`daemon.status`）→ 打开窗口 → 崩溃退避重启 → 更新升级（electron-updater）。
- **外部模式**：设置页可指向已有 daemon（如 NAS/CI 机器的 `pie-daemon --listen 0.0.0.0:8760`，或 SSH 隧道）。与 Paseo 的 host 连接模型对齐（可复用其 add-host 二维码/深链协议设计）。
- **Pi CLI 共存**：SDK daemon 与用户 TUI/`pi` CLI 并行运行；settings/auth/extensions 共享只读安全。冲突规则：**后写赢**（Pi 无锁，JSONL append-only 非活跃会话风险低；活跃会话双写在 P1 显式拦截：检测第二次 attach 活跃运行时标记 `session.busy` 只读）。

## 8. 远程访问与推送

- **P1（本期）**：LAN 直连（mDNS 广播 `_pie._tcp` 发现 + 二维码 token 配对）。
- **P3 relay**：借鉴 Paseo relay 架构——daemon 发起反向长连到可自托管 relay（只有密文流过）；配对时二维码含 relay URL + 公钥指纹，X25519 + AEAD；推送网关为移动端提供 wake-up（APNs/FCM 的「会话 `session.settled` / 权限待决」两类通知）。
- 不做云存储、不做远程代码执行暴露面（bash 通道仅在用户显式打开终端面板时存在）。

## 9. 安全模型

| 面 | 策略 |
|---|---|
| 本机 WS | token 鉴权（三种发放方式：桌面壳自动注入；LAN 扫码绑定；CLI 手动）；默认只听 127.0.0.1 |
| 数据 | 会话数据 100% 存 Pi 自家目录；App 私有状态（标签/归档）单独 `state.db`；不复制不混淆 |
| 凭据 | `auth.json`/OAuth 只在 daemon 内触达，客户端永不读取内容，只显示 provider 状态 |
| 审批 | §5.10 fail-safe（超时/掉线即拒）；destructive annotation 强制人工 |
| 项目信任 | 透传 Pi `project_trust`：workspace.open 时客户端确认卡 → daemon 再加载项目级扩展/pkgs |
| 传输 | LAN 建议用户开 TLS（自签 + 指纹固定）或走 relay（E2E）；App 明文连 LAN 打缓存提示 |
| 供应链 | 扩展代码与 Pi TUI 同权运行：安装页展示 source（npm/git/local）+ 警示文案（对齐 Pi packages 文档） |

## 10. Monorepo 结构

```
pie/
├── package.json                # workspaces + scripts（模板对齐 paseo 根）
├── docs/
│   ├── architecture.md         # 本文档
│   └── adr/                    # 后续决策记录
├── packages/
│   ├── protocol/               # @pie/protocol：类型+编解码+cap 协商+二进制帧
│   ├── client/                 # @pie/client：连接、请求、树同步状态机
│   ├── daemon/                 # @pie/daemon：Pi 内核（§4）+ WS + 审批 + 终端/文件
│   ├── app/                    # @pie/app：Expo（ios/android/web）
│   ├── desktop/                # @pie/desktop：Electron 壳 + sidecar
│   ├── relay/                  # @pie/relay（P3）
│   └── cli/                    # @pie/cli（P3）
└── scripts/                    # dev-daemon、打包、E2E
```

CI：`tsc --noEmit` × packages → vitest 单测 + `pi-smoke`（对真实 Pi SDK 全链路借用 session）→ `expo export` 构建 web → Electron 打包（mac/win）→ RN e2e（maestro）。

## 11. 路线图

| 阶段 | 周期 | 交付物 | 验收（DoD） |
|---|---|---|---|
| **P0 脚手架** | 2–3 周 | monorepo；protocol v0（Hello/信封/8 条核心命令）；daemon 内嵌 SDK 起 1 会话；web 聊天页（无面板） | 浏览器流式对话可用；`pi` TUI 同时续聊同一 JSONL |
| **P1 MVP** | 6–8 周 | §5.5 全命令 + §5.6 四类事件 + 树同步状态机；分支时间线、Steer/Follow composer、权限卡、扩展 dialog/widget（v1 行集）、模型选择（虚拟模型+thinking）、usage 卡、多 workspace；Electron sidecar；LAN 扫码直连；iOS/Android 界面 | 桌面为日常主力不可回退；手机可围观+接权限卡；fork→rewind 在 App 内可完成 90% 场景 |
| **P2 深化** | 8–12 周 | ~~终端通道/二进制帧~~（已废弃，ADR-0004）；扩展管理页+packages 安装流 ✓、MCP 管理页（跳过）、skills/prompt 浏览器 ✓、diff/文件树/PR 面板深化 ✓、typed widgets ✓（§6.5 启发式）、~~沙箱会话模式~~（缓议，见下）、~~OAuth 登录流~~（重定义为凭证面并缓议）；`file-transfer` 二进制通道仅在真实带宽瓶颈出现后设计 | 扩展生态完全免适配（新装扩展零适配可用） |
| **P3 生态** | 持续 | relay + 推送、CLI、语音（expo-two-way-audio 评估迁移）、pi-server 演进评估（§4.7）；**沙箱会话模式**（relay/远程场景首次出现「不受信项目经公网打开」时启动——本地单用户形态下与 Pi 本体威胁模型一致，无增量攻面）；**凭证面**（auth 状态/`pi auth print-api-key` 语义收口/relay token 管理——用户价值随 relay 接入兑现） | 公网移动体验对齐 Paseo |

里程碑间的工程铁律：每阶段 `protocol` 包增加字段只允许加法 + cap 门控（§5.11）。

## 12. 风险与对策

| # | 风险 | 等级 | 对策 |
|---|---|---|---|
| R1 | Pi SDK experimental 面变化（`AgentSessionEvent` 字段变更、ExtensionUIContext 调整） | 高 | 精确 pin + CI 烟测（fork/steer/compact/重连）；Pi 类型引用收口在 daemon 适配层（不允许 app 直接 import pi 包）；上游 release note 例行 review（AGENTS.md 义务） |
| R2 | 多客户端 attach 的写入权竞争（手机预览时桌面正在 prompt） | 中 | attachment 锁（§5.7）+ readonly 标记 + 「接管输入」显式按钮 |
| R3 | Electron + sidecar（Node 运行时）打包体积大 | 中 | P0 PoC node sea/pkg；若 >250MB 评估 Tauri v2 改造 desktop 包（app web 导出复用不受影响） |
| R4 | 移动后台断连限制（iOS） | 中 | P1 只承诺前台+LAN；P3 推送网关；Wire 上 `sinceSeq` 已就绪 |
| R5 | 扩展 widget 生态沉迷行集（终端行）能力有限 | 中 | typed widgets（P2）+ 行集→形状启发式（§6.5-6）双轨；给 Pi 上游提 ExtensionUIContext 的 typed setWidget 提案 |
| R6 | 会话 JSONL 双写冲突（App 与 CLI 同时活跃会话） | 低 | 活跃会话外进程只读（`session.busy` 互斥，由 daemon 对文件 mtime+session 清单判定）；冲突时 UI 标注「外部修改」并 refreshed snapshot |
| R7 | 复用 Paseo 资产的合规误踩 | 低 | `NOTICE` 清单 + 每次 copy PR 打标 origin；CI license check |

---

## 附录 A：能力映射总表

> 图例：ACP = Agent Client Protocol 原生表达；Paseo = 即经补丁后能力；**Companion** = 本应用原生面。

| 能力 | ACP | Paseo（Pi provider） | Companion |
|---|---|---|---|
| 会话树 / fork / switch | ✗ | 部分（rewind 补丁，fork 难用） | ✅ 一等：snapshot+entry 增量 |
| Steer / Follow-up 双队列 | ✗（只能排队/打断） | 部分（RPC 限制） | ✅ 原生（SDK 直译） |
| 扩展生命周期 UI（select/editor/...） | ✗ | 降级为权限问答 | ✅ 原生 dialog+widget 流 |
| 第三方扩展零适配渲染 | ✗（无扩展概念） | 逐个手工适配器 | ✅ ExtensionUIContext 整桥 |
| 虚拟模型 / 模型路由展示 | ✗ | ✗ | ✅ |
| thinking level / scoped cycle | ✗（modes 粗粒度） | 部分 | ✅ |
| 自定义 provider / llama.cpp / OAuth | ✗ | 部分 | ✅（含 in-app 登录流） |
| 压缩（手动/auto/摘要条目） | ✗ | 部分 | ✅ |
| usage / cost / 上下文水位 | ✗（无标准） | 轮询 | ✅ 事件直读 |
| Skills / prompt templates / packages | ✗ | ✗ | ✅ 管理页 |
| MCP 管理（exposure/tool search） | 部分（静态） | 部分 | ✅ 动态注册+命名 |
| 权限：annotation/会话级/参数改写 | 文本选项单 | 映射后较全 | ✅ 结构化+fail-safe |
| Codemode 输出（cell/value/image） | ✗ | 未知降级 | ✅（P2 渲染器） |
| 多设备同时观察同一会话 | 单客户端假设 | daemon 多客户端（自家模型） | ✅ + 未来 pi-server attachment 演进 |
| 远程（公网） | N/A | relay（E2E） | relay（P3，参考实现） |

## 附录 B：关键源码索引

| 主题 | 位置 |
|---|---|
| Pi RPC 命令/响应/扩展 UI 类型 | `pi-mono/packages/coding-agent/src/modes/rpc/rpc-types.ts` |
| Pi 会话事件全定义 | `pi-mono/packages/coding-agent/src/core/agent-session.ts`（`AgentSessionEvent`，L196）；`pi-mono/packages/agent/src/types.ts`（`AgentEvent`，L516） |
| 扩展 UI 上下文（被 daemon 实现的接口） | `pi-mono/packages/coding-agent/src/core/extensions/types.ts`（`ExtensionUIContext`，L149） |
| SDK 入口与配置 | `pi-mono/packages/coding-agent/docs/sdk.md`；`src/core/agent-session.ts`（`AgentSessionConfig`） |
| 会话 JSONL/树/entry 类型 | `pi-mono/packages/coding-agent/docs/session-format.md`；`src/core/session-manager.ts` |
| 虚拟模型 | `pi-mono/packages/coding-agent/docs/virtual-models.md`、`src/core/virtual-models.ts` |
| Paseo Pi 补丁现场（反例教材） | `paseo/packages/server/src/server/agent/providers/pi/`（rewind/usage-poller/extensions/* 等） |
| Paseo 二进制帧 / relay / 配对（可复用设计） | `paseo/packages/protocol/src/binary-frames/`、`paseo/packages/relay/` |
| Paseo 桌面壳与 sidecar 管理 | `paseo/packages/desktop/` |
| Paseo composer/面板交互（参考设计） | `paseo/packages/app/src/composer/`、`src/panels/`、`src/mobile-panels/` |

---

*本文档由架构分析→决策→协议草拟一次成稿；下一步：① 评审合并 ② 产出 `packages/protocol` 的 TS 类型初稿与 `docs/adr/0001-wire-protocol.md` ③ P0 脚手架动工。*
