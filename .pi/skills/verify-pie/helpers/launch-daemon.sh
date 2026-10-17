#!/usr/bin/env bash
# launch-daemon.sh <runId> [port] — start an isolated pie daemon for verification.
#
# What it creates (all under /tmp/pie-verify-<runId>/, all removed at cleanup):
#   agent/     scratch pi agent dir: copy of ~/.pi/agent/{auth.json,models.json}
#              (chmod 600; needed for models.list and chat; removed with the dir)
#   workspace/ git fixture (README.md + src/app.ts, clean commit, then dirtied)
#   daemon.log stdout+stderr of the daemon
#   run.json   {runId,port,token,agentDir,workspace,pid,daemonLog,staticPort}
#
# The recorded pid is the kernel's listener pid for our port (ss -tlnp), not
# $! — a foreign listener would have made our daemon exit (EADDRINUSE) and this
# script fail loudly, so the recorded pid can only ever be our daemon.
# Teardown: kill -TERM <pid> (daemon handles SIGTERM gracefully).
# Never pkill/killall — see verify-pie SKILL.md.
set -euo pipefail

RUN_ID="${1:?usage: launch-daemon.sh <runId> [port]}"
PORT="${2:-8790}"
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
RUN_DIR="/tmp/pie-verify-$RUN_ID"
AGENT_DIR="$RUN_DIR/agent"
WORKSPACE="$RUN_DIR/workspace"
TOKEN="verify-$RUN_ID"
STATIC_PORT=8899

mkdir -p "$AGENT_DIR" "$WORKSPACE"

# credentials copy (isolated state; the real ~/.pi/agent is never pointed at)
if [ "${VERIFY_PIE_NO_CREDS:-}" = "1" ]; then
	echo "VERIFY_PIE_NO_CREDS=1: skipping auth/models copy (models.list will fail, page toasts an error)" >&2
else
	for f in auth.json models.json; do
		if [ -f "$HOME/.pi/agent/$f" ]; then
			cp "$HOME/.pi/agent/$f" "$AGENT_DIR/$f"
			chmod 600 "$AGENT_DIR/$f"
		fi
	done
fi

# fixture workspace (mirrors scripts/ui-walkthrough.mjs's fixture, trimmed)
mkdir -p "$WORKSPACE/src"
printf 'export function greet(name: string): string {\n\treturn `Hello, ${name}!`;\n}\n' > "$WORKSPACE/src/app.ts"
printf -- '---\ntitle: Verify Fixture\ntags: [fixture]\n---\n\n# Verify Fixture\n\nA tiny repo for exercising the files tree, changes panel and diff view.\n\n```ts\nconst answer = 42;\n```\n' > "$WORKSPACE/README.md"
git -C "$WORKSPACE" init -q
git -C "$WORKSPACE" add -A
git -C "$WORKSPACE" commit -qm "verify fixture"
printf 'export function greet(name: string): string {\n\treturn `Hello, ${name}!`;\n}\n// dirty\n' > "$WORKSPACE/src/app.ts"
printf 'untracked\n' > "$WORKSPACE/notes.txt"

# daemon, in-process tsx loader: one clean node pid (same runtime as npm run daemon)
cd "$ROOT"
node --import tsx packages/daemon/src/index.ts \
	--listen "127.0.0.1:$PORT" --token "$TOKEN" --pi "$AGENT_DIR" \
	> "$RUN_DIR/daemon.log" 2>&1 &

# readiness: HTTP 200 on / (the daemon serves the demo page itself)
ready=0
for _ in $(seq 1 60); do
	if curl -sf "http://127.0.0.1:$PORT/" > /dev/null 2>&1; then ready=1; break; fi
	sleep 0.5
done
if [ "$ready" != "1" ]; then
	echo "daemon not ready on :$PORT within 30s — log follows:" >&2
	cat "$RUN_DIR/daemon.log" >&2
	# clean up whatever we started: the listener pid if any, else the job pid
	lp="$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true)"
	[ -n "${lp:-}" ] && kill -TERM "$lp" 2>/dev/null || true
	rm -rf "$RUN_DIR"
	exit 1
fi

# record the real listener pid (see header comment)
PID="$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
if [ -z "$PID" ]; then
	echo "could not resolve listener pid for :$PORT" >&2
	cat "$RUN_DIR/daemon.log" >&2
	exit 1
fi

cat > "$RUN_DIR/run.json" <<EOF
{"runId":"$RUN_ID","port":$PORT,"token":"$TOKEN","agentDir":"$AGENT_DIR","workspace":"$WORKSPACE","pid":$PID,"daemonLog":"$RUN_DIR/daemon.log","staticPort":$STATIC_PORT}
EOF
cat "$RUN_DIR/run.json"
