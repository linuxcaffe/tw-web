# tw-web — CLAUDE.md

Orientation for Claude Code sessions in this repo. Read before changing anything: tw-web is in
daily use, and this working copy *is* the live server.

## What this is

A Flask + plain-JS web UI (PWA) for **Taskwarrior 2.6.2**. It's not `taskwarrior-web`, the Rust
project that `~/dev/CLAUDE.md` describes; that file's tw-web-relevant parts are only "target 2.6.x".

- **2.6.2 is the spec.** No 3.x compatibility work, shims or migration, ever. The user designed most of
  2.6.2 and is the authority on task semantics.
- **It's not broken; don't break it.** Improve the scaffolding (tests, guards, docs), not the design.
- **Siblings, separate on purpose.** nb-web and tw-web link only through nb annotations (tw → nb,
  via `/api/launch`) and tw codeblocks/queries in nb. Borrow nb-web's *practices*, never its code,
  its test repo or its docs home.

Plans, reviews and design notes live in the nb notebook, not this repo:
`tw:docs/tw-web-dev-infra-plan.md` (premises, phased plan, security review S1–S11, taskutil design).

## Key files

| File | Lines | Role |
|---|---|---|
| `app.py` | ~1750 | The whole server: guard, settings, `run_task_command`, every `/api/*` route, `/ws/pty`, SSE, static route |
| `nav.js` | ~2100 | Shared chrome on every page: nav bar, filter/command bar, sidebars, Settings, PTY console, hook prompts |
| `main.js` | ~600 | List view (`TaskWarriorUI`) |
| `task-card.js` | ~430 | `TaskCardManager`, annotation linkify + launchers |
| `task-editor.js` | ~970 | `TaskEditor` add/edit modal |
| `kanban.js`, `agenda.js`, `calendar-planner.js` | | The other three views, each with its own `.html` page |
| `sw.js` | 50 | Service worker shell cache (`CACHE = 'tw-web-vN'`) |
| `tw-web-launch.sh` | | How the user runs it: Flask + Epiphany PWA; `--clean` wipes SW caches and restarts |
| `tw-web-native-host.py` | | Firefox native-messaging host (start/stop/status) for `firefox/` |
| `tests/` | | pytest suite (see Testing) |

`index.html` loads scripts in this order, and the order is load-bearing:
`nav.js` → `codemirror-bundle.js` → `task-editor.js` → `task-card.js` → `main.js`.
`codemirror-bundle.js` is built by rollup (`rollup.cm.config.js`) from `codemirror-entry.js`; FullCalendar,
xterm and Sortable are vendored `.min.js` files. There's no other build step.

## How it runs (and why to develop in a worktree)

The user starts it with `tw-web-launch.sh` (`--clean` when needed). It runs `python3 app.py` from
**this folder**, with Werkzeug's auto-reloader on. So **every save here goes live**, and a broken
save can take the server down.

- Develop in a worktree: `git worktree add ../tw-web-<topic> -b <branch>`. Test there, then
  `git merge --ff-only` into `main` when green and remove the worktree.
- Changes to **binding or the launcher** only take effect after the user runs
  `~/dev/tw-web/tw-web-launch.sh --clean`, because the reloader's parent process holds the socket. Ask them.
- Runtime files live in `$XDG_RUNTIME_DIR/tw-web/` (fallback `~/.cache/tw-web/`): `tw-web.log`, `tw-web.pid`,
  `prompts/`, `spool/`.
- Network: `127.0.0.1` always, plus Tailscale (`TW_WEB_TAILSCALE=1`, set by the launcher). The full env
  table is in README → "Network access".

## Testing

```bash
python3 -m pytest -q tests/                 # ~1 s; never touches ~/.task
taskutil web probe --port 5000              # live attack-surface check (~/dev/tw-taskutil)
```

- `tests/conftest.py` points `TASKRC`, `TASKDATA` and `XDG_RUNTIME_DIR` at a temp dir *before* importing
  `app`, which runs `task` at import time. Never import `app` in a test any other way.
- **Found a bug? Write the failing test first, watch it fail, then fix.**
- **A red test must have no side effects.** Stub `subprocess.Popen` (see the `no_spawn` fixture) for any
  route that launches something: `/api/open`, `/api/launch`, `/api/terminal`. Never call `/api/server/stop`
  from a test: its PID file can point at the live server. To test what a route would send to `task`,
  monkeypatch `run_task_command` (see the `captured` fixture).
- **Checking a change on a real server:** follow the **`verify` skill** (`.claude/skills/verify/`).
  `.tools/scratch-server.sh up|env|probe|down` runs the worktree's `app.py` against a throwaway database
  on a free port and stops exactly that server. It also covers the headless-browser check.
- **Stopping processes:** never `pkill`/`pgrep` a bare `"python3 app.py"`. nb-web runs one too, and the
  pattern also matches your own shell's command line. Use the anchored pattern
  `pgrep -f '^(/usr/bin/)?python3 app\.py$'` and kill only PIDs whose `/proc/<pid>/cwd` is your folder.

## Critical invariants

1. **`_guard_request` runs before every route.** It applies the Host allowlist (S4) and the Origin check on
   non-GET requests and `/ws/pty` (S1, S5). Never exempt a route. A route that changes state must not be a
   GET, or the Origin check won't cover it.
2. **Firefox extension origins are limited to `_EXTENSION_ROUTES`** (S8). A new popup feature needs its
   route added there *and* in the CORS `resources` regex: both, or neither.
3. **The static route serves only top-level app assets** (`_is_asset`, S7). Flask's own static folder is
   off (`static_folder=None`). Don't re-enable it, and never put logs or secrets in a served file type.
4. **Free text goes to `task` after `--`; attributes go before it** (S11). This covers descriptions,
   annotations, denotate patterns, bookmark titles and URLs. 2.6.2 never parses attributes inside one
   argument, but reads a whole argument starting with `rc.` as an override.
5. **No shell, anywhere.** `subprocess` takes argv lists. Launcher templates are split first, then
   `{value}` is substituted, so the value stays one argument (S10).
6. **`run_task_command`:** 15 s timeout, `rc.confirmation=no` injected. Use `readonly=True` for every
   read; it adds `rc.hooks=off`, so slow on-exit hooks (recurrence) don't fire on a GET.
7. **Runtime paths are computed in three places:** `app.py`, `tw-web-launch.sh` and
   `tw-web-native-host.py`. Change all three together (S9).
8. **Debugger:** never hard-code `debug=True`. `TW_WEB_DEBUG=1` is honoured only on a localhost-only
   bind (S3).
9. **Escape task text before `innerHTML`** (`escHtml` in `calendar-planner.js`, `_e` in `task-card.js`),
   or use `textContent` (S6). Task text can come from hooks, bookmarks and sync.
10. **The `TW_*` env/signal contract is shared with fleet hooks:** `TW_NOINTERACT`, `TW_CLIENT`,
    `TW_SPOOL_DIR`, `TW_PREFLIGHT_*`, `tw_needs_pty`, `tw_preflight`, `TW_INTERACTIVE_REQUIRED`.
    Don't rename or repurpose them; the table is in the plan note.
11. **Service-worker cache:** an unversioned `.git/hooks/pre-commit` bumps `sw.js` `CACHE` whenever a
    shell asset is staged. Don't bump it by hand. In a fresh clone the hook is missing, so bump it manually.

## Fleet tools

- **`taskutil`** (`~/dev/tw-taskutil`, its own repo): infrastructure checks around Taskwarrior. Today it
  has `web probe`; `snapshot`, `stale`, `fixture` and `web start|stop|status` are planned.
- **`~/.task`** is a git repo (gittw). Before risky work on the write path, suggest a snapshot commit.
- **Mirrors:** `origin` pushes to Codeberg *and* GitHub (`remote.pushDefault=origin`), so a plain `git push`
  updates both. Run `git fetch github` afterwards to refresh the tracking ref.

## Time log

After each milestone (a merged fix, a finished doc or skill), append a line to the day's timedot block in
`~/.nb/claude/accounting/dev_timelog.md`: `tw-web:<topic>  <hours>  ; <what, concretely>`, in quarter
hours, under a `## YYYY-MM-DD` heading. If another session already wrote that day's block, start a new
fenced block under the same heading. Commit it in that notebook as
`timedot: YYYY-MM-DD tw-web session (…)`. Do it as you go, no end-of-session ritual. Other tw repos use
their own account (`tw-taskutil:<topic>`, …).
