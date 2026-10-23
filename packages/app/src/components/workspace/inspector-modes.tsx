// Inspector mode control — the single segmented control used by both the
// desktop inspector rail and the compact explorer drawer (DESIGN.md
// §Components/Navigation: one selected-state vocabulary, no accent fill).
import { Activity, Gauge, GitCompare, Package, FolderOpen } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useUnistyles } from "react-native-unistyles";

import { isCompactBreakpoint } from "@/constants/layout";

import { SegmentedControl } from "@/components/ui/segmented-control";
import type { ExplorerMode } from "@/stores/tabs-store";

export type InspectorMode = Exclude<ExplorerMode, null>;

const MODES: InspectorMode[] = ["files", "changes", "resources", "usage", "activity"];

const ICONS: Record<InspectorMode, typeof FolderOpen> = {
	files: FolderOpen,
	changes: GitCompare,
	resources: Package,
	usage: Gauge,
	// `activity` is part of ExplorerMode (tabs-store) but is not one of the
	// inspector's four primary modes; the header's activity toggle reaches it.
	activity: Activity,
};

export function InspectorModeControl({
	mode,
	onChange,
}: {
	mode: InspectorMode;
	onChange: (mode: InspectorMode) => void;
}) {
	const { t } = useTranslation();
	const { theme, rt } = useUnistyles();
	// Touch policy: the compact drawer renders these as 44px targets, the
	// desktop rail keeps the tight 28px control.
	const compact = isCompactBreakpoint(rt.breakpoint);

	const options = MODES.map((value) => {
		const Icon = ICONS[value];
		const label = t(`workspace.rail.${value}`);
		return {
			value,
			label,
			// Labels are hidden at this width; the accessible name carries them.
			accessibilityLabel: label,
			icon: ({ color, size }: { color: string; size: number }) => (
				<Icon size={size} color={color} strokeWidth={1.5} />
			),
		};
	});

	return (
		<SegmentedControl
			testID="inspector-modes"
			options={options}
			value={mode}
			onValueChange={onChange}
			size={compact ? "md" : "xs"}
			hideLabels
			style={{ margin: theme.spacing[1] }}
		/>
	);
}
