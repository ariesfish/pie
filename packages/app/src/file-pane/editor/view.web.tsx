// Ported from getpaseo/paseo (Apache-2.0) — file-pane/editor/view.web.tsx.
// [pie] scope cut: the vim channel (@replit/codemirror-vim + mode
// listener) is trimmed until a settings surface exists to drive it;
// markdown wrapping uses pie's own extension match. Content flows through
// the FileEditorModel (CAS/autosave state machine) instead of props.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FileFind, FileFindModel } from "../find/index.web";
import { Annotation, Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getLanguageForFile } from "@getpaseo/highlight";
import type { WorkspaceFileLocation } from "@/file-pane/location";
import type { FileEditorModel } from "./model";
import { editorBaseExtensions, editorTheme, type EditorVisualTheme } from "./extensions.web";

interface FileEditorViewProps {
  model: FileEditorModel;
  filename: string;
  location: WorkspaceFileLocation;
  navigationRevision: number;
  theme: EditorVisualTheme;
}

const languageCompartment = new Compartment();
const wrappingCompartment = new Compartment();
const themeCompartment = new Compartment();

function wrappingForFile(filename: string) {
  return /\.(md|markdown|mdx)$/i.test(filename) ? EditorView.lineWrapping : [];
}

export function FileEditorView({
  model,
  filename,
  location,
  navigationRevision,
  theme,
}: FileEditorViewProps) {
  const [find] = useState(() => new FileFindModel());
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const snapshot = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const initial = useRef({ filename, model, theme, content: snapshot.content });

  useEffect(() => {
    if (!hostRef.current) return;
    const values = initial.current;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: values.content,
        extensions: [
          find.extension,
          ...editorBaseExtensions(() => void values.model.save()),
          languageCompartment.of(getLanguageForFile(values.filename)?.extension ?? []),
          wrappingCompartment.of(wrappingForFile(values.filename)),
          themeCompartment.of(editorTheme(values.theme)),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((tr) => tr.annotation(remoteUpdate))
            ) {
              const { lineSeparator } = values.model.getSnapshot();
              values.model.edit(update.state.doc.sliceString(0, undefined, lineSeparator));
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [find]);

  // Remote (disk/conflict-recovery) content replaces the buffer without
  // touching history or feeding back into the model.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const document = view.state.toText(snapshot.content);
    if (view.state.doc.eq(document)) return;
    const head = Math.min(view.state.selection.main.head, document.length);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: document },
      selection: { anchor: head },
      annotations: [remoteUpdate.of(true), Transaction.addToHistory.of(false)],
    });
  }, [snapshot.content]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !location.lineStart) return;
    const lineStart = Math.min(location.lineStart, view.state.doc.lines);
    const lineEnd = Math.min(location.lineEnd ?? lineStart, view.state.doc.lines);
    const from = view.state.doc.line(lineStart).from;
    const to = view.state.doc.line(Math.max(lineStart, lineEnd)).to;
    view.dispatch({
      selection: { anchor: from, head: lineEnd > lineStart ? to : from },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
  }, [location.lineEnd, location.lineStart, navigationRevision]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: [
        languageCompartment.reconfigure(getLanguageForFile(filename)?.extension ?? []),
        wrappingCompartment.reconfigure(wrappingForFile(filename)),
      ],
    });
  }, [filename]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeCompartment.reconfigure(editorTheme(theme)) });
  }, [theme]);

  return (
    <div style={FRAME_STYLE}>
      <div
        ref={hostRef}
        data-pmono=""
        data-testid="file-source-editor"
        aria-label={`Source editor for ${filename}`}
        style={HOST_STYLE}
      />
      <FileFind model={find} editor={viewRef} />
    </div>
  );
}

const remoteUpdate = Annotation.define<boolean>();
const FRAME_STYLE = {
  display: "flex",
  position: "relative",
  flex: 1,
  minHeight: 0,
  minWidth: 0,
} as const;
const HOST_STYLE = { flex: 1, minHeight: 0, overflow: "hidden" } as const;
