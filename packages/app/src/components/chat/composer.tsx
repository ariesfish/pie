// State machine shaped after paseo/packages/app/src/composer (Apache-2.0):
// draft state (input value) is separated from submission flow (delivery
// decision + send), and streaming forces an explicit steer/followUp choice
// instead of guessing. Rendering is Pie-specific and unistyles-themed.
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Brain, ChevronDown, Cpu } from "lucide-react-native";
import type { ModelCatalogItem, ThinkingLevel } from "@pie/protocol";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { DEFAULT_CONTENT_MAX_WIDTH } from "@/styles/theme";
import { useTranslation } from "react-i18next";
import { ArrowBigUp, CornerDownLeft, Layers, X, Zap } from "lucide-react-native";
import {
	AttachStrip,
	AttachButton,
	type ComposerAttachment,
} from "./composer/attach";

import {
	useConnectionStore,
	type SendDisposition,
} from "@/stores/connection-store";
import { Button } from "@/components/ui/button";

type Delivery = "auto" | "steer" | "followUp";

export function Composer() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const streaming = useConnectionStore((s) => s.streaming);
	const sessionId = useConnectionStore((s) => s.sessionId);
	const sendPrompt = useConnectionStore((s) => s.sendPrompt);
	const abortRun = useConnectionStore((s) => s.abortRun);
	const clearError = useConnectionStore((s) => s.clearError);

	const inputRef = useRef<TextInput | null>(null);
	const submitRef = useRef<((delivery: Delivery) => void) | null>(null);
	const [draft, setDraft] = useState("");
	const [images, setImages] = useState<
		{ data: string; mimeType: string; preview: string }[]
	>([]);
	const [queuedTip, setQueuedTip] = useState(false);
	const [height] = useState(72);
	const [modelMenu, setModelMenu] = useState(false);
	const [thinkingMenu, setThinkingMenu] = useState(false);
	const models = useConnectionStore((s) => s.models);
	const pendingModel = useConnectionStore((s) => s.pendingModel);
	const pendingThinking = useConnectionStore((s) => s.pendingThinking);
	const setPendingModel = useConnectionStore((s) => s.setPendingModel);
	const setPendingThinking = useConnectionStore((s) => s.setPendingThinking);

	// Composer height: fixed comfortable minimum; the multiline TextInput
	// grows with content (grip-drag resizing moves to W5 as an invisible
	// edge affordance — the handle itself read as noise; paseo.png has no
	// such grip).
	const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => () => {
		if (tipTimer.current) clearTimeout(tipTimer.current);
	}, []);

	// RN-web's multiline TextInput makes Enter a newline and never fires
	// onSubmitEditing (onKeyPress is equally unreliable there) — the
	// dogfood first flight caught a composer that could not send at all on
	// web. Park the latest submit behind a ref and listen on the real DOM
	// node; Shift+Enter keeps the newline, IME composition is respected.
	submitRef.current = (delivery: Delivery) => {
		void submit(delivery);
	};
	useEffect(() => {
		if (typeof document === "undefined") return;
		// RN component refs are not DOM nodes; on web the composer's
		// multiline TextInput renders exactly one <textarea> — bind there.
		const node = document.querySelector("textarea");
		if (!node) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
			event.preventDefault();
			submitRef.current?.(streaming ? "followUp" : "auto");
		};
		node.addEventListener("keydown", onKeyDown);
		return () => node.removeEventListener("keydown", onKeyDown);
	}, [streaming]);

	const submit = async (delivery: Delivery) => {
		const text = draft.trim();
		if ((!text && images.length === 0) || !sessionId) return;
		// Pi semantics: while streaming the daemon refuses "auto" — the UI must
		// force an explicit steer vs followUp decision (refuse to guess).
		if (streaming && delivery === "auto") return;
		const disposition: SendDisposition = await sendPrompt(
			text,
			delivery,
			images.length > 0 ? images.map(({ data, mimeType }) => ({ data, mimeType })) : undefined,
		);
		if (disposition === "queued" || disposition === "busy-confirmed") {
			setDraft("");
			setImages([]);
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
			<View style={styles.card}>
				{/* paseo.png composer: borderless multiline field on the card,
				    the affordance (attach / model / thinking / send) runs along
				    the bottom edge of the card. */}
				<TextInput
					placeholder={streaming ? t("chat.placeholderStreaming") : t("chat.placeholder")}
					placeholderTextColor={theme.colors.foregroundMuted}
					multiline
					value={draft}
					onChangeText={setDraft}
					style={[styles.input, { minHeight: height }]}
					ref={inputRef}
					onSubmitEditing={() => {
						void submit("auto");
					}}
				/>
				<AttachStrip images={images} onRemove={(i) => setImages((prev) => prev.filter((_, j) => j !== i))} label={t("chat.removeImage")} />
				{draft.length > 4000 && <Text style={styles.limit}>{draft.length}/∞</Text>}
				<View style={styles.cardBar}>
					<AttachButton
						label={t("chat.attachImage")}
						onAttach={(list) => setImages((prev) => [...prev, ...list])}
					/>
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
					<View style={styles.cardBarSpacer} />
					{streaming ? (
						<View style={styles.choices}>
							<Pressable
								style={[styles.choice, styles.stop]}
								accessibilityLabel={t("chat.stop")}
								onPress={() => void abortRun()}
							>
								<X size={15} color={theme.colors.onStrong} strokeWidth={1.75} />
							</Pressable>
							<Pressable
								style={[styles.choice, styles.steer]}
								accessibilityLabel={t("chat.steer")}
								onPress={() => void submit("steer")}
							>
								<Zap size={15} color={theme.colors.onStrong} strokeWidth={1.5} />
							</Pressable>
							<Pressable
								style={styles.choice}
								accessibilityLabel={t("chat.followUp")}
								onPress={() => void submit("followUp")}
							>
								<Layers size={15} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
							</Pressable>
						</View>
					) : (
						<Pressable
							style={({ pressed }) => [styles.sendRound, pressed && { opacity: 0.8 }]}
							accessibilityLabel={t("common.send")}
							onPress={() => void submit("auto")}
						>
							<CornerDownLeft size={16} color={theme.colors.accentForeground} strokeWidth={1.75} />
						</Pressable>
					)}
				</View>
			</View>
		</View>
	);
}

// Full protocol vocabulary (user feedback: the first flight shipped only a
// four-level subset). Order mirrors ThinkingLevel's ramp.
const THINKING_LEVELS: ThinkingLevel[] = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];

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
	root: {
		gap: theme.spacing[1],
		// User feedback first flight: the floating composer had no seam against
		// the transcript — give it the content measure plus a top hairline.
		paddingHorizontal: theme.spacing[3],
		paddingTop: theme.spacing[1],
		borderTopWidth: theme.borderWidth[1],
		borderTopColor: theme.colors.border,
		backgroundColor: theme.colors.background,
		maxWidth: DEFAULT_CONTENT_MAX_WIDTH + theme.spacing[6],
		alignSelf: "center",
		width: "100%",
	},
	// paseo.png composer card: page-white, ~20px radius, hairline border,
	// soft shadow; the multiline field sits on it with no inner chrome.
	card: {
		backgroundColor: theme.colors.background,
		borderRadius: theme.borderRadius["2xl"],
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		paddingBottom: theme.spacing[1],
		...theme.shadow.md,
	},
	input: {
		paddingHorizontal: theme.spacing[3],
		paddingTop: theme.spacing[2],
		paddingBottom: theme.spacing[1],
		color: theme.colors.foreground,
		fontSize: theme.fontSize.content,
		textAlignVertical: "top",
	},
	cardBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingHorizontal: theme.spacing[2],
		paddingBottom: 2,
	},
	cardBarSpacer: { flex: 1 },
	sendRound: {
		width: 30,
		height: 30,
		borderRadius: theme.borderRadius.full,
		backgroundColor: theme.colors.accent,
		alignItems: "center",
		justifyContent: "center",
	},
	// Streaming trio (stop/steer/followUp) sits inline where Send lives —
	// first-flight audit caught them stacked vertically off the input's edge.
	choices: { flexDirection: "row", gap: theme.spacing[1] },
	stop: {
		backgroundColor: theme.colors.statusDanger,
		borderColor: theme.colors.statusDanger,
		borderWidth: 1,
		borderRadius: 8,
	},




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
