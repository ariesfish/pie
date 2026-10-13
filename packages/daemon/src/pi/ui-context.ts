/**
 * Host ExtensionUIContext: the third "UI mode" for Pi (architecture.md §4.2).
 *
 * Every method mirrors the behavior of Pi's own RPC-mode UI context
 * (pi-mono packages/coding-agent/src/modes/rpc/rpc-mode.ts, createExtensionUIContext)
 * — same defaults on timeout, same no-ops for TUI-only surfaces — but forwards
 * to Pie wire events instead of RPC records:
 *
 *   dialogs   -> session.ext.dialog   (answered via ext.dialog.respond)
 *   widgets   -> session.ext.widget
 *   status    -> session.ext.status
 *   notify    -> session.ext.notify
 *   title     -> session.ext.title
 *   editor    -> session.ext.editorText
 */

import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { newId } from "@pie/protocol";
import type { ExtDialogRequest } from "@pie/protocol";

/** Default dialog timeout (P0): long enough for a user to open the app. */
export const DEFAULT_DIALOG_TIMEOUT_MS = 180_000;

interface PendingDialog {
	resolve: (value: string | boolean | undefined) => void;
	timer: ReturnType<typeof setTimeout>;
}

export interface HostUiOptions {
	/** Identifier of the session this UI context belongs to (wire routing). */
	sessionId: string;
	/** Emit a fire-and-forget ext event (widget/status/notify/title/editorText). */
	emitExt: (ev: string, data: Record<string, unknown>) => void;
	/** Emit a blocking dialog request and resolve when a client answers/cancels/times out. */
	publishDialog: (request: ExtDialogRequest) => void;
}

export class DialogRegistry {
	private pending = new Map<string, PendingDialog>();

	constructor(private readonly timeoutMs = DEFAULT_DIALOG_TIMEOUT_MS) {}

	private timeoutForMir(request: ExtDialogRequest): number {
		return (
			(request as { select?: { timeoutMs?: number } }).select?.timeoutMs ??
			(request as { confirm?: { timeoutMs?: number } }).confirm?.timeoutMs ??
			(request as { input?: { timeoutMs?: number } }).input?.timeoutMs ??
			(request as { editor?: { timeoutMs?: number } }).editor?.timeoutMs ??
			this.timeoutMs
		);
	}

	/** Wait for a daemon-side dialog answer. Publishes via `publish`. */
	waitFor(request: ExtDialogRequest, publish: (r: ExtDialogRequest) => void): Promise<string | undefined> {
		return new Promise<string | undefined>((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(request.requestId);
				resolve(undefined); // timeout -> cancel semantics (fail-safe)
			}, this.timeoutForMir(request));
			this.pending.set(request.requestId, {
				resolve: (value) => resolve(typeof value === "string" ? value : undefined),
				timer,
			});
			publish(request);
		});
	}

	waitForBoolean(request: ExtDialogRequest, publish: (r: ExtDialogRequest) => void): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(request.requestId);
				resolve(false); // timeout -> confirm=false (fail-safe)
			}, this.timeoutForMir(request));
			this.pending.set(request.requestId, {
				resolve: (value) => resolve(Boolean(value)),
				timer,
			});
			publish(request);
		});
	}

	/** Apply a client response (ext.dialog.respond). Returns false when unknown/expired. */
	respond(requestId: string, answer: { value?: string; confirmed?: boolean; cancelled?: boolean }): boolean {
		const pending = this.pending.get(requestId);
		if (!pending) return false;
		this.pending.delete(requestId);
		clearTimeout(pending.timer);
		if (answer.cancelled) pending.resolve(undefined);
		else if (answer.confirmed !== undefined) pending.resolve(answer.confirmed);
		else pending.resolve(answer.value);
		return true;
	}

	/** Cancel all pending dialogs (session closed / daemon shutdown). */
	cancelAll(): void {
		for (const [id, p] of this.pending) {
			clearTimeout(p.timer);
			p.resolve(undefined);
			this.pending.delete(id);
		}
	}
}

export function createHostUiContext(opts: HostUiOptions): { ui: ExtensionUIContext; dialogs: DialogRegistry } {
	const dialogs = new DialogRegistry();
	const { sessionId } = opts;

	const dialog = (
		kind: ExtDialogRequest["kind"],
		payload: Record<string, unknown>,
	): ExtDialogRequest =>
		({ requestId: newId("dlg"), sessionId, kind, [kind]: payload }) as unknown as ExtDialogRequest;

	// --- typed dialog members -------------------------------------------------
	const select = (
		title: string,
		options: string[],
		dialogOpts?: { timeout?: number; signal?: AbortSignal },
	): Promise<string | undefined> =>
		dialogs.waitFor(dialog("select", { title, options, timeoutMs: dialogOpts?.timeout }), opts.publishDialog).then(
			(v) => (typeof v === "string" ? v : undefined),
		);
	const confirm = (
		title: string,
		message: string,
		dialogOpts?: { timeout?: number; signal?: AbortSignal },
	): Promise<boolean> =>
		dialogs.waitForBoolean(
			dialog("confirm", { title, message, timeoutMs: dialogOpts?.timeout }),
			opts.publishDialog,
		);
	const input = (
		title: string,
		placeholder?: string,
		dialogOpts?: { timeout?: number; signal?: AbortSignal },
	): Promise<string | undefined> =>
		dialogs.waitFor(dialog("input", { title, placeholder, timeoutMs: dialogOpts?.timeout }), opts.publishDialog).then(
			(v) => (typeof v === "string" ? v : undefined),
		);
	const editorDialog = (title: string, prefill?: string): Promise<string | undefined> =>
		dialogs.waitFor(dialog("editor", { title, prefill }), opts.publishDialog).then((v) =>
			typeof v === "string" ? v : undefined,
		);

	// --- full UI context (TUI-only members inert, mirroring rpc-mode) ----------
	const setEditorTextFn = (text: string): void => {
		opts.emitExt("session.ext.editorText", { sessionId, text });
	};

	const ui = {
		select,
		confirm,
		input,
		editor: editorDialog,

		notify: (message: string, notifyType?: "info" | "warning" | "error"): void => {
			opts.emitExt("session.ext.notify", { sessionId, message, notifyType });
		},

		onTerminalInput: (): (() => void) => () => {},

		setStatus: (key: string, text: string | undefined): void => {
			opts.emitExt("session.ext.status", { sessionId, key, text });
		},

		setWorkingMessage: (_message?: string) => {},
		setWorkingVisible: (_visible: boolean) => {},
		setWorkingIndicator: (_options?: { frames?: string[]; intervalMs?: number }) => {},
		setHiddenThinkingLabel: (_label?: string) => {},

		setWidget: (
			key: string,
			content: string[] | undefined | unknown,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		): void => {
			if (content === undefined || Array.isArray(content)) {
				opts.emitExt("session.ext.widget", {
					sessionId,
					key,
					placement: options?.placement,
					lines: content,
					clear: content === undefined,
				});
			}
			// Component factories are TUI-only (same behavior as rpc-mode).
		},

		setFooter: (_factory: unknown) => {},
		setHeader: (_factory: unknown) => {},

		setTitle: (title: string): void => {
			opts.emitExt("session.ext.title", { sessionId, title });
		},

		custom: (async () => undefined) as ExtensionUIContext["custom"],

		pasteToEditor: (text: string): void => setEditorTextFn(text),
		setEditorText: setEditorTextFn,
		getEditorText: (): string => "",

		addAutocompleteProvider: (_factory: unknown) => {},
		setEditorComponent: (_factory: unknown) => {},
		getEditorComponent: (): undefined => undefined,
		getAllThemes: () => [] as { name: string; path: string | undefined }[],
		getTheme: (): undefined => undefined,
		setTheme: (): { success: boolean; error?: string } => ({
			success: false,
			error: "Theme switching not supported in the Pie daemon",
		}),
		getToolsExpanded: (): boolean => false,
		setToolsExpanded: (_expanded: boolean) => {},
	};

	return { ui: ui as unknown as ExtensionUIContext, dialogs };
}
