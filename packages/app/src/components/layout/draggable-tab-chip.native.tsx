// Native pass-through for the web draggable chip (same import path).
import type { ReactNode } from "react";

export interface DraggableTabChipProps {
	tabId: string;
	paneId: string;
	children: ReactNode;
	pushed?: boolean;
	dragged?: boolean;
}

export function DraggableTabChip({ children }: DraggableTabChipProps) {
	return <>{children}</>;
}
