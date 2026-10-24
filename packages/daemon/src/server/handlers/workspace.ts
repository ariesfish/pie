import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { HostSessionError } from "../../core/host-session.js";
import { isIgnoredName } from "../../services/fs-service.js";
import type { CommandRouter } from "../commands.js";
import { optionalString, optString, requiredString } from "./args.js";
import type { HandlerDeps } from "./deps.js";

export function registerWorkspaceCommands(router: CommandRouter, deps: HandlerDeps): void {
	// --- workspace filesystem + git (P2b) --------------------------------------
	router.register("fs.list", async (args) => {
		const workspaceId = requiredString(args, "workspaceId");
		const path = optionalString(args, "path");
		return { entries: await deps.fsService.list(workspaceId, path) };
	});
	router.register("fs.read", async (args) => {
		const workspaceId = requiredString(args, "workspaceId");
		const path = requiredString(args, "path");
		const maxBytes = typeof args["maxBytes"] === "number" ? (args["maxBytes"] as number) : undefined;
		return deps.fsService.read(workspaceId, path, maxBytes);
	});
	router.register("fs.write", async (args) => {
		const workspaceId = requiredString(args, "workspaceId");
		const path = requiredString(args, "path");
		const content = requiredString(args, "content");
		const expectedModifiedAt = optString(args, "expectedModifiedAt");
		const expectedRevision = optString(args, "expectedRevision");
		return deps.fsService.write(workspaceId, path, content, {
			modifiedAt: expectedModifiedAt,
			revision: expectedRevision,
		});
	});
	router.register("fs.watch", async (args, ctx) => {
		const workspaceId = requiredString(args, "workspaceId");
		const watchId = await deps.fsService.watchWorkspace(workspaceId, workspaceId);
		// Reuse the connection's subscribed set so workspace.fs.changed
		// reaches exactly the connections interested in this workspace.
		ctx.connection.subscribed.add(workspaceId);
		return { watchId };
	});
	router.register("fs.unwatch", async (args) => {
		const watchId = requiredString(args, "watchId");
		deps.fsService.unwatch(watchId);
		return {};
	});
	router.register("git.status", async (args) => {
		const workspaceId = requiredString(args, "workspaceId");
		return deps.gitService.status(workspaceId);
	});
	router.register("git.diff", async (args) => {
		const workspaceId = requiredString(args, "workspaceId");
		const path = optionalString(args, "path");
		const staged = args["staged"] === true;
		const includeUntracked = args["includeUntracked"] === true;
		return deps.gitService.diff(workspaceId, { path, staged, includeUntracked });
	});

	router.register("workspace.open", async (args) => {
		const path = requiredString(args, "path");
		// Validate before remembering: the UI's add-workspace flow reports
		// typos immediately instead of failing on the first fs.list later.
		let isDir = false;
		try {
			isDir = statSync(path).isDirectory();
		} catch {
			isDir = false;
		}
		if (!isDir) {
			throw new HostSessionError(
				`Workspace directory not found: ${path}`,
				"not_found",
			);
		}
		deps.registry.rememberWorkspace(path);
		return {
			workspaceId: path,
			path,
			name: path.split("/").filter(Boolean).pop() ?? path,
			trusted: true as boolean | null,
		};
	});

	router.register("session.list", async (args) => {
		const workspaceId = requiredString(args, "workspaceId");
		const recursive = args["recursive"] === true;
		return { sessions: await deps.registry.listSessions(workspaceId, recursive) };
	});

	router.register("workspace.projects", async (args) => {
		const workspaceId = requiredString(args, "workspaceId");
		const projects: Array<{ path: string; name: string }> = [];
		let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
		try {
			entries = await readdir(workspaceId, { withFileTypes: true });
		} catch {
			return { projects };
		}
		for (const entry of entries) {
			if (!entry.isDirectory.call(entry)) continue;
			if (isIgnoredName(entry.name)) continue;
			const dirPath = join(workspaceId, entry.name);
			if (!existsSync(join(dirPath, ".git"))) continue;
			projects.push({ path: dirPath, name: entry.name });
		}
		projects.sort((a, b) => a.name.localeCompare(b.name));
		return { projects };
	});
}
