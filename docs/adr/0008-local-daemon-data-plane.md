# ADR-0008: Desktop uses the local daemon as its Pi data plane

- 状态：已接受（2026-10-23）
- 关联：ADR-0001（wire 协议）、architecture.md §3/§7

## 背景

桌面端和远程 App 需要同一批数据：本地 Pi 的配置、会话列表、会话树、历史条目、
模型目录、扩展/工具/技能/MCP 状态。最直接的诱惑是让 Electron 主进程直接读
`~/.pi/agent`，远程 App 再走 host daemon。

这会产生两套读取与写回实现：

- JSONL 解析、分页、锁、配置 schema、原子写要在 Electron 与 daemon 各写一遍；
- 配置“可编辑”时，两边对同一文件的写入顺序与冲突处理很难保持一致；
- 远程端需要的能力（模型目录、扩展、技能、会话分页）最终仍要 daemon 提供。

## 决策

**Desktop 与 remote 共用同一套 daemon API。** Desktop 启动本地 sidecar daemon，
把它的地址注入 App；remote App 连接某个 host 的 daemon。

- “本地 Pi 数据”由本机 daemon 读取，而不是由 Electron 再开一条文件系统数据面；
- 配置、会话、元数据、历史分页、分叉/导航全部是 daemon 命令；
- Electron 只负责窗口、sidecar 生命周期、深链和系统集成。

## 影响

- daemon 需要补齐 `config.*`（只读 + 可写）与会话分页 API；远程端自动获得同等能力。
- 桌面离线浏览仍可用：sidecar 是本地进程，不依赖外网。
- 不在 Electron preload 暴露 `fs` / `~/.pi` 路径；写操作统一经过 daemon 的校验与
  冲突处理。
