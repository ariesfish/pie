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

Closed 2026-10-19: 子票 T-002..T-005 全部关闭(见各票 Closed 说明与 .audit 台账);伞票结案。剩两项 judgment 挂账不阻塞——入口可发现性(产品确认)、pi TUI 一致性(人工验收,skip-test 依据见 T-005 关闭说明)。

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

## [T-006] 过时 dist 路径:walkthrough/use 死路径修复 (ready-for-agent)

- **Parent**: spec/2026-10-overnight-compression.md
- **Type**: AFK
- **Blocked by**: None

## What to build

`scripts/ui-walkthrough.mjs`(:10 用法注释、:85 bundled 常量)与 `scripts/use.mjs`(:9 注释、:42 dist 常量)引用 `packages/app/dist/app-web`,该目录不存在(expo web 导出落 `packages/app/dist/`,README:54 与 verify-pie serve-app-web.mjs 为证)。四处统一改为 `packages/app/dist`。修后 `npm run use` 不再在 bundle 守卫必死,`--reuse-export` 快路径真正生效。

## Acceptance criteria

- [ ] [check: `grep -rn "dist/app-web" scripts/` 返回空]
- [ ] [check: `node scripts/use.mjs <scratch-ws> -- --agent <scratch-agent>` 越过 bundle 守卫(不再打印 "web bundle missing")]
- [ ] [check: `npm run ui-walkthrough -- --reuse-export` 走复用分支(日志无 "exporting web bundle" 行)且断言全 PASS]
- [ ] [check: npm run check 全绿]

## Blocked by

None


## [T-012] 批量权限批复:多选一键允许/拒绝(PRD 父票) (ready-for-agent)

- **Type**: AFK
- **Blocked by**: —
- **子票**: T-013(daemon wire)→ T-014(app store)→ T-015(app UI + 演示页)
- **Spec**: `spec/2026-10-batch-permission-diff-finish.md`

### Problem

daemon `--permission=ask|annotations` 模式下,一次会话可能同时基多个工具调用等待审批;当前 wire `permission.respond` 只能单张结算,app store 只存单卡对象(后到覆盖先到),演示页虽能叠多卡但只能逐张点。用户要能勾选多张卡后一键「全部允许/全部拒绝」;单卡时批量栏不出现。

### Solution

wire 只加不改:新命令 `permission.respondMany`(批量结算 + unknown id 报告)+ 新事件 `session.permission.settled`(三来源:user/timeout/dispose,服务端权威撤卡)。app store 权限态列表化 + 选择集;UI 多卡多选 + 批量栏;演示页同步。W5 行内评论与语音输入不属本票(缓议,挂 P3)。

### 拆迁决策(已定)

- 立票背景:todo.md 原「T-011」清单与已关闭的 rail-resize T-011 撞号;本轮按「ids never renumber」原则下迁至此新号立票。
- stored pending 列表化后,单卡 respond 与批量 respondMany 必须等价(单卡路径不得回归)。
- `- **下一站**:P2 收尾(diff Skia 渲染器升级、语音输入评估)→ P3…` 见 README 状态节本轮刷新;W3c 引擎证据:2b7fe08 / d8d1497 / df79b1d + walkthrough 04 在验。

### Acceptance Criteria

**MUST**(按子票执行,详见 T-013..T-015)

- [check: daemon wire —— respondMany 全结算 + timer 清除 + pending 清空]
- [check: daemon wire —— unknown 报告 + 已知 id 正常结算]
- [check: daemon wire —— 批量 allowSession 按 toolName 记入会话允许集]
- [check: daemon wire —— 单张 respond 回归 + denyAll 回归]
- [check: daemon wire —— settled 事件三来源广播(user/timeout/dispose)]
- [check: store —— 列表增删 + 选择集生命周期 + 批量请求携带 + 单卡等价]
- [check: npm run check 全绿]
- [evidence: 多卡同屏 + 全选全部允许 + toolcard 全 done(真实模型演示,浏览器双页)]
- [evidence: 演示页多卡截图 + 单卡时批量栏不出现]

**SHOULD / MAY**(同原 todo 清单:部分失效、移动端长按多选、中英文案、批量 allowSession 免重复出卡、选择集自动清空)

## [T-013] daemon:`permission.respondMany` + `session.permission.settled`(子票) (ready-for-agent)

- **Parent**: T-012
- **Type**: AFK
- **Blocked by**: T-012

### What to build

协议新增 `permission.respondMany {requestIds: RequestId[], decision}` → `{settled: RequestId[], unknown: RequestId[]}`;事件新增 `session.permission.settled {sessionId, requestId, source: "user" | "timeout" | "dispose"}`。daemon gate 加 respondMany(逐 id:删 pending + 清 timer + resolve;unknown 聚合报告)+ settled 发布(新发布通迳,三来源:respond/respondMany / timeout 到期 / dispose denyAll)。同时修 decision 校验:server 盲转型收下任意字符串、gate 现在非 "deny" 一律按放行结算——收紧为字面量枚举拒绝非法值。

### Acceptance criteria

- [ ] [check: wire 测试 —— respondMany 命令管道 + unknown 报告(全 unknown 批:settled 空、unknown 齐)]
- [ ] [check: 单元测试 —— respondMany 多 id 结算/unknown 拆分/单 respond 回归/拒绝后 pending 空]
- [ ] [check: 单元测试 —— settled 三来源+ allowSession 批量记入会话允许集]
- [ ] [check: 单元测试 —— decision 非法值被拒]
- [ ] [check: npm run check 全绿]

Closed 2026-10-19: respondMany 服务端组合 + settled 三来源(user/timeout/dispose)广播 + decision 枚举校验(盲转修复)落地;新增 6 单元 + 8 wire 用例全绿,900 用例 = 886 基线 + 14 新增;check 门 PASS(commit 见 git log)。

- [skip_test: UI 多卡视觉与真实模型旅程由收尾演示与 T-015 证据承担;wire 层经 registry 直驱 gate 接缝验证了真实 pending 全管道]

## [T-014] app store:权限卡列表化 + 选择集(子票) (ready-for-agent)

- **Parent**: T-012
- **Type**: AFK
- **Blocked by**: T-013

### What to build

`connection-store` 权限态从单对象改列表(含 timeoutMs,现被丢弃);叠加选择集(增删/清除);动作:单卡 respond 保持,新增 respondMany 决策携带所选项;`session.permission.settled` 到达即从列表+选择集移除各 id。

### Acceptance criteria

- [ ] [check: store 测试 —— 多请求 append(不互覆盖)]
- [ ] [check: store 测试 —— settled 到达移行+选择集同步]
- [ ] [check: store 测试 —— 批量携带所选 id;单卡 respond 等价(路径不变)]
- [ ] [check: store 测试 —— 超时/写锁语义不回归(既有用例全绿)]
- [ ] [check: npm run check 全绿]

## [T-015] app UI + 演示页:多卡 + 多选 + 批量栏(子票) (ready-for-agent)

- **Parent**: T-012
- **Type**: AFK
- **Blocked by**: T-014

### What to build

聊天流多卡渲染(替代单卡);多卡时每卡出选择复选 + 底部批量栏「全部允许(所选)/全部拒绝(所选)/取消」——单卡时复选与批量栏不出现;单卡仍可直接点卡上按钮。移动端长按卡进入选择。演示页(index.html)同步:复选 + 批量栏 + respondMany 调用。i18n en/zh-CN。

### Acceptance criteria

- [ ] [check: npm run check 全绿 + walkthrough 26 步复绿(无回归)]
- [ ] [evidence: 多卡同屏全选全部允许(真实模型,浏览器双页,收尾演示)]
- [ ] [evidence: 演示页多卡截图 + 单卡时批量栏不出现]
- [ ] [should: 移动端长按多选批量批复 —— 事件入口可用]
- [ ] [should: 中英文案切换正确]

## [T-016] diff 旧渲染器死码清理 (ready-for-agent)

- **Parent**: spec/2026-10-batch-permission-diff-finish.md
- **Type**: AFK
- **Blocked by**: T-012

### What to build

删 `packages/app/src/components/panels/diff-view.tsx` + `diff-model.ts`——W3c 后零引用(ingrep 已证:无 from-import)。

### Acceptance criteria

- [ ] [check: 删后 grep 无引用残留(`grep -rn "diff-view\|diff-model" packages/app/src` 为空)]
- [ ] [check: npm run check 全绿 + walkthrough 复绿(04 仍过)]
- [skip_test: 删除票无 RED 阶段——由 check + walkthrough 兕底]

## [T-017] diff displayPreferences:layout/wrap 切换 + 窄屏降级 (ready-for-agent)

- **Parent**: spec/2026-10-batch-permission-diff-finish.md
- **Type**: AFK
- **Blocked by**: T-016

### What to build

搬 paseo `use-changes-preferences`(持久化 + 窄屏 split 降级爹则),ChangesPanel 头部加 layout(unified/split)/wrap 切换控件,替换 `changes-panel.tsx:87-89` 硬编码 `displayPreferences`。walkthrough 04 扩断言:切换后布局生效。

### Acceptance criteria

- [ ] [check: store/hook 单测 —— 偏好持久化 + 窄屏降级规则]
- [ ] [check: npm run check 全绿]
- [evidence: walkthrough 扩展断言 —— split 切换后视口布局变化]

## [T-011] walkthrough 08 rail resize:headless 基线 FAIL 排查修复 (closed)

### Problem

`npm run ui-walkthrough` 的 08(rail resize handle widens rail)在 headless
基线 FAIL(overnight 2026-10-18 两次运行一致;handle 找得到、拖拽未见 rail
变宽)。已知的其它步骤全绿,仅 08 挂。

### Acceptance criteria

- [ ] [check: node scripts/ui-walkthrough.mjs --reuse-export 复现:修复前 08 FAIL(账本入 history,复现在前)]
- [ ] [check: 修复后 npm run ui-walkthrough 全步绿(含 08),输出入账]
- [ ] [check: npm run typecheck 0 错]
- [ ] [check: npx vitest run 全绿]
- [ ] [judgment: 根因修复而非放宽断言——放宽 check 条件须人点头]

Closed 2026-10-18: 根因 = Chromium 原生文本拖拽劫持(handle 被 live DOM 选区覆盖时,按下拖拽触发真实 dragstart + pointercancel,RNGH pan 在第一帧 move 后被取消)——handle 增 isWeb 守卫的 dragstart preventDefault;walkthrough 全绿含 08(x 1174→1106),typecheck 0 错,vitest 885+1 全绿;断言零放宽(commit 见 git log)。
