// Ported from getpaseo/paseo (Apache-2.0)
// [pie] fixtures reshaped to pie protocol shapes (FsReadResult/LiveFileVersion).
import type { FsReadResult } from "@pie/protocol";
import type { LiveFileVersion } from "./version";
import { describe, expect, it, vi } from "vitest";
import { LiveFileModel, type LiveFileSession, type LiveFileSubscription } from "./model";

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

function ready(): Extract<LiveFileVersion, { status: "ready" }> {
  // [pie] versions carry no metadata (workspace.fs.changed batches paths).
  return { status: "ready" };
}

function file(_revision = "revision-1", content = "one"): FsReadResult {
  return {
    path: "file.ts",
    text: content,
    bytes: content.length,
    truncated: false,
    binary: false,
  };
}

class TestLiveFileSession implements LiveFileSession {
  readonly reads: Deferred<FsReadResult>[] = [];
  subscribeAttempts = 0;
  private onVersion: ((version: LiveFileVersion) => void) | null = null;
  private readonly initial: LiveFileVersion;

  constructor(initial: LiveFileVersion = ready()) {
    this.initial = initial;
  }

  async subscribe(
    _target: { cwd: string; path: string },
    onVersion: (version: LiveFileVersion) => void,
  ): Promise<LiveFileSubscription> {
    this.subscribeAttempts += 1;
    this.onVersion = onVersion;
    return { initial: this.initial, unsubscribe: () => (this.onVersion = null) };
  }

  read(): Promise<FsReadResult> {
    const request = deferred<FsReadResult>();
    this.reads.push(request);
    return request.promise;
  }

  emit(version: LiveFileVersion): void {
    this.onVersion?.(version);
  }
}

class DeferredSubscribeSession implements LiveFileSession {
  readonly reads: Deferred<FsReadResult>[] = [];
  readonly subscription = deferred<LiveFileSubscription>();
  private onVersion: ((version: LiveFileVersion) => void) | null = null;

  subscribe(
    _target: { cwd: string; path: string },
    onVersion: (version: LiveFileVersion) => void,
  ): Promise<LiveFileSubscription> {
    this.onVersion = onVersion;
    return this.subscription.promise;
  }

  read(): Promise<FsReadResult> {
    const request = deferred<FsReadResult>();
    this.reads.push(request);
    return request.promise;
  }

  emit(version: LiveFileVersion): void {
    this.onVersion?.(version);
  }
}

class FlakySubscriptionSession extends TestLiveFileSession {
  override async subscribe(
    target: { cwd: string; path: string },
    onVersion: (version: LiveFileVersion) => void,
  ): Promise<LiveFileSubscription> {
    if (this.subscribeAttempts === 0) {
      this.subscribeAttempts += 1;
      throw new Error("Connection closed.");
    }
    return super.subscribe(target, onVersion);
  }
}

async function waitForRead(
  session: { reads: Deferred<FsReadResult>[] },
  count: number,
): Promise<void> {
  await vi.waitFor(() => expect(session.reads).toHaveLength(count));
}

describe("LiveFileModel", () => {
  it("reports initial and read-pending work before any terminal observation", async () => {
    const session = new TestLiveFileSession();
    const model = new LiveFileModel();
    model.open({ session, target: { cwd: "/workspace", path: "file.ts" }, liveUpdates: false });
    await waitForRead(session, 1);
    expect(model.getSnapshot()).toEqual({
      observation: null,
      read: { status: "pending", requested: false },
    });
  });

  it("reports read error as terminal and recovers on refresh", async () => {
    const session = new TestLiveFileSession();
    const model = new LiveFileModel();
    model.open({ session, target: { cwd: "/workspace", path: "file.ts" }, liveUpdates: false });
    await waitForRead(session, 1);
    session.reads[0].reject(new Error("read failed"));
    await vi.waitFor(() =>
      expect(model.getSnapshot().read).toEqual({ status: "error", error: "read failed" }),
    );
    model.refresh();
    await waitForRead(session, 2);
    session.reads[1].resolve(file("revision-2"));
    await vi.waitFor(() => expect(model.getObservation()?.status).toBe("ready"));
  });
  it("does not publish a missing candidate when the following read succeeds", async () => {
    const session = new TestLiveFileSession();
    const model = new LiveFileModel();
    model.open({
      session,
      target: { cwd: "/workspace", path: "file.ts" },
      liveUpdates: true,
    });
    await waitForRead(session, 1);
    session.reads[0].resolve(file());
    await vi.waitFor(() => expect(model.getObservation()).toMatchObject({ status: "ready" }));
    const publishedStatuses: string[] = [];
    model.subscribe(() => {
      const observation = model.getObservation();
      if (observation) publishedStatuses.push(observation.status);
    });

    session.emit({ status: "missing" });
    await waitForRead(session, 2);
    session.reads[1].resolve(file());
    await vi.waitFor(() => expect(model.getSnapshot().read).toEqual({ status: "idle" }));

    expect(publishedStatuses).not.toContain("missing");
  });

  it("publishes missing when the following read also fails", async () => {
    const session = new TestLiveFileSession();
    const model = new LiveFileModel();
    model.open({
      session,
      target: { cwd: "/workspace", path: "file.ts" },
      liveUpdates: true,
    });
    await waitForRead(session, 1);
    session.reads[0].resolve(file());
    await vi.waitFor(() => expect(model.getObservation()?.status).toBe("ready"));

    session.emit({ status: "missing" });
    await waitForRead(session, 2);
    session.reads[1].reject(new Error("File not found."));

    await vi.waitFor(() => expect(model.getObservation()?.status).toBe("missing"));
  });

  it("preserves a missing candidate for its queued confirming read", async () => {
    const session = new TestLiveFileSession();
    const model = new LiveFileModel();
    model.open({
      session,
      target: { cwd: "/workspace", path: "file.ts" },
      liveUpdates: true,
    });
    await waitForRead(session, 1);

    session.emit({ status: "missing" });
    session.reads[0].resolve(file());
    await waitForRead(session, 2);
    session.reads[1].reject(new Error("File not found."));

    await vi.waitFor(() => expect(model.getObservation()?.status).toBe("missing"));
  });

  it("recovers only from a read begun after a missing observation", async () => {
    const session = new TestLiveFileSession();
    const model = new LiveFileModel();
    model.open({
      session,
      target: { cwd: "/workspace", path: "file.ts" },
      liveUpdates: true,
    });
    await waitForRead(session, 1);
    session.reads[0].resolve(file());
    await vi.waitFor(() => expect(model.getObservation()).toMatchObject({ status: "ready" }));

    model.refresh();
    await waitForRead(session, 2);
    session.emit({ status: "missing" });
    session.reads[1].resolve(file("revision-2", "two"));

    await waitForRead(session, 3);
    expect(model.getObservation()?.status).toBe("ready");
    expect(model.getSnapshot().read).toEqual({ status: "pending", requested: true });

    session.reads[2].resolve(file("revision-2", "two"));
    await vi.waitFor(() => {
      expect(model.getSnapshot()).toMatchObject({
        observation: {
          status: "ready",
          // [pie] versions carry no metadata; the fresh file is the payload.
          version: { status: "ready" },
          file: { text: "two" },
        },
        read: { status: "idle" },
      });
    });
  });

  it("keeps an actionable error visible while refresh fails", async () => {
    const session = new TestLiveFileSession();
    const model = new LiveFileModel();
    model.open({
      session,
      target: { cwd: "/workspace", path: "file.ts" },
      liveUpdates: true,
    });
    await waitForRead(session, 1);
    session.reads[0].resolve(file());
    await vi.waitFor(() => expect(model.getObservation()).toMatchObject({ status: "ready" }));

    session.emit({
      status: "error",
      error: "Requested path is not a file",
    });
    await waitForRead(session, 2);
    expect(model.getSnapshot().read).toEqual({ status: "pending", requested: false });
    session.reads[1].reject(new Error("File unavailable."));

    await vi.waitFor(() => {
      expect(model.getSnapshot()).toMatchObject({
        observation: { status: "error", error: "Requested path is not a file" },
        read: { status: "error", error: "File unavailable." },
      });
    });

    model.refresh();
    await waitForRead(session, 3);
    expect(model.getSnapshot().read).toEqual({ status: "pending", requested: true });
  });

  it("keeps an update that arrives before the subscription response", async () => {
    const session = new DeferredSubscribeSession();
    const model = new LiveFileModel();
    model.open({
      session,
      target: { cwd: "/workspace", path: "file.ts" },
      liveUpdates: true,
    });

    session.emit(ready());
    session.subscription.resolve({ initial: ready(), unsubscribe() {} });

    await waitForRead(session, 1);
    expect(model.getObservation()).toBeNull();
  });

  it("retries a failed subscription when the user refreshes", async () => {
    const session = new FlakySubscriptionSession();
    const model = new LiveFileModel();
    model.open({
      session,
      target: { cwd: "/workspace", path: "file.ts" },
      liveUpdates: true,
    });
    await waitForRead(session, 1);
    expect(session.subscribeAttempts).toBe(1);

    session.reads[0].resolve(file());
    await vi.waitFor(() => expect(model.getObservation()?.status).toBe("ready"));
    model.refresh();

    await waitForRead(session, 2);
    expect(session.subscribeAttempts).toBe(2);
    expect(model.getSnapshot().read).toEqual({ status: "pending", requested: true });
  });

  it("reads once without subscribing when live updates are disabled", async () => {
    const session = new TestLiveFileSession();
    const model = new LiveFileModel();
    model.open({
      session,
      target: { cwd: "/workspace", path: "file.ts" },
      liveUpdates: false,
    });

    await waitForRead(session, 1);
    expect(session.subscribeAttempts).toBe(0);
    expect(model.getSnapshot().read).toEqual({ status: "pending", requested: false });
  });

  it("ignores a read that completes after the model closes", async () => {
    const session = new TestLiveFileSession();
    const model = new LiveFileModel();
    model.open({
      session,
      target: { cwd: "/workspace", path: "file.ts" },
      liveUpdates: true,
    });
    await waitForRead(session, 1);

    model.close();
    session.reads[0].resolve(file());
    await Promise.resolve();

    expect(model.getSnapshot()).toEqual({
      observation: null,
      read: { status: "idle" },
    });
  });
});
