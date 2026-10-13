/**
 * Package service (P2c): thin async wrapper around pi's DefaultPackageManager
 * — the same engine `pi install/remove/update/list` drives. The manager owns
 * settings persistence; each operation resolves fresh against disk so daemon
 * and CLI stay in sync (last writer wins, per Pi's file-based settings).
 */

import {
	DefaultPackageManager,
	SettingsManager,
	type PackageManager,
	type ProgressEvent,
} from "@earendil-works/pi-coding-agent";

import type { PackageInfo } from "@pie/protocol";

export class PackageError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

export class PackageService {
	private managers = new Map<string, PackageManager>();
	private progress: ((line: string) => void) | null = null;

	/** Progress tap (server logs; streaming progress is a later refinement). */
	onProgress(cb: ((line: string) => void) | null): void {
		this.progress = cb;
	}

	private manager(cwd: string, agentDir: string): PackageManager {
		const key = `${agentDir}\0${cwd}`;
		let pm = this.managers.get(key);
		if (!pm) {
			const settingsManager = SettingsManager.create(cwd, agentDir);
			pm = new DefaultPackageManager({
				cwd,
				agentDir,
				settingsManager,
			});
			pm.setProgressCallback((event: ProgressEvent) => {
				const line = [
					`${event.action} ${event.type}`,
					event.source,
					event.message,
				]
					.filter(Boolean)
					.join(" · ");
				this.progress?.(line);
			});
			this.managers.set(key, pm);
		}
		return pm;
	}

	async list(cwd: string, agentDir: string): Promise<{ packages: PackageInfo[] }> {
		const pm = this.manager(cwd, agentDir);
		const configured = await pm.listConfiguredPackages();
		return {
			packages: configured.map((p) => ({
				source: p.source,
				scope: p.scope,
				filtered: p.filtered,
				installedPath: p.installedPath ?? null,
			})),
		};
	}

	async install(
		cwd: string,
		agentDir: string,
		source: string,
		project: boolean,
	): Promise<{ source: string }> {
		if (!source.trim()) throw new PackageError("invalid_source", "empty package source");
		const pm = this.manager(cwd, agentDir);
		try {
			await pm.installAndPersist(source, { local: project });
		} catch (err) {
			throw new PackageError("install_failed", errText(err));
		}
		return { source };
	}

	async remove(
		cwd: string,
		agentDir: string,
		source: string,
		project: boolean,
	): Promise<{ removed: boolean }> {
		const pm = this.manager(cwd, agentDir);
		let removed: boolean;
		try {
			removed = await pm.removeAndPersist(source, { local: project });
		} catch (err) {
			throw new PackageError("remove_failed", errText(err));
		}
		return { removed };
	}

	async update(cwd: string, agentDir: string, source: string | undefined): Promise<{ updated: true }> {
		const pm = this.manager(cwd, agentDir);
		try {
			await pm.update(source);
		} catch (err) {
			throw new PackageError("update_failed", errText(err));
		}
		return { updated: true };
	}
}

function errText(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}
