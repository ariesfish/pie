import type { Transport, TransportFactory, TransportHandlers } from "./transport.js";

/** Minimal WebSocket surface the transport adapter relies on. */
interface WsLike {
	send(data: string): void;
	close(): void;
	addEventListener(name: string, listener: (ev: { data?: unknown }) => void): void;
	onopen?: () => void;
	onclose?: () => void;
	onerror?: (err: Error) => void;
	onmessage?: (ev: { data: unknown }) => void;
}

/** A WebSocket constructor (browser `WebSocket`, `ws.WebSocket`, RN WebSocket...). */
export type WebSocketCtor<T extends WsLike = WsLike> = new (url: string) => T;

/** Build a transport factory from any WebSocket-like constructor. */
export function createWsTransportFactory<T extends WsLike>(url: string, ctor: WebSocketCtor<T>): TransportFactory {
	return ({ onClose, onError, onMessage }: TransportHandlers) =>
		new Promise<Transport>((resolve, reject) => {
			let ws: T;
			try {
				ws = new ctor(url);
			} catch (err) {
				reject(err as Error);
				return;
			}
			let opened = false;

			ws.onopen = () => {
				opened = true;
				resolve({
					send: (line: string) => ws.send(`${line}\n`),
					close: () => ws.close(),
				});
			};
			ws.onclose = () => {
				if (!opened) reject(new Error(`WebSocket closed before opening: ${url}`));
				onClose();
			};
			ws.onerror = (err) => {
				const e = err instanceof Error ? err : new Error(`WebSocket error: ${url}`);
				if (!opened) reject(e);
				else onError(e);
			};
			ws.onmessage = (ev: { data: unknown }) => {
				const data = ev.data;
				if (typeof data === "string") {
					for (const line of splitLines(data)) onMessage(line);
				} else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
					const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
					const text = new TextDecoder().decode(bytes);
					for (const line of splitLines(text)) onMessage(line);
				}
			};
		});
}

function splitLines(text: string): string[] {
	return text
		.split("\n")
		.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l))
		.filter((l) => l.length > 0);
}
