# ADR-0007：视觉语言自立（Pie 拥有 token，Paseo 只提供结构）

- 状态：已采纳（2026-10-23，owner 在两套方案预览后选定 A · quiet-saas）
- 关联：ADR-0005（分层整目录搬运与栈锁定）、`DESIGN.md` v1、
  `docs/design/audit-2026-10.md`、`docs/paseo-ui-reuse.md`

## 背景

ADR-0005 把 UI 复用升级为「分层整目录搬运」，骨骼层与皮肤层都照搬 Paseo，紧接
Pie 只做了一处皮肤级改动：把 Paseo 的 teal 换成一族蓝紫（`theme.ts` 的
「Pie tints」）。结果是界面同时带着 Paseo 的语法和 Pie 的半套配色，落地后暴露三
类问题：

1. **层级不可见**：表面阶梯 5 级灰挤在 1.4:1–1.9:1，分隔线对白底 1.40:1，结构靠
   1px 线勉强维持；三级文本 3.07:1 却承担 10px 时间戳与占位符。
2. **语义重复**：同一「选中」有四种实现（header 填充、rail 灰底+白图标 1.2:1、
   tab 灰底细边、pane 2px 强调线）；Files/Changes 同时存在于主区 tab 与 rail。
3. **决策缺位**：没有 DESIGN.md，每次改动各自即兴选色与字号（全仓 26 处 9–11px）。

owner 明确对当前 UI 不满意，并要求以 pi-dev-mode 规范收敛。

## 决策

**1. Pie 拥有自己的视觉契约。** 根 `DESIGN.md` 是唯一真源（token、字号层级、
表面阶梯、选中语汇、强调色预算、导航模型）。Paseo 继续提供结构与交互力学
（ADR-0005 的骨骼层不复审），**皮肤层不再照搬**：token、配色、字号、选中态由
DESIGN.md 定义。

**2. 基调 = quiet-saas。** 近白纸 + 墨字 + 单一蓝紫强调色；深度靠三档表面 + 1px
细线，阴影只给真正浮起的层。方案 B（暖纸 / 衬线标题）经预览后否决，理由记录在
`DESIGN.md` 的 Iteration Guide；回滚需要新证据，不能凭口味。

**3. v1 只有浅色主题。** 删除不可达的 dark token 与 `_layout.tsx` 的强制
`setTheme("light")`。暗色是独立决策：重新引入必须有真实开关、完整 token 与对比度
复核，并 bump DESIGN.md 版本。

**4. 导航收敛为两层。** 侧栏（工作区 + 会话）→ 主区 tab（会话/文件/变更）→
检查器（主区上下文，单开关 + 分段）。删除恒驻 `New session` tab、rail 模式条与
重复入口；每类对象一个主入口。

**5. 视觉改动走流程。** 契约变更先改 `DESIGN.md` 并 bump `version`，再改代码；
改版先审计现状差异。可判定的门槛落在 `docs/CONSTRAINTS.md`（C1–C8、D1–D7），
对比度按实测写进票，不靠截图感觉。

## 后果

- **收益**：视觉决策有据可查；选中态与导航唯一；可读性门槛可机械校验；新 agent
  不必再从 Paseo 源码反推意图。
- **成本**：皮肤层与 Paseo 上游脱钩，后续 Paseo 的视觉改动不能直接合并，需要人工
  判断是否映射进 DESIGN.md。ADR-0005 的版本锁只覆盖依赖与骨骼层。
- **不做**：不改协议与 daemon 行为（文案边界例外，见 T-022）；不新增功能；不引入
  需授权字体、渐变、插画或第二种强调色。
- **验证**：`npm run check` + `npm run ui-walkthrough`，截图对照 DESIGN.md；票图
  T-018…T-023 在 `.dev/feature-ui-redesign/`。
