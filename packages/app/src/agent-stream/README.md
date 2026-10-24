# Agent stream

The live path is: `adapter` → `model` → a platform strategy
(`strategy-web` for web, `strategy-native` for native), with
`bottom-anchor-controller`, `history-window` and `history-row-revision`
owning scroll anchoring and virtualization.

## Parked: history pagination

`history-start-pagination` / `history-start-settle-scheduler` are wired into
both strategies, but the app deliberately keeps them dormant:

- `ChatList` passes `PARKED_HISTORY` (`hasOlderHistory: false` and no
  progress key), so `evaluateHistoryStartPagination` never loads.
- The daemon's `session.entries` returns the full snapshot and has no
  cursor/limit contract, so there is nothing to page against.

Reviving it is an end-to-end change, not a UI toggle:

1. add cursor + `hasMore` to `session.entries`;
2. keep a windowed entry list in the client/tree store;
3. wire `onNearHistoryStart` / `isLoadingOlderHistory` / `olderHistoryProgressKey`
   in `ChatList` and remove `PARKED_HISTORY`.

Do not make the state machine look live by passing guessed values.

## Removed: jump-to-message

`use-scroll-to-message` / `prompt-jump-settle` and the
`StreamViewportHandle.scrollToMessage` method had no caller after chat-find
was stubbed. They were deleted in T-030; restore them together with the find
surface, not on their own.
