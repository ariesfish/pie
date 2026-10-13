// Ported from getpaseo/paseo (Apache-2.0) — the DndContext wiring of
// components/split-container.tsx (web only; the native twin passes through).
// Drag semantics (upstream rules, scoped): same-pane over-tab → reorder;
// cross-pane over-tab → move + insert after; strip drop → move + append;
// pane-body drop → edge zones split (left/right/top/bottom), center moves.
import {
	createContext,
	useCallback,
	useContext,
	useRef,
	useState,
	type ReactNode,
} from "react";
import {
	closestCenter,
	DndContext,
	DragOverlay,
	PointerSensor,
	useSensor,
	useSensors,
	pointerWithin,
	type CollisionDetection,
	type DragEndEvent,
	type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import { useTabsStore } from "@/stores/tabs-store";
import { findPaneById, findPaneContainingTab } from "@/stores/workspace-layout-actions";

interface SplitDndContextValue {
	activeTabId: string | null;
}

const SplitDndContext = createContext<SplitDndContextValue>({ activeTabId: null });

export function useSplitDnd(): SplitDndContextValue {
	return useContext(SplitDndContext);
}

type WorkspaceTabDragData = {
	kind: "workspace-tab";
	tabId: string;
	paneId: string;
};
type SplitStripDropData = { kind: "split-pane-strip"; paneId: string };
type SplitBodyDropData = { kind: "split-pane-drop"; paneId: string };
type SplitDropData = SplitStripDropData | SplitBodyDropData;

const preferTabsThenPanes: CollisionDetection = (args) => {
	const pointerHits = pointerWithin(args);
	const tabHits = pointerHits.filter((entry) => entry.data?.droppableContainer.data.current?.kind === "workspace-tab");
	if (tabHits.length > 0) return tabHits;
	const paneHits = pointerHits.filter(
		(entry) => entry.data?.droppableContainer.data.current?.kind === "split-pane-strip" ||
			entry.data?.droppableContainer.data.current?.kind === "split-pane-drop",
	);
	if (paneHits.length > 0) return paneHits;
	return closestCenter(args);
};

/** Wraps the split tree with the drag system (web desktop). */
export function SplitDndShell({ children }: { children: ReactNode }) {
	const [activeTabId, setActiveTabId] = useState<string | null>(null);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
	);

	const endPointerOf = (event: DragEndEvent): { x: number; y: number } | null => {
		const native = event.activatorEvent as PointerEvent | MouseEvent | undefined;
		if (!native || typeof native.clientX !== "number") return null;
		return { x: native.clientX + event.delta.x, y: native.clientY + event.delta.y };
	};

	const resolveBodyDropPosition = (
		event: DragEndEvent,
	): "left" | "right" | "top" | "bottom" | "center" => {
		const rect = event.over?.rect;
		const pointer = endPointerOf(event);
		if (!rect || !pointer || rect.width <= 0 || rect.height <= 0) return "center";
		const relX = (pointer.x - rect.left) / rect.width;
		const relY = (pointer.y - rect.top) / rect.height;
		if (relX < 0.2) return "left";
		if (relX > 0.8) return "right";
		if (relY < 0.25) return "top";
		if (relY > 0.75) return "bottom";
		return "center";
	};

	const handleDragStart = useCallback((event: DragStartEvent) => {
		const data = event.active.data.current as WorkspaceTabDragData | undefined;
		setActiveTabId(data?.kind === "workspace-tab" ? data.tabId : null);
	}, []);

	const dragActiveRef = useRef(false);
	const handleDragEnd = useCallback((event: DragEndEvent) => {
		setActiveTabId(null);
		const activeData = event.active.data.current as WorkspaceTabDragData | undefined;
		const overData = event.over?.data.current as
			| WorkspaceTabDragData
			| SplitDropData
			| undefined;
		if (activeData?.kind !== "workspace-tab" || !overData) return;

		const store = useTabsStore.getState();
		const layout = store.layout;

		if (overData.kind === "workspace-tab") {
			const sourcePane = findPaneContainingTab(layout.root, activeData.tabId);
			const overPane = findPaneContainingTab(layout.root, overData.tabId);
			if (!sourcePane || !overPane) return;
			if (sourcePane.id === overPane.id) {
				const ids = sourcePane.tabIds.slice();
				const from = ids.indexOf(activeData.tabId);
				const overIndex = ids.indexOf(overData.tabId);
				if (from >= 0 && overIndex >= 0 && from !== overIndex) {
					store.reorderPaneTabs(sourcePane.id, arrayMove(ids, from, overIndex));
				}
				return;
			}
			// Cross pane: move, then insert after the hovered tab.
			store.moveTabToPane(activeData.tabId, overPane.id);
			const moved = useTabsStore.getState().layout;
			const refreshed = findPaneById(moved.root, overPane.id);
			if (refreshed) {
				const ids = refreshed.tabIds.filter((id) => id !== activeData.tabId);
				const at = ids.indexOf(overData.tabId);
				ids.splice(at + 1, 0, activeData.tabId);
				store.reorderPaneTabs(refreshed.id, ids);
			}
			return;
		}

		if (overData.kind === "split-pane-strip") {
			if (overData.paneId === activeData.paneId) return;
			store.moveTabToPane(activeData.tabId, overData.paneId);
			const moved = useTabsStore.getState().layout;
			const refreshed = findPaneById(moved.root, overData.paneId);
			if (refreshed) {
				const ids = refreshed.tabIds.filter((id) => id !== activeData.tabId);
				ids.push(activeData.tabId); // append at the strip end
				store.reorderPaneTabs(refreshed.id, ids);
			}
			return;
		}

		if (overData.kind === "split-pane-drop") {
			const position = resolveBodyDropPosition(event);
			if (position === "center") {
				if (overData.paneId !== activeData.paneId) {
					store.moveTabToPane(activeData.tabId, overData.paneId);
				}
				return;
			}
			store.splitPaneWithTab(activeData.tabId, position);
		}
	}, []);

	dragActiveRef.current = activeTabId !== null;

	return (
		<SplitDndContext.Provider value={{ activeTabId }}>
			<DndContext
				sensors={sensors}
				collisionDetection={preferTabsThenPanes}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
				onDragCancel={() => setActiveTabId(null)}
			>
				{children}
				<DragOverlay dropAnimation={null}>
					{activeTabId ? <DragOverlayTabChip tabId={activeTabId} /> : null}
				</DragOverlay>
			</DndContext>
		</SplitDndContext.Provider>
	);
}

function DragOverlayTabChip({ tabId }: { tabId: string }) {
	const tabs = useTabsStore((s) => s.tabs);
	const tab = tabs.find((t) => t.tabId === tabId);
	if (!tab) return null;
	return (
		<div
			style={{
				padding: "4px 10px",
				borderRadius: 8,
				backgroundColor: "rgba(32,36,44,0.96)",
				border: "1px solid rgba(128,138,160,0.35)",
				color: "#e7e9ee",
				fontSize: 12,
				pointerEvents: "none",
				maxWidth: 220,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
			}}
		>
			{tab.target.kind === "session" ? tab.target.sessionId.slice(0, 8) : tab.target.kind}
		</div>
	);
}
