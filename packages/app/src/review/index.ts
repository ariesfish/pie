// Ported from getpaseo/paseo (Apache-2.0) — review/index.ts, [pie] subset:
// geometry + draft shapes only. The comment store, editor sheet and
// feedback surfaces arrive with the W5 review batch.
export {
	getInlineReviewThreadState,
	getSplitInlineReviewThreadState,
	isInlineReviewEditorForTarget,
	type InlineReviewActions,
	type InlineReviewEditorState,
} from "./geometry";

export type {
	ReviewDraftComment,
	ReviewDraftMode,
	ReviewDraftSide,
} from "./state";
