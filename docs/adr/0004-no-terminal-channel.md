# ADR-0004：不提供终端通道（No Terminal Channel）

- 状态：已采纳（2025-10-12）
- 关联：ADR-0001（wire 协议 v1）、`docs/paseo-ui-reuse.md`（P2 排期）、architecture.md §4.6/§5.1/§5.10/§11

## 背景

原规划（P2c）：daemon 提供 `terminal.create/attach/write/resize/kill` 命令族 + 二进制帧 `terminal` 通道，前端以 xterm.js（web/desktop）+ Skia 网格渲染器（native，Paseo 移植）双向消费。该通道是引入「二进制帧」的头号动机。

## 决策

**Pie 不做终端通道。** 协议 capabilities 移除 `terminal`；`terminal.*` 命令族与 `terminal` 二进制 channel 从 roadmap 删除；Paseo 的 `terminal/` 目录（native Skia 渲染器、xterm 集成、find/paste/resize 工程）改为「不复用」。

## 理由

1. **传输效率与移动端体验双输**：终端 cell 增量流是高频小帧流水，在蜂窝/中端手机上带宽与电耗不划算；且小屏幕上呈现 80×24 的等宽网格可读性差强人意（Paseo 也只在桌面端给完整体验，移动端是分级阉割）。
2. **需求已被现有面覆盖**：Pie 的定位是 Pi 的**伴随客户端**。「看 Pi 干了什么」由 `session.tool.*` / `tool.bashDelta` 事件 + 已建成的文件/diff 面板承担（git 观察面在 P2b-1 落地）；「用户自己开 shell」的场景正确归宿是 TUI/桌面终端——Pi 本体的完整终端体验不受影响，手机上没必要复刻一个劣化版。
3. **协议复杂度审计的收益**：终端通道是二进制帧的头号需求方。砍掉后，二进制帧的紧前需求只剩 `file-transfer`（附件上送/大文件拉取）与 `bash-output`（可控会话内命令输出），两者都可延后到出现真实带宽瓶颈再设计（JSONL 阶段上限约 16MB/帧 + 压缩，够走很远）。

## 结论性影响

- `packages/protocol/src/capabilities.ts`：`terminal` capability 删除（v1 尚未对外发布，无需兼容期）。
- architecture.md §4.6 改为决策注记；§5.1 二进制帧 channels 收缩；§5.10 重写为「bash 输出与文件传输（按需）」；§11 路线图 P2c 重定义为富组件（原 P2d 顺延）。
- `docs/paseo-ui-reuse.md`：terminal/ B 级条目废除。
- 若未来需求反转（例如桌面端用户强诉求），重开 ADR——届时评估的不再是移动端，而是「桌面 web 壳内的终端面板」单独实现，移动端保持只读工具输出视图。
