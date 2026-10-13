// Web implementation of the sortable tab strip: rides dnd-kit's
// SortableContext (same-pane reorder lands in the shell's onDragEnd).
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import type { ReactNode } from "react";

export interface SortableTabStripProps {
	ids: string[];
	children: ReactNode;
}

export function SortableTabStrip({ ids, children }: SortableTabStripProps) {
	return (
		<SortableContext items={ids} strategy={horizontalListSortingStrategy}>
			{children}
		</SortableContext>
	);
}
