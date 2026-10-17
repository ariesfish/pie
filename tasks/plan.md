# Plan

Ordered slice list. Append new sections only; ids never renumber.

## [T-001] 会话重命名:会话名·重命名·清除(PRD) (ready-for-agent)

- **Type**: AFK
- **Blocked by**: —

## Problem Statement

会话多了之后,列表里靠首条消息摘要认会话很难;用户想给会话起自己的名字(「重构探索」「支付联调」),并且在手机、桌面、pi TUI 各处看到的都是同一个名字。当前 daemon 与协议层已具备改名能力(但仅限已打开的会话),UI 没有任何入口;未打开的磁盘会话无法改名,名字也无法清除回退。

## Solution

在会话列表(桌面/Web/移动同一套 app UI)为任意会话提供「重命名」与「清除会话名」两个操作。名字持久化在会话文件里,与 pi TUI/CLI 共享存储,一处改名处处一致。未打开的会话由 daemon 直接落盘,wire 协议不动。

## User Stories

1. As a 桌面/Web 用户, I want 在会话列表给任意会话(含未打开的)重命名, so that 列表一眼可认。
2. As a 移动端用户, I want 在手机上对会话重命名, so that 离开桌面也能整理会话。
3. As a 多端用户, I want 一处改的名字在其他端可见, so that 名字只有一份真相。
4. As a pi TUI 用户, I want pie 里改的名字在 TUI 中一致, so that 两个入口互不打架。
5. As a 用户, I want 清除自定义会话名, so that 改错名能回退到首条消息摘要。
6. As a 用户, I want 空白名输入有校验反馈, so that 不会提交意外结果。
7. As a 用户, I want 改名失败时有明确提示且列表不变, so that 不被静默失败欺骗。
8. As a 用户, I want 分支标签不因重命名而受影响, so that 标签与名字各司其职。
9. As a 用户, I want 分叉产物继承分叉点的会话名, so that 行为可预期且与 pi TUI 一致。
10. As a 国际化用户, I want 改名文案中英双语, so that 体验一致。

## Implementation Decisions

- **术语**(align 已钉,`GLOSSARY.md` 已写入):「会话名」+ 操作「重命名」「清除会话名」;与「分支标签」无关;显示回退规则固定为 会话名 > 首条消息摘要 > 占位文案。
- **daemon**:`session.rename` 支持未打开会话——不经打开,直接用 SDK SessionManager 能力向磁盘会话文件追加 `session_info` 条目。wire 协议字段不变(`name: string`),协议注释写明空串 = 显式清除(SDK 原生语义)。打开中的会话保持现有写锁规则与 `session.renamed` / `session.summary.updated` 广播;磁盘会话无订阅者,下次 `session.list` 自然反映。
- **app store**:改名动作(trim 输入;trim 后为空 → 清除语义;失败上报错误态);请求成功后本地更新行,同时订阅 `session.renamed` / `session.summary.updated` 做多端同步;回退显示沿用现有 sessionTitle 逻辑(名字优先级已在)。
- **UI**:列表行入口(移动长按 / 桌面·Web 悬停或右键)出菜单:「重命名」「清除会话名」。重命名面板预填当前名、提交/取消;清除为菜单内一步操作、提交即生效(可逆,不设确认弹窗)。
- **i18n**:en / zh-CN 各补文案。
- **分叉继承**:仅文档化(`GLOSSARY.md` 已含),不写代码。
- **不改**:wire 协议类型、@pie/client 协议层(直接 `conn.request("session.rename")`)、演示页。

## Testing Decisions

- **原则**:只测外部行为(wire 语义、store 状态转移与事件同步),不测实现细节与视觉。
- **daemon**(`packages/daemon/test` 先例,wire-smoke / summary-broadcast 风格):三语义用例——打开中改名、磁盘未打开改名、空串清除;加打开中改名回归。此处测试**捕捉**:持久化条目与 wire 返回;**漏**:pi TUI 端展示、真实多客户端广播时序。
- **app store**(command-center 等模型单测先例):改名动作 trim/清除、失败错误态、事件 upsert、回退标题。**捕捉**:状态逻辑;**漏**:手势与视觉。
- **UI** 不写组件测试;由 ui-walkthrough 扩展断言 + 截图取证(既有 13 项断言设施)。

## Out of Scope

- 分支标签的改名/管理(既有功能,不属本次)
- 自动命名(模型起名)
- 演示页(daemon public/index.html)改名输入——演示页已降级为 smoke 面板
- pi TUI 侧改名入口(TUI 自理;pie 只保证共享存储一致)
- 名字长度、字符集策略(除 trim 外不限制)
- 批量改名

## Acceptance Criteria

**MUST**

- [check: daemon wire 测试——对未打开磁盘会话发 session.rename 后,session.list 返回新会话名,会话文件尾部含新 session_info 条目](story 1)
- [check: daemon wire 测试——打开中会话的改名路径回归不受影响](story 1, 3)
- [check: daemon wire 测试——session.rename 传空串(或纯空白)后,该会话 name 为空,视为显式清除](story 5)
- [check: store 模型测试——改名成功后列表行更新为新名;收到 session.renamed / session.summary.updated 时行名同步;回退显示优先级 会话名>首条消息>占位 正确](story 1, 3)
- [check: store 模型测试——trim 后为空的输入不提交新名,按清除处理或拒绝并产生错误态](story 6)
- [check: npm run check 全绿(五包 typecheck + 全部 vitest)](全故事)
- [evidence: ui-walkthrough——列表行长按(移动)/悬停或右键(桌面/Web)出现「重命名」「清除会话名」菜单;提交后行内新名即时显示](story 1, 2)
- [evidence: 手机连同一 daemon,会话列表显示与桌面一致的名字](story 3)
- [evidence: 清除会话名后,行显示回退为首条消息摘要](story 5)

**SHOULD**

- [evidence: 改名失败(写锁被占)时 UI 显示错误提示且列表名不变](story 7)
- [evidence: 分叉产物显示继承的名字;父会话后续改名不影响既有分叉](story 9)
- [evidence: pi TUI 打开该会话时,会话选择列表显示与 pie 一致的名字](story 4)
- [evidence: 改名后时间线分支标签 pill 原样保留](story 8)
- [evidence: 切换 en/zh-CN 后,重命名面板与菜单文案正确](story 10)
- [judgment: 产品确认「长按/悬停」入口在移动与桌面的可发现性(只有人能判:入口是否足够显眼是主观体验)](story 1, 2)

**MAY**

- [evidence: 重命名面板预填当前会话名,编辑态可见旧名](story 1)
- [evidence: 打开中的会话在别端改名时,本端行名经事件实时更新(无需重拉列表)](story 3)

## Further Notes

- 「会话列表」(工作区下所有会话的集合视图)尚未入 `GLOSSARY.md`;本 PRD 按此词使用,建议 align 后续补钉该词,与「会话树」(单会话内分支结构)区分。
- 名字持久化与 pi TUI 共享同一份 `~/.pi/agent` 存储,README 已有此承诺,本 PRD 是它的兑现。
- align 阶段已产出 `GLOSSARY.md` 并写入本次全部术语决策;无 ADR(四个决策均可逆、不意外)。

## [T-002] daemon:磁盘会话改名 + 空串清除(wire 回归) (ready-for-agent)

- **Parent**: T-001
- **Type**: AFK
- **Blocked by**: None - can start immediately

## What to build

`session.rename` 对未打开的磁盘会话生效:daemon 不经打开,直接用 SDK SessionManager 构造到既有会话文件并追加 `session_info` 条目,`session.list` 立即反映新名(与 pi TUI 共享存储)。空串/纯空白 = 显式清除(写空 `session_info`,对齐 SDK 显式清除语义)。打开中的会话路径保持现状(`host.rename` + `session.renamed` / `session.summary.updated` 广播)。协议 `session.rename` 注释写明空串语义,wire 类型与字段零改动。

附注:实现第一步先验证 SPEC 开放问题 1(SDK SessionManager 直接构造到既有文件 + 追加的可行性);若不可行,停下回报,回 SPEC 再改。

## Acceptance criteria

- [ ] [check: daemon wire 测试——对未打开磁盘会话发 session.rename 后,session.list 返回新会话名,会话文件尾部含新 session_info 条目]
- [ ] [check: daemon wire 测试——打开中会话的改名路径回归不受影响]
- [ ] [check: daemon wire 测试——session.rename 传空串(或纯空白)后,该会话 name 为空,视为显式清除]
- [ ] [check: npm run check 全绿(五包 typecheck + 全部 vitest)]

## Blocked by

None - can start immediately

Closed 2026-10-17: renameOnDisk 磁盘路径 + 空串显式清除落地,session-rename.test.ts 4/4 wire 测试,`npm run check` 全绿(commit 见 git log)。

## [T-003] app store:改名动作 + 事件同步 + 回退标题 (ready-for-agent)

- **Parent**: T-001
- **Type**: AFK
- **Blocked by**: T-002

## What to build

会话列表 store 增加改名/清除动作:输入 trim,trim 后为空按清除处理(或不提交并产生错误态);请求失败进入错误态(供 UI 提示,行数据不变)。请求成功后本地更新该行;订阅 `session.renamed` / `session.summary.updated`,收到即同步行名(多端一致性)。回退标题规则保持 会话名 > 首条消息 > 占位。

## Acceptance criteria

- [ ] [check: store 模型测试——改名成功后列表行更新为新名;收到 session.renamed / session.summary.updated 时行名同步;回退显示优先级 会话名>首条消息>占位 正确]
- [ ] [check: store 模型测试——trim 后为空的输入不提交新名,按清除处理或拒绝并产生错误态]
- [ ] [check: store 模型测试——请求失败进入错误态,行数据不变]
- [ ] [check: npm run check 全绿(五包 typecheck + 全部 vitest)]

## Blocked by

- T-002

Closed 2026-10-17: renameSession(trim/清除语义)+ 失败错误态 + session.renamed 事件同步落地,store 模型测试 9/9,`npm run check` 全绿(commit 见 git log)。

## [T-004] 列表行改名入口 + 清除 + i18n (ready-for-agent)

- **Parent**: T-001
- **Type**: AFK
- **Blocked by**: T-003

## What to build

左侧栏会话列表行入口:移动端长按、桌面/Web 悬停按钮(或右键)出菜单,含「重命名」「清除会话名」。重命名面板预填当前会话名、提交/取消;提交 trim 后非空才生效;清除为一步操作、不设确认弹窗(可逆)。改名失败(如写锁被占)显示错误提示且列表名不变。i18n:en / zh-CN 全部文案。

## Acceptance criteria

- [ ] [evidence: 列表行长按(移动)/悬停或右键(桌面/Web)出现「重命名」「清除会话名」菜单;提交后行内新名即时显示]
- [ ] [evidence: 重命名面板预填当前会话名,编辑态可见旧名]
- [ ] [evidence: 清除会话名后,行显示回退为首条消息摘要]
- [ ] [evidence: 改名失败(写锁被占)时 UI 显示错误提示且列表名不变]
- [ ] [evidence: 切换 en/zh-CN 后,重命名面板与菜单文案正确]
- [ ] [check: npm run check 全绿(五包 typecheck + 全部 vitest)]

## Blocked by

- T-003

Closed 2026-10-17: 菜单入口 + 重命名面板 + 清除 + 内联错误横幅落地;浏览器取证 12/12(含写锁冲突横幅与 zh-CN 文案),walkthrough 回归与基线一致(commit 见 git log)。

## [T-005] walkthrough 验收扩展 + 跨端/TUI 取证 (ready-for-agent)

- **Parent**: T-001
- **Type**: AFK
- **Blocked by**: T-004

## What to build

把 T-004 的手工检查自动化进 `scripts/ui-walkthrough.mjs`:改名(磁盘会话 + 打开中)、清除、分支标签 pill 不受影响、分叉继承行为断言。取证:手机连同一 daemon 与桌面名字一致;pi TUI 会话选择列表显示同一名字;打开中的会话在别端改名时本端行名经事件实时更新(无需重拉列表)。截图落 `./ui-walkthrough-shots`,供产品对入口可发现性做 judgment(该条不阻塞其余项)。

## Acceptance criteria

- [ ] [evidence: ui-walkthrough 断言全绿(改名/清除/标签/分叉),截图落 ./ui-walkthrough-shots]
- [ ] [evidence: 手机连同一 daemon,会话列表显示与桌面一致的名字]
- [ ] [evidence: pi TUI 打开该会话时,会话选择列表显示与 pie 一致的名字]
- [ ] [evidence: 打开中的会话在别端改名时,本端行名经事件实时更新(无需重拉列表)]
- [ ] [judgment: 产品确认「长按/悬停」入口在移动与桌面的可发现性(只有人能判:入口是否足够显眼是主观体验)]

## Blocked by

- T-004

Closed 2026-10-17: walkthrough 扩展 R1-R11 全绿(分叉继承/标签完整性/UI 改名清除/别端实时更新/手机同名字)+ 紧凑壳层 BottomSheetModalProvider 修复(顺带修好 09/10)。两项保留未勾:pi TUI 一致性(CLI 无非交互列表能力,skip-test,文件级保证已由 T-002 覆盖)与入口可发现性(产品 judgment)。08 rail resize 为既有 headless 问题,基线对比记录在案。
