# Spec: 会话重命名(会话名·重命名·清除)

> 上游:T-001 PRD(`tasks/plan.md`);术语:`GLOSSARY.md`;协议基线:ADR-0001 wire 协议。

## Objective

用户在会话列表给任意会话(含未打开的磁盘会话)重命名或清除会话名;名字持久化在会话文件里,与 pi TUI/CLI 共享同一份存储,一处改名、处处一致。

- 谁用:pie 桌面 / Web / 移动端的用户。
- 成功的样子:会话列表里每一行都能改成自己起的名字(或清除回退);手机、桌面、pi TUI 看到同一个名字;daemon 改动不碰 wire 协议。

## Tech Stack

- TypeScript 5.9 / Node ≥ 22.19 / vitest 3
- npm workspaces 五包:`@pie/protocol`(wire 协议)、`@pie/client`(类型化 daemon 客户端)、`@pie/daemon`(内嵌 pi SDK 的守护进程)、`@pie/app`(Expo Router 正式 UI,React Native + i18next en/zh-CN)、`@pie/desktop`(Electron 壳)
- pi SDK:`@earendil-works/pi-coding-agent`(改名经由其 `AgentSession.setSessionName` → 会话文件 `session_info` 条目)

## Commands

```bash
npm run check              # 五包 typecheck + 全部 vitest(提测门槛)
npm test                   # vitest run(单跑测试)
npm run daemon             # 前台启动 daemon(127.0.0.1:8760)
npm run app                # expo start(移动/Web)
npm run ui-walkthrough     # UI 验收:daemon + web 导出 + 断言 + 截图到 ./ui-walkthrough-shots
npm run smoke              # 无 LLM 端到端烟测(不写 ~/.pi/agent)
```

无独立 lint 脚本,`npm run typecheck` 兜底。

## Project Structure

```
packages/protocol/src/commands.ts        # session.rename 契约;空串=清除语义注释
packages/daemon/src/server/server.ts     # session.rename handler(本次:磁盘会话路径 + 空串放行)
packages/daemon/src/core/host-session.ts # host.rename → SDK setSessionName(打开中路径,现状)
packages/daemon/test/                    # wire 级 vitest(先例:summary-broadcast.test.ts)
packages/app/src/stores/session-list-store.ts  # 列表状态:改名动作、事件同步、回退标题
packages/app/src/components/layout/left-sidebar.tsx  # 列表行渲染(入口菜单挂在这里)
packages/app/src/i18n/resources/         # en / zh-CN 文案
packages/app/src/**/*.test.ts            # 模型/状态单测(先例:command-center/*.test.ts)
scripts/ui-walkthrough.mjs               # 13 项断言 + 截图取证(本次扩展)
```

## Code Style

Tabs 缩进、分号、colocated `*.test.ts`、平台分叉文件(`.web.tsx` / `.native.tsx`)、i18n 走 i18next resources。真实片段(daemon wire 测试先例):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WebSocket } from "ws";

vi.mock("../src/serve-page.js", () => ({ readIndexAndMeta: async () => null }));

const { DaemonServer } = await import("../src/server/server.js");

const dir = mkdtempSync(join(tmpdir(), "pie-sum-"));
mkdirSync(join(dir, "agent-home", "sessions"), { recursive: true });
```

命名规则:wire 层沿用命令名 `session.rename`;UI/store 层用「rename / clear」动词 + 会话名语义;术语一律按 `GLOSSARY.md`(禁「标题」指会话名)。

## Testing Strategy

- **daemon** —— wire 级 vitest 于 `packages/daemon/test/`:临时 agent home + 真实 `DaemonServer` + WebSocket 客户端,断言返回与磁盘条目。测:打开中改名(回归)/ 磁盘未打开改名 / 空串·纯空白清除。**捕捉**持久化条目与 wire 返回;**漏** pi TUI 端展示、真实多客户端广播时序。
- **app store** —— colocated 模型单测:改名动作 trim/清除语义、失败错误态、`session.renamed` / `session.summary.updated` 事件 upsert、回退标题优先级(会话名 > 首条消息 > 占位)。**捕捉**状态逻辑;**漏**手势与视觉。
- **UI** —— 不写组件测试;`npm run ui-walkthrough` 扩展断言 + 截图取证。
- 原则:只测外部行为,不测实现细节。

## Acceptance Criteria

**MUST**

- [check: daemon wire 测试——对未打开磁盘会话发 session.rename 后,session.list 返回新会话名,会话文件尾部含新 session_info 条目]
- [check: daemon wire 测试——打开中会话的改名路径回归不受影响]
- [check: daemon wire 测试——session.rename 传空串(或纯空白)后,该会话 name 为空,视为显式清除]
- [check: store 模型测试——改名成功后列表行更新为新名;收到 session.renamed / session.summary.updated 时行名同步;回退显示优先级 会话名>首条消息>占位 正确]
- [check: store 模型测试——trim 后为空的输入不提交新名,按清除处理或拒绝并产生错误态]
- [check: npm run check 全绿(五包 typecheck + 全部 vitest)]
- [evidence: ui-walkthrough——列表行长按(移动)/悬停或右键(桌面/Web)出现「重命名」「清除会话名」菜单;提交后行内新名即时显示]
- [evidence: 手机连同一 daemon,会话列表显示与桌面一致的名字]
- [evidence: 清除会话名后,行显示回退为首条消息摘要]

**SHOULD**

- [evidence: 改名失败(写锁被占)时 UI 显示错误提示且列表名不变]
- [evidence: 分叉产物显示继承的名字;父会话后续改名不影响既有分叉]
- [evidence: pi TUI 打开该会话时,会话选择列表显示与 pie 一致的名字]
- [evidence: 改名后时间线分支标签 pill 原样保留]
- [evidence: 切换 en/zh-CN 后,重命名面板与菜单文案正确]
- [judgment: 产品确认「长按/悬停」入口在移动与桌面的可发现性(只有人能判:入口是否足够显眼是主观体验)]

**MAY**

- [evidence: 重命名面板预填当前会话名,编辑态可见旧名]
- [evidence: 打开中的会话在别端改名时,本端行名经事件实时更新(无需重拉列表)]

## Boundaries

- **Always**:改前 `npm run check` 全绿;术语按 `GLOSSARY.md`;wire 协议只加不改(ADR-0001);单测只测外部行为。
- **Ask first**:协议类型/命令签名变更、新依赖、daemon 对 SDK 非公开 API 的用法变更。
- **Never**:改 `node_modules` 里的 pi SDK;删除或跳过失败测试来凑绿;顺手改演示页或 TUI 侧行为(范围外)。

## Open Questions

1. **SDK 磁盘追加可行性**(实现第一步验证):用 `SessionManager(cwd, dir, file, persist)` 直接构造到既有会话文件并 `appendSessionInfo` 是否可靠。若不可行,备选「临时打开再改名」会引入「改名顺带打开会话」副作用——需回来改本 spec。
2. **「会话列表」一词**(工作区下会话集合视图)尚未入 `GLOSSARY.md`,与「会话树」(单会话内分支结构)不同;本 spec 按 PRD 用词,align 后续补钉。—— **已解决(2026-10-18)**:`GLOSSARY.md` 已入「会话列表」条目(含与「会话树」的区分与 Relationships 行),证据见 `.audit/T-009.tsv`。
3. **桌面/Web 入口形态**:PRD 定「悬停或右键」,实现时二选一或都做;最终形态由 SHOULD 的 [judgment] 条目由产品确认兜底。
