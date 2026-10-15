// Ported from getpaseo/paseo (Apache-2.0) — FileVersionSchema shape.
// [pie] re-typed to the pie protocol (ADR-0006): a ready version *may* carry
// the daemon-composed FileVersionInfo (modifiedAt/size/revision) — fs.read
// observations always do; watcher events are path batches, so their ready
// edge notification (which just triggers a re-read) carries none. missing /
// error describe the file, not the watcher.
import type { FileVersionInfo } from "@pie/protocol";

export type LiveFileVersion =
	| { status: "ready"; version?: FileVersionInfo }
	| { status: "missing" }
	| { status: "error"; error?: string };

/** Footprint alias used by the editor cone (paseo names it FileVersion). */
export type FileVersion = LiveFileVersion;
