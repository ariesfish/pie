// [pie] W3e palette open/close state (module store). Paseo drives visibility
// from its keyboard-shortcut store; pie's keyboard system lands in W4 — the
// palette wraps in a tiny store so both the header button and the web
// Cmd/Ctrl+K listener can drive it.
import { create } from "zustand";

interface CommandCenterState {
	open: boolean;
	openCommandCenter: () => void;
	closeCommandCenter: () => void;
	toggleCommandCenter: () => void;
}

export const useCommandCenterStore = create<CommandCenterState>((set) => ({
	open: false,
	openCommandCenter: () => set({ open: true }),
	closeCommandCenter: () => set({ open: false }),
	toggleCommandCenter: () => set((s) => ({ open: !s.open })),
}));
