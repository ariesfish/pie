// Ported from getpaseo/paseo (Apache-2.0) — file-pane/live-file/hook.ts.
// [pie] rewritten against PieConnection: reads go through fs.read; versions
// arrive as batched workspace.fs.changed events, so the subscription filters
// the batched paths for this file and reports bare ready versions (see
// ./version.ts). fs.watch is idempotent per workspace — the request both
// starts the daemon watcher (if absent) and piggybacks the shared stream.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { PieConnection } from "@pie/client";

import { LiveFileModel, type LiveFileSession, type LiveFileVersion } from "./model";

export function useLiveFile(input: {
	connection: PieConnection | null;
	workspaceId: string | null;
	path: string | null;
	enabled: boolean;
	liveUpdates: boolean;
}) {
	const [model] = useState(() => new LiveFileModel());
	const session = useMemo<LiveFileSession | null>(() => {
		const { connection, workspaceId } = input;
		if (!connection || !workspaceId) return null;
		return {
			async subscribe(target, onVersion) {
				const version: LiveFileVersion = { status: "ready" };
				// The daemon watcher is shared per workspace (idempotent);
				// requesting it here also guarantees the event stream exists
				// even when no other surface started it.
				await connection.request("fs.watch", { workspaceId }).catch(() => undefined);
				const unsubscribe = connection.onEvent((event) => {
					if (event.ev !== "workspace.fs.changed") return;
					if (!event.data.paths.includes(target.path)) return;
					onVersion(version);
				});
				return { initial: version, unsubscribe };
			},
			async read(target) {
				// [pie] ADR-0006: fs.read returns the file's version snapshot
				// alongside the content; ready observations carry it.
				return connection.request("fs.read", {
					workspaceId,
					path: target.path,
				});
			},
		};
	}, [input.connection, input.workspaceId]);

	useEffect(() => {
		if (!input.enabled || !session || !input.path) {
			model.close();
			return;
		}
		model.open({
			session,
			// [pie] pie's watcher is workspace-scoped (no cwd/path target); the
			// path rides along for the event filter and fs.read above.
			target: { cwd: input.workspaceId ?? "", path: input.path },
			liveUpdates: input.liveUpdates,
		});
		return () => model.close();
	}, [input.enabled, input.liveUpdates, input.path, input.workspaceId, model, session]);

	const snapshot = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
	return {
		file: snapshot.observation?.status === "ready" ? snapshot.observation.file : null,
		error: snapshot.read.status === "error" ? snapshot.read.error : null,
		// Effects start reads after the first render. An enabled target is therefore
		// already in the producer's initial/retargeting display state.
		isFetching:
			input.enabled &&
			(snapshot.read.status === "pending" ||
				(snapshot.read.status === "idle" && snapshot.observation === null)),
		isRetrying: snapshot.read.status === "pending" && snapshot.read.requested,
		refresh: model.refresh,
		model,
		snapshot,
	};
}
