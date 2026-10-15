// Ported from getpaseo/paseo (Apache-2.0) — file-pane/editor/model.ts.
// [pie] re-typed to the ADR-0006 protocol: FileVersion is the live-file
// edge type (ready may be bare when it comes straight from a watcher event);
// a write-ready version must carry the daemon FileVersionInfo token. The
// write result's error arm is gone — pie routes failures through the RPC
// error channel, so the session throws.
import type { FileVersionInfo, FsWriteResult } from "@pie/protocol";

import type { FileVersion } from "../live-file/version";

export type FileEditorStatus = "clean" | "dirty" | "saving" | "conflict" | "error";
export type FileLineSeparator = "\n" | "\r\n" | "\r";

/** A ready version that actually carries the CAS token (from fs.read). */
export type WriteReadyVersion = Extract<FileVersion, { status: "ready" }> & {
	version: FileVersionInfo;
};

export interface FileEditorSnapshot {
  status: FileEditorStatus;
  content: string;
  lineSeparator: FileLineSeparator;
  modified: boolean;
  version: WriteReadyVersion;
  observedVersion: FileVersion;
  error: string | null;
}

export type FileConflictCallout =
  | { kind: "changed"; canOverwrite: boolean }
  | { kind: "deleted" }
  | { kind: "checkFailed" };

export interface FileEditorFile {
  content: string;
  hasBom: boolean;
  version: WriteReadyVersion;
}

export interface FileEditorSession {
  write(input: {
    content: string;
    expectedModifiedAt: string;
    expectedRevision?: string;
  }): Promise<FsWriteResult>;
}

export type FileEditorObservation =
  | { status: "ready"; file: FileEditorFile }
  | Extract<FileVersion, { status: "missing" | "error" }>;

export interface FileObservationSource {
  subscribe(listener: () => void): () => void;
  getObservation(): FileEditorObservation | null;
  refresh(): void;
}

type ObservedDiskState = FileEditorObservation | { status: "unsettled"; version: FileVersion };

export interface FileEditorClock {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

const systemClock: FileEditorClock = {
  setTimeout(callback, delay) {
    return globalThis.setTimeout(callback, delay);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle);
  },
};

export class FileEditorModel {
  private readonly session: FileEditorSession;
  private readonly clock: FileEditorClock;
  private readonly listeners = new Set<() => void>();
  private snapshot: FileEditorSnapshot;
  private autosave: ReturnType<typeof setTimeout> | null = null;
  private saveSequence = 0;
  private disposed = false;
  private observedWhileSaving: FileEditorObservation | null = null;
  private observed: ObservedDiskState;
  private lastReceivedObservation: FileEditorObservation | null = null;
  private refreshObservation: (() => void) | null = null;
  private reloadRequested = false;
  private persistedContent: string;
  private hasBom: boolean;
  private unsubscribeObservationSource: (() => void) | null = null;

  constructor(input: {
    file: FileEditorFile;
    session: FileEditorSession;
    clock?: FileEditorClock;
  }) {
    this.session = input.session;
    this.clock = input.clock ?? systemClock;
    this.persistedContent = input.file.content;
    this.hasBom = input.file.hasBom;
    this.observed = { status: "ready", file: input.file };
    this.snapshot = {
      status: "clean",
      content: input.file.content,
      lineSeparator: detectLineSeparator(input.file.content),
      modified: false,
      version: input.file.version,
      observedVersion: input.file.version,
      error: null,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): FileEditorSnapshot => this.snapshot;

  connectFileObservations(source: FileObservationSource): void {
    this.disconnectFileObservations();
    this.refreshObservation = source.refresh;
    const receiveObservation = () => {
      const observation = source.getObservation();
      if (observation) this.receiveFileObservation(observation);
    };
    this.unsubscribeObservationSource = source.subscribe(receiveObservation);
    receiveObservation();
  }

  disconnectFileObservations(): void {
    this.unsubscribeObservationSource?.();
    this.unsubscribeObservationSource = null;
    this.refreshObservation = null;
  }

  edit(content: string): void {
    if (this.disposed || content === this.snapshot.content) return;
    this.reloadRequested = false;
    const modified = content !== this.persistedContent;
    let status: FileEditorStatus = modified ? "dirty" : "clean";
    if (this.snapshot.status === "conflict") {
      status = "conflict";
    }
    this.setSnapshot({ ...this.snapshot, status, content, modified, error: null });
    if (status === "dirty") this.scheduleAutosave();
    else this.clearAutosave();
  }

  async save(): Promise<void> {
    if (this.disposed || (this.snapshot.status !== "dirty" && this.snapshot.status !== "error")) {
      return;
    }
    // A bare ready edge (watcher event, re-read pending) or missing/error
    // observation blocks the save — the CAS token must come from a read.
    if (this.snapshot.observedVersion.status !== "ready" || !isWriteReady(this.snapshot.observedVersion)) {
      this.enterConflict(this.snapshot.observedVersion);
      return;
    }
    await this.performWrite(this.snapshot.observedVersion);
  }

  receiveFileObservation(observation: FileEditorObservation): void {
    if (this.disposed || observation === this.lastReceivedObservation) return;
    this.lastReceivedObservation = observation;
    const version = observationVersion(observation);
    this.observed = observation;
    this.setSnapshot({ ...this.snapshot, observedVersion: version });
    if (this.snapshot.status === "saving") {
      this.observedWhileSaving = observation;
      return;
    }
    if (observation.status !== "ready") {
      this.reloadRequested = false;
      this.enterConflict(version);
      return;
    }
    if (this.reloadRequested) {
      this.reloadRequested = false;
      this.applyFile(observation.file);
      return;
    }
    if (observation.file.content === this.persistedContent) {
      this.adoptUnchangedFile(observation.file);
      return;
    }
    if (this.snapshot.status === "clean") {
      this.applyFile(observation.file);
      return;
    }
    this.enterConflict(version);
  }

  async overwrite(): Promise<void> {
    if (this.disposed || this.snapshot.status !== "conflict") return;
    if (this.snapshot.observedVersion.status !== "ready" || !isWriteReady(this.snapshot.observedVersion)) return;
    await this.performWrite(this.snapshot.observedVersion);
  }

  async reload(): Promise<void> {
    if (this.disposed) return;
    if (this.observed.status !== "ready") {
      this.reloadRequested = true;
      this.refreshObservation?.();
      return;
    }
    this.applyFile(this.observed.file);
  }

  dispose(): void {
    this.disposed = true;
    this.reloadRequested = false;
    this.saveSequence += 1;
    this.clearAutosave();
    this.disconnectFileObservations();
    this.listeners.clear();
  }

  suspendAutosave(): () => void {
    const wasScheduled = this.autosave !== null;
    this.clearAutosave();
    let resumed = false;
    return () => {
      if (resumed || this.disposed) return;
      resumed = true;
      if (wasScheduled && this.snapshot.status === "dirty") this.scheduleAutosave();
    };
  }

  private async performWrite(expectedVersion: WriteReadyVersion): Promise<void> {
    this.clearAutosave();
    const sequence = ++this.saveSequence;
    const content = this.snapshot.content;
    const hasBom = this.hasBom;
    this.observedWhileSaving = null;
    this.setSnapshot({ ...this.snapshot, status: "saving", error: null });
    const serializedContent = hasBom ? `\uFEFF${content}` : content;
    let result: FsWriteResult;
    try {
      result = await this.session.write({
        content: serializedContent,
        expectedModifiedAt: expectedVersion.version.modifiedAt,
        expectedRevision: expectedVersion.version.revision,
      });
    } catch (error) {
      if (this.disposed || sequence !== this.saveSequence) return;
      this.setSnapshot({
        ...this.snapshot,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    if (this.disposed || sequence !== this.saveSequence) return;
    if (result.status === "conflict") {
      // ADR-0006: null = the file was deleted on disk.
      const conflicted: FileVersion =
        result.version == null
          ? { status: "missing" }
          : { status: "ready", version: result.version };
      this.observed = { status: "unsettled", version: conflicted };
      this.enterConflict(conflicted);
      return;
    }

    const writtenVersion: WriteReadyVersion = {
      status: "ready",
      version: result.version,
    };
    const pending = this.takeObservedWhileSaving();
    this.persistedContent = content;
    if (pending && !observationMatchesWrite(pending, content, hasBom)) {
      const pendingVersion = observationVersion(pending);
      this.observed = pending;
      this.setSnapshot({
        ...this.snapshot,
        status: "conflict",
        modified: this.snapshot.content !== this.persistedContent,
        version: writtenVersion,
        observedVersion: pendingVersion,
        error: null,
      });
      return;
    }
    const settledVersion =
      pending?.status === "ready" && isWriteReady(pending.file.version)
        ? pending.file.version
        : writtenVersion;
    this.observed = pending ?? { status: "unsettled", version: writtenVersion };
    const modified = this.snapshot.content !== this.persistedContent;
    this.setSnapshot({
      ...this.snapshot,
      status: modified ? "dirty" : "clean",
      modified,
      version: settledVersion,
      observedVersion: settledVersion,
      error: null,
    });
    if (modified) this.scheduleAutosave();
  }

  private applyFile(file: FileEditorFile): void {
    this.clearAutosave();
    this.saveSequence += 1;
    this.persistedContent = file.content;
    this.hasBom = file.hasBom;
    this.observed = { status: "ready", file };
    this.setSnapshot({
      status: "clean",
      content: file.content,
      lineSeparator: detectLineSeparator(file.content),
      modified: false,
      version: file.version,
      observedVersion: file.version,
      error: null,
    });
  }

  private takeObservedWhileSaving(): FileEditorObservation | null {
    const observation = this.observedWhileSaving;
    this.observedWhileSaving = null;
    return observation;
  }

  private enterConflict(version: FileVersion): void {
    this.clearAutosave();
    this.setSnapshot({
      ...this.snapshot,
      status: "conflict",
      modified: this.snapshot.content !== this.persistedContent,
      observedVersion: version,
      error: version.status === "error" ? (version.error ?? null) : null,
    });
  }

  private adoptUnchangedFile(file: FileEditorFile): void {
    this.hasBom = file.hasBom;
    this.observed = { status: "ready", file };
    const modified = this.snapshot.content !== this.persistedContent;
    const recovering = this.snapshot.status === "conflict";
    let status = this.snapshot.status;
    if (recovering) status = modified ? "dirty" : "clean";
    this.setSnapshot({
      ...this.snapshot,
      status,
      modified,
      version: file.version,
      observedVersion: file.version,
      error: recovering ? null : this.snapshot.error,
    });
    if (status === "dirty") this.scheduleAutosave();
    else this.clearAutosave();
  }

  private scheduleAutosave(): void {
    this.clearAutosave();
    this.autosave = this.clock.setTimeout(() => {
      this.autosave = null;
      void this.save();
    }, 800);
  }

  private clearAutosave(): void {
    if (!this.autosave) return;
    this.clock.clearTimeout(this.autosave);
    this.autosave = null;
  }

  private setSnapshot(snapshot: FileEditorSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

export function getFileConflictCallout(snapshot: FileEditorSnapshot): FileConflictCallout | null {
  if (snapshot.status !== "conflict") return null;
  switch (snapshot.observedVersion.status) {
    case "ready":
      return { kind: "changed", canOverwrite: snapshot.modified };
    case "missing":
      return { kind: "deleted" };
    case "error":
      return { kind: "checkFailed" };
    default:
      return assertNever(snapshot.observedVersion);
  }
}

function isWriteReady(version: FileVersion): version is WriteReadyVersion {
  return version.status === "ready" && version.version != null;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected file version: ${JSON.stringify(value)}`);
}

function detectLineSeparator(content: string): FileLineSeparator {
  for (let index = 0; index < content.length; index += 1) {
    const character = content.charCodeAt(index);
    if (character === 10) return "\n";
    if (character === 13) return content.charCodeAt(index + 1) === 10 ? "\r\n" : "\r";
  }
  return "\n";
}

function observationVersion(observation: FileEditorObservation): FileVersion {
  return observation.status === "ready" ? observation.file.version : observation;
}

function observationMatchesWrite(
  observation: FileEditorObservation,
  content: string,
  hasBom: boolean,
): boolean {
  return (
    observation.status === "ready" &&
    observation.file.content === content &&
    observation.file.hasBom === hasBom
  );
}
