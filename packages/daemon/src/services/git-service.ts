/**
 * Workspace git service (P2b, read-only): status and working-tree diff via
 * spawn('git'). Paseo drives the same primitives with a heavyweight
 * cache/observation layer (workspace-git-service.ts, ~140KB); Pie keeps the
 * direct-command shape first and will add caching when profiles demand it.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

import type { GitDiffFile, GitStatusEntry, GitStatusResult } from "@pie/protocol";

const exec = promisify(execFile);
const STATUS_TIMEOUT_MS = 10_000;

export class GitError extends Error {
	code: string;
	/** Preserved when a failed command still produced parseable stdout
	 *  (e.g. `git diff --no-index` exits 1 with a valid patch). */
	stdout?: string;
	constructor(code: string, message: string, stdout?: string) {
		super(message);
		this.code = code;
		if (stdout !== undefined) this.stdout = stdout;
	}
}

/** Parse `git status --porcelain -b -z` (NUL-separated). */
export function parseStatusZ(raw: string): { branch: string | null; entries: GitStatusEntry[] } {
	const tokens = raw.split("\0");
	let branch: string | null = null;
	const entries: GitStatusEntry[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]!;
		if (token.length === 0) continue;
		if (token.startsWith("#")) {
			// `## main` or `## main...origin/main [ahead 1, behind 2]`
			const after = token.slice(3);
			const m = /^(\S+?)(?:\.\.\.|\s|$)/.exec(after);
			if (m && m[1]) branch = m[1];
			continue;
		}
		if (token.length < 4) continue;
		const index = token[0]!;
		const worktree = token[1]!;
		const path = token.slice(3);
		let origPath: string | undefined;
		// porcelain -z renames/copies: `XY NQF <new>\0<old>` — the origin
		// path is the NEXT NUL-separated token.
		if ((index === "R" || index === "C" || worktree === "R" || worktree === "C") && tokens[i + 1]) {
			origPath = tokens[i + 1];
			i += 1;
		}
		entries.push({
			path,
			origPath,
			index,
			worktree,
			untracked: index === "?",
		});
	}
	return { branch, entries };
}

/** Map status letters to a coarse change kind for diff views. */
export function changeKindOf(entry: GitStatusEntry): GitDiffFile["change"] {
	const c = entry.index === "?" ? entry.worktree : entry.index;
	if (c === "A") return "added";
	if (c === "D") return "deleted";
	if (c === "R") return "renamed";
	if (c === "C") return "copied";
	if (c === "?") return "untracked";
	return "modified";
}

export class GitService {
	/** Run git in cwd; ENOENT/no-repo map to typed errors, never to stdout. */
	private async git(cwd: string, args: string[]): Promise<string> {
		try {
			const { stdout } = await exec("git", args, {
				cwd,
				maxBuffer: 16 * 1024 * 1024,
				timeout: STATUS_TIMEOUT_MS,
			});
			return stdout;
		} catch (err) {
			const e = err as NodeJS.ErrnoException & {
				stderr?: string;
				stdout?: string;
				killed?: boolean;
			};
			if (e.code === "ENOENT") {
				throw new GitError("git_unavailable", "git executable not found on the daemon host");
			}
			if (typeof e.stderr === "string" && /not a git repository/i.test(e.stderr)) {
				throw new GitError("not_a_repo", "workspace is not a git repository");
			}
			if (e.killed) {
				throw new GitError("timeout", `git ${args[0]} timed out`);
			}
			const message = e.stderr || e.message || "git failed";
			throw new GitError("git_failed", message.trim(), e.stdout);
		}
	}

	async status(root: string): Promise<GitStatusResult> {
		const raw = await this.git(root, ["status", "--porcelain=v1", "-b", "-z"]);
		const { branch, entries } = parseStatusZ(raw);
		let upstream: { ahead: number; behind: number } | null = null;
		const rawAB = await this.git(root, [
			"rev-list",
			"--left-right",
			"--count",
			"@{upstream}...HEAD",
		]).catch(() => null);
		if (rawAB) {
			const parts = rawAB.trim().split(/\s+/).map((n) => Number.parseInt(n, 10)) as [number?, number?];
			const behind = parts[0] ?? NaN;
			const ahead = parts[1] ?? NaN;
			if (Number.isFinite(ahead) && Number.isFinite(behind)) upstream = { ahead, behind };
		}
		return { repoRoot: root, branch, upstream, entries };
	}

	/**
	 * Working-tree diff. `staged` swaps to `git diff --cached HEAD`; untracked
	 * files are synthesized as additions by reading their content (opt-in).
	 */
	async diff(
		root: string,
		opts: { path?: string; staged?: boolean; includeUntracked?: boolean },
	): Promise<{ files: GitDiffFile[] }> {
		const status = await this.status(root);
		const files: GitDiffFile[] = [];
		const env = status.entries.filter(
			(e) => !opts.path || e.path === opts.path || e.origPath === opts.path,
		);

		const diffTargets = env.filter((e) => !e.untracked);
		if (diffTargets.length > 0) {
			const args = ["diff", "--no-color", "--no-ext-diff"];
			if (opts.staged) args.push("--cached", "HEAD");
			if (opts.path) args.push("--", opts.path);
			else args.push("--");
			const raw = await this.git(root, args);
			for (const f of parseUnifiedDiff(raw)) files.push(f);
		}

		if (opts.includeUntracked) {
			for (const e of env.filter((x) => x.untracked && !x.origPath)) {
				// Best-effort: untracked content becomes an add patch via
				// `git diff --no-index /dev/null <path>` ( exits 1; stdout still parses).
				const raw = await this.git(root, [
					"diff",
					"--no-color",
					"--no-ext-diff",
					"--no-index",
					"--",
					"/dev/null",
					e.path,
				]).catch((err: unknown) => {
					// git diff --no-index exits 1 with a valid patch on stdout.
					const out = (err as { stdout?: string }).stdout;
					return typeof out === "string" && out.length > 0 ? out : null;
				});
				if (raw) {
					const parsed = parseUnifiedDiff(raw);
					if (parsed.length > 0) files.push({ ...parsed[0]!, path: e.path, change: "untracked" });
				} else {
					files.push({ path: e.path, change: "untracked", patch: "", binary: false });
				}
			}
		}
		return { files };
	}
}

/** Split one unified diff stream into per-file bodies (paths normalized to POSIX). */
export function parseUnifiedDiff(raw: string): GitDiffFile[] {
	const out: GitDiffFile[] = [];
	let current: GitDiffFile | null = null;
	for (const line of raw.split("\n")) {
		// `diff --git a/<old> b/<new>` — the b side is the working-tree name.
		const m = /^diff --git "?(?:a\/(.+?))? ?"?"?b\/(.+?)"?$/.exec(line);
		if (m) {
			if (current) out.push(current);
			current = {
				path: normPath(m[2]!),
				change: "modified",
				patch: "",
				binary: false,
				...(m[1] && m[1] !== m[2] ? { origPath: normPath(m[1]) } : {}),
			};
			continue;
		}
		if (!current) continue;
		if (line.startsWith("new file mode")) current.change = "added";
		else if (line.startsWith("deleted file mode")) current.change = "deleted";
		else if (line.startsWith("Binary files")) current.binary = true;
		else if (line.startsWith("rename from")) current.change = "renamed";
		else if (line.startsWith("GIT binary patch")) current.binary = true;
		current.patch += line + "\n";
	}
	if (current) out.push(current);
	return out;
}

function normPath(p: string): string {
	return p.replace(/\\/g, "/");
}
