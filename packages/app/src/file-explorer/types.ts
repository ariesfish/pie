// Explorer data shapes (pie-native, [pie] port of the type surface paseo
// carries in stores/session-store: ExplorerEntry/ExplorerDirectory/SortOption).
// Values come from pie's daemon protocol (FsEntryInfo: kind "file" | "dir" |
// "symlink", size/mtime null when unavailable) — the tree/visibility logic in
// this directory is the paseo port, adapted to those value shapes.
import type { FsEntryInfo } from "@pie/protocol";

/** Directory-listing entry as the daemon reports it. */
export type ExplorerEntry = FsEntryInfo;

/** A loaded directory: path plus its (already fetched) entries. */
export interface ExplorerDirectory {
	path: string;
	entries: ExplorerEntry[];
}

/** Tree sort orders (paseo stores/panel-store SortOption). */
export type SortOption = "name" | "modified" | "size";

/**
 * The key the root listing is stored under ("" — the daemon's fs.list takes
 * no path for the root). Paseo's session-store keys the root as "."; pie's
 * workspace-store and the tree below use the empty string.
 */
export const EXPLORER_ROOT_PATH = "";

export type ExplorerFileKind = "text" | "image" | "binary";

export interface ExplorerFile {
	path: string;
	kind: ExplorerFileKind;
	/** Decoded UTF-8 text for text files; carries a leading \uFEFF when the file had a BOM. */
	content?: string;
	/** True when content started with a UTF-8 BOM (restore on write). */
	hasBom: boolean;
	/** Raw size in bytes. */
	size: number;
	/** True when the daemon capped the read (file larger than the limit). */
	truncated: boolean;
}
