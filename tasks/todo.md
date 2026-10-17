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
- [ ] 菜单入口 + 行内即时更新
- [ ] 面板预填旧名
- [ ] 清除回退首条消息摘要
- [ ] 写锁冲突提示
- [ ] 中英文案
- [ ] npm run check 全绿

## T-005 (ready-for-agent)
- [ ] walkthrough 断言全绿 + 截图
- [ ] 手机与桌面名字一致
- [ ] pi TUI 一致性
- [ ] 别端改名实时更新
- [ ] judgment —— 入口可发现性(产品确认,不阻塞)
