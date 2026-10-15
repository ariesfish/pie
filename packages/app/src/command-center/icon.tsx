// Ported from getpaseo/paseo (Apache-2.0) — command-center/icon.tsx.
// [pie] generalized: paseo adapts its agent-controls icon family; pie
// accepts any icon component with the {size, color} lucide-style props.
import { withUnistyles } from "react-native-unistyles";
import type { ComponentType } from "react";

import type { CommandCenterIcon, CommandCenterIconProps } from "./contributions";

/** An icon component over {size, color} (both lucide and hand-rolled icons qualify). */
export type CommandCenterSourceIcon = ComponentType<{
	size: number;
	color?: string;
}>;

const commandCenterIcons = new Map<CommandCenterSourceIcon, CommandCenterIcon>();

export function getCommandCenterIcon(Component: CommandCenterSourceIcon): CommandCenterIcon {
  const cached = commandCenterIcons.get(Component);
  if (cached) return cached;

  const ThemedIcon = withUnistyles(Component as ComponentType<Record<string, unknown>>, (theme) => ({
    color: theme.colors.foregroundMuted,
  }));
  function CommandCenterIconAdapter({ size }: CommandCenterIconProps) {
    return <ThemedIcon size={size} />;
  }
  commandCenterIcons.set(Component, CommandCenterIconAdapter);
  return CommandCenterIconAdapter;
}
