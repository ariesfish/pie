// Session history tree. The rows come from the snapshot's flat tree metadata;
// selecting a row can rewind the active branch (navigate) or fork a new
// session at that point. Both operations are daemon commands, not local edits.
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Brain,
  Circle,
  Cpu,
  FileText,
  Gauge,
  GitBranch,
  Sparkles,
  Tag,
  User,
  Wrench,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Button } from "@/components/ui/button";
import { relativeTimeLabel } from "@/lib/relative-time";
import { useConnectionStore, useSessionTreeView } from "@/stores/connection-store";
import { useTabsStore } from "@/stores/tabs-store";
import type { TreeNodeMeta } from "@pie/protocol";

interface TreeRow {
  node: TreeNodeMeta;
  depth: number;
  childCount: number;
}

function buildRows(nodes: TreeNodeMeta[]): TreeRow[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string | null, TreeNodeMeta[]>();
  for (const node of nodes) {
    const parent = node.parentId && byId.has(node.parentId) ? node.parentId : null;
    const list = children.get(parent);
    if (list) list.push(node);
    else children.set(parent, [node]);
  }
  for (const list of children.values()) {
    list.sort((a, b) => {
      const ta = a.timestamp ?? "";
      const tb = b.timestamp ?? "";
      return ta === tb ? (a.id < b.id ? -1 : 1) : ta < tb ? -1 : 1;
    });
  }
  const rows: TreeRow[] = [];
  const seen = new Set<string>();
  const visit = (node: TreeNodeMeta, depth: number) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    rows.push({ node, depth, childCount: children.get(node.id)?.length ?? 0 });
    for (const child of children.get(node.id) ?? []) visit(child, depth + 1);
  };
  for (const root of children.get(null) ?? []) visit(root, 0);
  return rows;
}

function rowIcon(node: TreeNodeMeta) {
  if (node.type === "message") {
    if (node.role === "user") return User;
    if (node.role === "toolResult") return Wrench;
    return Sparkles;
  }
  if (node.type === "label") return Tag;
  if (node.type === "model_change") return Cpu;
  if (node.type === "thinking_level_change") return Brain;
  if (node.type === "usage") return Gauge;
  if (node.type === "compaction" || node.type === "branch_summary") return FileText;
  return Circle;
}

export function SessionTreePanel() {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const { nodes, leafId, activePath } = useSessionTreeView();
  const sessionId = useConnectionStore((s) => s.sessionId);
  const streaming = useConnectionStore((s) => s.streaming);
  const navigateToEntry = useConnectionStore((s) => s.navigateToEntry);
  const forkAtEntry = useConnectionStore((s) => s.forkAtEntry);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"navigate" | "fork" | null>(null);

  useEffect(() => {
    setSelectedId(null);
  }, [sessionId]);

  const rows = useMemo(() => buildRows(nodes), [nodes]);
  const selected = rows.find((row) => row.node.id === selectedId)?.node ?? null;

  const goTo = async () => {
    if (!selected || selected.id === leafId || busy) return;
    setBusy("navigate");
    await navigateToEntry(selected.id);
    setBusy(null);
  };

  const fork = async () => {
    if (!selected || busy) return;
    setBusy("fork");
    const forkedId = await forkAtEntry(selected.id);
    setBusy(null);
    if (forkedId) useTabsStore.getState().openSession(forkedId);
  };

  return (
    <View style={styles.root} testID="session-tree-panel">
      <View style={styles.header}>
        <Text style={styles.title}>{t("history.title")}</Text>
        <Text style={styles.count}>{t("history.count", { count: rows.length })}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>{t("history.empty")}</Text>
        ) : (
          rows.map(({ node, depth, childCount }) => {
            const Icon = rowIcon(node);
            const active = activePath.has(node.id);
            const isLeaf = node.id === leafId;
            const isSelected = node.id === selectedId;
            const text = node.preview || node.label || node.type;
            return (
              <Pressable
                key={node.id}
                testID="session-tree-row"
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setSelectedId(node.id)}
                style={[
                  styles.row,
                  { paddingLeft: theme.spacing[2] + depth * 14 },
                  active && styles.rowActive,
                  isSelected && styles.rowSelected,
                ]}
              >
                <View style={styles.treeSlot}>
                  {childCount > 1 ? (
                    <GitBranch size={11} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
                  ) : (
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: active ? theme.colors.foreground : theme.colors.borderAccent },
                      ]}
                    />
                  )}
                </View>
                <Icon
                  size={13}
                  color={active ? theme.colors.foreground : theme.colors.foregroundExtraMuted}
                  strokeWidth={1.5}
                />
                <Text
                  style={[styles.rowText, active && styles.rowTextActive]}
                  numberOfLines={1}
                >
                  {text}
                </Text>
                {node.label && node.preview ? <Text style={styles.label}>{node.label}</Text> : null}
                {isLeaf ? <Text style={styles.current}>{t("history.current")}</Text> : null}
                {node.timestamp ? (
                  <Text style={styles.time}>
                    {relativeTimeLabel(t, node.timestamp)}
                  </Text>
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
      {selected ? (
        <View style={styles.detail}>
          <Text style={styles.detailTitle} numberOfLines={2}>
            {selected.preview || selected.label || selected.type}
          </Text>
          <Text style={styles.detailMeta}>
            {selected.type}
            {selected.timestamp ? ` · ${relativeTimeLabel(t, selected.timestamp)}` : ""}
          </Text>
          <View style={styles.actions}>
            <Button
              size="sm"
              variant="default"
              disabled={selected.id === leafId || streaming || busy !== null}
              loading={busy === "navigate"}
              onPress={() => void goTo()}
            >
              {t("history.goHere")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={streaming || busy !== null}
              loading={busy === "fork"}
              onPress={() => void fork()}
            >
              {t("history.forkHere")}
            </Button>
          </View>
        </View>
      ) : (
        <Text style={styles.hint}>{t("history.hint")}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  count: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
  list: { padding: theme.spacing[2], gap: theme.spacing[0.5], paddingBottom: theme.spacing[6] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[1],
    paddingRight: theme.spacing[2],
    borderRadius: theme.borderRadius.sm,
  },
  rowActive: { backgroundColor: theme.colors.surface2 },
  rowSelected: { borderWidth: 1, borderColor: theme.colors.accent },
  treeSlot: { width: 12, alignItems: "center" },
  dot: { width: 4, height: 4, borderRadius: theme.borderRadius.full },
  rowText: { flex: 1, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  rowTextActive: { color: theme.colors.foreground, fontWeight: theme.fontWeight.medium },
  label: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
    maxWidth: 80,
  },
  current: { color: theme.colors.accent, fontSize: theme.fontSize.sm },
  time: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
  empty: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
    padding: theme.spacing[3],
  },
  hint: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
    padding: theme.spacing[3],
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  detail: {
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
    padding: theme.spacing[3],
    gap: theme.spacing[1],
    backgroundColor: theme.colors.surface1,
  },
  detailTitle: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  detailMeta: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
  actions: { flexDirection: "row", gap: theme.spacing[2], marginTop: theme.spacing[1] },
}));
