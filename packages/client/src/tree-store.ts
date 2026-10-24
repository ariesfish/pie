/**
 * Session tree sync store (architecture.md §5.6-D, §5.7).
 *
 * Authoritative client state: the tree (id -> node meta), the active leaf, and
 * entries along the active path. The visible timeline is *derived* as the
 * root -> leaf entry path — never stored separately.
 */

import {
	type CommandResult,
	type EventEnvelope,
	type SessionEntry,
	type SessionSnapshot,
	type SessionStateInfo,
	type TreeNodeMeta,
} from "@pie/protocol";

export class GapDetectedError extends Error {
	constructor(
		readonly gapFrom: number,
		readonly gapTo: number,
	) {
		super(`Event gap detected: expected ${gapFrom}, got ${gapTo}`);
		this.name = "GapDetectedError";
	}
}

export interface TreeStats {
	readonly nodes: number;
	readonly entries: number;
	readonly branchTips: number;
}

export class SessionTreeStore {
	private treeMap = new Map<string, TreeNodeMeta>();
	private entries = new Map<string, SessionEntry>();
	private leafId: string | null = null;
	private snap: SessionSnapshot | null = null;
	private window: { hasMore: boolean; nextCursor: string | null } = {
		hasMore: false,
		nextCursor: null,
	};
	private queues: { steering: string[]; followUp: string[] } = { steering: [], followUp: [] };
	private state: SessionStateInfo | null = null;

	get sessionId(): string | undefined {
		return this.snap?.sessionId;
	}
	get snapshot(): SessionSnapshot | null {
		return this.snap;
	}
	get currentLeafId(): string | null {
		return this.leafId;
	}
	get hasOlderEntries(): boolean {
		return this.window.hasMore;
	}
	get olderCursor(): string | null {
		return this.window.nextCursor;
	}
	get currentQueues(): { steering: string[]; followUp: string[] } {
		return this.queues;
	}
	get currentState(): SessionStateInfo | null {
		return this.state;
	}
	get stats(): TreeStats {
		let branchTips = 0;
		for (const node of this.treeMap.values()) {
			if (!this.childrenOf(node.id).length) branchTips++;
		}
		return { nodes: this.treeMap.size, entries: this.entries.size, branchTips };
	}

	/** Idempotent: (re)initialize from a snapshot. */
	applySnapshot(snapshot: SessionSnapshot): void {
		this.snap = snapshot;
		this.treeMap = new Map(snapshot.tree.map((n) => [n.id, n]));
		this.entries = new Map(snapshot.entries.map((e) => [e.id, e]));
		this.leafId = snapshot.leafId;
		this.window = snapshot.entryWindow ?? { hasMore: false, nextCursor: null };
		this.queues = { steering: [...snapshot.queues.steering], followUp: [...snapshot.queues.followUp] };
		this.state = snapshot.state;
	}

	/**
	 * Prepend a page fetched with `session.entries { before }`. The tree already
	 * knows every node from the snapshot; only the entry payloads are missing.
	 */
	prependEntries(
		entries: readonly SessionEntry[],
		window: { hasMore: boolean; nextCursor: string | null },
	): void {
		for (const entry of entries) {
			this.entries.set(entry.id, entry);
			if (!this.treeMap.has(entry.id)) {
				this.treeMap.set(entry.id, {
					id: entry.id,
					parentId: entry.parentId ?? null,
					type: entry.type,
					timestamp: entry.timestamp,
				});
			}
		}
		this.window = window;
	}

	/**
	 * Apply one wire event. Throws GapDetectedError when an entry-appended event
	 * references an unknown parent (lost frames) so upper layers can re-attach.
	 */
	applyEvent(event: EventEnvelope): void {
		const data = event.data as Record<string, unknown>;
		switch (event.ev) {
			case "session.entry.appended": {
				const entry = data["entry"] as SessionEntry;
				const leafId = (data["leafId"] as string | null) ?? null;
				if (!this.treeMap.has(entry.id)) {
					const parent = entry.parentId ?? null;
					if (parent !== null && !this.treeMap.has(parent)) {
						throw new GapDetectedError(event.seq, event.seq);
					}
					this.treeMap.set(entry.id, {
						id: entry.id,
						parentId: parent,
						type: entry.type,
					timestamp: entry.timestamp,
						label: (entry as { label?: string }).label,
					});
					this.entries.set(entry.id, entry);
				}
				if (leafId) this.leafId = leafId;
				return;
			}
			case "session.leaf.changed": {
				const leafId = data["leafId"] as string;
				if (!this.treeMap.has(leafId)) throw new GapDetectedError(event.seq, event.seq);
				this.leafId = leafId;
				return;
			}
			case "session.queue.changed": {
				this.queues = {
					steering: [...(data["steering"] as string[])],
					followUp: [...(data["followUp"] as string[])],
				};
				return;
			}
			case "session.state.changed": {
				if (this.state) {
					this.state = {
						...this.state,
						isStreaming: (data["isStreaming"] as boolean) ?? this.state.isStreaming,
						isCompacting: (data["isCompacting"] as boolean) ?? this.state.isCompacting,
						isRetrying: (data["isRetrying"] as boolean) ?? this.state.isRetrying,
						pendingMessages: (data["pendingMessages"] as number) ?? this.state.pendingMessages,
					};
				}
				return;
			}
			case "session.thinking.changed": {
				if (this.state) this.state = { ...this.state, thinkingLevel: data["level"] as never };
				return;
			}
			case "session.model.changed": {
				if (this.state) this.state = { ...this.state, model: data["model"] as never };
				return;
			}
			case "session.renamed": {
				if (this.snap) this.snap = { ...this.snap, name: data["name"] as string | undefined };
				return;
			}
			default:
				// Streaming deltas, tool events, extension UI etc. are not tree state;
				// stores that want them subscribe separately.
				return;
		}
	}

	/** Flat tree metadata copy in snapshot order (roots then depth-first). */
	treeNodes(): TreeNodeMeta[] {
		return [...this.treeMap.values()];
	}

	/** Derived: parent's child ids, ordered by timestamp then id. */
	childrenOf(id: string | null): string[] {
		const out: string[] = [];
		for (const node of this.treeMap.values()) {
			if (node.parentId === id) out.push(node.id);
		}
		return out.sort((a, b) => {
			const ta = this.treeMap.get(a)?.timestamp ?? "";
			const tb = this.treeMap.get(b)?.timestamp ?? "";
			if (ta !== tb) return ta < tb ? -1 : 1;
			return a < b ? -1 : 1;
		});
	}

	/** Derived: entry path root -> current leaf, oldest first. */
	timeline(): SessionEntry[] {
		const path: string[] = [];
		let cursor = this.leafId;
		while (cursor) {
			path.push(cursor);
			cursor = this.treeMap.get(cursor)?.parentId ?? null;
		}
		path.reverse();
		return path
			.map((id) => this.entries.get(id))
			.filter((e): e is SessionEntry => e !== undefined);
	}

	/** Derived: sibling branch count along the active path (>= 1 when forks exist). */
	forkPoints(): string[] {
		const out: string[] = [];
		let cursor = this.leafId;
		while (cursor) {
			const node = this.treeMap.get(cursor);
			if (!node) break;
			if (this.childrenOf(node.parentId).length > 1) out.push(node.id);
			cursor = node.parentId;
		}
		return out;
	}
}


// Narrow helper extract for CLI use.
export type SessionListResult = CommandResult<"session.list">;
