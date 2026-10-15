// Ported from getpaseo/paseo (Apache-2.0) — types/stream.ts.
// [pie] narrowed to the kind surface the agent-stream foundation
// discriminates on. Payloads stay open (`unknown`) where paseo carries
// agent-message/provider detail pies does not model yet; W4b fills them
// as the streaming pipeline rewires onto these items.
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface TimelinePosition {
  epoch: string;
  seq: number;
}

/** Agent provider identity (opaque in pie until the agent surfaces land). */
export type AgentProvider = string;

export interface UserMessageItem {
  kind: "user_message";
  id: string;
  clientMessageId?: string;
  turnId?: string;
  timelineCursor?: TimelinePosition;
  text: string;
  timestamp: Date;
  /** [pie] placeholder until attachment surfacing (W4d); only the count matters here. */
  images?: unknown[];
}

export interface AssistantMessageItem {
  kind: "assistant_message";
  id: string;
  messageId?: string;
  turnId?: string;
  timelineCursor?: TimelinePosition;
  /** Rendered markdown text (W4b maps content blocks onto this). */
  text: string;
  timestamp: Date;
  /** Display-only fields, assigned after source-item plugin transforms. */
  blockGroupId?: string;
  blockIndex?: number;
}

export type ThoughtStatus = "loading" | "ready";

export interface ThoughtItem {
  kind: "thought";
  id: string;
  timelineCursor?: TimelinePosition;
  turnId?: string;
  text: string;
  timestamp: Date;
  status: ThoughtStatus;
}

export type AgentToolCallStatus =
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  /** Orchestrator-plane statuses arrive through the same union in tests. */
  | "executing";

/**
 * [pie] open tool-call payload: the existing chat pipeline models tool
 * calls as content blocks inside the assistant message plus the
 * connection store's ToolCallRecord; W4b lifts them into items and
 * tightens `data`.
 */
export interface ToolCallPayload {
  source: "agent" | "orchestrator";
  data: ToolCallData;
}

/**
 * Open tool-call data: the exact fields vary between the agent
 * (AgentToolCallData) and orchestrator planes; pie keeps the known core
 * optional until W4b tightens this with the real pipeline payloads.
 */
export interface ToolCallData {
  toolCallId?: string;
  callId?: string;
  toolName?: string;
  name?: string;
  detail?: unknown;
  provider?: AgentProvider;
  status?: AgentToolCallStatus;
  arguments?: unknown;
  result?: unknown;
  error?: unknown;
}

export interface ToolCallItem {
  kind: "tool_call";
  id: string;
  timelineCursor?: TimelinePosition;
  turnId?: string;
  timestamp: Date;
  payload: ToolCallPayload;
}

type NotificationLevel = "info" | "warning" | "error";

export interface NotificationItem {
  kind: "notification";
  sourceType: "error" | "notification";
  id: string;
  timelineCursor?: TimelinePosition;
  turnId?: string;
  timestamp: Date;
  level: NotificationLevel;
  message: string;
}

export interface CompactionItem {
  kind: "compaction";
  id: string;
  timelineCursor?: TimelinePosition;
  turnId?: string;
  timestamp: Date;
  status: "loading" | "completed";
  trigger?: "auto" | "manual";
  preTokens?: number;
}

export interface PluginTimelineStreamItem {
  kind: "plugin";
  id: string;
  timelineCursor?: TimelinePosition;
  turnId?: string;
  timestamp: Date;
  pluginId: string;
  pluginItemId: string;
  itemKind: string;
  version: number;
  data: JsonValue;
}

export interface TodoEntry {
  text: string;
  completed: boolean;
  id?: string;
  status?: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

export type TaskActivity =
  | { type: "created"; count: number }
  | { type: "added" | "started" | "completed"; task: string };

export interface TodoListItem {
  kind: "todo_list";
  id: string;
  timelineCursor?: TimelinePosition;
  turnId?: string;
  timestamp: Date;
  provider: AgentProvider;
  items: TodoEntry[];
  activity: TaskActivity;
}

export type StreamItem =
  | UserMessageItem
  | AssistantMessageItem
  | ThoughtItem
  | ToolCallItem
  | TodoListItem
  | NotificationItem
  | CompactionItem
  | PluginTimelineStreamItem;
