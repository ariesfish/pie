// Ported from getpaseo/paseo (Apache-2.0) dnd wiring pattern (web-only files).
// Draggable tab chip for the pane tab strips — on native this is a pass-through
// (no drag); drag arrives with a native gesture port.
import { useSortable } from "@dnd-kit/sortable";
import type { ReactNode } from "react";

export interface DraggableTabChipProps {
	tabId: string;
	paneId: string;
	/** The rendered tab (press, label, close button). */
	children: ReactNode;
	pushed?: boolean;
	dragged?: boolean;
}

export function DraggableTabChip({ tabId, paneId, children, pushed }: DraggableTabChipProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: tabId,
		data: { kind: "workspace-tab", tabId, paneId },
		disabled: pushed,
	});
	const style: React.CSSProperties = {
		transform: transform
			? `translate3d(${transform.x}px, ${transform.y}px, 0)`
			: undefined,
		transition,
		opacity: isDragging ? 0.35 : 1,
		cursor: "grab",
	};
	return (
		<div
			ref={setNodeRef}
			style={style}
			// The activator is inside the chip (long-press style drag start);
			// press handlers keep working outside a 8px activation distance.
			{...attributes}
			{...listeners}
		>
			<span ref={setActivatorNodeRef} style={{ display: "contents" }}>
				{children}
			</span>
		</div>
	);
}
