---
version: 1.6
name: Pie design system
description: 近白纸上的工程工具：墨字、墨色强调、1px 细线 + 表面阶梯做深度；界面退到会话后面，强调只给操作与焦点，彩色只留给语义状态。
resolved-from-defaults:
  palette: light_clean        # quiet-saas 档；跨端工作台浅色为默认（沿用上一轮用户反馈）
  typography: inter           # 系统 UI 栈；不引入需授权的字体
  display: same_as_body       # 工具型产品不做展示字体
  mood: professional_minimal  # quiet-saas 档
  density: compact            # 桌面工具；compact 断点下按 density.ts 放大触控尺寸
  exclude: [gradients, stock_photos, serif_display, second_accent_hue]
colors:
  background: "#FFFFFF"
  surface: "#F6F7F9"
  surface-raised: "#EEF0F4"
  text-primary: "#14161A"
  text-secondary: "#4B5361"
  text-tertiary: "#5D6678"
  accent: "#14161A"
  hairline: "#E4E7EC"
  hairline-strong: "#D0D5DD"
  on-accent: "#FFFFFF"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.62
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace"
    fontSize: "12.5px"
    lineHeight: 1.7
---

## Overview

Pie 是给 Pi coding agent 的跨设备客户端：桌面、移动、Web。主循环是**读 agent 的输出、
批准它的动作**，不是浏览页面。因此视觉的第一目标是让会话内容清楚，第二目标是让当前
上下文（哪个会话、哪个 tab、哪个检查器）不用找。

方向：**近白纸 + 墨字 + 墨色强调**。深度靠三档表面（canvas / sub / raise）加
1px 细线，不靠阴影；强调是稀缺资源，只出现在主操作、运行状态、链接和焦点环上，
而且用 ink 本身，不引入第二个色相。彩色只保留给语义状态（成功 / 警告 / 错误）和
代码语法高亮；界面不需要靠蓝色来证明可点击。
没有渐变、没有插画、没有装饰性色块；产品自己的 UI 是唯一的图像。

参考来源：`docs/design/audit-2026-10.md`（现状审计）、`docs/design/variants/index.html`
（已选方案 A）。Paseo 只提供结构参照（ADR-0005），不复制其皮肤与商标；本文件取代
Paseo 皮肤层的唯一依据见 ADR-0007。

## Colors

### Brand & Accent

- `accent #14161A`：强调色就是 ink 本身，不另立色相。白字在其上 **18.1:1**；
  作为文字落在任何一档表面上都是最高对比。
- hover/active：主操作填充降到 90% 不透明度，不新增 token，也不换成第二种颜色。
- **预算**：每视口最多 2 处墨色强调。通常是「一个主按钮 + 一个运行/焦点状态」。
- 允许：主操作填充、运行状态点、焦点环、图表中的单条强调。
- 链接：`ink` + 常驻下划线（不靠颜色区分），hover 只改变下划线/不透明度。
- 禁止：导航选中填充、正文着色、卡片整块着色、用强调色画分隔线；
  除语义状态与代码语法外，不引入任何彩色 token。

### Surface

三档，按信息层级使用，不按组件方便程度使用：

| token | 值 | 用途 |
|---|---|---|
| `surface0` (canvas) | `#FFFFFF` | 主内容、对话、编辑器 |
| `surface1` (sub) | `#F6F7F9` | 侧栏、tab 条、检查器这类「框架」面 |
| `surface2` (raise) | `#EEF0F4` | 选中行、hover、分段控件选中、行内 code |
| `surface3` (strong) | `#E1E5EB` | 默认 chip 底、需要更强一档的填充 |
| `surface-code` | `#F8F9FB` | 代码块、工具卡 header、diff 纸面 |
| `hairline` | `#E4E7EC` | 1px 收边（装饰性，不单独承担结构） |
| `hairline-strong` | `#D0D5DD` | 输入框、卡片边界等需要被看见的边 |

规则：相邻表面的差异必须是可见的一档；结构不能只靠 1.4:1 的细线。代码/diff 永远
回到中性纸面，不跟随侧栏的 sub 色。

### Text

| 角色 | 值 | 对比度（对白底） | 用途 |
|---|---|---|---|
| `ink` | `#14161A` | 18.1:1 | 标题、正文、选中态 |
| `ink-2` | `#4B5361` | 7.75:1 | 次要正文、控件标签 |
| `ink-3` | `#5D6678` | 5.77:1 | 时间戳、占位符、辅助信息（**最低档**） |

正文小字必须 ≥ 4.5:1；`ink-3` 是下限，不得再引入更浅的文本色。`ink-3` 在每一档
表面上都达标：sub **5.39:1**、raise **5.06:1**、strong step **4.57:1**。选值依据是
「三级文本会落在选中行上」，不是只对白底验算。

### Semantic

| token | 值 | 用途 |
|---|---|---|
| `success` | `#1F7A4D` | 完成、已连接、diff 新增文字 |
| `warning` | `#9A6700` | 待授权、需要注意 |
| `danger` | `#B42318` | 错误、拒绝、diff 删除文字 |
| `success-soft` | `#E7F4EC` | 状态 chip 底 |
| `warning-soft` | `#F3EDE0` | 待授权 / 运行中的 chip 底 |
| `danger-soft` | `#FDECEA` | 错误 chip / diff 删除行底 |
| `diff-add` | `#EAF6EE` | diff 新增行底 |
| `diff-del` | `#FBEAE8` | diff 删除行底 |

状态色只用于状态，不做装饰；语义色不参与导航选中。soft 底是**固定 hex**，
不按 alpha 现算：同一个 chip 落在 canvas / sub / raise 上必须同色，对比度才能
按写下的值复核。

**对比度可达面**（实测，前景 / 实际底色）：`ink` 与 `ink-2` 在四档表面都 ≥ 6.1:1；
`ink-3` 最低 4.57:1。墨色 `accent` 就是 `ink`，在所有表面都远超 4.5:1，可以安全
承载小字。语义色作为**文字**只保证到 sub 档：`statusWarning` 在 raise 上 4.27:1，
低于 4.5——只允许用于图标或形状。要在 raise 上写状态文字，用 `ink-2` + soft tint 底，
不要让状态色本身当正文色。代码语法高亮使用独立的 highlight palette，不属于 UI
强调色，也不参与每视口的强调预算。

## Typography

### Font Family

- UI / 正文：系统栈（`system-ui` … `PingFang SC`）。不引入需要授权的字体。
- Mono：`ui-monospace` 栈，只给代码、命令、diff、token 数。
- 中文与英文共用同一套尺寸；不因语言切换字号。

### Hierarchy

| 角色 | 字号 / 行高 / 字重 | 用途 |
|---|---|---|
| page | 26 / 1.25 / 600 | 页面级标题（设置、工作区首页） |
| section | 20 / 1.3 / 600 | 空状态标题、面板标题 |
| body | 15 / 1.62 / 400 | 会话正文 |
| ui | 13 / 1.5 / 400–500 | 会话行、tab、控件标签 |
| base | 14 / 1.5 / 400 | 表单、一般界面文字 |
| caption | 12 / 1.45 / 400 | 时间戳、辅助信息 |
| mono | 12.5 / 1.7 / 400 | 代码、命令、diff |

**最小 12px。** 不使用 9/10/11px；密度靠间距、留白与字重，不靠缩小字号。
字重只用 400 / 500 / 600，不用 700 及以上。

### Principles

层级来自字号 + 字重 + 颜色三者的组合，不靠加粗一切。同一屏最多两个层级的标题；
正文保持 15px，代码保持 mono。中文行高略大于英文（1.62 起）。

内容标题（markdown h1–h6）从 body 起按同一比例表派生（22 / 20 / 18 / 16），
属于正文内部层级，不新增 UI 档位。

### Substitutes

- 系统无 `PingFang SC`（Windows/Linux）：落到 `system-ui` 的 CJK 字体，不另配。
- Mono 缺失：`Menlo` → `Consolas` → `monospace`，不下载字体。
- 本期不引入衬线展示字体（暖纸方案未采用）。

## Layout

### Spacing System

4 的倍数：`4 / 8 / 12 / 16 / 24 / 32 / 48`。两档半档 `2 / 6` 只用于图标旁距、
chip 内衬这类控件内部微调，不做分栏与页面级留白。禁止 3 / 5 这类未声明的裸值；
1px 只用于描边，2px 只用于选中下划线/左条。

### Grid & Container

- 桌面三栏：侧栏 **232px**（固定）· 主区自适应 · 检查器 **300px**（可拖 264–520）。
- 对话与 composer 的内容列 **max-width 720px**，居中；不随窗口无限拉宽。
- 检查器可关闭；关闭后主区占满，不保留空列。
- 侧栏/检查器的分隔用 1px hairline，不用阴影。

### Responsive Behavior

- 断点沿用 `md: 720` / `lg: 992`；`< md` 为 compact。
- compact：侧栏与检查器变成左右抽屉（边缘手势 + 顶部按钮），不引入第三套导航。
- compact 触控目标 ≥ 44×44；桌面控件高度 28–32。
- 会话行：桌面 32，compact 44；tab：桌面 33，compact 40。

## Elevation & Depth

- 默认零阴影：卡片、面板、侧栏只用表面档位 + 1px 细线。
- 允许一层阴影的只有真正浮起的层：composer、权限卡、菜单、sheet、toast。
  阴影值 `0 1px 2px rgba(16,24,40,.04), 0 8px 24px rgba(16,24,40,.06)`。
- 禁止堆叠阴影、发光、毛玻璃、渐变。暗色主题本期不发布：`theme.ts` 里的 dark
  token 要么删除，要么接到真实开关；不允许留不可达的死主题。

## Shapes

- `radius-sm 4`：行内 code、小 chip。
- `radius 6`：按钮、输入框、tab、图标按钮。
- `radius-lg 10`：卡片、diff 容器、权限卡。
- `radius-xl 14`：composer、sheet。
- `radius-2xl 16`：sheet 顶角（`BORDER_RADIUS["2xl"]`，控件几何表使用）。
- `999`：只有状态点与胶囊 chip。
- 同一元素不得出现两套圆角；不使用 5/8/20 等裸值。

## Components

### Buttons

- 高度：桌面 28（紧凑行内）/ 32（表单）；compact 44。
- 主操作：`accent`（ink）填充 + `on-accent`（白）文字，每视口最多一个。
- 次要：canvas 底 + `hairline-strong` 边 + `ink` 文字。
- 幽灵：透明底 + `ink-2` 文字，仅用于「拒绝 / 取消」这类低优先动作。
- 发送按钮：`ink` 圆形 30px，白图标（不占强调色预算）。
- 禁用：`ink-3` 文字 + `surface1` 底，不降低整体不透明度。

### Cards & Containers

- 卡片：canvas + 1px `hairline` + `radius-lg`；无阴影（浮层除外）。
- 权限卡：`hairline-strong` 边 + 一层阴影 + 顶部状态 chip；主按钮唯一墨色填充。
- 工具卡：header 用 `surface-code`，正文 mono；状态 chip 用语义 soft 底。
- diff：容器 `radius-lg`，行底用 `diff-add` / `diff-del`，行号 `ink-3`。

### Inputs & Forms

- 高度 32（桌面）/ 44（compact），`radius 6`，1px `hairline-strong`。
- focus：2px `accent`（ink）环（外扩 1px），不改变布局尺寸。
- placeholder 用 `ink-3`，不得更浅。
- 错误：`danger` 边 + `danger` 文字一行，不用红色整块底。

### Navigation

**两层，每类对象一个主入口：**

1. **侧栏**：工作区 + 会话列表。选中 = `surface2` 底 + `ink` + 500；运行中 = `accent`（ink）点。
2. **主区 tab**：会话 / 文件 / 变更。选中 = canvas 底 + `ink` + 500（tab 条本身是 sub）。
3. **检查器**：主区的上下文，不参与一级导航。一个开关（顶部图标）控制开合；
   内部用分段控件切换 文件 / 变更 / 历史 / 包 / 用量 / 活动，选中 = `surface2` + `ink`。
   历史面板展示会话树：缩进表示分支，当前路径 `surface2` + `ink`，节点可回到该点或从这里分叉。

- 不设常驻「新会话」tab；新会话的唯一入口是 tab 行尾 `+`（侧栏不再放同名按钮）。
- 导航选中态不用强调色填充；墨色强调只给运行状态点、主操作、焦点。
- 同类控件只有一种选中语汇；禁止「一个用填充、一个用下划线、一个用白图标」。

## Motion & Interaction

- 时长 120ms（hover/press）/ 160ms（面板开合）；缓动 `ease-out`。
- 只动透明度、位置、尺寸；不动颜色以外的装饰。
- tab 切换不做过场动画；流式输出不做打字机效果。
- `prefers-reduced-motion` 下取消所有非必要位移与淡入。

## Do's and Don'ts

**Do**

- 只用 `theme.ts` 的 token；新增 token 先改本文件再改代码。
- 新文本先选层级（body / ui / caption）再选字号；不即兴写 `fontSize: 11`。
- 每个视口数一遍墨色强调事件，超过 2 个就删；语义状态不算强调。
- 对比度按「实际前景 / 实际底色」计算并写进票；不靠截图感觉。
- 图标按钮必须有 `accessibilityLabel`；focus 必须可见。
- 浮层才用阴影；静态卡片用细线。

**Don't**

- 不引入第二个强调色（含 success/danger 当装饰）。
- 不用强调色填充导航选中态。
- 不用 1.4:1 的细线单独承担结构。
- 不出现 9/10/11px 文本。
- 不留不可达的主题/组件/常量（dark token、重复 `RailMode`、未使用 `SIDEBAR_WIDTH`）。
- 不把用户可见文案写进 daemon/protocol；一律走 app 的 i18n（en + zh-CN）。
- 不复制 Paseo 的商标、截图或具体 trade dress；结构参照不等于皮肤复制。

## Agent Rules

编码 agent 在任何 UI 改动前必须：

1. 读本文件与 `docs/CONSTRAINTS.md`；票上写明涉及的 token 与对比度。
2. 颜色只从 `packages/app/src/styles/theme.ts` 取；允许的字面量文件只有
   `styles/theme.ts`、`components/material-file-icons.ts`
   与 `*.platform.*` 适配层。
3. 字号只从本文件的层级取；不新增档位。
4. 墨色强调预算 ≤ 2/视口；主操作每视口 ≤ 1。
5. 新增/修改的图标按钮补 `accessibilityLabel`；交互元素补 focus 态。
6. 改完跑 `npm run check`；UI 改动再跑 `npm run ui-walkthrough`，截图对照本文件。
7. 视觉决策变化先改本文件并 bump `version`，再改代码——不做静默改版。

## Iteration Guide

- 本文件是设计决策记录：每次修改写清「改什么 / 为什么 / 代价」，并 bump `version`。
- v1.6（2026-10-23，T-036）：新增设置页（`/settings`）。顶部是 Pi agent 目录与
  默认模型 / auth provider / 模型 provider / MCP 计数摘要；下面用分段控件切换
  `settings.json` / `models.json` / `mcp.json`，正文是 mono JSON 编辑器。只开放
  这三个文件，`auth.json` 只显示 provider 名、不返回密钥；保存带 revision CAS，
  冲突时要求先重载。页面沿用 canvas + hairline + 墨色主按钮，不新增 token。
- v1.5（2026-10-23，T-035）：检查器新增「历史」段，展示 Pi 会话树：缩进表示
  分支、当前根到叶路径抬升、分叉点显示分支图标；选中节点可 Navigate（同一文件
  内 rewind）或 Fork（新会话）。会话树来自快照的扁平原数据，不在客户端重算 Pi
  语义；条目预览使用 daemon 给的纯文本 preview。分页见 `session.entries` 的
  cursor 契约（最近一页随快照，旧页按需加载）。
- v1.4（2026-10-23，T-029）：**去掉蓝色强调，改为全墨色**。`accent` 直接等于
  `ink #14161A`，主按钮、焦点环、运行状态点、链接都用它；链接改为常驻下划线，
  因为墨色不再靠色相区分可点击。删除 `accentBright`（与 accent 重复）和
  `statusMerged`（重命名/复制文件状态改用 `ink-3`，不再引入紫色）；diff 选区改用
  中性 `borderAccent`。彩色只剩语义状态与代码语法高亮。代价：强调的层级改由
  填充/线宽/下划线承担，同一屏两个墨色主操作会比两个蓝色按钮更难区分——所以
  每视口仍限一个主操作。
- v1.3（2026-10-23，T-025）：**token 与实际代码对齐**。代码块 / 工具卡 header / diff
  纸面统一到 `surface-code`（此前文档写了 token、组件用 surface1/2 顶替）；语义
  soft 与 diff 行底色改为固定值（`success-soft #E7F4EC`、新增 `warning-soft
  #F3EDE0`、`danger-soft #FDECEA`、`diff-add #EAF6EE`、`diff-del #FBEAE8`），
  不再按 12% alpha 现算——固定值才能在每一档表面复核对比度；删除无人使用且从未
  实现的 `accent-soft`；`surface3`（strong）补进表面表，此前只写在正文里。字重
  700 档（`FONT_WEIGHT.bold`）从 token 与代码中移除，标题统一 600；间距表补上
  控件内部的 2 / 6 半档，并删除未使用的 64+ 档。检查器宽度代码回到文档值
  300 / 264–520。
- v1.2（2026-10-23，T-019）：检查器分段补齐「包」与「活动」——v1.1 只写了三项，
  但资源面板与事件流是既有能力，不能因为没写进契约就消失；同时明确新会话只有一个
  入口（tab 行尾 `+`），并新增 `FONT_SIZE.ui = 13` 作为会话行/控件标签档。
- v1.1（2026-10-23，T-018）：`ink-3` 由 `#667085` 改为 `#5D6678` —— 实测该色落在
  raise 档（选中行）只有 4.36:1，低于正文门槛；新值在每档表面 ≥ 4.57:1。同时补
  `radius-2xl 16`（sheet 用），因为组件几何表按角色取该档。
- 改版先审计：对照 `docs/design/audit-2026-10.md` 列出现状差异，再提改动。
- 已否决方向：暖纸 / 衬线标题（`docs/design/variants/index.html` 方案 B）。
  重新考虑需要新的证据（用户测试或品牌决策），不能凭口味回滚。
- 已知债务与还账顺序见 `docs/CONSTRAINTS.md` 的「当前基线」；还清一项就从基线里删一项。
- 暗色主题是独立决策：实现时必须有真实开关、完整 token 与对比度复核，才算进入本文件。
