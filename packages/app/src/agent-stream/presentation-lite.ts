// [pie] W4b-2 minimal presentation surface: paseo's presentation.ts
// (plugin projections + tool-call overview grouping + spoken-input
// envelope, with the plugins/timeline and tool-calls cones) belongs to
// the view weave and lands with it; the viewport only needs the
// message-id id of a row (assistant rows come from Markdown block
// splitting, so a row id differs from its source message id).
import type { StreamItem } from "@/types/stream";

/** The source message a display row belongs to (see paseo presentation.ts). */
export function getStreamItemMessageId(item: StreamItem): string {
  return item.kind === "assistant_message" ? (item.blockGroupId ?? item.id) : item.id;
}
