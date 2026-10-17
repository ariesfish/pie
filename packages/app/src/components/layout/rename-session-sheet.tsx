// Session rename panel: AdaptiveModalSheet + prefilled text input. Submit
// delegates to the store (trim / whitespace-only = clear semantics); the row
// updates in place on success and the sheet closes. Failures surface as a
// toast via the sidebar's renameError effect, the row stays unchanged.
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { SessionListItem } from "@pie/protocol";

import { AdaptiveModalSheet, AdaptiveTextInput } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { useSessionListStore } from "@/stores/session-list-store";

export function RenameSessionSheet({
	session,
	visible,
	onClose,
}: {
	session: SessionListItem | null;
	visible: boolean;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const renameSession = useSessionListStore((s) => s.renameSession);
	const [text, setText] = useState("");

	const submit = async () => {
		if (!session) return;
		await renameSession(session.sessionId, text);
		onClose();
	};

	return (
		<AdaptiveModalSheet
			visible={visible && Boolean(session)}
			onClose={onClose}
			header={{ title: t("agentList.renameTitle") }}
			scrollable={false}
			footer={
				<>
					<Button variant="ghost" onPress={onClose}>
						{t("common.cancel")}
					</Button>
					<Button onPress={() => void submit()}>{t("agentList.renameSubmit")}</Button>
				</>
			}
		>
			<AdaptiveTextInput
				initialValue={session?.name ?? ""}
				resetKey={session?.sessionId ?? "none"}
				onChangeText={setText}
				placeholder={t("agentList.renamePlaceholder")}
				autoFocus
				testID="rename-session-input"
			/>
		</AdaptiveModalSheet>
	);
}
