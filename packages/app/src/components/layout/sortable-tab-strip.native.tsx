// Native pass-through for the sortable tab strip (same import path).
import type { ReactNode } from "react";

export interface SortableTabStripProps {
	ids: string[];
	children: ReactNode;
}

export function SortableTabStrip({ children }: SortableTabStripProps) {
	return <>{children}</>;
}
