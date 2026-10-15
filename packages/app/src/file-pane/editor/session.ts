// [pie] W3b-4 assembly hub: wires the ported FileEditorModel onto pie's
// transport — live-file observations (fs.read + workspace.fs.changed), and
// the ADR-0006 CAS write through PieConnection. Paseo composes this inside
// its file-pane screen; pie keeps it as a hook the files panel calls.
import { useEffect, useMemo, useState } from "react";
import type { PieConnection } from "@pie/client";

import { useLiveFile } from "../live-file/hook";
import { FileEditorModel, type FileEditorFile } from "./model";
import { createFileObservationSource } from "./observation-source";

export interface UseFileEditorInput {
	connection: PieConnection | null;
	workspaceId: string | null;
	path: string | null;
	enabled: boolean;
}

/**
 * One editor model per opened text file. Returns null until the first
 * ready observation (fs.read) lands — the model needs the file body plus
 * its ADR-0006 version to start clean.
 */
export function useFileEditor(input: UseFileEditorInput) {
	const live = useLiveFile({
		connection: input.connection,
		workspaceId: input.workspaceId,
		path: input.path,
		enabled: input.enabled,
		liveUpdates: true,
	});

	const [model, setModel] = useState<FileEditorModel | null>(null);

	const session = useMemo(() => {
		const { connection, workspaceId, path } = input;
		if (!connection || !workspaceId || !path) return null;
		return {
			async write(artifact: {
				content: string;
				expectedModifiedAt: string;
				expectedRevision?: string;
			}) {
				return connection.request("fs.write", {
					workspaceId,
					path,
					content: artifact.content,
					expectedModifiedAt: artifact.expectedModifiedAt,
					expectedRevision: artifact.expectedRevision,
				});
			},
		};
	}, [input.connection, input.workspaceId, input.path]);

	const observation = live.snapshot.observation;

	useEffect(() => {
		if (!session || !observation || observation.status !== "ready") {
			if (model) {
				model.dispose();
				setModel(null);
			}
			return;
		}
		if (model) return;
		const read = observation.file;
		if (read.binary || read.text === null) return;
		const version = observation.version;
		if (version.status !== "ready" || version.version == null) return;
		const file: FileEditorFile = {
			content: read.text,
			hasBom: read.text.length > 0 && read.text.charCodeAt(0) === 0xfeff,
			version: { status: "ready", version: version.version },
		};
		setModel(new FileEditorModel({ file, session }));
	}, [model, session, observation]);

	// Feed the live observation stream (disk changes, deletions, check
	// errors) into the editor's conflict machinery.
	useEffect(() => {
		if (!model || !live.model) return;
		model.connectFileObservations(
			createFileObservationSource({
				subscribe: live.model.subscribe,
				getObservation: live.model.getObservation,
				refresh: live.model.refresh,
			}),
		);
		return () => model.disconnectFileObservations();
	}, [model, live.model]);

	useEffect(() => {
		return () => model?.dispose();
	}, [model]);

	return { model, fetching: live.isFetching };
}
