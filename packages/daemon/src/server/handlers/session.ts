import { HostSessionError } from "../../core/host-session.js";
import type { CommandRouter } from "../commands.js";
import { requiredString } from "./args.js";
import type { HandlerDeps } from "./deps.js";
import { permissionOptions, requireHost, requireWriter, resyncSnapshot } from "./shared.js";

export function registerSessionCommands(router: CommandRouter, deps: HandlerDeps): void {
	router.register("session.create", async (args) => {
		const cwd = requiredString(args, "workspaceId");
		const host = await deps.registry.openSession({
			cwd,
			mode: "new",
			emit: (ev) => deps.forwardBySession(ev),
			...permissionOptions(deps),
		});
		return { sessionId: host.sessionId, sessionFile: host.sessionFile };
	});

	router.register("session.attach", async (args, ctx) => {
		const sessionId = args["sessionId"] as string | undefined;
		const path = args["path"] as string | undefined;
		let host = sessionId ? deps.registry.get(sessionId) : undefined;
		if (!host && path) {
			host = await deps.registry.openSession({
				mode: "open",
				sessionPath: path,
				emit: (ev) => deps.forwardBySession(ev),
				...permissionOptions(deps),
			});
		}
		if (!host) throw new HostSessionError(`Session not open and no path given: ${String(sessionId)}`, "not_found");
		ctx.connection.subscribed.add(host.sessionId);
		// Presentation lock: first attach wins the write lock (P0).
		const wantsWrite = (args["as"] ?? "readwrite") === "readwrite" && host.writerConnection === null;
		if (wantsWrite) host.writerConnection = ctx.connection.id;
		const snapshot = host.snapshot();
		ctx.connection.assignSeqAndSend("session.snapshot", { snapshot });
		return {
			sessionId: host.sessionId,
			presentation: host.writerConnection === ctx.connection.id ? ("readwrite" as const) : ("readonly" as const),
			leafId: snapshot.leafId,
			runState: host.session.isCompacting
				? ("compacting" as const)
				: host.session.isStreaming
					? ("streaming" as const)
					: ("idle" as const),
		};
	});

	router.register("session.detach", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		ctx.connection.subscribed.delete(host.sessionId);
		if (host.writerConnection === ctx.connection.id) host.writerConnection = null;
		return {};
	});

	router.register("session.entries", async (args) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		return host.entriesPage({
			leafId: args["leafId"] as string | undefined,
			before: args["before"] as string | undefined,
			limit: typeof args["limit"] === "number" ? (args["limit"] as number) : undefined,
		});
	});

	router.register("session.prompt", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const lockError = requireWriter(host, ctx.connection);
		if (lockError) throw lockError;
		const message = requiredString(args, "message");
		const delivery = (args["delivery"] ?? "auto") as "auto" | "steer" | "followUp";
		const images = args["images"] as Array<{ data: string; mimeType: string }> | undefined;
		return await new Promise<{ disposition: "started" | "queued" | "handled" }>((resolve, reject) => {
			host.prompt(message, images, delivery, (disposition, error) => {
				if (disposition === "error") reject(new HostSessionError(error ?? "prompt failed", "pi_error"));
				else resolve({ disposition });
			});
		});
	});

	router.register("session.steer", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const lockError = requireWriter(host, ctx.connection);
		if (lockError) throw lockError;
		return { disposition: await host.steer(requiredString(args, "message"), args["images"] as never) };
	});

	router.register("session.followUp", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const lockError = requireWriter(host, ctx.connection);
		if (lockError) throw lockError;
		return { disposition: await host.followUp(requiredString(args, "message"), args["images"] as never) };
	});

	router.register("session.abort", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const lockError = requireWriter(host, ctx.connection);
		if (lockError) throw lockError;
		await host.abort();
		return {};
	});

	router.register("session.queue.clear", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const lockError = requireWriter(host, ctx.connection);
		if (lockError) throw lockError;
		return host.clearQueue();
	});

	router.register("session.navigate", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const lockError = requireWriter(host, ctx.connection);
		if (lockError) throw lockError;
		const entryId = requiredString(args, "entryId");
		const summarize = Boolean(args["summarize"]);
		const result = await host.navigate(entryId, summarize, args["label"] as string | undefined);
		// Observation resync: the tree walk changed without new appends.
		resyncSnapshot(deps, host);
		return result;
	});

	router.register("session.rename", async (args, ctx) => {
		const sessionId = requiredString(args, "sessionId");
		// Empty/whitespace-only name = explicit clear (SDK session_info semantics).
		const name = args["name"];
		if (typeof name !== "string") {
			throw new HostSessionError("Missing required string argument: name", "invalid_args");
		}
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) {
			// Not open: rename the on-disk session file directly (no attach).
			if (!(await deps.registry.renameOnDisk(sessionId, name))) {
				throw new HostSessionError(`Session not found: ${sessionId}`, "not_found");
			}
			return {};
		}
		const lockError = requireWriter(host, ctx.connection);
		if (lockError) throw lockError;
		host.rename(name);
		return {};
	});

	router.register("session.stats", async (args) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		return host.stats();
	});

	router.register("models.list", async (args) => {
		// Prefer an open session's ModelRuntime (fresh availability);
		// P1 fallback (user feedback first flight: the creator screen
		// asked for models before any session existed): a shared catalog
		// runtime over the agent dir's auth + models-store, no refresh.
		if (args["sessionId"]) {
			const host = requireHost(deps, args);
			if (host instanceof HostSessionError) throw host;
			return { models: host.models() };
		}
		const workspaceId = args["workspaceId"] as string | undefined;
		const host = deps.registry.open.find((h) => !workspaceId || h.cwd === workspaceId);
		if (host) return { models: host.models() };
		const catalog = await deps.getCatalogRuntime();
		return catalog ? { models: catalog() } : { models: [] };
	});

	router.register("model.set", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const lockError = requireWriter(host, ctx.connection);
		if (lockError) throw lockError;
		const model = args["model"] as { provider: string; id: string } | undefined;
		if (!model) throw new HostSessionError("model required", "invalid_args");
		const applied = host.setModel(model.provider, model.id, args["thinkingLevel"] as never);
		deps.broadcast(host.sessionId, "session.model.changed", { sessionId: host.sessionId, model: applied });
		return {
			model: applied,
			thinkingLevel: host.snapshot().state.thinkingLevel,
		};
	});

	router.register("thinking.set", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const lockError = requireWriter(host, ctx.connection);
		if (lockError) throw lockError;
		host.setThinking(requiredString(args, "level") as never);
		return {};
	});

	router.register("session.tree", async (args) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const snapshot = host.snapshot();
		return { tree: snapshot.tree, leafId: snapshot.leafId };
	});

	router.register("session.forkPreview", async (args) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		return { items: host.forkPreview() };
	});

	router.register("session.forkAt", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const lock = requireWriter(host, ctx.connection);
		if (lock) throw lock;
		const entryId = requiredString(args, "entryId");
		const position = (args["position"] ?? "at") as "at" | "before";
		const forked = await deps.registry.forkSession(host.sessionId, entryId, position, permissionOptions(deps));
		return forked;
	});

	router.register("compaction.run", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const lock = requireWriter(host, ctx.connection);
		if (lock) throw lock;
		return await host.compact(args["customInstructions"] as string | undefined);
	});

	router.register("compaction.setAuto", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const lock = requireWriter(host, ctx.connection);
		if (lock) throw lock;
		host.setAutoCompaction(Boolean(args["enabled"]));
		return {};
	});

	router.register("session.exportHtml", async (args) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const path = await host.exportHtml(args["outputPath"] as string | undefined);
		return { path };
	});

	router.register("retry.abort", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const lock = requireWriter(host, ctx.connection);
		if (lock) throw lock;
		host.abortRetry();
		return {};
	});

	router.register("bash.abort", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const lock = requireWriter(host, ctx.connection);
		if (lock) throw lock;
		host.abortBashCommand();
		return {};
	});

	router.register("scope.set", async (args, ctx) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const lock = requireWriter(host, ctx.connection);
		if (lock) throw lock;
		const scoped = (args["scoped"] as Array<{ provider: string; id: string; thinkingLevel?: never }>) ?? [];
		host.setScope(scoped);
		return {};
	});

	router.register("commands.list", async (args) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		return { commands: host.commandsOverview() };
	});
}
