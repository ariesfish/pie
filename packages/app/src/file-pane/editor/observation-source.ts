// Ported from getpaseo/paseo (Apache-2.0) — file-pane/editor/observation-source.ts.
// [pie] adapters: explorerFileFromReadResult takes (path, read); error
// observations carry no cwd/path metadata (pie versions are bare). A live
// ready observation always comes from a completed read, so its version is
// never the bare watcher edge — writing callers get a real CAS token.
import { explorerFileFromReadResult } from "@/file-explorer/read-result";
import type { LiveFileObservation } from "../live-file/model";
import type {
  FileEditorObservation,
  FileObservationSource,
  WriteReadyVersion,
} from "./model";

export interface LiveObservationSource {
  subscribe(listener: () => void): () => void;
  getObservation(): LiveFileObservation | null;
  refresh(): void;
}

export function createFileObservationSource(
  liveFile: LiveObservationSource,
): FileObservationSource {
  let liveObservation: LiveFileObservation | null = null;
  let editorObservation: FileEditorObservation | null = null;
  return {
    subscribe: liveFile.subscribe,
    refresh: liveFile.refresh,
    getObservation() {
      const nextLiveObservation = liveFile.getObservation();
      if (nextLiveObservation === liveObservation) return editorObservation;
      liveObservation = nextLiveObservation;
      editorObservation = fileEditorObservation(nextLiveObservation);
      return editorObservation;
    },
  };
}

function fileEditorObservation(
  observation: LiveFileObservation | null,
): FileEditorObservation | null {
  if (!observation || observation.status !== "ready") return observation;
  const decodedFile = explorerFileFromReadResult(
    observation.file.path,
    observation.file,
  );
  if (decodedFile.kind !== "text" || decodedFile.content === undefined) {
    return {
      status: "error",
      error: "File is no longer text.",
    };
  }
  return {
    status: "ready",
    file: {
      content: decodedFile.content,
      hasBom: decodedFile.hasBom,
      version: observation.version as WriteReadyVersion,
    },
  };
}
