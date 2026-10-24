// Ported from getpaseo/paseo (Apache-2.0) — file-pane/conflict-alert.tsx.
import { Button } from "@/components/ui/button";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { AlertTriangle } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";

const ThemedAlertTriangle = withUnistyles(AlertTriangle);
const warningIconMapping = (theme: Theme) => ({ color: theme.colors.statusWarning });

export type FileConflictAlertState =
  | { kind: "changed"; canOverwrite: boolean; onReload(): void; onOverwrite(): void }
  | { kind: "deleted" }
  | { kind: "checkFailed"; retrying: boolean; onRetry(): void };

export function FileConflictAlert({ state }: { state: FileConflictAlertState }) {
  const { t } = useTranslation();
  let title = t("conflict.changedOnDisk");
  if (state.kind === "deleted") title = t("conflict.deletedTitle");
  else if (state.kind === "checkFailed") title = t("conflict.checkFailedTitle");
  let description: string | undefined;
  if (state.kind !== "changed") description = t("conflict.preservedDescription");
  else if (state.canOverwrite) description = t("conflict.conflictDescription");

  return (
    <View style={styles.container} testID="file-conflict-alert" accessibilityRole="alert">
      <ThemedAlertTriangle size={ICON_SIZE.sm} uniProps={warningIconMapping} />
      <View style={styles.message}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {state.kind !== "deleted" ? (
        <View style={styles.actions}>
          {state.kind === "changed" && state.canOverwrite ? (
            <Button variant="outline" size="sm" onPress={state.onOverwrite}>
              {t("conflict.overwrite")}
            </Button>
          ) : null}
          {state.kind === "changed" ? (
            <Button variant="outline" size="sm" onPress={state.onReload}>
              {t("conflict.reload")}
            </Button>
          ) : null}
          {state.kind === "checkFailed" ? (
            <Button variant="outline" size="sm" onPress={state.onRetry} loading={state.retrying}>
              {t("conflict.retry")}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.statusWarning,
    backgroundColor: theme.colors.surface1,
  },
  message: {
    flex: 1,
    flexBasis: 180,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  title: {
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexShrink: 0,
    marginLeft: "auto",
    flexDirection: "row",
    gap: theme.spacing[2],
  },
}));
