// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/panels/panel-manifest.ts
// (Pie adaptation: manifests for pie's four target kinds. Semantics carried
// over: hosts limit where a tab can live, singletons dedupe per pane, and
// resourceKey is the retained-panel identity behind RetainedPanel mounts.)
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

export type PaneHost = "main" | "explorer";

export interface PanelManifest<K extends WorkspaceTabTarget["kind"] = WorkspaceTabTarget["kind"]> {
	kind: K;
	supportedHosts: readonly PaneHost[];
	showCloseButton: boolean;
	singleton: boolean;
	resourceKey(target: Extract<WorkspaceTabTarget, { kind: K }>): string;
}

type PanelManifestByKind = {
	[K in WorkspaceTabTarget["kind"]]: PanelManifest<K>;
};

const manifests = {
	new_tab: {
		kind: "new_tab",
		supportedHosts: ["main", "explorer"],
		showCloseButton: false,
		singleton: false,
		resourceKey: () => "new_tab",
	},
	session: {
		kind: "session",
		supportedHosts: ["main"],
		showCloseButton: true,
		singleton: false,
		resourceKey: (target) => target.sessionId,
	},
	files: {
		kind: "files",
		supportedHosts: ["main"],
		showCloseButton: true,
		singleton: true,
		resourceKey: () => "files",
	},
	changes: {
		kind: "changes",
		supportedHosts: ["main"],
		showCloseButton: true,
		singleton: true,
		resourceKey: () => "changes",
	},
} satisfies PanelManifestByKind;

export function getPanelManifest<K extends WorkspaceTabTarget["kind"]>(kind: K): PanelManifest<K> {
	return manifests[kind] as unknown as PanelManifest<K>;
}

export function panelSupportsHost(kind: WorkspaceTabTarget["kind"], host: PaneHost): boolean {
	return getPanelManifest(kind).supportedHosts.includes(host);
}

export function panelCanLaunchInPane(
	kind: WorkspaceTabTarget["kind"],
	panePanelKinds: readonly WorkspaceTabTarget["kind"][],
): boolean {
	return !getPanelManifest(kind).singleton || !panePanelKinds.includes(kind);
}

export function panelResourceKey(target: WorkspaceTabTarget): string {
	const manifest = getPanelManifest(target.kind);
	return `${target.kind}:${manifest.resourceKey(target as never)}`;
}
