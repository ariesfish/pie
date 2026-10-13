// Native pass-through for the web drop target (same import path).
import type { ReactNode } from "react";

export interface SplitDropTargetProps {
	paneId: string;
	active: boolean;
	zone: "pane" | "pane-body";
	children: ReactNode;
}

export function SplitDropTarget({ children }: SplitDropTargetProps) {
	return <>{children}</>;
}
