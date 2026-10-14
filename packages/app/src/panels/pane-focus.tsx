// Ported from getpaseo/paseo (Apache-2.0) — panels/pane-context.tsx (focus
// slice only). [pie] the full pane-context (target/openTab model over
// workspace-tabs) arrives with the file-pane rewiring; the find bar needs
// just the focus triad today.
import { createContext, useContext, type ReactNode } from "react";
import invariant from "tiny-invariant";

export interface PaneFocusContextValue {
	isWorkspaceFocused: boolean;
	isPaneFocused: boolean;
	isInteractive: boolean;
	focusPane: () => void;
}

const PaneFocusContext = createContext<PaneFocusContextValue | null>(null);
const noopFocusPane = () => {};

export function createPaneFocusContextValue(input: {
	isWorkspaceFocused: boolean;
	isPaneFocused: boolean;
	onFocusPane?: () => void;
}): PaneFocusContextValue {
	return {
		isWorkspaceFocused: input.isWorkspaceFocused,
		isPaneFocused: input.isPaneFocused,
		isInteractive: input.isWorkspaceFocused && input.isPaneFocused,
		focusPane: input.onFocusPane ?? noopFocusPane,
	};
}

export function PaneFocusProvider({
	value,
	children,
}: {
	value: PaneFocusContextValue;
	children: ReactNode;
}) {
	return <PaneFocusContext.Provider value={value}>{children}</PaneFocusContext.Provider>;
}

export function usePaneFocus(): PaneFocusContextValue {
	const value = useContext(PaneFocusContext);
	invariant(value, "PaneFocusContext is required");
	return value;
}
