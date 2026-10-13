# ADR-0005：UI 复用策略升级为「分层整目录搬运」并锁定 Paseo 技术栈

- 状态：已采纳（2026-10-13）
- 关联：ADR-0004（terminal 目录废除）、`docs/paseo-ui-reuse.md`（原 A/B/C 分级清单，本文升级其结论）、architecture.md §6.4/§11

## 背景

1. **基础功能审计暴露病根**：对 `@pie/app` 做基本功能核查发现——`explorerMode` 无任何 UI 可设置（explorer 栏永远空白）、FilesPanel/ChangesPanel/ResourcesPanel 完成开发但从未挂载（Wave 1 重构的孤儿组件）、调用链断在「点了文件没有任何东西渲染它」。直接原因：P2a 按 `paseo-ui-reuse.md` 的 A 级清单只搬运了 6 个文件，布局引擎/面板系统/移动端手势骨骼全部被「手写简化版」替代，而简化版没有走到可用。
2. **Paseo 代码库定量测量**（2026-10 实测，2114 文件 / 23MB 源码）：
   - `components/`（65K 行组件库）仅 ~10% 文件触摸数据层（`@getpaseo/protocol` / session-store / host-runtime）；
   - `mobile-panels/`（1K 行）**零数据耦合**；`workspace-tabs/`+`panel-manifest`（1.2K 行）~20%；SplitContainer（1450 行）+ RetainedPanel + floating-header 零耦合；
   - 数据相反，`session-store`（1907 行）+ `host-runtime`（2884 行）+ `timeline/`（3265 行）深度绑定 agent/provider/线性时间线模型。
3. **技术栈联网核查**（npm registry + GitHub API，2026-10-13 实测）：paseo 钉版=2025-Q3 快照（Expo 54 / RN 0.81 / RNGH 2.28），当前最新为 Expo 57 / RN 0.87 / RNGH 3.3，但**所有组件 major 同代**（reanimated 4 / skia 2 / unistyles 3 / query 5 / zustand 5 / i18next 26 / react-native-web 0.21），且 26 个依赖无一淘汰。AI 时代评估（训练语料霸权、类型护栏、React Compiler 1.0）：该栈对 AI 代码生成恰好是理论最优区间，无更优替代。

## 决策

**1. UI 复用策略从「A/B/C 分级逐件搬运」升级为「分层整目录搬运」：**

| 层 | 策略 | 目录 |
|---|---|---|
| 骨骼（零/低耦合基础设施） | **整目录搬**，带测试 | SplitContainer+RetainedPanel、mobile-panels、workspace-tabs+panel-manifest、`components/`（ui 基元/adaptive/markdown/headers/sidebar 等）、styles 体系 |
| 皮肤之下的成熟渲染器 | 搬渲染核心，数据 hooks 换接 `@pie` 协议命令 | file-pane（CM6 完整版）+ file-explorer、git Skia diff、usage、command-center、composer（submission model；steer/followUp 交互层自研） |
| 数据模型核心 | **不搬**（pie 已有 Pi 原生等价物） | session-store、host-runtime、timeline reducers、agent-stream 渲染管线（力学部分除外）、provider-selection、subagents、hosts、terminal（ADR-0004） |

**2. 执行顺序（W1–W4）：** W1 骨骼（布局引擎+面板注册器+移动端手势+依赖补齐+React Compiler）→ W2 组件库与 markdown（吸收 streamdown 的「流式按块渲染、前缀稳定」思想）→ W3 数据面板（file-pane/git/usage 接 pie 协议）→ W4 composer 完整版 + 流式聊天管线（FlatList 虚拟化 + inverted + maintainVisibleContentPosition 全套力学）。

**3. 版本锁定：** W1–W4 全程锁 paseo 钉版（Expo 54 / RN 0.81 / RNGH 2.28 / skia 2.2.12 / reanimated 4.3.1），唯二例外：`markdown-it` 保持 15（paseo 的 ^10 是 2019 年版本）、Electron 37→44。搬运完成后单独立项升级 SDK 57 / RNGH 3 / vitest 5。**禁止边搬边升**——paseo 的 23MB 生产代码是我们对钉版组合的最大兼容性测试套件。

**4. AI 时代增量（随 W1 开启）：** React Compiler 1.0（`experiments.reactCompiler`）作为 AI 生成/搬运代码的性能兜底；oxlint 提级执行（反馈环速度=AI 迭代速度）。**不引入** assistant-ui/ai-elements/streamdown 等 web-only AI UI 库（RN 无等价物；其 runtime 抽象违背 pie 存在理由——见 architecture.md §1.1）；`@assistant-ui/react-native`（0.1.x）列入季度观察名单。

## 理由

1. **耦合测量证明边界清晰**：UI 骨骼与皮肤约 90% 数据无关，「手写简化版」是对已验证实现的高成本重写。上轮孤儿面板事故即简化路线的成本证据。
2. **差异化保留在正确的层**：pie 的核心价值（会话树/steer·followUp/Pi 扩展生态）全部位于数据层——该层 pie 已建成（connection-store + tree-store + daemon 全命令集），也是 paseo 的 `AgentClient` 抽象补不出的部分。骨骼搬 + 数据层自持 = 各取两库之长。
3. **栈核查排除换栈动机**：26 个依赖与 RN 0.81/Expo 54 生态零版本鸿沟（pie 与 paseo 依赖栈几乎逐行相同）；2026-10 时点无一项被替代或淘汰，major 全部延续。换栈收益为零、成本为全部重写。
4. **AI 时代选型函数**：生态语料最大=生成质量最高=幻觉最少；显式小 API（zustand/unistyles/query）优于魔法抽象层；React Compiler 自动记忆化恰好兜住 AI 搬运代码最常见的性能缺陷（漏 memo）。

## 结论性影响

- 本 ADR 取代 `docs/paseo-ui-reuse.md` §2 分级清单的搬运粒度结论（其耦合度实测数据仍有效）；P2a 已搬运的 6 个 A 级文件保留，W2 起被整目录版本覆盖。
- `NOTICE` 台账流程（`[port]` 标记 + Apache-2.0 头注释 + 季度审计）适用于所有整目录搬运；与 ADR-0004 一致，`terminal/` 永不搬运。
- 新增依赖（W1）：`@tanstack/react-query`（daemon 场景关闭 online/network 监听）、`react-native-keyboard-controller`、`@floating-ui/react-native`。
- roadmap「P2 收尾：diff Skia 渲染器」按 ADR-0004 同款 .native 分叉模式执行（web 端不引入 CanvasKit，实测 7MB）。
- 搬运完成后（W4 之后、P3 之前）立项：SDK 54→57 升级 + RNGH 2→3 + vitest→5 的组合升级 PR。
