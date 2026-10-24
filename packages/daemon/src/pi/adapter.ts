/**
 * Pi <-> protocol value adapters. This is the ONLY place in the daemon where
 * Pi SDK types are mapped to `@pie/protocol` values (architecture.md
 * §12/R1). Everything else consumes protocol types.
 */

import type {
	AgentSession,
	SessionEntry as PiSessionEntry,
	SessionTreeNode,
} from "@earendil-works/pi-coding-agent";

/** Pi ImageContent shape (pi-ai type is not re-exported by pi-coding-agent). */
export interface PiImageContent {
	type: "image";
	data: string;
	mimeType: string;
}

import type {
	AgentMessage,
	ContextUsage,
	MessageEntry,
	ModelCatalogItem,
	ModelRef,
	SessionEntry as WireSessionEntry,
	SessionStateInfo,
	TreeNodeMeta,
	Usage as WireUsage,
} from "@pie/protocol";

/** Pi AgentMessage type, recovered from the exported SessionEntry. */
export type PiAgentMessage = Extract<PiSessionEntry, { type: "message" }>["message"];
export type PiAssistantMessage = Extract<PiAgentMessage, { role: "assistant" }>;
export type PiContentBlock = PiAssistantMessage["content"][number];

export function mapAgentMessage(message: PiAgentMessage): AgentMessage {
	// Structural passthrough: pi-ai message shapes are a superset of the
	// protocol mirror; non-rendered fields simply travel along.
	return message as unknown as AgentMessage;
}

export function mapSessionEntry(entry: PiSessionEntry): WireSessionEntry {
	switch (entry.type) {
		case "message":
		case "model_change":
		case "thinking_level_change":
		case "usage":
		case "session_info":
		case "label":
			// Known shapes map 1:1 (typeof level/label fields are permissive in the
			// protocol mirror; extra pi fields beyond the mirror are dropped).
			return entry as unknown as WireSessionEntry;
		default: {
			// compaction / branch_summary / context_edit / custom / future kinds.
			const { type, id, parentId, timestamp, ...rest } = entry as unknown as Record<string, unknown>;
			void type;
			void id;
			void parentId;
			void timestamp;
			return {
				type: (entry as { type: string }).type,
				id: (entry as { id: string }).id,
				parentId: (entry as { parentId: string | null }).parentId,
				timestamp: (entry as { timestamp: string }).timestamp,
					data: rest,
			};
		}
	}
}

const TREE_PREVIEW_MAX_CHARS = 140;

function messagePreview(message: PiAgentMessage): string {
	if (!message) return "";
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		for (const part of content) {
			if (
				part &&
				typeof part === "object" &&
				"type" in part &&
				(part as { type?: unknown }).type === "text" &&
				typeof (part as { text?: unknown }).text === "string"
			) {
				return (part as { text: string }).text;
			}
		}
	}
	return "";
}

function treePreview(entry: PiSessionEntry): string | undefined {
	if (entry.type !== "message") return undefined;
	const text = messagePreview(entry.message).replace(/\s+/g, " ").trim();
	return text ? text.slice(0, TREE_PREVIEW_MAX_CHARS) : undefined;
}

export function mapTree(nodes: readonly SessionTreeNode[]): TreeNodeMeta[] {
	const out: TreeNodeMeta[] = [];
	const walk = (node: SessionTreeNode): void => {
		const entry = node.entry as { id: string; parentId: string | null; timestamp: string; type: string };
		const message =
			entry.type === "message"
				? (node.entry as Extract<PiSessionEntry, { type: "message" }>).message
				: undefined;
		const labelEntry =
			entry.type === "label" ? (node.entry as PiSessionEntry & { label?: string }) : undefined;
		out.push({
			id: entry.id,
			parentId: entry.parentId,
			type: entry.type,
			role: message?.role,
			preview: treePreview(node.entry),
			timestamp: entry.timestamp,
			label: node.label ?? labelEntry?.label,
			labelTimestamp: node.labelTimestamp,
		});
		for (const child of node.children) walk(child);
	};
	for (const root of nodes) walk(root);
	return out;
}

export function mapUsage(usage: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; cacheWrite1h?: number; reasoning?: number; total?: number } | undefined):
	WireUsage | undefined {
	if (!usage) return undefined;
	return {
		input: usage.input ?? 0,
		output: usage.output ?? 0,
		cacheRead: usage.cacheRead ?? 0,
		cacheWrite: usage.cacheWrite ?? 0,
		cacheWrite1h: usage.cacheWrite1h,
		reasoning: usage.reasoning,
		total: usage.total,
	};
}

export function mapContextUsage(cu: ContextUsage | undefined): ContextUsage | undefined {
	if (!cu) return undefined;
	return cu;
}

/** Model reference for protocol payloads (virtual models keep their identity). */
export function mapModel(model: { provider: string; id: string; name?: string; api?: string; reasoning?: boolean; type?: string }): ModelRef {
	return {
		provider: model.provider,
		id: model.id,
		name: model.name,
		api: model.api,
		reasoning: model.reasoning,
	};
}

export function mapModelCatalog(model: {
	provider: string;
	id: string;
	name?: string;
	api?: string;
	reasoning?: boolean;
	type?: string;
	input?: string[];
	contextWindow?: number;
	maxTokens?: number;
}): ModelCatalogItem {
	return {
		...mapModel(model),
		input: model.input,
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
	};
}

/** Coarse session state summary used by snapshots + session.state.changed. */
export function buildStateInfo(session: AgentSession): SessionStateInfo {
	return {
		model: session.model ? mapModel(session.model as never) : undefined,
		thinkingLevel: session.thinkingLevel,
		isStreaming: session.isStreaming,
		isCompacting: session.isCompacting,
		isRetrying: session.isRetrying,
		retryAttempt: session.isRetrying ? session.retryAttempt : undefined,
		autoCompaction: session.autoCompactionEnabled,
		steeringMode: session.steeringMode,
		followUpMode: session.followUpMode,
		pendingMessages: session.pendingMessageCount,
		messageCount: session.messages.length,
	};
}

/** Images from wire payload (data/mimeType) into the Pi ImageContent shape. */
export function mapImages(
	images: ReadonlyArray<{ data: string; mimeType: string }> | undefined,
): PiImageContent[] | undefined {
	if (!images || images.length === 0) return undefined;
	return images.map((img) => ({ type: "image", data: img.data, mimeType: img.mimeType }));
}

/** Convenience re-export for host-session typing. */
export type { MessageEntry };
