/** A file location inside the workspace, optionally narrowed to a line range. */
export interface WorkspaceFileLocation {
	path: string;
	lineStart?: number;
	lineEnd?: number;
}
