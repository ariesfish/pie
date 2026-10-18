# Todo

Per-task checklists and status. Heading markers are triage roles (see docs/agents/triage-labels.md).

## T-001 (ready-for-agent)
- [ ] MUST: daemon wire —— 磁盘未打开会话改名:session.list 新名 + 文件含 session_info 条目
- [ ] MUST: daemon wire —— 打开中会话改名回归
- [ ] MUST: daemon wire —— 空串/纯空白 = 显式清除
- [ ] MUST: store —— 改名动作 + 事件同步 + 回退优先级
- [ ] MUST: store —— trim 空输入处理
- [ ] MUST: npm run check 全绿
- [ ] MUST: walkthrough —— 菜单入口 + 行内即时更新
- [ ] MUST: walkthrough —— 手机与桌面名字一致
- [ ] MUST: walkthrough —— 清除后回退首条消息摘要
- [ ] SHOULD: walkthrough —— 写锁冲突提示
- [ ] SHOULD: walkthrough —— 分叉继承行为
- [ ] SHOULD: walkthrough —— pi TUI 一致性
- [ ] SHOULD: walkthrough —— 分支标签不受影响
- [ ] SHOULD: walkthrough —— 中英文案
- [ ] SHOULD: judgment —— 入口可发现性(产品确认)
- [ ] MAY: walkthrough —— 面板预填旧名
- [ ] MAY: walkthrough —— 别端改名实时更新

## T-002 (ready-for-agent)
- [x] daemon wire —— 磁盘会话改名:list 新名 + 文件含 session_info 条目
- [x] daemon wire —— 打开中改名回归
- [x] daemon wire —— 空串/纯空白 = 显式清除
- [x] npm run check 全绿

## T-003 (ready-for-agent)
- [x] store —— 改名动作 + 事件同步 + 回退优先级
- [x] store —— trim 空输入处理
- [x] store —— 失败错误态,行不变
- [x] npm run check 全绿

## T-004 (ready-for-agent)
- [x] 菜单入口 + 行内即时更新
- [x] 面板预填旧名
- [x] 清除回退首条消息摘要
- [x] 写锁冲突提示
- [x] 中英文案
- [x] npm run check 全绿

## T-005 (ready-for-agent)
- [x] walkthrough 断言全绿 + 截图
- [x] 手机与桌面名字一致
- [ ] pi TUI 一致性(skip-test:pi CLI 无非交互会话列表;文件级保证已由 T-002 覆盖,人工验收)
- [x] 别端改名实时更新
- [ ] judgment —— 入口可发现性(产品确认,不阻塞)

## T-006 (ready-for-agent)
- [ ] use.mjs 守卫越过(bundle 不再误报缺失)
- [ ] walkthrough --reuse-export 复用分支实证
- [ ] scripts/ 下无 dist/app-web 残留
- [ ] npm run check 全绿

## T-007 (ready-for-agent)
- [ ] index.html 无单引号字符串(grep 不变量)
- [ ] daemon 起页 smoke(sendBtn 元素在位)
- [ ] npm run check 全绿

## T-008 (ready-for-agent)
- [ ] launch + doctor + serve + drive 全链跑通
- [ ] app-web-diff 证据落 .audit/evidence/(report + shots)
- [ ] gotchas 复核:跑证为真则保留,为假则改正
- [ ] features/README.md + SKILL.md 证明状态更新(带证据指针)
- [ ] npm run check 全绿

## T-009 (ready-for-agent)
- [ ] GLOSSARY.md 增「会话列表」条目(与会话树区分)
- [ ] SPEC.md 开放问题 2 标已解决(指针回 GLOSSARY)
- [ ] npm run check 全绿

## T-010 (ready-for-agent)
- [ ] VERIFY_PIE_PERMISSION=ask → run.json permissionMode=ask + daemon.log "Permission ask"
- [ ] 无环境变量 → 默认 off(daemon.log 无 Permission 行)
- [ ] demo-permission-card.md 过时表述改正;SKILL.md launch 节提环境变量
- [ ] npm run check 全绿

## T-006 进度(过夜演练)
- [x] use.mjs 守卫越过(bundle 不再误报缺失)
- [x] walkthrough --reuse-export 复用分支实证(26 PASS;与全新导出断言集一致)
- [x] scripts/ 下无 "app-web" 残留
- [x] npm run check 全绿

## T-007 进度(过夜演练)
- [x] index.html 无单引号字符串(grep 不变量:pre 'sendBtn' → post 无)
- [x] daemon 起页 smoke(served page 无单引号,sendBtn 元素在位,清理完成)
- [x] npm run check 全绿

## T-009 进度(过夜演练)
- [x] GLOSSARY.md 增「会话列表」条目(含 Relationships 行,与会话树区分)
- [x] SPEC.md 开放问题 2 标已解决(指针回 GLOSSARY + .audit/T-009.tsv)
- [x] npm run check 全绿

## T-010 进度(过夜演练)
- [x] VERIFY_PIE_PERMISSION=ask(+TIMEOUT) → run.json permissionMode=ask + daemon.log "Permission ask (timeout 30000ms)"
- [x] 无环境变量 → 默认 off(无 Permission 行);非法值 exit 2 拒绝、不起进程
- [x] demo-permission-card.md 过时表述改正;SKILL.md launch 节提环境变量
- [x] npm run check 全绿

## T-011 (ready-for-agent)
- [ ] MUST: daemon wire —— respondMany 全结算 + timer 清除 + pending 清空
- [ ] MUST: daemon wire —— unknown 报告 + 已知 id 正常结算
- [ ] MUST: daemon wire —— 批量 allowSession 按 toolName 记入会话允许集
- [ ] MUST: daemon wire —— 单张 respond 回归 + denyAll 回归
- [ ] MUST: daemon wire —— settled 事件三来源广播(user/timeout/dispose)
- [ ] MUST: store —— 列表增删 + 选择集生命周期 + 批量请求携带 + 单卡等价
- [ ] MUST: npm run check 全绿
- [ ] MUST: verify-pie 批量旅程 —— 多卡同屏 + 全选全部允许 + toolcard 全 done + ws-probe 取证
- [ ] MUST: 演示页多卡截图 + 单卡时批量栏不出现
- [ ] SHOULD: 部分失效演练 —— 一张卡 timeout 过期后其余仍可批量结算
- [ ] SHOULD: 移动端长按多选批量批复
- [ ] SHOULD: 中英文案切换
- [ ] SHOULD: judgment —— 多选手势移动端顺手度(产品确认)
- [ ] MAY: 批量 allowSession 后同类工具不再出卡
- [ ] MAY: 选择集随卡结算自动清空
- [ ] MAY: judgment —— 全部允许/拒绝无需二次确认(产品确认)

## T-008 进度(过夜演练)
- [x] launch + doctor + serve + drive 全链跑通(11/11 steps;首跑按原配方 4 步 RED,抓出两处挂账漂移)
- [x] app-web-diff 证据落 .audit/evidence/overnight-20261018/T-008/(report + shots + ws-side-effects)
- [x] gotchas 复核:rail 模式页签 icon-only(aria 定位)、sticky header 真 testid、画布异步、初始 New-session tab——全部改正
- [x] features/README.md + SKILL.md 证明状态更新(app-web-changes-diff → proven,证据指针)
- [x] npm run check 全绿
