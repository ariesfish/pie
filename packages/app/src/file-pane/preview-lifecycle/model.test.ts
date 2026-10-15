// Ported from getpaseo/paseo (Apache-2.0)
import type { FsReadResult } from "@pie/protocol";
import type { LiveFileSnapshot } from "../live-file/model";
import { describe, expect, it } from "vitest";
import {
  FilePreviewLifecycleModel,
  type FilePanePreview,
  type FilePreviewLifecycleSnapshot,
} from "./model";

function previewFile(content: string) {
  // [pie] ExplorerFile shape (file-explorer/types).
  return {
    kind: "text" as const,
    path: "file.ts",
    hasBom: false,
    size: 7,
    truncated: false,
    content,
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function file(marker = "preview", path = "file.ts"): FsReadResult {
  // [pie] no revisions on reads; the marker doubles as the text payload so
  // preparations can still tell reads apart.
  return {
    path,
    text: `preview-${marker}`,
    bytes: 7,
    truncated: false,
    binary: false,
    version: { modifiedAt: "2026-01-01T00:00:00.000Z", size: 1, revision: "0:0:1:1" },
  };
}

function pending(): LiveFileSnapshot {
  return { observation: null, read: { status: "pending", requested: false } };
}

function completed(rawFile: FsReadResult): LiveFileSnapshot {
  return {
    observation: {
      status: "ready",
      file: rawFile,
      // [pie] bare ready version (no per-file metadata).
      version: {
        status: "ready",
      },
    },
    read: { status: "idle" },
  };
}

function source(
  targetKey: string,
  snapshot: LiveFileSnapshot,
): {
  targetKey: string;
  liveFileSnapshot: LiveFileSnapshot;
} {
  return { targetKey, liveFileSnapshot: snapshot };
}

describe("FilePreviewLifecycleModel", () => {
  it("represents pending raw reads, preparation, ready previews, unsupported files, and conversion failures", async () => {
    const first = deferred<FilePanePreview | null>();
    const second = deferred<FilePanePreview | null>();
    const third = deferred<FilePanePreview | null>();
    const preparations = [first, second, third];
    const model = new FilePreviewLifecycleModel(() => preparations.shift()!.promise);
    const preview: FilePanePreview = {
      file: previewFile("preview"),
      imageAttachment: null,
    };

    model.setSource(source("file.ts", pending()));
    expect(model.getSnapshot()).toEqual({ status: "read_pending" });

    model.setSource(source("file.ts", completed(file("one"))));
    expect(model.getSnapshot()).toEqual({ status: "preparing" });
    first.resolve(preview);
    await expectSnapshot(model, { status: "ready", preview });

    model.setSource(source("file.ts", pending()));
    expect(model.getSnapshot()).toEqual({ status: "read_pending", preview });

    model.setSource(
      source("file.ts", {
        observation: {
          status: "error",
        },
        read: { status: "pending", requested: true },
      }),
    );
    expect(model.getSnapshot()).toEqual({ status: "read_pending", preview });

    model.setSource(source("file.ts", completed(file("two"))));
    expect(model.getSnapshot()).toEqual({ status: "preparing", preview });
    second.resolve(null);
    await expectSnapshot(model, { status: "unsupported" });

    model.setSource(source("file.ts", completed(file("three"))));
    expect(model.getSnapshot()).toEqual({ status: "preparing" });
    third.reject(new Error("preview failed"));
    await expectSnapshot(model, { status: "error", message: "preview failed" });
  });

  it("does not publish a stale conversion after retargeting", async () => {
    const first = deferred<FilePanePreview | null>();
    const second = deferred<FilePanePreview | null>();
    const model = new FilePreviewLifecycleModel((rawFile) =>
      rawFile.text === "preview-one" ? first.promise : second.promise,
    );
    const nextPreview: FilePanePreview = {
      file: previewFile("two"),
      imageAttachment: null,
    };

    model.setSource(source("file.ts", completed(file("one"))));
    model.setSource(source("second.ts", completed(file("two", "second.ts"))));
    first.resolve({ file: previewFile("one"), imageAttachment: null });
    await Promise.resolve();
    expect(model.getSnapshot()).toEqual({ status: "preparing" });

    second.resolve(nextPreview);
    await expectSnapshot(model, { status: "ready", preview: nextPreview });
  });
});

async function expectSnapshot(
  model: FilePreviewLifecycleModel,
  expected: FilePreviewLifecycleSnapshot,
): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  expect(model.getSnapshot()).toEqual(expected);
}
