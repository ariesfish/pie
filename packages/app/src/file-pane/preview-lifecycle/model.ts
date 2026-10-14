// Ported from getpaseo/paseo (Apache-2.0)
// [pie] text-only previews (attachments image path deferred; FsReadResult shapes).
import type { FsReadResult } from "@pie/protocol";
import { explorerFileFromReadResult } from "@/file-explorer/read-result";
import type { ExplorerFile } from "@/file-explorer/types";
import type { LiveFileSnapshot } from "../live-file/model";

export interface FilePanePreview {
  file: ExplorerFile;
  // [pie] image attachments ride the W4+ attachments subsystem; pie's fs.read
  // also has no binary payload yet, so every preview here is text/null only.
  imageAttachment: null;
}

export type FilePreviewLifecycleSnapshot =
  | { status: "initial" }
  | { status: "read_pending"; preview?: FilePanePreview }
  | { status: "preparing"; preview?: FilePanePreview }
  | { status: "ready"; preview: FilePanePreview }
  | { status: "error"; message: string; preview?: FilePanePreview }
  | { status: "unsupported" };

const initialSnapshot: FilePreviewLifecycleSnapshot = { status: "initial" };

/** Converts a completed raw read into the preview resources consumed by FilePane. */
export async function createFilePanePreview(file: FsReadResult): Promise<FilePanePreview | null> {
  const explorerFile = explorerFileFromReadResult(file.path, file);
  return { file: explorerFile, imageAttachment: null };
}

/** Owns conversion after LiveFileModel has produced a raw file snapshot. */
export class FilePreviewLifecycleModel {
  private readonly listeners = new Set<() => void>();
  private snapshot: FilePreviewLifecycleSnapshot = initialSnapshot;
  private generation = 0;
  private preparedSourceKey: FsReadResult | null = null;
  private targetKey: string | null = null;

  constructor(
    private readonly prepare: (file: FsReadResult) => Promise<FilePanePreview | null>,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): FilePreviewLifecycleSnapshot => this.snapshot;

  setSource(input: { targetKey: string | null; liveFileSnapshot: LiveFileSnapshot }): void {
    const targetChanged = input.targetKey !== this.targetKey;
    const retainedPreview = targetChanged ? undefined : filePreviewFromLifecycle(this.snapshot);
    if (targetChanged) {
      this.targetKey = input.targetKey;
      this.preparedSourceKey = null;
      this.generation += 1;
    }

    const source = getReadySource(input);
    if (source) {
      if (source.key === this.preparedSourceKey) {
        return;
      }
      this.preparedSourceKey = source.key;
      const generation = ++this.generation;
      this.setSnapshot({
        status: "preparing",
        ...(retainedPreview ? { preview: retainedPreview } : {}),
      });
      void this.prepareSource({ file: source.file, generation, retainedPreview });
      return;
    }

    const nextSnapshot = getNonReadySnapshot(input.liveFileSnapshot);
    if (nextSnapshot.status === "initial" && retainedPreview) {
      return;
    }
    const retainedSnapshot = retainedPreview
      ? { ...nextSnapshot, preview: retainedPreview }
      : nextSnapshot;
    if (sameNonReadyState(this.snapshot, retainedSnapshot)) {
      return;
    }
    this.preparedSourceKey = null;
    this.generation += 1;
    this.setSnapshot(retainedSnapshot);
  }

  private setSnapshot(snapshot: FilePreviewLifecycleSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  private async prepareSource(input: {
    file: FsReadResult;
    generation: number;
    retainedPreview?: FilePanePreview;
  }): Promise<void> {
    try {
      const preview = await this.prepare(input.file);
      if (input.generation !== this.generation) return;
      this.setSnapshot(preview ? { status: "ready", preview } : { status: "unsupported" });
    } catch (error) {
      if (input.generation !== this.generation) return;
      this.setSnapshot({
        status: "error",
        message: errorMessage(error),
        ...(input.retainedPreview ? { preview: input.retainedPreview } : {}),
      });
    }
  }
}

export function filePreviewFromLifecycle(
  snapshot: FilePreviewLifecycleSnapshot,
): FilePanePreview | undefined {
  return "preview" in snapshot ? snapshot.preview : undefined;
}

export function resolveFilePreviewLifecycle(snapshot: FilePreviewLifecycleSnapshot): {
  file: ExplorerFile | null;
  imageAttachment: null;
} {
  const preview = filePreviewFromLifecycle(snapshot);
  return preview ?? { file: null, imageAttachment: null };
}

function getReadySource(input: {
  targetKey: string | null;
  liveFileSnapshot: LiveFileSnapshot;
}): { key: FsReadResult; file: FsReadResult } | null {
  const observation = input.liveFileSnapshot.observation;
  if (!input.targetKey || observation?.status !== "ready") {
    return null;
  }
  // [pie] versions carry no metadata, so the read result's object identity is
  // the version boundary: every fs.read produces a fresh object, and replays
  // of the same observation reuse it.
  if (input.targetKey !== observation.file.path) {
    return null;
  }
  return {
    key: observation.file,
    file: observation.file,
  };
}

function getNonReadySnapshot(snapshot: LiveFileSnapshot): FilePreviewLifecycleSnapshot {
  if (snapshot.read.status === "error") {
    return { status: "error", message: snapshot.read.error };
  }
  if (snapshot.read.status === "pending") {
    return { status: "read_pending" };
  }
  if (snapshot.observation?.status === "error") {
    // [pie] observation errors carry an optional message.
    return { status: "error", message: snapshot.observation.error ?? "Read failed" };
  }
  if (snapshot.observation?.status === "missing") {
    return { status: "error", message: "File not found" };
  }
  return initialSnapshot;
}

function sameNonReadyState(
  current: FilePreviewLifecycleSnapshot,
  next: FilePreviewLifecycleSnapshot,
): boolean {
  if (current.status !== next.status) {
    return false;
  }
  return current.status !== "error" || next.status !== "error" || current.message === next.message;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to prepare preview";
}
