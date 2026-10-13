// Native pass-through for the web dnd shell (same import path). Native drag
// arrives with a gesture port; until then the tree renders without dnd.
import { createContext, useContext, type ReactNode } from "react";

interface SplitDndContextValue {
	activeTabId: string | null;
}

const SplitDndContext = createContext<SplitDndContextValue>({ activeTabId: null });

export function useSplitDnd(): SplitDndContextValue {
	return useContext(SplitDndContext);
}

export function SplitDndShell({ children }: { children: ReactNode }) {
	return <>{children}</>;
}
