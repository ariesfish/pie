// State machine shaped after paseo/packages/app/src/composer (Apache-2.0):
// draft state (input value) is separated from submission flow (delivery
// decision + send), and streaming forces an explicit steer/followUp choice
// instead of guessing. Rendering is Pie-specific and unistyles-themed.
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { PanResponder } from "react-native";
import { Brain, ChevronDown, Cpu } from "lucide-react-native";
import type { ModelCatalogItem, ThinkingLevel } from "@pie/protocol";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ArrowBigUp, CornerDownLeft, Layers, Zap } from "lucide-react-native";

import {
	useConnectionStore,
	type SendDisposition,
} from "@/stores/connection-store";
import { Button } from "@/components/ui/button";

type Delivery = "auto" | "steer" | "followUp";

export function Composer() {
	const { t } = useTranslation();
	const streaming = useConnectionStore((s) => s.streaming);
	const sessionId = useConnectionStore((s) => s.sessionId);
	const sendPrompt = useConnectionStore((s) => s.sendPrompt);
	const clearError = useConnectionStore((s) => s.clearError);

	const [draft, setDraft] = useState("");
	const [queuedTip, setQueuedTip] = useState(false);
	const [height, setHeight] = useState(150);
	const [modelMenu, setModelMenu] = useState(false);
	const [thinkingMenu, setThinkingMenu] = useState(false);
	const models = useConnectionStore((s) => s.models);
	const pendingModel = useConnectionStore((s) => s.pendingModel);
	const pendingThinking = useConnectionStore((s) => s.pendingThinking);
	const setPendingModel = useConnectionStore((s) => s.setPendingModel);
	const setPendingThinking = useConnectionStore((s) => s.setPendingThinking);

	// Composer resize (paseo agent-controls dock): drag the top grip;
	// clamp keeps the input usable and the chat list readable.
	const dragRef = useRef<{ startY: number; startH: number } | null>(null);
	const gripResponder = useRef(
		PanResponder.create({
			onMoveShouldSetPanResponder: () => true,
			onPanResponderGrant: (e) => {
				dragRef.current = { startY: e.nativeEvent.pageY, startH: height };
			},
			onPanResponderMove: (e) => {
				if (!dragRef.current) return;
				const dy = dragRef.current.startY - e.nativeEvent.pageY;
				setHeight(Math.max(88, Math.min(420, dragRef.current.startH + dy)));
			},
			onPanResponderRelease: () => {
				dragRef.current = null;
			},
		}),
	).current;
	const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => () => {
		if (tipTimer.current) clearTimeout(tipTimer.current);
	}, []);

	const submit = async (delivery: Delivery) => {
		const text = draft.trim();
		if (!text || !sessionId) return;
		// Pi semantics: while streaming the daemon refuses "auto" — the UI must
		// force an explicit steer vs followUp decision (refuse to guess).
		if (streaming && delivery === "auto") return;
		const disposition: SendDisposition = await sendPrompt(text, delivery);
		if (disposition === "queued" || disposition === "busy-confirmed") {
			setDraft("");
			clearError();
			setQueuedTip(true);
			if (tipTimer.current) clearTimeout(tipTimer.current);
			tipTimer.current = setTimeout(() => setQueuedTip(false), 1800);
		}
	};

	if (!sessionId) {
		return (
			<View style={styles.disabledRow}>
				<Text style={styles.disabledText}>{t("chat.noSession")}</Text>
			</View>
		);
	}

	return (
		<View style={styles.root}>
			{queuedTip && <Text style={styles.tip}>{t("chat.queue")} · ok</Text>}
			<View
				{...gripResponder.panHandlers}
				style={styles.grip}
				accessibilityLabel="composer resize"
			/>
			<View style={styles.composerRow}>
				<TextInput
					placeholder={streaming ? t("chat.placeholderStreaming") : t("chat.placeholder")}
					placeholderTextColor="#4b5262"
					multiline
					value={draft}
					onChangeText={setDraft}
					style={[styles.input, { height }]}
					onSubmitEditing={() => {
						void submit("auto");
					}}
				/>
				{streaming ? (
					<View style={styles.choices}>
						<Pressable
							style={[styles.choice, styles.steer]}
							onPress={() => void submit("steer")}
						>
							<Zap size={18} color="#e6e9ef" strokeWidth={1.5} />
						</Pressable>
						<Pressable
							style={[styles.choice]}
							onPress={() => void submit("followUp")}
						>
							<Layers size={18} color="#8b93a7" strokeWidth={1.5} />
						</Pressable>
					</View>
				) : (
					<Button
						variant="default"
						size="md"
						leftIcon={<CornerDownLeft size={16} color="#ffffff" strokeWidth={1.5} />}
						onPress={() => void submit("auto")}
					>
						{t("common.send")}
					</Button>
				)}
			</View>
			{draft.length > 4000 && <Text style={styles.limit}>{draft.length}/∞</Text>}
			<AgentControlsRow
				models={models}
				pendingModel={pendingModel}
				pendingThinking={pendingThinking}
				onPickModel={(m) => {
					setPendingModel(m);
					setModelMenu(false);
				}}
				onPickThinking={(l) => {
					setPendingThinking(l);
					setThinkingMenu(false);
				}}
				modelMenu={modelMenu}
				thinkingMenu={thinkingMenu}
				onToggleModelMenu={() => {
					setModelMenu((v) => !v);
					setThinkingMenu(false);
				}}
				onToggleThinkingMenu={() => {
					setThinkingMenu((v) => !v);
					setModelMenu(false);
				}}
			/>
		</View>
	);
}

const THINKING_LEVELS: ThinkingLevel[] = ["off", "low", "medium", "high"];

/** Paseo agent-controls row (subset): model picker + thinking level picker. */
function AgentControlsRow({
	models,
	pendingModel,
	pendingThinking,
	onPickModel,
	onPickThinking,
	modelMenu,
	thinkingMenu,
	onToggleModelMenu,
	onToggleThinkingMenu,
}: {
	models: ModelCatalogItem[];
	pendingModel: ModelCatalogItem | null;
	pendingThinking: ThinkingLevel | null;
	onPickModel: (m: ModelCatalogItem) => void;
	onPickThinking: (l: ThinkingLevel) => void;
	modelMenu: boolean;
	thinkingMenu: boolean;
	onToggleModelMenu: () => void;
	onToggleThinkingMenu: () => void;
}) {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const modelLabel = pendingModel ? `${pendingModel.provider}/${pendingModel.id}` : t("controls.modelDefault");
	const thinkingLabel = pendingThinking ?? t("controls.thinkingDefault");
	return (
		<View style={styles.controlsRow}>
			<Pressable style={styles.controlTrigger} onPress={onToggleModelMenu}>
				<Cpu size={12} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
				<Text style={styles.controlLabel} numberOfLines={1}>
					{modelLabel}
				</Text>
				<ChevronDown size={10} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
			</Pressable>
			{modelMenu ? (
				<View style={styles.menu}>
					{models.length === 0 ? (
						<Text style={styles.menuEmpty}>{t("controls.modelEmpty")}</Text>
					) : (
						models.map((m) => (
							<Pressable key={`${m.provider}/${m.id}`} style={styles.menuItem} onPress={() => onPickModel(m)}>
								<Text style={styles.menuItemText} numberOfLines={1}>
									{m.provider}/{m.id}
								</Text>
							</Pressable>
						))
					)}
				</View>
			) : null}
			<Pressable style={styles.controlTrigger} onPress={onToggleThinkingMenu}>
				<Brain size={12} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
				<Text style={styles.controlLabel}>{thinkingLabel}</Text>
				<ChevronDown size={10} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
			</Pressable>
			{thinkingMenu ? (
				<View style={[styles.menu, { left: 140 }]}>
					{THINKING_LEVELS.map((l) => (
						<Pressable key={l} style={styles.menuItem} onPress={() => onPickThinking(l)}>
							<Text
								style={[
									styles.menuItemText,
									pendingThinking === l && styles.menuItemTextOn,
								]}
							>
								{l}
							</Text>
						</Pressable>
					))}
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: { gap: theme.spacing[1] },
	composerRow: { flexDirection: "row", gap: theme.spacing[2], alignItems: "flex-end" },
	input: {
		flex: 1,
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
		color: theme.colors.foreground,
		fontSize: theme.fontSize.content,
	},
	choices: { flexDirection: "column", gap: theme.spacing[1] },
	choice: {
		backgroundColor: theme.colors.surface2,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		paddingVertical: theme.spacing[2],
		paddingHorizontal: theme.spacing[3],
		alignItems: "center",
		justifyContent: "center",
	},
	steer: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
	disabledRow: {
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.lg,
		padding: theme.spacing[3],
		alignItems: "center",
	},
	disabledText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
	tip: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm, alignSelf: "flex-end" },
	limit: { color: theme.colors.statusWarning, fontSize: theme.fontSize.sm, alignSelf: "flex-end" },
	grip: {
		height: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	controlsRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1.5],
	},
	controlTrigger: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: theme.spacing[2],
		paddingVertical: 4,
		borderRadius: theme.borderRadius.md,
		backgroundColor: theme.colors.surface1,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		maxWidth: 240,
	},
	controlLabel: { color: theme.colors.foregroundMuted, fontSize: 11 },
	menu: {
		position: "absolute",
		bottom: 30,
		left: 0,
		minWidth: 200,
		maxHeight: 260,
		backgroundColor: theme.colors.surface2,
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		padding: 4,
		zIndex: 40,
	},
	menuItem: {
		paddingHorizontal: theme.spacing[2],
		paddingVertical: 5,
		borderRadius: theme.borderRadius.md,
	},
	menuItemText: { color: theme.colors.foregroundMuted, fontSize: 11 },
	menuItemTextOn: { color: theme.colors.accentForeground },
	menuEmpty: { color: theme.colors.foregroundExtraMuted, fontSize: 11, padding: theme.spacing[2] },
}));
