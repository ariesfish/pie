// Shared attachment traits (web consumes FileReader outputs; native is a stub for now).
export interface ComposerAttachment {
	data: string;
	mimeType: string;
	preview: string;
}
