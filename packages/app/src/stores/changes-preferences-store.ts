// [pie] T-017: changes display preferences — layout (unified/split) + line
// wrapping, persisted per pie's storage idiom (localStorage + zustand store;
// data layer adapted, not copied, per ADR-0005). resolveDiffLayout carries
// paseo's degradation semantics (no split on narrow/native form factors).
import { create } from "zustand";

export interface ChangesPreferences {
	layout: "unified" | "split";
	wrapLines: boolean;
}

export const DEFAULT_CHANGES_PREFERENCES: ChangesPreferences = {
	layout: "unified",
	// Pie shipped wrap-on at W3c-4; keep that behavior as the default.
	wrapLines: true,
};

export const CHANGES_PREFERENCES_STORAGE_KEY = "@pie:changes-preferences";

function loadFromStorage(): ChangesPreferences {
	if (typeof localStorage === "undefined") return DEFAULT_CHANGES_PREFERENCES;
	try {
		const raw = localStorage.getItem(CHANGES_PREFERENCES_STORAGE_KEY);
		if (!raw) return DEFAULT_CHANGES_PREFERENCES;
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return DEFAULT_CHANGES_PREFERENCES;
		const layout = (parsed as { layout?: unknown }).layout;
		const wrapLines = (parsed as { wrapLines?: unknown }).wrapLines;
		return {
			layout: layout === "split" ? "split" : "unified",
			wrapLines: wrapLines === false ? false : true,
		};
	} catch {
		return DEFAULT_CHANGES_PREFERENCES;
	}
}

function persist(next: ChangesPreferences): void {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(CHANGES_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
	} catch {
		/* best effort */
	}
}

interface ChangesPreferencesState {
	preferences: ChangesPreferences;
	setLayout: (layout: ChangesPreferences["layout"]) => void;
	setWrapLines: (wrapLines: boolean) => void;
}

export const useChangesPreferences = create<ChangesPreferencesState>((set) => ({
	preferences: loadFromStorage(),
	setLayout: (layout) => {
		set((st) => {
			const next = { ...st.preferences, layout };
			persist(next);
			return { preferences: next };
		});
	},
	setWrapLines: (wrapLines) => {
		set((st) => {
			const next = { ...st.preferences, wrapLines };
			persist(next);
			return { preferences: next };
		});
	},
}));

/** Paseo semantics: split needs room (web, non-compact) — else degrade to unified. */
export function resolveDiffLayout(
	layout: ChangesPreferences["layout"],
	canUseSplitLayout: boolean,
): "unified" | "split" {
	return canUseSplitLayout ? layout : "unified";
}
