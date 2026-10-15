// Platform face for the ported editor (W3b-4): CodeMirror on web, plain
// TextInput on native. The FileEditorModel underneath is shared. Metro
// resolves the .web/.native faces directly; this hub serves typecheck.
export { FileEditorView } from "./view.native";
