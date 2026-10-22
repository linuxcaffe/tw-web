#!/usr/bin/env bash
# scratch-server.sh — run tw-web from a working folder against a throwaway task
# database and settings file, on a free port, and stop exactly that server afterwards.
#
#   .tools/scratch-server.sh up   [DIR]   start (DIR defaults to the current folder)
#   .tools/scratch-server.sh env  [DIR]   print exports for seeding: eval "$(… env)"; task add …
#   .tools/scratch-server.sh probe [DIR]  taskutil web probe against it
#   .tools/scratch-server.sh down [DIR]   stop it and delete the throwaway data
#
# Never touches ~/.task, the live server's runtime dir, or any other app.py
# (nb-web runs one too): processes are stopped by PID, after checking their cwd.
set -euo pipefail

cmd=${1:-}; DIR=$(cd "${2:-.}" && pwd -P)
STATE="$DIR/_scratch-server.state"   # gitignored via _*

die() { echo "scratch-server: $*" >&2; exit 1; }
[ -f "$DIR/app.py" ] || die "$DIR has no app.py"
[ "$DIR" != "$(cd ~/dev/tw-web 2>/dev/null && pwd -P)" ] || echo "scratch-server: note: $DIR is the live working copy; a worktree is safer" >&2

load() { [ -f "$STATE" ] || die "not running (no $STATE)"; . "$STATE"; }

case "$cmd" in
up)
    [ -f "$STATE" ] && die "already up ($STATE); run down first"
    TMP=$(mktemp -d -t tw-web-scratch.XXXXXX)
    mkdir -m 700 "$TMP/data" "$TMP/run"
    printf 'data.location=%s/data\nhooks=off\nconfirmation=no\n' "$TMP" > "$TMP/taskrc"
    PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
    (cd "$DIR" && exec env TASKRC="$TMP/taskrc" TASKDATA="$TMP/data" TW_TASK_DIR="$TMP/data" XDG_RUNTIME_DIR="$TMP/run" \
        TW_WEB_SETTINGS="$TMP/settings.json" TW_WEB_PORT="$PORT" python3 app.py > "$TMP/server.log" 2>&1) &
    PID=$!
    printf 'TMP=%q\nPORT=%q\nPID=%q\n' "$TMP" "$PORT" "$PID" > "$STATE"
    for _ in $(seq 1 40); do
        curl -s -o /dev/null "http://127.0.0.1:$PORT/manifest.json" && break
        kill -0 "$PID" 2>/dev/null || { cat "$TMP/server.log" >&2; rm -f "$STATE"; rm -rf "$TMP"; die "server exited"; }
        sleep 0.3
    done
    echo "up: http://localhost:$PORT  (pid $PID, data $TMP/data, log $TMP/server.log)"
    ;;
env)
    load
    printf 'export TASKRC=%q TASKDATA=%q TW_WEB_PORT=%q TW_WEB_SETTINGS=%q\n' \
        "$TMP/taskrc" "$TMP/data" "$PORT" "$TMP/settings.json"
    ;;
probe)
    load
    command -v taskutil >/dev/null || die "taskutil not on PATH (ln -s ~/dev/tw-taskutil/taskutil.py ~/.local/bin/taskutil)"
    taskutil web probe --port "$PORT"
    ;;
down)
    load
    # the server and its reloader child, only if they really run from DIR
    for p in "$PID" $(pgrep -P "$PID" 2>/dev/null || true); do
        [ "$(readlink "/proc/$p/cwd" 2>/dev/null)" = "$DIR" ] && kill "$p" 2>/dev/null || true
    done
    for _ in $(seq 1 30); do
        { ss -ltn | grep -q ":$PORT\b" || kill -0 "$PID" 2>/dev/null; } || break; sleep 0.2
    done
    ss -ltn | grep -q ":$PORT\b" && die "port $PORT still listening; check: ss -ltnp | grep :$PORT"
    kill -0 "$PID" 2>/dev/null && die "pid $PID still running; check: ps -p $PID"
    rm -rf "$TMP"; rm -f "$STATE"
    echo "down: port $PORT closed, throwaway data removed"
    ;;
*) sed -n '2,12p' "$0"; exit 2 ;;
esac
