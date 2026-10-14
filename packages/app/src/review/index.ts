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

// [pie] placeholders until the W5 review batch: every render site in the
// diff surfaces gates behind `reviewActions`, which pie callers never
// provide, so these never paint — they exist to satisfy the import surface.
import type { InlineReviewActions } from "./geometry";
import type { ReviewableDiffTarget } from "@/utils/diff-layout";
import type { StyleProp, ViewStyle } from "react-native";
import type { PressableProps } from "react-native";

export function InlineReviewAddButton(_props: PressableProps & { style?: StyleProp<ViewStyle> }) {
	return null;
}

export function InlineReviewThread(_props: {
	reviewTarget: ReviewableDiffTarget;
	reviewActions: InlineReviewActions;
	height: number;
	viewportWidth: number;
	pinToViewport: boolean;
}) {
	return null;
}
