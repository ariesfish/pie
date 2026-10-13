/**
 * Permission layer (architecture.md §5.9): an inline Pi extension that
 * intercepts `tool_call` events and surfaces approval cards over the wire.
 *
 * The approval formula mirrors the official extension guide
 * (pi-mono packages/coding-agent/docs/extensions.md):
 *   destructive == true -> ask; otherwise !readOnly && (destructive default
 *   true || openWorld default true) -> ask; read-only -> allow.
 *
 * Fail-safe: timeout or daemon-side cancel resolves as DENY, and a blocked
 * tool reports its reason back to the model (`block: true`).
 */

import type { ExtensionAPI, InlineExtension, ToolAnnotations } from "@earendil-works/pi-coding-agent";
import { newId } from "@pie/protocol";

export type PermissionMode = "off" | "annotations" | "ask";

/** Default card timeout: 10 minutes (arch doc §5.9). */
export const PERMISSION_TIMEOUT_MS = 10 * 60 * 1000;

export interface WirePermissionRequest {
	requestId: string;
	sessionId: string;
	toolName: string;
	argsPreview: Record<string, unknown>;
	annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
	reason: string;
	timeoutMs: number;
}

export type PermissionDecision = "allow" | "allowSession" | "deny";

interface PendingPermission {
	resolve: (decision: PermissionDecision) => void;
	timer: ReturnType<typeof setTimeout>;
}

export class PermissionGate {
	private pending = new Map<string, PendingPermission>();
	private sessionAllowed = new Set<string>();

	constructor(
		private readonly opts: {
			mode: PermissionMode;
			timeoutMs?: number;
			/** Late-bound: the gate is created before the session exists. */
			sessionId: () => string;
			publish: (request: WirePermissionRequest) => void;
		},
	) {}

	get mode(): PermissionMode {
		return this.opts.mode;
	}

	get enabled(): boolean {
		return this.opts.mode !== "off";
	}

	/** Annotation-based approval formula (docs extensions.md). */
	static needsApproval(annotations: ToolAnnotations | undefined): boolean {
		if (annotations?.readOnlyHint === true) return false;
		if (annotations?.destructiveHint === true) return true;
		return (annotations?.destructiveHint ?? true) || (annotations?.openWorldHint ?? true);
	}

	/**
	 * Extension hook: return undefined to allow (no result), or a block result.
	 */
	async intercept(toolName: string, input: Record<string, unknown>, annotations?: ToolAnnotations): Promise<{ block: true; reason: string } | undefined> {
		if (this.opts.mode === "off") return undefined;
		if (this.sessionAllowed.has(toolName)) return undefined;
		if (this.opts.mode === "annotations" && !PermissionGate.needsApproval(annotations)) return undefined;

		const decision = await this.requestApproval(toolName, input, annotations);
		if (decision === "deny") {
			return { block: true, reason: `${toolName} was not approved by the user` };
		}
		return undefined;
	}

	private requestApproval(
		toolName: string,
		input: Record<string, unknown>,
		annotations?: ToolAnnotations,
	): Promise<PermissionDecision> {
		const requestId = newId("perm");
		return new Promise<PermissionDecision>((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(requestId);
				resolve("deny"); // fail-safe (timeout = deny, §5.9)
			}, this.opts.timeoutMs ?? PERMISSION_TIMEOUT_MS);
			this.pending.set(requestId, {
				resolve: (decision) => {
					if (decision === "allowSession") this.sessionAllowed.add(toolName);
					resolve(decision === "allowSession" ? "allow" : decision);
				},
				timer,
			});
			this.opts.publish({
				requestId,
				sessionId: this.opts.sessionId(),
				toolName,
				argsPreview: clonePreview(input),
				annotations,
				reason: this.opts.mode === "ask" ? "policy=ask" : "policy=annotations",
				timeoutMs: this.opts.timeoutMs ?? PERMISSION_TIMEOUT_MS,
			});
		});
	}

	/** Client response (permission.respond). Returns false when unknown/expired. */
	respond(requestId: string, decision: PermissionDecision): boolean {
		const pending = this.pending.get(requestId);
		if (!pending) return false;
		this.pending.delete(requestId);
		clearTimeout(pending.timer);
		pending.resolve(decision);
		return true;
	}

	/** Resolve everything as deny (session dispose / shutdown). */
	denyAll(): void {
		for (const [, p] of this.pending) {
			clearTimeout(p.timer);
			p.resolve("deny");
		}
		this.pending.clear();
	}
}

/** Cap args for the preview payload (no kvetch about huge buffers on cards). */
function clonePreview(input: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input ?? {})) {
		out[key] = truncate(value);
	}
	return out;
}
function truncate(value: unknown): unknown {
	if (typeof value === "string") return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
	if (Array.isArray(value)) return value.length > 20 ? [...value.slice(0, 20).map(truncate), `(${value.length - 20} more)`] : value.map(truncate);
	if (value && typeof value === "object") {
		const o: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 50)) o[k] = truncate(v);
		return o;
	}
	return value;
}

/**
 * The inline extension installed into every daemon-held session when
 * permission mode != "off". Uses the only officially supported interception
 * point (`tool_call`) — same mechanism the TUI permission flows rely on.
 */
export function createPermissionExtension(gate: PermissionGate): InlineExtension {
	return (pi: ExtensionAPI): void => {
		pi.on("tool_call", async (event) => {
			const toolName = event.toolName;
			const info = pi.getAllTools().find((t) => t.name === toolName);
			const result = await gate.intercept(toolName, (event as { input?: Record<string, unknown> }).input ?? {}, info?.annotations);
			return result; // undefined -> allow; {block, reason} -> deny
		});
	};
}
