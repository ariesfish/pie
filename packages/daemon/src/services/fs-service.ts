/**
 * Workspace filesystem service (P2b): listing, capped reads and a batched
 * file watcher for open workspaces. Read-only observation — all mutations
 * flow through Pi's tools. Design follows paseo's workspace git service
 * shape (subscription registry + batched change events) at a fraction of
 * the surface.
 */

import { watch, type FSWatcher } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import type { Broadcaster } from "../server/commands.js";
import type { FsEntryInfo, FsReadResult } from "@pie/protocol";

const DEFAULT_MAX_READ_BYTES = 256 * 1024;
const READ_HARD_CAP = 2 * 1024 * 1024;
const WRITE_HARD_CAP = 2 * 1024 * 1024;
const WATCH_DEBOUNCE_MS = 150;
const WATCH_BATCH_LIMIT = 1_000;

export class FsError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

interface WatchHandle {
	watchId: string;
	workspaceId: string;
	root: string;
	watcher: FSWatcher;
	timer: ReturnType<typeof setTimeout> | null;
	pending: Set<string>;
	closed: boolean;
}

export class FsService {
	private handles = new Map<string, WatchHandle>();
	private broadcaster: Broadcaster | null = null;
	private nextId = 1;

	setBroadcaster(broadcaster: Broadcaster | null): void {
		this.broadcaster = broadcaster;
	}

	/** List one directory level, sorted (dirs first). Ignores well-known junk. */
	async list(root: string, relPath: string | undefined): Promise<FsEntryInfo[]> {
		const dir = relPath ? join(root, relPath) : root;
		let dirents;
		try {
			dirents = await readdir(dir, { withFileTypes: true });
		} catch (err) {
			const e = err as NodeJS.ErrnoException;
			if (e.code === "ENOTDIR" || e.code === "ENOENT") {
				throw new FsError("not_found", `No such directory: ${relPath ?? "."}`);
			}
			if (e.code === "ENOTDIR" || e.code === "EACCES") {
				throw new FsError("forbidden", `Cannot list: ${relPath ?? "."}`);
			}
			throw err;
		}
		const out: FsEntryInfo[] = [];
		for (const dirent of dirents) {
			if (isIgnoredName(dirent.name)) continue;
			const entryPath = toPosix(join(relPath ?? "", dirent.name));
			let size: number | null = null;
			let modifiedAt: string | null = null;
			try {
				const st = await stat(join(dir, dirent.name));
				size = st.isFile() ? st.size : 0;
				modifiedAt = st.mtime.toISOString();
			} catch {
				// dangling symlink / raced — keep nulls
			}
			const kind: FsEntryInfo["kind"] = dirent.isDirectory()
				? "dir"
				: dirent.isSymbolicLink()
					? "symlink"
					: "file";
			out.push({ path: entryPath, name: dirent.name, kind, size, modifiedAt });
		}
		out.sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		return out;
	}

	/** Read one file, binary-safe and size-capped. */
	async read(
		root: string,
		relPath: string,
		maxBytes: number | undefined,
	): Promise<FsReadResult> {
		const file = join(root, relPath);
		const cap = Math.min(maxBytes ?? DEFAULT_MAX_READ_BYTES, READ_HARD_CAP);
		const st = await stat(file).catch(() => {
			throw new FsError("not_found", `No such file: ${relPath}`);
		});
		if (st.isDirectory()) throw new FsError("not_found", `Not a file: ${relPath}`);
		const buf = await readFile(file).catch((err: NodeJS.ErrnoException) => {
			if (err.code === "EACCES") throw new FsError("forbidden", `Cannot read: ${relPath}`);
			throw new FsError("not_found", `No such file: ${relPath}`);
		});
		const head = buf.subarray(0, 8192);
		const binary = head.includes(0);
		const truncated = buf.byteLength > cap;
		const slice = truncated ? buf.subarray(0, cap) : buf;
		return {
			path: toPosix(relPath),
			text: binary ? null : slice.toString("utf8"),
			bytes: buf.byteLength,
			truncated,
			binary,
		};
	}

	/** Whole-file text write (atomic tmp+rename, size-capped, workspace paths only). */
	async write(root: string, relPath: string, content: string): Promise<{ path: string; bytes: number }> {
		const file = join(root, relPath);
		if (relPath.includes("..") || relPath.startsWith("/"))
			throw new FsError("forbidden", "path must be workspace-relative");
		const buf = Buffer.from(content, "utf8");
		if (buf.byteLength > WRITE_HARD_CAP)
			throw new FsError("too_large", `write exceeds ${WRITE_HARD_CAP} byte cap`);
		const tmp = `${file}.pie-tmp-${process.pid}-${Date.now().toString(36)}`;
		await writeFile(tmp, buf).catch((err: NodeJS.ErrnoException) => {
			if (err.code === "EACCES" || err.code === "ENOENT")
				throw new FsError("forbidden", `cannot write: ${relPath}`);
			throw err;
		});
		await rename(tmp, file).catch(async (err: NodeJS.ErrnoException) => {
			await rmFile(tmp).catch(() => undefined);
			throw new FsError("forbidden", `cannot write: ${relPath} (${err.code ?? "unknown"})`);
		});
		return { path: toPosix(relPath), bytes: buf.byteLength };
	}

	/** Start (or return the existing) recursive watch for a workspace. */
	async watchWorkspace(workspaceId: string, root: string): Promise<string> {
		const existing = [...this.handles.values()].find((h) => h.workspaceId === workspaceId);
		if (existing) return existing.watchId;
		const watchId = `fsw-${this.nextId++}`;
		const handle: WatchHandle = {
			watchId,
			workspaceId,
			root,
			watcher: watch(root, { recursive: true }, (event, filename) => {
				if (typeof filename !== "string") return;
				const rel = toPosix(filename);
				if (rel.split("/").some((seg) => isIgnoredName(seg))) return;
				handle.pending.add(rel);
				if (handle.timer) return;
				handle.timer = setTimeout(() => {
					handle.timer = null;
					this.flush(handle);
				}, WATCH_DEBOUNCE_MS);
			}),
			timer: null,
			pending: new Set(),
			closed: false,
		};
		this.handles.set(watchId, handle);
		return watchId;
	}

	unwatch(watchId: string): void {
		const handle = this.handles.get(watchId);
		if (!handle) throw new FsError("not_found", `No such watch: ${watchId}`);
		this.closeHandle(handle);
	}

	/** Stop everything (daemon shutdown). */
	closeAll(): void {
		for (const handle of this.handles.values()) this.closeHandle(handle);
	}

	private closeHandle(handle: WatchHandle): void {
		if (handle.closed) return;
		handle.closed = true;
		if (handle.timer) clearTimeout(handle.timer);
		handle.watcher.close();
		this.handles.delete(handle.watchId);
	}

	private flush(handle: WatchHandle): void {
		if (handle.closed || handle.pending.size === 0) return;
		const paths = [...handle.pending].slice(0, WATCH_BATCH_LIMIT);
		handle.pending.clear();
		this.broadcaster?.("workspace.fs.changed", { workspaceId: handle.workspaceId, paths, watchId: handle.watchId }, handle.workspaceId);
	}
}

const rmFile = (p: string) => rm(p, { force: true });

function toPosix(p: string): string {
	return p.split(sep).join("/");
}

/** Cheap ignore list (P2b-1): well-known non-project directories and VCS internals. */
const IGNORED_NAMES = new Set([
	".git",
	"node_modules",
	".venv",
	"venv",
	"__pycache__",
	".DS_Store",
	"dist",
	"build",
	".cache",
	".next",
	".turbo",
	"target",
]);

function isIgnoredName(name: string): boolean {
	return IGNORED_NAMES.has(name);
}
