// Ported from getpaseo/paseo (Apache-2.0)
import type { Theme } from "@/styles/theme";

export const mutedIconColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

export const extraMutedIconColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundExtraMuted,
});
