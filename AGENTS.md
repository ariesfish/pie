# AGENTS.md — Pie

Pie（π·e）是 Pi coding agent 的跨设备客户端：Electron 桌面 + Expo 移动 + Web。
daemon 内嵌 Pi SDK，与 `pi` TUI/CLI 共享 `~/.pi/agent` 存储。

先读本文件，再按需读 `docs/agents/` 下的仓库配置。非平凡任务按 pi-dev-mode 路由
（spec → tickets → implement → review），不要直接开写。

## 常用命令

```bash
npm run check                 # 五个包 typecheck + vitest（合并前必跑）
npm run typecheck             # 只跑类型
npx vitest run                # 只跑测试
npm run smoke                 # 无 LLM 端到端烟测（临时 agent dir）
npm run ui-walkthrough        # UI 交互验收，截图落 ./ui-walkthrough-shots
npm run daemon                # 本地 daemon，默认 127.0.0.1:8760
npm run app:web               # Expo web
npm run app:build:web         # 静态 web 导出 → packages/app/dist
```

UI / daemon 行为改动的验收走 `.pi/skills/verify-pie/`（真实面驱动 + 证据落盘），
不要用"应该能工作"替代。

## 仓库结构

```
packages/protocol   wire 协议类型与编解码
packages/client     类型化 daemon 客户端（连接/重放/会话树同步）
packages/daemon     内嵌 Pi SDK 的本地服务 + 内置演示页
packages/app        正式 UI（Expo Router，中/英）
packages/desktop    Electron 壳 + sidecar
docs/               架构、ADR、术语、agent 配置、设计
.dev/               agent 过程记忆与工单（见 .dev/README.md）
```

## Agent skills

### Issue tracker

feature-first 文件 tracker：`/.dev/feature-<slug>/` 下 `spec.md` + `plan.md` +
`todo.md`（+ 可选 `tickets/`）；T-id 全库唯一、只追加不改号。见
`docs/agents/issue-tracker.md`。

### Triage labels

五角色词汇原样使用（`needs-triage` / `needs-info` / `ready-for-agent` /
`ready-for-human` / `wontfix`），以 `todo.md` 标题行括号标记表达。
见 `docs/agents/triage-labels.md`。

### Domain docs

单一上下文：术语在 `docs/GLOSSARY.md`，决策在 `docs/adr/`，架构在
`docs/architecture.md`；视觉契约在根 `DESIGN.md`，质量门槛在
`docs/CONSTRAINTS.md`。见 `docs/agents/domain.md`。

## 工作流

- **spec**：`.dev/feature-<slug>/spec.md`，与票、票图同目录；不再有根 `spec/`。
- **tickets**：写进同一 feature 的 `plan.md`，勾选写进 `todo.md`。
- **账本**：`.dev/lifecycle/`（gate.sh，tracked）。开票/关门/裁决按
  `.dev/README.md` 的命令执行；台账行落 `.dev/audit/T-<id>.tsv`。
- **证据**：`.dev/audit/evidence/<run>/`（ignored）；结论里引用可复跑的路径，
  不贴大段日志。
- **设计**：任何 UI 改动先读根 `DESIGN.md`；参考图与方案预览在 `docs/design/`。
  视觉改动不得绕过契约临时发明 token。
- **提交**：按 `commit` 技能（Conventional Commits、英文 subject），只提交
  本次改动；不 push、不 squash。

## 记录在案的偏差

这些是与 pi-dev-mode 默认约定的刻意差异，改之前先改这里：

1. **tracker 用 `.dev/feature-<slug>/` 而非 GitHub Issues**：远端虽是 GitHub，
   但工单历史、验收证据和代码同仓评审更有价值；`docs/agents/issue-tracker.md`
   负责让技能找到它。根 `SPEC.md` + `spec/` + `tasks/` 已于 2026-10 迁入该布局。
2. **`.dev/` 部分入库**：`lifecycle/` 与 `audit/T-*.tsv` 随 clone 走，
   `audit/evidence/`、`inbox/`、`feature-<slug>/` 不入库。
3. **术语文件在 `docs/GLOSSARY.md`**（旧路径根 `GLOSSARY.md` 已迁移）；
   ADR 继续放 `docs/adr/`。
