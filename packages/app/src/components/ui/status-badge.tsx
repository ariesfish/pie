// Ported from getpaseo/paseo (Apache-2.0)
import React, { useMemo, type ReactNode } from "react";
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type StatusBadgeVariant = "success" | "warning" | "error" | "muted";

interface StatusBadgeProps {
  label: string;
  variant?: StatusBadgeVariant;
  leading?: ReactNode;
  /** `xs` fits beside a line of `sm` text: the same label on tighter padding. */
  size?: "sm" | "xs";
}

/**
 * Status chip (DESIGN.md §Components/Cards): the semantic soft tint carries the
 * state, a matching status-coloured dot names the colour, and the label stays
 * on `ink`.
 *
 * The fills are the fixed DESIGN soft tokens, not a status hue at 12% over the
 * surface. On those values the hue measures: success 4.70:1, danger 5.75:1,
 * warning 4.17:1. Warning is still below the 4.5:1 text floor, so the label
 * does not take the status hue; `ink-3` on the same tints measures 4.95–5.10:1
 * but would make three chip variants speak two different label tones. The dot
 * carries the hue, the label rides on `ink` — one vocabulary for all variants.
 */
export function StatusBadge({ label, variant = "muted", leading, size = "sm" }: StatusBadgeProps) {
  const pillStyle = useMemo(
    () => [
      styles.pill,
      size === "xs" && styles.pillXs,
      variant === "success" && styles.pillSuccess,
      variant === "warning" && styles.pillWarning,
      variant === "error" && styles.pillError,
    ],
    [size, variant],
  );
  const dotStyle = useMemo(
    () => [
      styles.dot,
      variant === "success" && styles.dotSuccess,
      variant === "warning" && styles.dotWarning,
      variant === "error" && styles.dotError,
    ],
    [variant],
  );

  return (
    <View style={pillStyle}>
      {leading}
      <View style={dotStyle} />
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface3,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
  },
  pillXs: {
    paddingHorizontal: theme.spacing[1.5],
    paddingVertical: 1,
  },
  // Soft tint background + transparent border = the state reads as a state,
  // not as a fill competing with the accent.
  pillSuccess: {
    backgroundColor: theme.colors.statusSuccessSoft,
    borderColor: "transparent",
  },
  pillWarning: {
    backgroundColor: theme.colors.statusWarningSoft,
    borderColor: "transparent",
  },
  pillError: {
    backgroundColor: theme.colors.statusDangerSoft,
    borderColor: "transparent",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.foregroundExtraMuted,
  },
  dotSuccess: { backgroundColor: theme.colors.statusSuccess },
  dotWarning: { backgroundColor: theme.colors.statusWarning },
  dotError: { backgroundColor: theme.colors.statusDanger },
  pillText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
}));
