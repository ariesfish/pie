# ADR-0002: 权限层经 `tool_call` 扩展事件实现，默认关闭

- 状态：已接受
- 日期：2025-10-12
- 关联：[architecture.md §5.9](../architecture.md#59-权限协议)、[ADR-0001](0001-wire-protocol.md)

## 背景

架构文档 §5.10 设计了权限卡（annotation 驱动、会话级记忆、参数改写、超时=拒绝）。实现前需要确认三件事：拦截点在哪、默认策略是什么、超时语义如何与 Pi 的并行工具调用模型共存。

## 决策

1. **拦截点：宿主 inline 扩展的 `tool_call` 事件**（`PermissionGate` + `createPermissionExtension`，`packages/daemon/src/pi/permissions.ts`）。依据：Pi 官方文档 extensions.md 的权限扩展示例即此机制——扩展可以返回 `{ block: true, reason }` 拒绝调用，且 `pi.getAllTools()` 提供 MCP 语义的 annotations。这是唯一受支持的拦截点，不 hack 内核。
2. **默认 `--permission=off`**（与 Pi TUI 行为一致：Pi 本就不逐调用审批，docs/security.md）。理由：
   - daemon 的信任模型继承 Pi：「同操作系统用户权限」，终端里 `pi` 怎么跑，daemon 就怎么跑；
   - P0 用户（本机桌面）的体验基线不能倒退；
   - `--permission=annotations`（destructive/非只读触发审批）与 `--permission=ask`（全部审批）是显式选项，配 `--permission-timeout-ms`。
   - 移动端（P3，经 relay 的远程观察）上线时按架构 §9 重新评估默认值——远程写权限要求更严的默认是可预期的演进，但属于新场景的决策，不在未要求时改变本机默认。
3. **超时=拒绝（fail-safe）**：默认 10 分钟；`denyAll()` 在会话 dispose 时把所有未决卡结算为拒绝。拒绝时返回模型可读的 reason（`${toolName} was not approved by the user`），模型下一轮可见并能改道。
4. **annotation 公式照抄官方示例**（destructiveHint → ask；非 readOnly 且（destructive 默认 true 或 openWorld 默认 true）→ ask；unknown annotations 视为危险——MCP 默认）。

## 拒绝的替代实现

- **自建 bash/edit 包装工具替换内建工具**：会失去 Pi 内建工具的会话记录/嵌套调用/usage 语义，且需要跟随每个 Pi 版本的工具签名。
- **daemon 侧 MCP shim 注入审批工具**：等价于 Paseo 的方案——多一层协议损耗，且无法拦截内建工具。
- **默认开启审批**：与 Pi TUI 信任模型不一致，会让既有工作流在本机场景倒退（每个 read 都点确认）。

## 后果

- 权限卡是纯 additive 能力：`session.permission.request` 事件 + `permission.respond` 命令已进协议；客户端 UI 已实现。
- `allowSession` 记忆是**会话级**的（per HostSession），daemon 重启即失效——P2 评估持久化到 settings（与 Pi 的 `defaultTools` 模型对齐）。
- 参数改写（`mutatedArgs`）P1 未实现：`tool_call` 事件支持原地 mutate `event.input`，协议已预留字段，P2 补。
