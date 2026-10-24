# Agent stream

The live path is: `adapter` → `model` → a platform strategy
(`strategy-web` for web, `strategy-native` for native), with
`bottom-anchor-controller`, `history-window` and `history-row-revision`
owning scroll anchoring and virtualization.

## History pagination

`history-start-pagination` / `history-start-settle-scheduler` load older
entries as the reader reaches the top of the transcript:

- the attach snapshot carries the newest page (daemon `SNAPSHOT_ENTRY_LIMIT`)
  plus `entryWindow { hasMore, nextCursor }`;
- `ChatList` passes the store's cursor to `onNearHistoryStart`;
- the store calls `session.entries { before, limit }`, prepends the page into
  `SessionTreeStore`, and bumps `revision` so the stream rebuilds.

The tree metadata is complete from the snapshot, so branch navigation does not
need to fetch every branch's entries up front.

## Removed: jump-to-message

`use-scroll-to-message` / `prompt-jump-settle` and the
`StreamViewportHandle.scrollToMessage` method had no caller after chat-find
was stubbed. They were deleted in T-030; restore them together with the find
surface, not on their own.
