import { describe, expect, it, vi } from "vitest";

import { HostSession } from "../src/core/host-session.js";

function fakeHost(session: Record<string, unknown>): HostSession {
	const host = Object.create(HostSession.prototype) as unknown as {
		session: Record<string, unknown>;
		applyTail: Promise<void>;
	};
	host.session = session;
	host.applyTail = Promise.resolve();
	return host as unknown as HostSession;
}

describe("HostSession.applyConfig", () => {
	it("refreshes models and rebinds the current model", async () => {
		const calls: string[] = [];
		const current = { provider: "acme", id: "m1" };
		const next = { provider: "acme", id: "m1", name: "fresh" };
		const session = {
			isIdle: true,
			model: current,
			agent: { state: { model: current } },
			reload: vi.fn(async () => {
				calls.push("reload");
			}),
			setModel: vi.fn(),
			modelRuntime: {
				refresh: vi.fn(async () => {
					calls.push("refresh");
					return { aborted: false, errors: new Map() };
				}),
				getModel: vi.fn(() => next),
				getError: vi.fn(() => undefined),
			},
		};
		const host = fakeHost(session);

		await expect(host.applyConfig(["models"])).resolves.toEqual({ status: "applied" });
		expect(calls).toEqual(["refresh"]);
		expect(session.agent.state.model).toBe(next);
		expect(session.setModel).not.toHaveBeenCalled();
	});

	it("reloads resources before refreshing models", async () => {
		const calls: string[] = [];
		const session = {
			isIdle: true,
			model: undefined,
			agent: { state: { model: undefined } },
			reload: vi.fn(async () => {
				calls.push("reload");
			}),
			setModel: vi.fn(),
			modelRuntime: {
				refresh: vi.fn(async () => {
					calls.push("refresh");
					return { aborted: false, errors: new Map() };
				}),
				getModel: vi.fn(),
				getError: vi.fn(() => undefined),
			},
		};
		const host = fakeHost(session);

		await host.applyConfig(["settings", "models"]);
		expect(calls).toEqual(["refresh", "reload"]);
	});

	it("skips busy sessions without touching them", async () => {
		const session = {
			isIdle: false,
			reload: vi.fn(),
			setModel: vi.fn(),
			modelRuntime: { refresh: vi.fn(), getModel: vi.fn(), getError: vi.fn() },
		};
		const host = fakeHost(session);

		await expect(host.applyConfig(["settings"])).resolves.toEqual({ status: "busy" });
		expect(session.reload).not.toHaveBeenCalled();
	});

	it("refuses prompts, model changes, compaction and navigation while applying", async () => {
		const host = fakeHost({}) as unknown as {
			applyingConfig: boolean;
			steer: (message: string) => Promise<unknown>;
			followUp: (message: string) => Promise<unknown>;
			setModel: (provider: string, model: string) => unknown;
			compact: () => Promise<unknown>;
			navigate: (entry: string, summarize: boolean) => Promise<unknown>;
		};
		host.applyingConfig = true;

		await expect(host.steer("hi")).rejects.toMatchObject({ code: "session_streaming" });
		await expect(host.followUp("hi")).rejects.toMatchObject({ code: "session_streaming" });
		expect(() => host.setModel("acme", "m1")).toThrow("Wait for config");
		await expect(host.compact()).rejects.toMatchObject({ code: "session_streaming" });
		await expect(host.navigate("entry", false)).rejects.toMatchObject({
			code: "session_streaming",
		});
	});

	it("warns when the current model disappeared", async () => {
		const session = {
			isIdle: true,
			model: { provider: "acme", id: "gone" },
			agent: { state: { model: { provider: "acme", id: "gone" } } },
			reload: vi.fn(),
			setModel: vi.fn(),
			modelRuntime: {
				refresh: vi.fn(async () => ({ aborted: false, errors: new Map() })),
				getModel: vi.fn(() => undefined),
				getError: vi.fn(() => undefined),
			},
		};
		const host = fakeHost(session);

		await expect(host.applyConfig(["models"])).resolves.toEqual({
			status: "applied",
			warnings: ["acme/gone"],
		});
	});
});
