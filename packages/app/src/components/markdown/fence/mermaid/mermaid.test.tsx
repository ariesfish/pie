/**
 * @vitest-environment jsdom
 */
// Mermaid fence tests, following the switch.test.tsx jsdom pattern (act-guarded
// root render + stubbed react-native/unistyles surface).
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MermaidFence } from "./index";

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 2: 8, 3: 12 },
    fontSize: { code: 12 },
    fontFamily: { mono: "monospace" },
    borderRadius: { md: 6 },
    borderWidth: { 1: 1 },
    colors: {
      surface1: "#111",
      foreground: "#eee",
      border: "#333",
    },
  },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "web", select: (v: Record<string, unknown>) => v.web ?? v.default },
  ScrollView: ({ children, ...rest }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-scrollview": true, ...rest }, children),
  Text: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-text": true }, children),
  View: ({
    children,
    ref: viewRef,
    ...rest
  }: { children?: React.ReactNode; ref?: React.Ref<HTMLDivElement> }) =>
    React.createElement("div", { ref: viewRef, ...rest }, children),
}));

vi.mock("react-native-unistyles", () => ({
  useUnistyles: () => ({ theme }),
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
}));

describe("MermaidFence (web surface)", () => {
	let root: Root | null = null;
	let container: HTMLElement | null = null;

	beforeEach(() => {
		const dom = new JSDOM("<!doctype html><html><body></body></html>");
		vi.stubGlobal("React", React);
		vi.stubGlobal("window", dom.window);
		vi.stubGlobal("document", dom.window.document);
		vi.stubGlobal("navigator", dom.window.navigator);
		container = document.createElement("div");
		document.body.appendChild(container);
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		root = createRoot(container);
	});

	afterEach(() => {
		if (root) {
			act(() => {
				root?.unmount();
			});
		}
		root = null;
		container = null;
		vi.unstubAllGlobals();
	});

	function renderFence(props: { code: string; phase: "streaming" | "complete" }) {
		act(() => {
			root?.render(
				<MermaidFence
					code={props.code}
					phase={props.phase}
					inheritedStyles={{}}
					textStyle={{}}
				/>,
			);
		});
		return container;
	}

	it("renders the SVG diagram for a complete fence", () => {
		const host = renderFence({ code: "graph LR\n  A[Begin] --> B[Work]", phase: "complete" });
		const svg = host?.querySelector("svg") ?? null;
		expect(svg).not.toBeNull();
		// width/height attrs are stripped so the diagram fills the pane width.
		expect(svg?.getAttribute("width")).toBeNull();
		expect(svg?.style.width).toBe("100%");
	});

	it("renders ASCII box-drawing output while the fence streams", () => {
		const host = renderFence({ code: "graph LR\n  A --> B", phase: "streaming" });
		expect(host?.querySelector("svg") ?? null).toBeNull();
		expect(host?.textContent ?? "").toMatch(/[─┌┐└┘├┤│►]/u);
	});

	it("falls back to the raw source when the diagram cannot be parsed", () => {
		const host = renderFence({ code: "utter nonsense\n  no diagram here", phase: "complete" });
		expect(host?.querySelector("svg") ?? null).toBeNull();
		expect(host?.textContent ?? "").toContain("utter nonsense");
	});
});
