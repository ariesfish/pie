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
 * Why the label is not status-coloured: at the chip's 12px the status hue does
 * not clear D1 (4.5:1) on the tints it sits on — `statusWarning` on its own tint
 * is 4.17:1 on canvas and 3.67:1 on the raised surface, `statusSuccess` 4.51 /
 * 4.00. DESIGN.md §Colors already rules this out ("这些组合只允许用于图标或形状，
 * 不允许承载小字"), so the colour moves to the dot and the text rides on ink.
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
    backgroundColor: theme.colors.statusSuccessTint,
    borderColor: "transparent",
  },
  pillWarning: {
    backgroundColor: theme.colors.statusWarningTint,
    borderColor: "transparent",
  },
  pillError: {
    backgroundColor: theme.colors.statusDangerTint,
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
