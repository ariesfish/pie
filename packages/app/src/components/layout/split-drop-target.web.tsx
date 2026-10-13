// Ported from getpaseo/paseo (Apache-2.0) — components/split-drop-zone.tsx
// (web-only): the pane-host drop target. While a tab drag is active it
// reports edge/center hover so the shell can preview splits vs moves.
import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";

export interface SplitDropTargetProps {
	paneId: string;
	/** Only droppable while a workspace-tab drag is active. */
	active: boolean;
	/** pane: the tab-strip area — tabs reorder/move into the pane. */
	zone: "pane" | "pane-body";
	children: ReactNode;
}

export function SplitDropTarget({ paneId, active, zone, children }: SplitDropTargetProps) {
	const { setNodeRef, isOver } = useDroppable({
		id: `${zone}:${paneId}`,
		disabled: !active,
		data: { kind: zone === "pane" ? "split-pane-strip" : "split-pane-drop", paneId },
	});
	return (
		<div
			ref={setNodeRef}
			style={{ display: "flex", flex: 1, minHeight: 0, outline: isOver ? "1.5px dashed rgba(128,138,160,0.5)" : undefined }}
		>
			{children}
		</div>
	);
}
