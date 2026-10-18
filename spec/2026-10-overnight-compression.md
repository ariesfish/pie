# Spec: 过夜压缩演练(仓库挂账待办 5 票)

> 上游:本仓库挂账证据(任务台账 + verify-pie 特性图 + 脚本死路径)。
> 执行:implement-all auto(单审批:用户 2026-10-18 消息即为审批)。
> 台账:每票一 commit + `.audit/T-XXX.tsv` 七列决策行(P3 定稿表头)。

## Objective

把仓库里五笔真实挂账待办清掉:两条脚本死路径、一处文案风格漂移、一处术语台账缺口、一个 verify 助手缺能力、一段"已映射未证明"旅程。每票小而独立,各有机器可跑的验收与给人看的证据。

## Tickets(依赖:无;顺序 T-006→T-007→T-009→T-010→T-008,驱动旅程最后)

- **T-006 过时 dist 路径**:`scripts/ui-walkthrough.mjs:10,85` 与 `scripts/use.mjs:9,42`
  引用 `packages/app/dist/app-web`——该目录不存在(expo 导出落在 `packages/app/dist/`,
  README:54 与 serve-app-web.mjs 均为证)。后果:`npm run ui-walkthrough -- --reuse-export`
  静默失效(永远走全新导出),`npm run use` 在 bundle 守卫处必死。改四处指向
  `packages/app/dist`。
- **T-007 demo 页单引号统一**:`packages/daemon/public/index.html:545` 的
  `$('sendBtn')` 是全文件唯一单引号字符串(其余 296 个引号为双引号)。统一为
  `$("sendBtn")`。
- **T-008 verify-pie 未证旅程复核**:特性图自述 `app-web-changes-diff`
  「mapped but unproven」。真实目标跑一遍该旅程(launch → doctor → serve →
  drive → ws-probe → cleanup),证据落 `.audit/evidence/verify-pie-<runId>/app-web-diff/`;
  若跑证 gotchas 有误则改正,并更新 `features/README.md` 与 `SKILL.md` 证明状态。
  不跑 chat/permission 旅程(需真实模型与 token,本批范围外,如实标注)。
- **T-009 GLOSSARY 补钉「会话列表」**:T-001 Further Notes 挂账(
  「会话列表」尚未入 `GLOSSARY.md`,与「会话树」区分)。补条目并把 SPEC.md
  开放问题 2 标为已解决(指针回 GLOSSARY)。
- **T-010 launch-daemon.sh 权限模式**:`features/demo-permission-card.md` 两处自述
  助手缺 `VERIFY_PIE_PERMISSION` 支持(当前恒 off)。加环境变量透传
  `--permission` / `--permission-timeout-ms`(daemon CLI 已有该旗,
  `packages/daemon/src/config.ts:57-70`),run.json 记录模式,并改正特性文件里
  过时的"currently it does not"表述。

## Commands

```bash
npm run check                     # 每票回归门槛(五包 typecheck + 全部 vitest)
npm run ui-walkthrough            # T-006 复用快路径实证(--reuse-export)
node scripts/use.mjs <ws> -- --agent <dir>   # T-006 守卫实证
grep -o "'[^']*'" packages/daemon/public/index.html   # T-007 不变量
.pi/skills/verify-pie/helpers/launch-daemon.sh <runId> [port]   # T-008/T-010
npm run app:build:web             # T-008 静态导出
```

## Boundaries

- **Always**:每票一 commit,只含该票文件 + 台账更新;`npm run check` 全绿;
  tsv 行 append-only,evidence 用指针(pre/post sha:file:line 或工件路径)。
- **Ask first / 停止**:测试过不去且无显然修法、需求歧义、高风险不可逆操作
  (本批无)——停下写进 replies,不硬推。
- **Never**:改 `node_modules`、改冻结的 control-web 适配器、git add -A、
  动 ~/.pi/agent(真凭据)、pkill/killall(只杀记录的 pid)。
- **诚实跳过**:chat/permission 旅程需真实模型消费 token,不在本批;跳过写
  `skip_test` 列,不写自由文本。

## Evidence / Audit

- 决策台账:`.audit/T-006.tsv` … `.audit/T-010.tsv`,表头
  `id decision reason evidence verdict skip_test show`(P3 定稿)。
- 每行 evidence 列携带 before/after 指针(如 `pre:728ac74:scripts/use.mjs:42`
  / `post:<sha>:<file>:<line>`,或工件路径);verdict ∈ green/red/reverted/open。
- show 列给人看活:verify 证据目录、walkthrough 截图、drive report、commit。
- 晨间审计口径:每行 before/after/evidence 指针齐全即过;缺指针行如实列出。
