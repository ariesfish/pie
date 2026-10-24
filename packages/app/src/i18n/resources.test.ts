import { describe, expect, it } from "vitest";

import { en } from "./resources/en";
import { zhCN } from "./resources/zh-CN";

function keyPaths(value: unknown, prefix = ""): string[] {
	if (!value || typeof value !== "object") return [prefix];
	return Object.entries(value as Record<string, unknown>)
		.flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key))
		.map((path) => path.replace(/_(zero|one|two|few|many|other)$/, ""))
		.sort();
}

describe("i18n resources", () => {
	it("keeps the Chinese locale at the same key set as English", () => {
		expect([...new Set(keyPaths(zhCN))]).toEqual([...new Set(keyPaths(en))]);
	});
});
