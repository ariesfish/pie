# Spec: 批量权限批复 + diff Skia 收尾(2026-10 本轮)

> 上游:用户 2026-10-19 指令(TODO 未竟项 + plan.md 类似情况 + diff Skia 收尾三件 + 语音输入缓议);
> 侦察:权限链路 + diff 栈两次只读侦察(结论已入拆分表)。
> 执行:implement-all auto(单审批:用户已确认拆分表与演示形态)。
> 台账:每票一 commit + `.audit/T-XXX.tsv` 七列决策行;`.sdlc/` 账本在开,D 类门入账。

## Objective

两件事:

1. **批量权限批复**(todo.md 悬置的「T-011」清单,因与已关闭的 rail-resize T-011 撞号而立票):
   daemon 会话发多个工具调用需要审批时,用户可多选一次性允许/拒绝,而不是一张卡一张卡点。
   wire 只加不改(ADR-0001):新命令 `permission.respondMany` + 新事件 `session.permission.settled`。
2. **diff Skia 收尾三件**:W3c 引擎已落地(2b7fe08/d8d1497/df79b1d,walkthrough 04 在验)——
   本轮做 README 过时表述对齐、旧 diff 渲染器死码清理、displayPreferences 布局切换。
   W5 行内评论(paseo review 批)与语音输入按用户指示**缓议**,挂 P3。

## Tickets(依赖:T-012→T-013→T-014→T-015 串行;T-016→T-017 串行;两链独立)

- **T-012 台账修缮 + 立票**:todo.md 批量批复清单自 T-011 撞号下迁出,立 T-012(父票)+ T-013..T-015(子票)入 plan.md;
  T-001 伞票结案标注;rail T-011 保持已关闭;README「下一站/已知限制」刷新(diff W3c 已落地证据、语音输入缓议)。
- **T-013 协议+daemon:`permission.respondMany` + `session.permission.settled`**:
  批量结算 + unknown id 报告 + timer 逐个清理;settled 三来源广播(user/timeout/dispose);
  修 decision 盲转型(server.ts 现在任意非 "deny" 字符串按放行结算)。
- **T-014 app store:权限卡列表化**:单对象 pending → 列表 + 选择集生命周期(增删/选择/清除)+
  批量请求携带所选 id + 单卡 respond 等价;保留 timeoutMs(现被丢弃)。
- **T-015 app UI + 演示页:多卡 + 多选 + 批量栏**:聊天流多卡渲染、选择态、批量「全部允许/全部拒绝」
  (单卡时不出现批量栏)、移动端多选入口、i18n 中英;demo 页(index.html)同步多选批量。
- **T-016 diff 死码清理**:删 `packages/app/src/components/panels/diff-view.tsx` + `diff-model.ts`(零引用,grep 已证)。
- **T-017 diff displayPreferences**:搬 paseo `use-changes-preferences`(含窄屏降级),ChangesPanel 头部
  layout(unified/split)/wrap 切换,替换 changes-panel.tsx 硬编码;walkthrough 04 扩断言。
- **收尾(不立票)**:`npm run check` + `npm run ui-walkthrough` 全绿;起 daemon + serve app web +
  demo 页,真实模型触发多卡批量批复给用户看(浏览器双页)。

## Commands

```bash
npm run check             # 每票回归门槛(五包 typecheck + 全部 vitest)
npx vitest run packages/daemon/test/permission-batch.test.ts   # T-013 先 RED
npx vitest run packages/app/src/stores/connection-store.test.ts # T-014
npm run ui-walkthrough    # T-016/T-017 + 收尾走查(26 步 + R1-R11)
.git/…/gate.sh run <票> tdd -- npx vitest run …   # .sdlc/ 账本 D 类门(pi-dev-mode gates)
```

## Boundaries

- **Always**:wire 只加不改(ADR-0001);每票一 commit,只含该票文件 + 台账 TSV(force-add) + task-status;
  tdd 内核:先 RED 后 GREEN;术语按 `GLOSSARY.md`;`npm run check` 全绿才收票。
- **Ask first**:协议既有字段/命令签名变更、SDK 非公开 API 新用法、`pi` 配置目录之外的持久化位置。
- **Never**:改 `node_modules`;改冻结的 control-web;删测试凑绿;`git add -A`;动 `~/.pi/agent` 真凭据;
  pkill/killall。
- **诚实跳过**:真实多卡需真实模型(无 LLM 无法触发 permission.request)——wire 层只验 command 管道
  (unknown 报告)+ 单元层验 gate 三来源语义;多卡视觉证据由收尾演示(用户在场)+ 截图承担,
  skip_test 列如实记。

## Evidence / Audit

- 决策台账:`.audit/T-012.tsv` … `.audit/T-017.tsv`,七列定稿(id decision reason evidence verdict skip_test show),
  随票 force-add 入库(恢复 T-002..T-005 先例;`/.audit/` 规则只该拦 bulky 证据)。
- 浏览器取证沿用 walkthrough/verify-pie 既有机制,截图落 `ui-walkthrough-shots/`(本地)。
- 演示:daemon `--permission ask` + 真实模型短 prompt 触发多卡,用户浏览器亲验批量批复。
