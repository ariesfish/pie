// [pie] T-015: batch bar UI semantics — multi-card visibility + selection →
// respondPermissions wiring. The multi-card visual cannot be driven by a real
// model today (pi serializes tool-call preparation through the permission
// gate — see .audit/T-015.tsv T015-7), so the UI path is locked here against
// a controlled store; the real store's semantics live in permission-store.test.ts.
/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const { useConnectionStore, respondPermissions } = vi.hoisted(() => {
	const respondPermissions = vi.fn();
	type TestState = {
		permissions: Array<{ requestId: string; toolName: string }>;
		permissionSelection: string[];
	};
	const state: TestState = { permissions: [], permissionSelection: [] };
	// zustand-call-compatible stub: (selector) => value, plus setState/getState.
	const useConnectionStore: any = (selector: (s: TestState & { respondPermissions: unknown }) => unknown) =>
		selector({ ...state, respondPermissions });
	useConnectionStore.getState = () => state;
	useConnectionStore.setState = (patch: Partial<TestState>) => Object.assign(state, patch);
	return { useConnectionStore, respondPermissions };
});

vi.mock("@/stores/connection-store", () => ({ useConnectionStore }));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		// 返回 key + 插值参数值(便于断言计数):"key|v1,v2"
		t: (key: string, opts?: Record<string, unknown>) =>
			`${key}|${Object.values(opts ?? {}).join(",")}`,
	}),
}));

import { PermissionBatchBar, filterSelectedPermissions } from "./permission-batch-bar";

const cards = [
	{ requestId: "r1", toolName: "read", sessionId: "s1", argsPreview: {}, reason: "", timeoutMs: 1 },
	{ requestId: "r2", toolName: "bash", sessionId: "s1", argsPreview: {}, reason: "", timeoutMs: 1 },
];

beforeEach(() => {
	respondPermissions.mockClear();
	useConnectionStore.setState({ permissions: [], permissionSelection: [] });
});
afterEach(cleanup);

describe("PermissionBatchBar visibility + batch actions (T-015)", () => {
	it("单卡/零卡:不出现批量栏", () => {
		const { container } = render(<PermissionBatchBar />);
		expect(container.innerHTML).toBe("");
		useConnectionStore.setState({ permissions: [cards[0]!] });
		const again = render(<PermissionBatchBar />);
		expect(again.container.innerHTML).toBe("");
	});

	it("两卡:批量栏出现,计数正确", () => {
		useConnectionStore.setState({ permissions: cards, permissionSelection: [] });
		const { getByTestId } = render(<PermissionBatchBar />);
		const bar = getByTestId("permission-batch-bar");
		// t mock 输出 "permission.batch.count|2,0"
		expect(bar.textContent).toContain("permission.batch.count|2,0");
	});

describe("filterSelectedPermissions(部分失效:选择集⊓仍待审)", () => {
	it("全选:携带全部 id", () => {
		expect(filterSelectedPermissions(cards, ["r1", "r2"])).toEqual(["r1", "r2"]);
	});
	it("选择集含已撤卡的 id:只携带仍存在的 id", () => {
		expect(filterSelectedPermissions([cards[0]!], ["r1", "r2"])).toEqual(["r1"]);
	});
	it("空选择/全失效:空批", () => {
		expect(filterSelectedPermissions(cards, [])).toEqual([]);
		expect(filterSelectedPermissions([], ["r1", "r2"])).toEqual([]);
	});
});

describe("PermissionBatchBar batch actions 定位与禁用态 (T-015)", () => {
	it("两卡:允许/拒绝/全选/取消四钮在位,空选择时允许与拒绝置灰", () => {
		useConnectionStore.setState({ permissions: cards, permissionSelection: [] });
		const { getByTestId } = render(<PermissionBatchBar />);
		const bar = getByTestId("permission-batch-bar");
		const allow = within(bar).getByRole("button", { name: /permission\.batch\.allow/u });
		const deny = within(bar).getByRole("button", { name: /permission\.batch\.deny/u });
		within(bar).getByRole("button", { name: /permission\.batch\.selectAll/u });
		within(bar).getByRole("button", { name: /permission\.batch\.clear/u });
		expect(allow.getAttribute("aria-disabled")).toBe("true");
		expect(deny.getAttribute("aria-disabled")).toBe("true");
	});
});
});
