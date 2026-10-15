// Ported from getpaseo/paseo (Apache-2.0) — file-pane/editor/observation-source.test.ts.
// [pie] fixture shapes follow the pie protocol (FsReadResult +
// ADR-0006 versions; no cwd/path metadata on error/missing arms).
import { describe, expect, test } from "vitest";

import type { LiveFileObservation } from "../live-file/model";
import {
  createFileObservationSource,
  type LiveObservationSource,
} from "./observation-source";

class TestLiveObservationSource implements LiveObservationSource {
  observation: LiveFileObservation | null;

  constructor(observation: LiveFileObservation | null) {
    this.observation = observation;
  }

  subscribe(): () => void {
    return () => undefined;
  }

  getObservation(): LiveFileObservation | null {
    return this.observation;
  }

  refresh(): void {}
}

function version(revision = "revision-1") {
  return {
    modifiedAt: "2026-07-18T00:00:00.000Z",
    size: 3,
    revision,
  };
}

function readyObservation(): LiveFileObservation {
  return {
    status: "ready",
    file: {
      path: "file.ts",
      text: "one",
      bytes: 3,
      truncated: false,
      binary: false,
      version: version(),
    },
    version: { status: "ready", version: version() },
  };
}

describe("createFileObservationSource", () => {
  test("returns the same editor observation until the live observation changes", () => {
    const liveFile = new TestLiveObservationSource(readyObservation());
    const source = createFileObservationSource(liveFile);

    const first = source.getObservation();
    const repeated = source.getObservation();

    expect(repeated).toBe(first);
    expect(first).toMatchObject({
      status: "ready",
      file: {
        content: "one",
        hasBom: false,
        version: { status: "ready", version: version() },
      },
    });

    liveFile.observation = readyObservation();
    expect(source.getObservation()).not.toBe(first);
  });

  test("surfaces binary reads as check errors with a bare error version", () => {
    const liveFile = new TestLiveObservationSource({
      status: "ready",
      file: {
        path: "file.bin",
        text: null,
        bytes: 4,
        truncated: false,
        binary: true,
        version: version("rev-bin"),
      },
      version: { status: "ready", version: version("rev-bin") },
    });
    const source = createFileObservationSource(liveFile);

    expect(source.getObservation()).toMatchObject({
      status: "error",
      error: "File is no longer text.",
    });
  });

  test("passes missing and error observations straight through", () => {
    const liveFile = new TestLiveObservationSource({ status: "missing" });
    const source = createFileObservationSource(liveFile);
    expect(source.getObservation()).toEqual({ status: "missing" });

    liveFile.observation = { status: "error", error: "gone" };
    expect(source.getObservation()).toEqual({ status: "error", error: "gone" });
  });
});
