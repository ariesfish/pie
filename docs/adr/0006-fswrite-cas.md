# ADR-0006:`fs.write` 乐观并发(CAS)协议

- 状态:已接受(2026-10-14 拍板:A 双令牌 paseo 同款;B conflict{version:null})
- 日期:2026-10-14
- 关联:ADR-0005(W3b-4 前置)、W3b-2 live-file 哑化版本边界

## 1. 背景与动机

W3b-4 要搬 paseo 的 `file-pane/editor/`(编辑器:autosave、冲突横幅、overwrite/reload)。
其 model 状态机的基础是**乐观并发写**:每次 save 携带"我看到的版本",服务端不匹配就
拒绝。没有它,编辑器只能无条件覆写 —— 而 pie 的真实主用例恰好危险:**pi agent 与用户
同时编辑同一文件**(agent 写文件 → fs.changed 事件 → 用户编辑器正持有旧内容待保存)。

现状:

- `fs.write` args `{workspaceId, path, content}`,**无条件覆写**(原子 tmp+rename,好底子)
- `workspace.fs.changed` 只回 `paths: string[]`(无 per-file 版本)
- `LiveFileVersion`(W3b-2)是哑化占位:`{status:"ready"}` 不带元数据 —— **当时已预留型位**
- 全仓仅一个调用点:`workspace-store.ts:206`(破坏面 ≈ 0)

## 2. paseo 参照(Apache-2.0)

paseo server(`file-explorer/service.ts`)的 CAS 语义:

```
fileVersion(stats) = `${dev}:${ino}:${size}:${mtimeNs}`          // revision 串
matches(stats, expectedModifiedAt, expectedRevision):
  expectedRevision ? revision比对 : stats.mtime.toISOString() === expectedModifiedAt
```

- **双令牌**:`expectedRevision`(含 inode+mtimeNs 的精确串)优先;省略则退化为
  ISO mtime 比对。客户端拿到 revision 就用它(无 TOCTOU 毫秒精度问题)
- 结果三态:`written{modifiedAt,size,revision}` | `conflict{version: 盘上现版本}` |
  `error{error}`(binary/超限等编辑前置检查)
- conflict **回盘上现 version** —— 客户端免一次 re-read 即可渲染差异横幅
- editor model(pie 待搬):`observedVersion` 观察流 + saving 期间缓存观察 +
  conflict callout `{kind:"changed", canOverwrite} | {kind:"deleted"} | {kind:"checkFailed"}`

## 3. pie 提案

### 3.1 协议(`@pie/protocol`)

```ts
// values.ts — 新增(接通 W3b-2 预留的型位)
export interface FileVersionInfo {
    modifiedAt: string;   // ISO mtime
    size: number;         // bytes
    revision: string;     // `${dev}:${ino}:${size}:${mtimeNs}`(server 拼装)
}

// commands.ts — fs.read result 扩展(向后兼容,加字段)
"fs.read": { result: FsReadResult & { version: FileVersionInfo } };

// commands.ts — fs.write 换形
"fs.write": {
    args: {
        workspaceId: WorkspaceId; path: string; content: string;
        /** CAS:只在版本仍匹配时写入;两者均省略 = 无条件写(兼容现调用)。 */
        expectedModifiedAt?: string;
        expectedRevision?: string;
    };
    result: FsWriteResult;   // 见下
};

// values.ts — 判别联合
export type FsWriteResult =
    | { status: "written"; path: string; bytes: number; version: FileVersionInfo }
    | { status: "conflict"; path: string; version: FileVersionInfo | null }; // null = 文件已被删除
```

**不抄 paseo 的 `error` 三态**:pie 已有 `FsError(code)` → RPC error 管道
(forbidden/too_large),编辑前置检查(binary/超限)沿用该管道,不进 result。

### 3.2 daemon(`fs-service.ts`)

```
write(root, relPath, content, expected?):
  stat(bigint) ─ ENOENT → expected给了? return conflict{version:null} : 走原 unconditional 路径
  matches(revision优先,mtime退化) ─ 不匹配 → conflict{version: 本盘 stat 版本}
  原子写(维持 tmp+rename + caps)
  re-stat → written{version: 新版本}
```

写后 re-stat 解决"返回给客户端的版本必须与盘上真实值一致"(rename 改 mtime)。
工作区内多客户端:watcher 批事件不变(paths only)—— 客户端 edito 收到 changed 后
re-read 拿新 version(现 live-file 即此模式,零改动)。

### 3.3 app 侧

- `LiveFileVersion.ready` 扩为 `{status:"ready"; version: FileVersionInfo}`
  (W3b-2 注释里"为未来的 per-file 事件留 typed 位"兑现)
- live-file 观察流不动(read 驱动)
- **W3b-4 本体**(后续 PR):port `file-pane/editor/` 的
  model(402L)/model.test(652L)/view.web/extensions.web/observation-source/conflict-alert,
  `FileEditorSession.write` 适配新协议;状态机照搬

## 4. 决策点(待拍板)

| # | 问题 | 建议 |
|---|------|------|
| A | 双令牌(revision 优先 + mtime 退化,paseo 同款)vs 单令牌 mtimeIso+size | **双令牌**:revision 消除同毫秒 TOCTOU;mtime 退化保证手工调用方可写 |
| B | `conflict{version:null}` 表 deleted,还是给 `{status:"deleted"}` 分支 | **null 即可**(客户端只管"我不能写 + 现在盘上是什么",合成成本一个判空) |
| C | revision 含 inode —— 云同步目录(iCloud/Dropbox)inode 会漂移 → 误 conflict | 接受(与 paseo 同水平;mtime 同样会漂;pin 到同一 daemon 会话内使用无碍) |
| D | 协议 result 换形是 breaking(内部仅 1 调用点,同 PR 吃掉) | 接受 |

## 5. 测试策略

1. daemon 单测:written 回精准版本 / conflict 两分支(mtime 漂、revision 漂)/
   deleted(conflict null)/ expected 省略 = 无条件
2. `parsed-diff` 同款模式:先协议面,后编辑器面
3. walkthrough:编辑 dirty→save 闭环(conflict 需外部改动,留给单测层)

## 6. 分期

- **PR-1(本设计,~250 行)**:protocol + daemon + workspace-store 单点适配 + 单测
- **PR-2(W3b-4 主体,~1.5k 行)**:editor 面 port + 冲突横幅 UI + walkthrough 05e
