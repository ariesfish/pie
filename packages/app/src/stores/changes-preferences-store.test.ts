// [pie] T-017: changes display preferences — persistence (pie idiom:
// localStorage + zustand) + paseo's resolveDiffLayout degradation semantics.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_CHANGES_PREFERENCES,
	CHANGES_PREFERENCES_STORAGE_KEY,
	resolveDiffLayout,
	useChangesPreferences,
} from "@/stores/changes-preferences-store";

function stored(v: unknown) {
	window.localStorage.setItem(CHANGES_PREFERENCES_STORAGE_KEY, JSON.stringify(v));
}
function readStored(): any {
	return JSON.parse(window.localStorage.getItem(CHANGES_PREFERENCES_STORAGE_KEY) ?? "null");
}

afterEach(() => {
	window.localStorage.clear();
	vi.resetModules();
});

describe("changes preferences store (T-017)", () => {
	it("默认值 = 现行为(unified + wrapLines on),首次读后落盘", () => {
		expect(DEFAULT_CHANGES_PREFERENCES).toEqual({ layout: "unified", wrapLines: true });
		expect(useChangesPreferences.getState().preferences).toEqual(DEFAULT_CHANGES_PREFERENCES);
	});

	it("setLayout/setWrapLines 即时生效并持久化", () => {
		useChangesPreferences.getState().setLayout("split");
		useChangesPreferences.getState().setWrapLines(false);
		expect(useChangesPreferences.getState().preferences).toEqual({ layout: "split", wrapLines: false });
		expect(readStored()).toEqual({ layout: "split", wrapLines: false });
	});

	it("重启(新 store 实例)从盘上恢复", async () => {
		stored({ layout: "split", wrapLines: false });
		const { useChangesPreferences: fresh } = await import("@/stores/changes-preferences-store");
		expect(fresh.getState().preferences).toEqual({ layout: "split", wrapLines: false });
	});

	it("盘上垃圾/部分字段:容错回落默认(不抛错)", async () => {
		stored({ layout: "diagonal", wrapLines: "yes", extra: 1 });
		const { useChangesPreferences: fresh } = await import("@/stores/changes-preferences-store");
		expect(fresh.getState().preferences).toEqual(DEFAULT_CHANGES_PREFERENCES);
	});

	it("非 JSON 盘上值:回落默认", async () => {
		window.localStorage.setItem(CHANGES_PREFERENCES_STORAGE_KEY, "{not-json");
		const { useChangesPreferences: fresh } = await import("@/stores/changes-preferences-store");
		expect(fresh.getState().preferences).toEqual(DEFAULT_CHANGES_PREFERENCES);
	});
});

describe("resolveDiffLayout(paseo 语义移植)", () => {
	it("可用 split 时按偏好返回", () => {
		expect(resolveDiffLayout("split", true)).toBe("split");
		expect(resolveDiffLayout("unified", true)).toBe("unified");
	});
	it("不可用 split(窄屏/原生)强制降级 unified", () => {
		expect(resolveDiffLayout("split", false)).toBe("unified");
	});
});
