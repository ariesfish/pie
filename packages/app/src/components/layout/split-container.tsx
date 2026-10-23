// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/components/split-container.tsx
// (Pie W1c-3 adaptation: renders the split tree — groups become flexed rows
// with resizable dividers, panes host their tab strip + retained panels.
// Tab drag-to-move (dnd-kit, web-desktop only upstream) lands next; the
// pane-header split/close affordances cover the same operations meanwhile.)
import { Fragment, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
	Columns2,
	GitCompare,
	MessageSquare,
	Plus,
	FolderOpen,
	X,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { RetainedPanel } from "@/components/retained-panel";
import { createPaneFocusContextValue, PaneFocusProvider } from "@/panels/pane-focus";
import { DraggableTabChip } from "@/components/layout/draggable-tab-chip";
import { SortableTabStrip } from "@/components/layout/sortable-tab-strip";
import { SplitDropTarget } from "@/components/layout/split-drop-target";
import { SplitDndShell, useSplitDnd } from "@/components/layout/split-dnd-shell";
import { getPanelRegistration, type PanelProps } from "@/panels/panel-registry";
import type { SplitNode, SplitPane } from "@/stores/workspace-layout-actions";
import { collectAllTabs } from "@/stores/workspace-layout-actions";
import { useSessionListStore, sessionTitle } from "@/stores/session-list-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

/** Desktop split tree host. */
export function SplitContainer() {
	const layout = useTabsStore((s) => s.layout);
	return (
		<SplitDndShell>
			<SplitNodeView node={layout.root} />
		</SplitDndShell>
	);
}

/** Compact host: the focused pane only, full width (no split chrome). */
export function SingleFocusedPane() {
	const layout = useTabsStore((s) => s.layout);
	const pane = useMemo(() => {
		const focused = layout.focusedPaneId;
		return findPaneInTree(layout.root, focused);
	}, [layout]);
	if (!pane) return null;
	return <SplitPaneView pane={pane} compact />;
}

function findPaneInTree(node: SplitNode, paneId: string | null): SplitPane | null {
	if (node.kind === "pane") {
		return node.pane.id === paneId ? node.pane : null;
	}
	for (const child of node.group.children) {
		const found = findPaneInTree(child, paneId);
		if (found) return found;
	}
	return null;
}

function SplitNodeView({ node }: { node: SplitNode }) {
	if (node.kind === "pane") {
		return <SplitPaneView pane={node.pane} />;
	}
	return <SplitGroupView node={node} />;
}

function SplitGroupView({ node }: { node: Extract<SplitNode, { kind: "group" }> }) {
	const resizeSplit = useTabsStore((s) => s.resizeSplit);
	const row = node.group.direction === "horizontal";
	const [containerSize, setContainerSize] = useState(0);
	const sizesRef = useRef(node.group.sizes);
	sizesRef.current = node.group.sizes;
	const { children, sizes, id: groupId } = node.group;

	return (
		<View
			style={row ? styles.row : styles.column}
			onLayout={(event) =>
				setContainerSize(
					row ? event.nativeEvent.layout.width : event.nativeEvent.layout.height,
				)
			}
		>
			{children.map((child, index) => (
				<Fragment key={getNodeKey(child)}>
					{index > 0 ? (
						<SplitDivider
							row={row}
							onResize={(deltaPx) => {
								if (containerSize <= 0) return;
								const ratio = deltaPx / containerSize;
								const beginSizes = sizesRef.current;
								const next = beginSizes.slice();
								const a = beginSizes[index - 1] ?? 0.5;
								const b = beginSizes[index] ?? 0.5;
								next[index - 1] = a + ratio;
								next[index] = b - ratio;
								resizeSplit(groupId, next);
							}}
						/>
					) : null}
					<View style={{ flex: Math.max(0.05, sizes[index] ?? 1) }}>
						<SplitNodeView node={child} />
					</View>
				</Fragment>
			))}
		</View>
	);
}

function getNodeKey(node: SplitNode): string {
	return node.kind === "pane" ? `pane-${node.pane.id}` : `group-${node.group.id}`;
}

/** Drag divider between two adjacent group children; translation drives the
 * ratio shift (begin sizes snapshot happens in the parent's sizesRef each
 * resize, so consecutive gestures never fight a stale baseline). */
function SplitDivider({ row, onResize }: { row: boolean; onResize: (deltaPx: number) => void }) {
	const { theme } = useUnistyles();
	const [active, setActive] = useState(false);
	const startRef = useRef(0);
	const pan = Gesture.Pan()
		.minDistance(2)
		.onBegin(() => setActive(true))
		.onStart((event) => {
			startRef.current = row ? event.absoluteX : event.absoluteY;
		})
		.onUpdate((event) => {
			const delta = (row ? event.absoluteX : event.absoluteY) - startRef.current;
			onResize(delta);
		})
		.onEnd(() => setActive(false))
		.onFinalize(() => setActive(false));
	return (
		<GestureDetector gesture={pan}>
			<View
				accessibilityLabel="resize split"
				style={[styles.dividerHit, row ? styles.dividerRow : styles.dividerColumn]}
			>
				<View
					style={[
						row ? styles.dividerBarRow : styles.dividerBarColumn,
						active && { backgroundColor: theme.colors.accent },
					]}
				/>
			</View>
		</GestureDetector>
	);
}

function SplitPaneView({ pane, compact = false }: { pane: SplitPane; compact?: boolean }) {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const focusPane = useTabsStore((s) => s.focusPane);
	const canClosePane = useTabsStore((s) => s.canClosePane);
	const closePane = useTabsStore((s) => s.closePane);
	const splitPaneWithTab = useTabsStore((s) => s.splitPaneWithTab);
	const isActivePane = useTabsStore((s) => s.layout.focusedPaneId === pane.id);
	const closable = !compact && canClosePane(pane.id);

	// [W3b] the ported file-pane surfaces (find bar) read pane focus through
	// the pane-focus context rather than prop drilling.
	const paneFocusValue = useMemo(
		() =>
			createPaneFocusContextValue({
				isWorkspaceFocused: true,
				isPaneFocused: isActivePane,
				onFocusPane: () => focusPane(pane.id),
			}),
		[isActivePane, focusPane, pane.id],
	);

	return (
		<PaneFocusProvider value={paneFocusValue}>
		<View style={[styles.pane, isActivePane && styles.paneFocused]}>
			<Pressable
				onPress={() => focusPane(pane.id)}
				style={styles.paneHeaderHit}
				accessibilityLabel={`focus pane ${pane.id}`}
			>
				<View
					style={[
						styles.paneHeaderRow,
						isActivePane && styles.paneHeaderRowFocused,
					]}
				>
					<PaneTabsRow pane={pane} compact={compact} dimmed={!isActivePane} />
					{!compact ? (
						<View style={styles.paneActions}>
							<PaneAction
								label={t("panels.split")}
								onPress={() => {
									const tabId = pane.focusedTabId ?? pane.tabIds[0];
									if (tabId) splitPaneWithTab(tabId, "right");
								}}
							>
								<Columns2 size={12} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
							</PaneAction>
							{closable ? (
								<PaneAction label={t("common.close")} onPress={() => closePane(pane.id)}>
									<X size={12} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
								</PaneAction>
							) : null}
						</View>
					) : null}
				</View>
			</Pressable>
			<DraggablePaneBody pane={pane} />
		</View>
		</PaneFocusProvider>
	);
}

/** Pane body drop target — edge drops split, center moves (web). */
function DraggablePaneBody({ pane }: { pane: SplitPane }) {
	const { activeTabId } = useSplitDnd();
	return (
		<SplitDropTarget paneId={pane.id} zone="pane-body" active={activeTabId !== null}>
			<PanePanelHost pane={pane} />
		</SplitDropTarget>
	);
}

function PaneAction({
	children,
	onPress,
	label,
}: {
	children: React.ReactNode;
	onPress: () => void;
	label: string;
}) {
	return (
		<Pressable hitSlop={6} onPress={onPress} accessibilityLabel={label} style={styles.paneAction}>
			{children}
		</Pressable>
	);
}

/** Tab strip scoped to one pane. */
function PaneTabsRow({
	pane,
	compact,
	dimmed = false,
}: {
	pane: SplitPane;
	compact: boolean;
	dimmed?: boolean;
}) {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const tabs = useTabsStore((s) => s.tabs);
	const setActive = useTabsStore((s) => s.setActive);
	const closeTab = useTabsStore((s) => s.closeTab);
	const openNew = useTabsStore((s) => s.openNew);
	const sessions = useSessionListStore((s) => s.sessions);
	const openFilePath = useWorkspaceStore((s) => s.openFilePath);

	function labelFor(tab: (typeof tabs)[number]): {
		title: string;
		icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
		closable: boolean;
	} {
		switch (tab.target.kind) {
			case "new_tab":
				return { title: t("agentList.newSession"), icon: Plus, closable: false };
			case "session": {
				const { sessionId } = tab.target;
				const session = sessions.find((s) => s.sessionId === sessionId);
				// A just-created session has no list row yet (first message not
				// persisted): show a spoken title, not the raw session id.
				return {
					title: session ? sessionTitle(session) || t("agentList.untitled") : t("agentList.newSession"),
					icon: MessageSquare,
					closable: true,
				};
			}
			case "files":
				return {
					title: openFilePath ? (openFilePath.split("/").pop() ?? t("panels.files")) : t("panels.files"),
					icon: FolderOpen,
					closable: true,
				};
			case "changes":
				return { title: t("panels.changes"), icon: GitCompare, closable: true };
		}
	}

	const { activeTabId } = useSplitDnd();

	return (
		<SplitDropTarget paneId={pane.id} zone="pane" active={activeTabId !== null}>
			<SortableTabStrip ids={pane.tabIds}>
				<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={styles.tabsScroll}
				contentContainerStyle={styles.tabsRow}
			>
				{pane.tabIds.map((tabId) => {
					const tab = tabs.find((entry) => entry.tabId === tabId);
					if (!tab) return null;
					// The creator panel is reachable through the trailing "+" only;
					// pinning it as a tab was a third entry point (DESIGN.md
					// §Components/Navigation).
					if (tab.target.kind === "new_tab") return null;
					const on = pane.focusedTabId === tabId;
					const label = labelFor(tab);
					const Icon = label.icon;
					return (
						<DraggableTabChip key={tabId} tabId={tabId} paneId={pane.id}>
							<Pressable
								style={[styles.tab, on && (dimmed ? styles.tabOnDim : styles.tabOn)]}
								onPress={() => setActive(tabId)}
							>
								<Icon
									size={11}
									color={
										on && !dimmed
											? theme.colors.foreground
											: theme.colors.foregroundExtraMuted
									}
									strokeWidth={1.75}
								/>
								<Text
									style={[styles.tabText, on && !dimmed && styles.tabTextOn]}
									numberOfLines={1}
								>
									{label.title}
								</Text>
								{label.closable && !compact ? (
									<Pressable style={styles.tabClose} onPress={() => closeTab(tabId)} hitSlop={4}>
										<X
											size={11}
											color={on ? theme.colors.foreground : theme.colors.foregroundExtraMuted}
											strokeWidth={1.75}
										/>
									</Pressable>
								) : null}
							</Pressable>
						</DraggableTabChip>
					);
				})}
					{/* Sticky creator entry — a pane's sole creator tab is replaced by the
					 * first real open (upstream rule), so a trailing "+" keeps creation
					 * permanently reachable (W1c-1 sticky semantics). */}
					<Pressable
						style={styles.tab}
						onPress={() => openNew()}
						accessibilityLabel={t("agentList.newSession")}
						hitSlop={4}
					>
						<Plus size={11} color={theme.colors.foregroundExtraMuted} strokeWidth={1.75} />
					</Pressable>
				</ScrollView>
			</SortableTabStrip>
		</SplitDropTarget>
	);
}

/** Retained-panel host scoped to one pane. */
function PanePanelHost({ pane }: { pane: SplitPane }) {
	const tabs = useTabsStore((s) => s.tabs);
	const visible = useMemo(
		() =>
			pane.tabIds
				.map((tabId) => tabs.find((entry) => entry.tabId === tabId))
				.filter((tab): tab is NonNullable<typeof tab> => tab !== undefined),
		[pane.tabIds, tabs],
	);
	return (
		<View style={styles.panelHost}>
			{visible.map((tab) => {
				const registration = getPanelRegistration(tab.target.kind);
				if (!registration) return null;
				const Panel = registration.component as React.ComponentType<PanelProps>;
				return (
					<RetainedPanel key={tab.tabId} active={pane.focusedTabId === tab.tabId}>
						<Panel target={tab.target} />
					</RetainedPanel>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	row: { flex: 1, flexDirection: "row" },
	column: { flex: 1, flexDirection: "column" },
	pane: {
		flex: 1,
		minWidth: 0,
		minHeight: 0,
		backgroundColor: theme.colors.surface0,
	},
	paneFocused: {},
	paneHeaderHit: { flexGrow: 0 },
	paneHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingRight: theme.spacing[1],
		backgroundColor: theme.colors.surface1,
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	paneHeaderRowFocused: {
		backgroundColor: theme.colors.surface2,
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.borderAccent,
	},
	paneActions: { flexDirection: "row", alignItems: "center", gap: 2 },
	paneAction: {
		padding: theme.spacing[1],
		borderRadius: theme.borderRadius.md,
	},
	dividerHit: {
		alignItems: "center",
		justifyContent: "center",
	},
	dividerRow: { width: 7, alignSelf: "stretch" },
	dividerColumn: { height: 7, alignSelf: "stretch" },
	dividerBarRow: {
		width: 2,
		alignSelf: "stretch",
		marginHorizontal: 2,
		borderRadius: 2,
		backgroundColor: theme.colors.foregroundExtraMuted,
		opacity: 0.55,
	},
	dividerBarColumn: {
		height: 2,
		alignSelf: "stretch",
		marginVertical: 2,
		borderRadius: 2,
		backgroundColor: theme.colors.foregroundExtraMuted,
		opacity: 0.55,
	},
	tabsScroll: { flexGrow: 0, flexShrink: 0 },
	tabsRow: {
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[1],
		gap: theme.spacing[1],
		backgroundColor: theme.colors.surface1,
	},
	tab: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1],
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[1],
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: "transparent",
		maxWidth: 200,
	},
	tabOn: { backgroundColor: theme.colors.surface0, borderColor: theme.colors.border },
	tabOnDim: { backgroundColor: theme.colors.surface1 },
	tabText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, maxWidth: 150 },
	tabTextOn: { color: theme.colors.foreground },
	tabClose: { padding: 1 },
	panelHost: { flex: 1, flexDirection: "row" },
}));
