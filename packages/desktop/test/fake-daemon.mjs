/**
 * Minimal fake pie daemon for the sidecar-manager tests:
 * binds an ephemeral HTTP server and prints the "WS ws://127.0.0.1:<port>"
 * status line like the real daemon does.
 */

import http from "node:http";

const server = http.createServer((_req, res) => {
	res.writeHead(200, { "content-type": "text/html" });
	res.end("pie fake daemon");
});

server.listen(0, "127.0.0.1", () => {
	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;
	console.log(`WS        ws://127.0.0.1:${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
