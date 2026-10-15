// [pie] Global error boundary: an uncaught render throw used to leave a
// blank page with no clue. Catch it here, show the message + stack head,
// and offer a retry. Deliberately free of react-native-unistyles: when the
// crash is itself a theme/registry failure, the fallback must still render.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

interface Props {
	children: ReactNode;
}

interface State {
	error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error("[AppErrorBoundary]", error, info.componentStack);
	}

	render() {
		const { error } = this.state;
		if (!error) return this.props.children;
		return <CrashScreen error={error} onRetry={() => this.setState({ error: null })} />;
	}
}

const COLORS = {
	bg: "#0a0a0c",
	fg: "#e6e9ef",
	danger: "#e5534b",
	muted: "#8b93a7",
	surface: "#15161a",
	border: "#26272d",
	accent: "#2b6cb0",
};

function CrashScreen({ error, onRetry }: { error: Error; onRetry(): void }) {
	return (
		<View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
			<Text style={{ color: COLORS.danger, fontSize: 18, fontWeight: "600" }}>
				Something broke
			</Text>
			<Text style={{ color: COLORS.fg, fontSize: 15, textAlign: "center" }} selectable>
				{error.message || String(error)}
			</Text>
			<ScrollView style={{ maxHeight: 260, width: "100%", backgroundColor: COLORS.surface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border }} contentContainerStyle={{ padding: 12 }}>
				<Text style={{ color: COLORS.muted, fontSize: 12, fontFamily: "monospace" }} selectable>
					{String(error.stack ?? "").slice(0, 800)}
				</Text>
			</ScrollView>
			<Pressable
				style={{ marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.accent }}
				onPress={onRetry}
			>
				<Text style={{ color: "#ffffff", fontSize: 15, fontWeight: "500" }}>Try again</Text>
			</Pressable>
		</View>
	);
}
