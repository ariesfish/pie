// Resources store (P2c): packages + skills, loaded from daemon commands.
// Extensions ride resources.overview (session-scoped).
import { create } from "zustand";

import type { PackageInfo, SkillInfo } from "@pie/protocol";

import { useConnectionStore } from "./connection-store";
import { useWorkspaceStore } from "./workspace-store";

/** Current workspace id (set when a session workspace is bound). */
function reloadWorkspaceId(): string | null {
	const ws = useWorkspaceStore.getState().workspaceId;
	if (ws) return ws;
	// 未绑定 workspace 时退回连接 workspace 输入（与 index 屏一致）。
	const conn = useConnectionStore.getState();
	return conn.conn ? null : null;
}

interface ResourcesState {
	packages: PackageInfo[];
	packagesLoading: boolean;
	installSource: string;
	installProject: boolean;
	installing: boolean;
	skills: SkillInfo[];
	skillsLoading: boolean;
	skillBody: string | null;
	skillBodyPath: string | null;

	refreshPackages: () => Promise<void>;
	refreshSkills: (sessionId: string) => Promise<void>;
	install: () => Promise<void>;
	removePackage: (source: string, project: boolean) => Promise<void>;
	updateAll: () => Promise<void>;
	setInstallSource: (v: string) => void;
	setInstallProject: (v: boolean) => void;
	openSkill: (sessionId: string, filePath: string) => Promise<void>;
	closeSkill: () => void;
}

export const useResourcesStore = create<ResourcesState>((set, get) => ({
	packages: [],
	packagesLoading: false,
	installSource: "",
	installProject: false,
	installing: false,
	skills: [],
	skillsLoading: false,
	skillBody: null,
	skillBodyPath: null,

	refreshPackages: async () => {
		const { workspaceId, conn } = needConn();
		if (!workspaceId) return;
		set({ packagesLoading: true });
		try {
			const res = await conn.request("packages.list", { workspaceId });
			set({ packages: res.packages, packagesLoading: false });
		} catch (err) {
			useConnectionStore.setState({ error: errText(err) });
			set({ packagesLoading: false });
		}
	},

	refreshSkills: async (sessionId) => {
		const { conn } = needConn();
		set({ skillsLoading: true });
		try {
			const res = await conn.request("skills.list", { sessionId });
			set({ skills: res.skills, skillsLoading: false });
		} catch (err) {
			useConnectionStore.setState({ error: errText(err) });
			set({ skillsLoading: false, skills: [] });
		}
	},

	install: async () => {
		const { workspaceId, conn } = needConn();
		if (!workspaceId) return;
		const { installSource, installProject } = get();
		if (!installSource.trim()) return;
		set({ installing: true });
		try {
			await conn.request("packages.install", {
				workspaceId,
				source: installSource.trim(),
				project: installProject,
			});
			set({ installSource: "", installing: false });
			await get().refreshPackages();
		} catch (err) {
			useConnectionStore.setState({ error: errText(err) });
			set({ installing: false });
		}
	},

	removePackage: async (source, project) => {
		const { workspaceId, conn } = needConn();
		if (!workspaceId) return;
		try {
			await conn.request("packages.remove", { workspaceId, source, project });
			await get().refreshPackages();
		} catch (err) {
			useConnectionStore.setState({ error: errText(err) });
		}
	},

	updateAll: async () => {
		const { workspaceId, conn } = needConn();
		if (!workspaceId) return;
		set({ installing: true });
		try {
			await conn.request("packages.update", { workspaceId });
			set({ installing: false });
			await get().refreshPackages();
		} catch (err) {
			useConnectionStore.setState({ error: errText(err) });
			set({ installing: false });
		}
	},

	setInstallSource: (v) => set({ installSource: v }),
	setInstallProject: (v) => set({ installProject: v }),

	openSkill: async (sessionId, filePath) => {
		const { conn } = needConn();
		set({ skillBody: null, skillBodyPath: filePath });
		try {
			const res = await conn.request("skills.read", { sessionId, filePath });
			set({ skillBody: res.content });
		} catch (err) {
			useConnectionStore.setState({ error: errText(err) });
			set({ skillBody: null, skillBodyPath: null });
		}
	},

	closeSkill: () => set({ skillBody: null, skillBodyPath: null }),
}));

function errText(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function needConn(): {
	workspaceId: string | null;
	conn: NonNullable<ReturnType<typeof useConnectionStore.getState>["conn"]>;
} {
	const conn = useConnectionStore.getState().conn;
	// workspaceId 挂在 workspace store（fs/git 同源）；未连接时抛错由调用 catch。
	if (!conn) throw new Error("not connected");
	return { workspaceId: reloadWorkspaceId(), conn };
}
