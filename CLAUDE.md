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

**Consolidation (2026-10-13 → 15, steps 0–4 merged):** `tw:docs/tw-web-consolidation-plan.md` built the shared
pieces (`tw-api.js`, `tw-filter.js`, the server query builder `_task_filter_args`, the typed console request
and `_hook_signals`), each step fixing bugs from `tw:docs/tw-web-known-bugs.md`;
`tw:docs/tw-web-behavioural-spec.md` is the reference for what must not change. The feature freeze ended
with step 4; the leftovers (bug 10, H3, the debug harness, dead code, `add.html`) were done the same day.
Doc changes owed or made are tracked in `tw:docs/tw-web-doc-updates.md`: add a line when you change a doc.

## Key files

| File | Lines | Role |
|---|---|---|
| `app.py` | ~1900 | The whole server: guard, settings, `run_task_command`, every `/api/*` route, `/ws/pty`, SSE, static route |
| `nav.js` | ~2350 | Shared chrome on every page: nav bar, filter/command bar, sidebars, Settings (Server: restart/stop), PTY console (`openPty(cmd, {kind})`, `offerTerminal`), hook prompts, and the server watch (`_initServerWatch`: `/api/ping` on load, every 30 s while visible and on `tw-server-check`; a banner while the server doesn't answer, with "Open Termux" on a phone) |
| `tw-api.js` | 129 | `TW.store` (the shared task cache), `TW.api.write` (every task write goes through it, so every write empties the cache), `TW.api.handleWriteResult` (hook signals: PTY, deferred offer, timeout) `TW.api.networkError` (a fetch that threw: "tw-web server isn't answering" when no one answered, and asks nav.js to check) and `TW.commands` (command mode's command words, from `/api/commands`) |
| `tw-filter.js` | 195 | `TW.filter` (the nav bar's filter, priority, project and tags inputs, with modifiers: one set of rules for every view; virtual tags like `+OVERDUE` match the UUIDs `task` gives `/api/vtags`, fetched by nav.js `_syncVtags` and cached in `TW.store`) and `TW.sort` (`PRI_ORDER` 1–6 H M L, the List's sort). Pure functions, unit-tested in Node (`tests/js/`) |
| `main.js` | ~410 | List view (`TaskWarriorUI`) |
| `task-card.js` | ~410 | `TaskCardManager`, annotation linkify + launchers |
| `task-editor.js` | ~930 | `TaskEditor` add/edit modal. An edit re-reads the task on open and sends only the fields the user changed (`_formValues` snapshots); a save with no changes sends nothing. A new task starts from the nav filter's project, priority and tags (`TW.filter.addDefaults`); the project field suggests the Projects sidebar's list |
| `kanban.js`, `agenda.js`, `calendar-planner.js` | | The other three views, each with its own `.html` page |
| `sun.js` | 40 | `TW.sun`: sunrise, sunset and civil twilight for a date and place (the Calendar's cyan daylight stripe, `cal_daylight`/`cal_latitude`/`cal_longitude`). Pure, unit-tested in Node (`tests/js/sun.test.cjs`) |
| `tw-layers.js` | 109 | `TW.layers`: things that aren't tasks, for the Calendar (`layerEventSource`, `paintLayerMarks`) and the Agenda (`agendaLayerDays`): never editable, never counted, untouched by the nav filter. Three layers from the taskrc's `holiday.*` entries (`/api/holidays`, written by tw-events), split by `.kind`: holidays (all-day; `cal_holidays`, `agenda_holiday_days`), the moon's phases and the seasons (moments, `.at`: a mark at their time in Week/Day; `cal_moon`, `cal_seasons`). Helpers pure, unit-tested in Node (`tests/js/tw-layers.test.cjs`). Plan: `tw:docs/tw-holidays-and-layers-plan.md` |
| `sw.js` | 50 | Service worker shell cache (`CACHE = 'tw-web-vN'`) |
| `tw-web-launch.sh` | | How the user runs it: Flask + Epiphany PWA; `--clean` wipes SW caches and restarts |
| `tw-web-native-host.py` | | Firefox native-messaging host (start/stop/status) for `firefox/` |
| `tests/` | | pytest suite (see Testing) |

`index.html` loads scripts in this order, and the order is load-bearing:
`nav.js` → `tw-api.js` → `tw-filter.js` → `codemirror-bundle.js` → `task-editor.js` → `task-card.js` → `main.js`.
Every page loads `tw-api.js` right after `nav.js`. A new write from a page uses `TW.api.write`, not `fetch`,
a new task cache goes through `TW.store`, and a view filters and sorts with `TW.filter`/`TW.sort` (loaded on
the four view pages; `tests/test_js.py` checks that a page using them loads them) (consolidation plan, `tw:docs/tw-web-consolidation-plan.md`).
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
python3 .tools/check-guards.py              # every identifier in .guards still exists
python3 .tools/check-refs.py                # each page's scripts define what they use, in order
python3 tests/e2e/run.py [name…]            # headless page checks, scratch server only (~2 min)
```

The pre-commit hook (`.tools/pre-commit`) runs all three local checks and blocks a red commit; bypass a
deliberate work-in-progress commit with `--no-verify`. Install it once per clone:
`ln -sf ../../.tools/pre-commit .git/hooks/pre-commit` (worktrees share it).

- `tests/conftest.py` points `TASKRC`, `TASKDATA` and `XDG_RUNTIME_DIR` at a temp dir *before* importing
  `app`, which runs `task` at import time. Never import `app` in a test any other way.
- **Found a bug? Write the failing test first, watch it fail, then fix.**
- **A red test must have no side effects.** Stub `subprocess.Popen` (see the `no_spawn` fixture) for any
  route that launches something: `/api/open`, `/api/launch`. Never call `/api/server/stop`
  from a test: its PID file can point at the live server. To test what a route would send to `task`,
  monkeypatch `run_task_command` (see the `captured` fixture).
- **`.guards`** lists load-bearing identifiers: the security functions, the `TW_*` contract, the runtime
  paths and what the views share. When you write something others depend on, add a line. When the
  hook names a missing one, restore it, or (if the removal is deliberate) update `.guards` in the same commit.
- **`check-refs.py`** knows the pages share globals with no modules: a top-level use must load after its
  definer (`kanban.js` builds a `TaskCardManager` while loading), a call-time use must be on the page
  unless guarded with `typeof`, and two scripts on one page can't both `let`/`const`/`class` one name.
  A cross-page use that is fine by design goes in its `ALLOWED` table with the reason.
- **Checking a change on a real server:** follow the **`verify` skill** (`.claude/skills/verify/`).
  `.tools/scratch-server.sh up|env|probe|down` runs the worktree's `app.py` against a throwaway database
  and settings file (`TW_WEB_SETTINGS`) on a free port and stops exactly that server. It also covers the headless-browser check.
- **Page checks** live in `tests/e2e/*.check.cjs` (helpers in `lib.cjs`). `run.py` brings up a scratch
  server, re-seeds the throwaway database before each check and always brings it down; both it and `lib.cjs`
  refuse port 5000, `~/.task` and a server without its own settings file (a check that saves Settings
  would otherwise write the folder's `settings.json`). A check that reproduces a known bug is listed in `tests/e2e/xfail.txt`;
  fixing the bug turns it into an XPASS, which fails the run until its line is removed. A page fix starts
  with a check here, just as a server fix starts with a pytest. The pre-commit hook doesn't run them (too
  slow); run them before merging a page change.
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
10. **The `TW_*` env/signal contract is shared with fleet hooks:** `TW_NOINTERACT`, `TW_CLIENT`, `TW_WEB`,
    `TW_SPOOL_DIR`, `TW_PREFLIGHT_*`, `tw_needs_pty`, `tw_preflight`, `TW_INTERACTIVE_REQUIRED`. The reference
    is `~/dev/awesome-taskwarrior/CONVENTIONS.md`; `tests/test_contract.py` pins tw-web's side with the
    document's examples. Don't rename or repurpose them. The terminal console (`_pty_env`) clears
    `TW_NOINTERACT`, `TW_WEB`, `TW_SPOOL_DIR` and `TW_PREFLIGHT_*` so hooks can prompt there.
    **Write routes report hook signals through `_hook_signals(result, args)`** (`needs_pty`, `timed_out`,
    `deferred_cmd`, each with the command as typed after `task`, `shlex`-quoted), and pages act on them with
    `TW.api.handleWriteResult`. The console's first message says what to run (`_pty_argv`: kind `task` or
    `shell`). **Nothing runs a request's text through a shell or opens a desktop terminal.** tw-web doesn't
    read `tw_preflight`: bulk commands run in the console, where Taskwarrior confirms them itself.
11. **Service-worker cache:** the pre-commit hook bumps `sw.js` `CACHE` whenever a shell asset is staged.
    Don't bump it by hand. If the hook isn't installed (fresh clone), install it (see Testing).
12. **Reads never use the CLI's context.** tw-web takes context only from the nav bar (`context=`). In 2.6.2
    `export` ignores `rc.context` but reports (`count`, `projects`) apply it, so every read passes
    `rc.context=none` (`tests/test_queries.py` checks the read routes). Task-list reads build their filter in
    `_task_filter_args`: context and raw-filter expressions are `shlex`-split and parenthesised, because one
    argument holding `a or b` with quotes matches nothing.

## Fleet tools

- **`taskutil`** (`~/dev/tw-taskutil`, its own repo): infrastructure checks around Taskwarrior: `web probe`,
  `snapshot` (commit `~/.task`, no push; the launcher runs it on every start) and `stale` (old uncommitted
  work, lagging or unreachable mirrors; a daily user timer runs it with `--notify`). `fixture` and
  `web start|stop|status` are planned.
- **`~/.task`** is a git repo (gittw). Before risky work on the write path, run `taskutil snapshot -m "before …"`.
- **Mirrors:** `origin` pushes to Codeberg *and* GitHub (`remote.pushDefault=origin`), so a plain `git push`
  updates both. Run `git fetch github` afterwards to refresh the tracking ref.

## Time log

After each milestone (a merged fix, a finished doc or skill), append a line to the day's timedot block in
`~/.nb/claude/accounting/dev_timelog.md`: `tw-web:<topic>  <hours>  ; <what, concretely>`, in quarter
hours, under a `## YYYY-MM-DD` heading. If another session already wrote that day's block, start a new
fenced block under the same heading. Commit it in that notebook as
`timedot: YYYY-MM-DD tw-web session (…)`. Do it as you go, no end-of-session ritual. Other tw repos use
their own account (`tw-taskutil:<topic>`, …).
