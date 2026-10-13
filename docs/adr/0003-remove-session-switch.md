# ADR-0003: 从协议中移除 `session.switch`

- 状态：已接受
- 日期：2025-10-12
- 关联：[architecture.md §5.5](../architecture.md#55-命令目录p1-全集)

## 背景

协议 v1 初稿沿袭 Pi RPC 的 `switch_session` 设计了 `session.switch`（切换「当前」会话）。Pi TUI 需要它，因为一个 TUI 进程只有一个激活会话；问题是我们要不要在 Pie 协议里保留。

## 决策

**移除**。理由：

1. **daemon 的数据模型没有「当前会话」**：daemon 并发持有多个 `HostSession`，每个客户端有自己的 attach 集合与 presentation 锁（§5.7）。「切换」在客户端侧等价于 `session.attach` 另一个会话——attach 已经携带快照重同步，「switch」将是一个语义重复的第二入口。
2. **服务器无状态优于有状态**：保留 switch 意味着 daemon 需要跟踪 per-client 的 active 指针，而 UI 状态（当前查看哪个会话）本来就应该归属客户端。
3. **未被任何实现使用**：协议尚未发布，没有兼容性负担。这是移除的最后窗口。

## 补充：保留的 TUI 等价语义

- 终端里 `pi` 与 Pie 的互通不需要 switch：两者共享 JSONL，各自打开各自的活动视图。
- 若未来 CLI 客户端想要「切换」概念，由 CLI 自身在客户端层组合（attach + detach）实现。

## 后果

- `commands.ts` 删除 `session.switch`；架构文档 §5.5 对应行已删。
- 对未知命令的统一 `not_implemented` 错误依旧兜底，客户端误发时行为不变。
- 教训沉淀：协议镜鉴上游命令时，先问「我们的模型里谁是所有权属主」再决定是否照抄。
