// Ported from getpaseo/paseo (Apache-2.0) — command-center/command-center.tsx.
// [pie] broad simplification: paseo's palette renders workspace/agent/file/
// contribution rows from a host search pipeline and routes through the
// keyboard-shortcut store with overlay teleport. Pie's palette is
// contribution-only (W3e source set), keeps the ported ranking pipeline
// (results.ts), opens from the header button or Cmd/Ctrl+K, and runs as a
// plain RN Modal with the ported isolated bottom-sheet pattern on native.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	FlatList,
	Modal,
	Pressable,
	Text,
	TextInput,
	View,
	type ListRenderItemInfo,
	type NativeSyntheticEvent,
	type NativeScrollEvent,
} from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles, withUnistyles } from "react-native-unistyles";
import { ChevronRight } from "lucide-react-native";

import { useCommandCenterContributions } from "./provider";
import { useCommandCenterStore } from "./command-center-store";
import {
	buildContributionSections,
	preserveActiveResultId,
	projectCommandCenterRows,
	type CommandCenterListRow,
	type CommandCenterResult,
	type CommandCenterResultSection,
} from "./results";

const ThemedChevronRight = withUnistyles(ChevronRight, (theme) => ({
	color: theme.colors.foregroundMuted,
}));

const MAX_HEIGHT_PICK = "60%" as const;
const KEYBOARD_SHOULD_PERSIST_TAPS = "always" as const;

export function CommandCenter() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const open = useCommandCenterStore((s) => s.open);
	const closeCommandCenter = useCommandCenterStore((s) => s.closeCommandCenter);
	const contributions = useCommandCenterContributions();

	const [query, setQuery] = useState("");
	const [activeResultId, setActiveResultId] = useState<string | null>(null);
	const listRef = useRef<FlatList<CommandCenterListRow> | null>(null);
	const inputRef = useRef<TextInput | null>(null);

	// Reset transient state whenever the palette opens.
	useEffect(() => {
		if (open) {
			setQuery("");
			setActiveResultId(null);
		}
	}, [open]);

	const sections = useMemo<CommandCenterResultSection[]>(
		() => buildContributionSections(contributions.contributions, query),
		[contributions, query],
	);

	const projection = useMemo(() => projectCommandCenterRows(sections), [sections]);
	const { rows, selectableResults } = projection;

	// Keep the active id valid as the result set shifts under the query.
	useEffect(() => {
		setActiveResultId((current) => preserveActiveResultId(current, selectableResults));
	}, [selectableResults]);

	const runResult = useCallback(
		(result: CommandCenterResult) => {
			closeCommandCenter();
			void result.run();
		},
		[closeCommandCenter],
	);

	const moveActive = useCallback(
		(delta: number) => {
			setActiveResultId((current) => {
				if (selectableResults.length === 0) return null;
				const index = current ? selectableResults.findIndex((r) => r.id === current) : -1;
				const nextIndex =
					(index + delta + selectableResults.length) % selectableResults.length;
				return selectableResults[nextIndex]?.id ?? null;
			});
		},
		[selectableResults],
	);

	const runActive = useCallback(() => {
		const active = selectableResults.find((result) => result.id === activeResultId);
		if (active) runResult(active);
	}, [activeResultId, runResult, selectableResults]);

	// Keep the active row in view.
	const rowIndexByResultId = projection.rowIndexByResultId;
	useEffect(() => {
		if (activeResultId == null) return;
		const rowIndex = rowIndexByResultId.get(activeResultId);
		if (rowIndex == null) return;
		listRef.current?.scrollToIndex({ index: rowIndex, viewPosition: 0.5, animated: true });
	}, [activeResultId, rowIndexByResultId]);

	const handleKey = useCallback(
		(key: string | null): boolean => {
			if (key === "ArrowDown") {
				moveActive(1);
				return true;
			}
			if (key === "ArrowUp") {
				moveActive(-1);
				return true;
			}
			if (key === "Enter") {
				runActive();
				return true;
			}
			return false;
		},
		[moveActive, runActive],
	);

	if (!open) return null;

	return (
		<Modal
			visible
			transparent
			animationType="fade"
			onRequestClose={closeCommandCenter}
			statusBarTranslucent
		>
			<Pressable style={styles.backdrop} onPress={closeCommandCenter}>
				<Pressable style={styles.panel}>
					<View style={styles.headerRow}>
						<TextInput
							ref={inputRef}
							autoFocus
							value={query}
							onChangeText={setQuery}
							placeholder={t("commandCenter.placeholder")}
							style={styles.input}
							placeholderTextColor={theme.colors.foregroundMuted}
							onKeyPress={(event) => {
								handleKey(event.nativeEvent.key);
							}}
						/>
						<Pressable hitSlop={8} onPress={closeCommandCenter} accessibilityLabel={t("commandCenter.close")}>
							<Text style={styles.esc}>esc</Text>
						</Pressable>
					</View>
					<FlatList
						ref={listRef}
						data={rows}
						keyboardShouldPersistTaps={KEYBOARD_SHOULD_PERSIST_TAPS}
						keyExtractor={(row) => row.key}
						renderItem={(info: ListRenderItemInfo<CommandCenterListRow>) =>
							renderRow({ info, activeResultId, onSelect: runResult, emptyLabel: t("commandCenter.empty") })
						}
						ItemSeparatorComponent={null}
						onScrollToIndexFailed={(event: {
							index: number;
						}) => {
							listRef.current?.scrollToOffset({ offset: event.index * 56, animated: true });
						}}
						contentContainerStyle={
							rows.length === 0 ? styles.emptyContainer : styles.listContent
						}
					/>
				</Pressable>
			</Pressable>
		</Modal>
	);
}

function renderRow(input: {
	info: ListRenderItemInfo<CommandCenterListRow>;
	activeResultId: string | null;
	onSelect(result: CommandCenterResult): void;
	emptyLabel: string;
}) {
	const { item } = input.info;
	if (item.kind === "section") {
		if (!item.title) return null;
		return (
			<View key={item.key} style={styles.sectionHeader}>
				<Text style={styles.sectionTitle}>{item.title}</Text>
			</View>
		);
	}
	const result = item.result;
	if (result.kind !== "contribution") return null;
	const contribution = result.contribution;
	if (contribution.presentation.kind !== "action") return null;
	const active = result.id === input.activeResultId;
	return (
		<Pressable
			key={item.key}
			onPress={() => input.onSelect(result)}
			onHoverIn={() => undefined}
			style={[styles.resultRow, active && styles.resultRowActive]}
		>
			{contribution.presentation.icon ? (
				<contribution.presentation.icon size={15} />
			) : (
				<View style={styles.iconFallback} />
			)}
			<Text style={styles.resultTitle} numberOfLines={1}>
				{contribution.presentation.title}
			</Text>
			{active ? <ThemedChevronRight size={15} /> : null}
		</Pressable>
	);
}

const styles = StyleSheet.create((theme) => ({
	backdrop: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.62)",
		justifyContent: "flex-start",
	},
	panel: {
		alignSelf: "center",
		marginTop: theme.spacing[16],
		width: "92%",
		maxWidth: 560,
		maxHeight: MAX_HEIGHT_PICK,
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.lg,
		borderWidth: 1,
		borderColor: theme.colors.border,
		overflow: "hidden",
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
		borderBottomWidth: 1,
		borderBottomColor: theme.colors.border,
	},
	input: {
		flex: 1,
		color: theme.colors.foreground,
		fontSize: theme.fontSize.content,
		paddingVertical: theme.spacing[1],
	},
	esc: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
		fontFamily: theme.fontFamily.mono,
		borderWidth: 1,
		borderColor: theme.colors.border,
		borderRadius: theme.borderRadius.sm,
		paddingHorizontal: theme.spacing[2],
		paddingVertical: 2,
	},
	listContent: { paddingBottom: theme.spacing[3] },
	emptyContainer: {
		padding: theme.spacing[6],
		alignItems: "center",
		justifyContent: "center",
	},
	sectionHeader: {
		paddingHorizontal: theme.spacing[3],
		paddingTop: theme.spacing[2],
		paddingBottom: theme.spacing[1],
	},
	sectionTitle: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: 10,
		fontWeight: "600",
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	resultRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[3],
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
	},
	resultRowActive: {
		backgroundColor: theme.colors.surface2,
	},
	resultTitle: {
		flex: 1,
		color: theme.colors.foreground,
		fontSize: theme.fontSize.content,
	},
	iconFallback: { width: 15, height: 15 },
}));
