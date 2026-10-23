# `.dev/` — agent process memory & tracker

pi-dev-mode 约定：`.dev/` 是 agent 的工作区，不是产品源码。目录在场即启用对应能力；删除即回到无账本行为。

本仓库采用 **feature-first** 布局：一次大需求 = 一个 `.dev/feature-<slug>/` 目录，spec、票图、勾选全在里面。

## 布局

```
.dev/
├── README.md              # 本文件（tracked）
├── feature-<slug>/        # 一次工作的全部（ignored）
│   ├── spec.md            # 契约
│   ├── plan.md            # 切片图 = 工单索引
│   ├── todo.md            # 勾选 + triage 标记
│   ├── research.md        # 调研笔记（可选）
│   └── tickets/T-XXX.md   # 全文票（plan 行装不下时）
├── feature-archive/       # 2026-10 迁移前的 SPEC/spec/tasks 冻结记录（ignored，只读）
├── inbox/                 # 未归属入件（ignored）
├── lifecycle/             # gate.sh 账本（tracked）
│   ├── README.md
│   ├── items/<T-id>/state.json
│   └── observe/           # L4 桩，故意不实现
└── audit/                 # 决策与证据
    ├── T-*.tsv            # 七列决策台账（tracked，随票提交）
    └── evidence/          # 截图 / report / verdict / ws 录包（ignored）
```

命名契约：顶层 feature 目录以 `feature-` 起头，整名即 slug；保留名 `inbox/`、
`lifecycle/`、`audit/`、`feature-archive/` 不用该前缀。T-id 跨 feature 全局唯一，
下一个 = `.dev/` 下最大号 + 1，只追加不重排。

## tracked / ignored 的取舍

pi-dev-mode 默认把整个 `.dev/` 当单开发者的过程记忆（gitignore）。本仓库有一处刻意偏差，理由写在 `AGENTS.md`：

- `lifecycle/` 与 `audit/T-*.tsv` **入库**：账本和决策行是审计记录，`gate.sh replay` 需要它们随 clone 存在。
- `audit/evidence/`、`inbox/`、`feature-<slug>/`、`feature-archive/` **不入库**：体积大、可重跑生成，或只是过程稿。

当前 feature：`feature-ui-redesign/`（2026-10 UI 波次，T-018…T-023）。

## 常用命令

```bash
# 开票（建立 .dev/lifecycle/，幂等）
bash /path/to/pi-dev-mode/gates/gate.sh open T-018 "标题"

# D 类门：真实命令
bash /path/to/pi-dev-mode/gates/gate.sh run T-018 tdd -d packages/app -- npx vitest run

# 关票
bash /path/to/pi-dev-mode/gates/gate.sh close T-018 --note "原因"
```

账本存在与否只影响 D/A 类门，不影响其它技能行为。
