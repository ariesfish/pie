// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/panels/register-panels.ts
// (Pie adaptation: registers pie's four built-in panels — the session chat
// surface, the shared files/changes panels, and the sticky new-tab creator.
// Third-party extensions register here eventually via the panels seam.)
import { ChatList } from "@/components/chat/chat-list";
import { Composer } from "@/components/chat/composer";
import { FilesPanel } from "@/components/panels/files-panel";
import { ChangesPanel } from "@/components/panels/changes-panel";
import { NewSessionPanel } from "@/components/layout/new-session-panel";
import { GitCompare, MessageSquare, FolderOpen, Plus } from "lucide-react-native";
import { definePanel, registerPanel } from "@/panels/panel-registry";
import type { PanelProps } from "@/panels/panel-registry";

function SessionPanel({ target }: PanelProps<"session">) {
	return (
		<>
			<ChatList />
			<Composer />
		</>
	);
}

function FilesTabPanel(_props: PanelProps<"files">) {
	return <FilesPanel />;
}

function ChangesTabPanel(_props: PanelProps<"changes">) {
	return <ChangesPanel />;
}

function NewTabPanel(_props: PanelProps<"new_tab">) {
	return <NewSessionPanel />;
}

registerPanel(
	definePanel("session", {
		component: SessionPanel,
		presentation: { label: (t) => t("panels.chat"), icon: MessageSquare },
	}),
);

registerPanel(
	definePanel("files", {
		component: FilesTabPanel,
		presentation: { label: (t) => t("panels.files"), icon: FolderOpen },
	}),
);

registerPanel(
	definePanel("changes", {
		component: ChangesTabPanel,
		presentation: { label: (t) => t("panels.changes"), icon: GitCompare },
	}),
);

registerPanel(
	definePanel("new_tab", {
		component: NewTabPanel,
		presentation: { label: (t) => t("agentList.newSession"), icon: Plus },
	}),
);
