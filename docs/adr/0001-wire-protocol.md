# ADR-0001: Wire 协议 v1 采用自建 JSONL over WebSocket，语义直译 Pi SDK

- 状态：已接受
- 日期：2025-10-11
- 关联：[architecture.md §5](../architecture.md#5-wire-协议-v1-规格)

## 背景

pie 的客户端（Expo app / Electron / CLI）需要与内嵌 Pi SDK 的 daemon 通信。候选方案：

| 候选 | 说明 |
|---|---|
| A. 复用 Pi RPC JSONL | 把 daemon 做成 RPC 记录转发器（客户端直接说 `pi` 的 RPC 协议） |
| B. ACP（Agent Client Protocol） | 通用 Agent 客户端协议（Zed），Paseo 的默认集成路径之一 |
| C. `pi-protocol`（CBOR framed + routed envelopes） | Pi monorepo 的实验性远程协议 |
| D. 自建 JSONL over WebSocket，语义直译 Pi SDK | daemon 与 client 之间的自有协议 |

## 决策

**采用 D**。要点：

1. **信封三分法**：`{id, cmd, args}` 请求 / `{id, ok, data|error}` 响应 / `{ev, seq, data}` 事件。
   - `seq` 为**连接级**单调递增（非会话级）：客户端只需一个严格有序的消费者，简化 mux/demux；断线重连用 `sync {sinceSeq}` 从 daemon 环缓冲重放（默认保留 2h/10k 条）。
2. **Hello 能力协商先于一切**：`v`（major）不匹配即断；minor 能力（treeSync / extWidgets / binaryFrames / fileTransfer…）走 `caps` 字符串求交集。
3. **会话树同步为协议核心**：attach 返回 `session.snapshot`（tree + entries + leafId + state + queues），之后以 `session.entry.appended`（携带完整 Pi `SessionEntry`，含 `parentId`）作为树状态唯一增量来源；仅观察分支切换用 `session.leaf.changed`。客户端权威状态 = 树，时间线 = root→leaf 的 entry 路径派生。
4. **Pi 语义直译**：每条命令/事件都能回溯到一个 Pi SDK API（如 `session.forkAt` → `SessionManager` fork、`session.queue.clear` → `clear_queue`）。禁止发明 Pi 之外的第二语义——Pi SDK 变更时只有一层平移。
5. **扩展 UI 桥接协议化**：daemon 实现 `ExtensionUIContext`（经 `session.bindExtensions({ uiContext })` 注入，与 Pi RPC 模式注入方式一致），把 `select/confirm/input/editor/notify/setStatus/setWidget/setTitle/setEditorText` 转为 wire 事件；阻塞式 dialog 客户端必须在超时内用 `ext.dialog.respond` 回应，超时/掉线取默认值（fail-safe，与 Pi RPC 行为一致）。
6. **高频增量合流**：message 流式 delta（text/thinking/toolargs）服务端 ≤16ms 窗口合流为 `session.partial.delta`（只合并、不重排，非 delta 事件到来前先冲刷缓冲）；bash 输出 ≤100ms。
7. **P2 引入二进制帧**：同一 WS 上按帧头（magic `0x50 0x49` + channel + frameType + seq）复用于 terminal / bash-output / file-transfer / 图片，控制帧保持 JSONL 文本便于调试——抓包可读优先协议演进。

## 被否方案的原因

- **A（Pi RPC 转发）**：客户端被迫完整实现 Pi RPC 的命令面，而实体语义（entry 树、usage、模型路由）仍要自己组装；且 RPC 是为「单宿主+单客户端」设计的 stdio 协议，没有能力协商、鉴权、重放、多客户端广播。多一层不增值的耦合。
- **B（ACP）**：多 agent 通用抽象，能力面为最小公倍数：无会话树、无同为语义的 steer/followUp、无扩展生态概念、权限仅文本选项（见 architecture.md §1.1、附录 A）。本项目的存在理由即摆脱它。
- **C（pi-protocol）**：概念模型（serverId/attachment/replicated state）与我们的多端观察语义完全对口，且我们的 wire 命名刻意与其对齐；但官方标注 experimental、无兼容保证。**作为观察项**：若其生产化，协议层替换成本被信封三分法与资源地址模型隔离在 `@pie/protocol` 单包内（见 architecture.md §4.7）。

## 后果

- 正：客户端可开发独立于 daemon 发版节律；协议调试抓包可读；Pi SDK 升级只影响 daemon；后续可平滑评估迁移 pi-protocol。
- 负：自担协议维护义务（版本协商 + 环缓冲重放 + 合流状态机）；需要一套协议级测试（codec round-trip、树同步状态机、重放）——已在 P0 验收范围内。
- 对齐义务：Pi SDK 精确 pin（当前 `1.1.0`），minor 升级走独立 PR + `pi-smoke` 全链路烟测。

## 实现注记（与源码核对后的修订）

- SDK 的 prompt 流式参数为 `PromptOptions.streamingBehavior: "steer" | "followUp"`（`agent-session.ts:314`），不是早期架构文档草稿中的 `steer` 字段——已修订。
- `ExtensionUIContext` 注入点为 `session.bindExtensions({ uiContext })`（`agent-session.ts:3258`，RPC 模式同法于 `rpc-mode.ts:320`），不是 `CreateAgentSessionOptions`——已修订。
- P0 实测发现：Pi 的会话文件惰性落盘（首次 append 前不存在），列会话必须 daemon 内存与磁盘合并；忽略此点会导致新建会话在列表中“消失”。
- `prompt` 命令采用 rpc-mode 同款 preflightResult 模式：接受即响应（不等整轮跑完），错误仅在未接受时上报（`rpc-mode.ts:394`）。
