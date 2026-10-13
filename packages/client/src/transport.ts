/**
 * Platform-neutral transport boundary between the client and the daemon
 * (architecture.md §3.2). The client package never imports `ws` directly;
 * hosts (Expo / Electron / Node CLI) provide a factory.
 */

export interface TransportHandlers {
	/** One complete JSONL line (without the trailing LF). */
	onMessage(line: string): void;
	/** Orderly close — no more frames will arrive. */
	onClose(): void;
	onError(error: Error): void;
}

export interface Transport {
	/** Deliver one complete JSONL line (LF is appended by the transport). */
	send(line: string): void;
	close(): void;
}

export type TransportFactory = (handlers: TransportHandlers) => Promise<Transport>;
