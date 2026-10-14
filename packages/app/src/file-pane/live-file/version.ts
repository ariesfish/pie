// [pie] pie's watcher (workspace.fs.changed) reports batched workspace
// paths, not per-file versions — a version here only marks a change
// boundary, so "ready" carries no metadata. The missing/error states stay
// typed for the daemon's future per-file events.
export type LiveFileVersion =
	| { status: "ready" }
	| { status: "missing" }
	| { status: "error"; error?: string };
