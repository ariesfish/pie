# Design docs

设计契约、审计基线与方案预览。所有视觉改动先读根 `DESIGN.md` v1。

## 已选方案

**A · quiet-saas**（2026-10-23）。契约落根 `DESIGN.md` v1；暖纸（B）作为否决方向记录在契约的 Iteration Guide。

## 文件

| 路径 | 作用 |
|---|---|
| `audit-2026-10.md` | 2026-10 UI 审计基线：观测 token、矛盾清单、实测对比度、真实缺陷 |
| `variants/index.html` | 两套方案预览（quiet-saas / 暖纸），同一布局与导航收敛，仅换 token |
| `references/paseo.png` | Paseo 参考截图（产品形态蓝本；来自 `docs/paseo-ui-reuse.md`） |

## 看预览

```bash
open docs/design/variants/index.html     # macOS；按 1 / 2 切换方案
```

预览是静态 mock，不是 app 产物：用来拍方向和检查层级，不替代 `npm run ui-walkthrough`。
落地时 token 写进 `packages/app/src/styles/theme.ts`，组件按 `DESIGN.md` 收敛。

## 规则来源

- 审计方法：ui-design **extract**（先把现状逆向成基线，再谈改）。
- 方案语言：`quiet-saas` 与 `warm-editorial`（claude 系）两个风格档，同一结构不同皮肤。
- 质量门槛：`docs/CONSTRAINTS.md` 的 D1–D7（对比度、字号、表面阶梯、强调色预算、选中态、导航唯一性、触控）。
