---
name: verify
description: Project verify skill for tw-web — how to check a change without touching the live server or ~/.task: worktree, pytest, a scratch server on a free port against a throwaway task database, taskutil web probe, optional headless browser. Read before improvising any verification (curl smoke tests, hand-started servers, pkill).
---

# Verifying a tw-web change

This working copy is the live server (`~/dev/tw-web`, port 5000, auto-reload), and `~/.task` is the
user's real data. Everything below happens elsewhere. Written 2026-10-13 from phase 1 of
`tw:docs/tw-web-dev-infra-plan.md`, where every slip happened while improvising this loop by hand.

## The loop

```bash
# 1. Work in a worktree, never in ~/dev/tw-web
git -C ~/dev/tw-web worktree add ../tw-web-<topic> -b <topic>
cd ~/dev/tw-web-<topic>

# 2. Red test first, then fix, then green (~1 s, throwaway TASKRC/TASKDATA/XDG_RUNTIME_DIR)
python3 -m pytest -q tests/
python3 .tools/check-guards.py && python3 .tools/check-refs.py   # the hook runs these too

# 3. Real server from the worktree, against a throwaway database and settings file, on a free port
.tools/scratch-server.sh up            # prints http://localhost:<port>
eval "$(.tools/scratch-server.sh env)" # TASKRC/TASKDATA/TW_WEB_PORT/TW_WEB_SETTINGS for seeding
task add 'seed task' project:demo      # goes to the throwaway db (check the "TASKRC override" line)
curl -s localhost:$TW_WEB_PORT/api/tasks
.tools/scratch-server.sh probe         # taskutil web probe: 11/11 expected (no Tailscale bind here)
.tools/scratch-server.sh down          # stops exactly that server, deletes the data
unset TASKRC TASKDATA TW_WEB_PORT TW_WEB_SETTINGS   # or later `task` commands hit the deleted db

# 4. Merge and clean up
git -C ~/dev/tw-web merge --ff-only <topic>    # live server reloads now
git -C ~/dev/tw-web worktree remove ../tw-web-<topic> && git -C ~/dev/tw-web branch -d <topic>
taskutil web probe --port 5000                 # 21/21 on the live server (with Tailscale)
git -C ~/dev/tw-web push && git -C ~/dev/tw-web fetch -q github
```

If the change touches **binding, the launcher, or runtime paths**, the live server only picks it up
after the user runs `~/dev/tw-web/tw-web-launch.sh --clean`. Ask them, then probe again.

## Headless browser check (UI changes)

Use the harness, not a hand-started server:

```bash
python3 tests/e2e/run.py                 # all checks: brings a scratch server up, re-seeds, brings it down
python3 tests/e2e/run.py bug01 kanban    # only checks whose name contains one of these
```

A new check is `tests/e2e/<name>.check.cjs`:

```js
const { check, expect, task, exportOne, B, sleep, cardTexts } = require('./lib.cjs');
check(async pg => {
  await pg.goto(B + '/calendar-planner.html');
  await pg.waitForSelector('.fc-ev-title');
  expect(cond, 'what is wrong, with the values');   // exit 1: the behaviour is wrong
});                                                 // a throw / timeout is exit 2: the check is broken
```

- The seed (7 tasks, IDs 1–7, plus the `state`/duration UDAs and a `work` context) is in `run.py`. Every
  check starts from it. Times like `scheduled:today+10h` mean today 10:00, so they stay inside the
  calendar's current week.
- Make the bug show up as an `expect`, not a timeout: wait for what is there either way, then assert.
- **Holidays, moon phases, seasons:** the seed taskrc has none (the Agenda checks count date lines).
  Wrap a check in `withHolidays([[name, dayOffset, lastOffset?, {kind, time}?], …], async key => …)`:
  it appends `holiday.*` entries to the scratch taskrc and restores it afterwards.
- **Recurrence (templates, instances, the hook's notes):** wrap a check in `withRecurrence(async () => …)`:
  it copies recurrence-overhaul's hooks from `~/dev/tw-recurrence_overhaul-hook` (or `$TW_E2E_RECURRENCE`)
  into the scratch dir, turns hooks on with its `recurrence.rc` (the `r`, `type`, `rend`… UDAs) and points
  `TW_TASK_DIR` at the scratch data (the hooks' spool and logs default to `~/.task`). `editor-recur` uses it.
  The seed taskrc keeps 2.6.2's own recurrence on, which refuses a `status:recurring` task without `recur`:
  import templates only inside `withRecurrence` (its rc sets `recurrence=no`). Settings read at server start
  (`recurrence.field`, so the Recur status button's filter) can't be changed by a check.
- **2.6.2 exports a waiting task as `status: pending`** (waiting is a virtual tag since 2.6): a check that
  needs a non-pending status must use completed, deleted or a template.
- **Red against main's views:** for a page fix, copy the touched view files aside, `git show main:<file> >
  <file>`, run the new check (it must fail), then copy them back.
- Bug checks go in `tests/e2e/xfail.txt` until the fix. Read the `xfail` reason line in the output, so a
  check doesn't count as reproducing the bug when it failed for another reason.
- Playwright is borrowed from `~/dev/nb-web-tests/e2e/node_modules` (or `$TW_E2E_PLAYWRIGHT`); tw-web has
  no install of its own.
- Use substrings that are unique among the seeds: `hasText: 'eta home due'` also matched "beta home due".
- **Settings last the whole run:** `run.py` re-seeds the task data before each check, not the scratch
  `settings.json`. A check that changes Settings posts the defaults back at its end
  (`calendar-zoom-settings`, `settings-save-on-change`).
- **Touch checks:** drive touches with CDP `Input.dispatchTouchEvent` in an `isMobile`/`hasTouch` context
  (`calendar-touch-drag`, `calendar-swipe`). Wobble the finger a few px during a long press: a perfectly
  still press passed while the real phone (Brave) scrolled the page with the grabbed task. In Month a
  dragged task is `.fc-event-dragging`; in Week and Day, `.fc-event-mirror`.

### One-off probes and screenshots

`run.py` prints only pass/fail per check, so a throwaway probe writes what it finds to a file:
drop `tests/e2e/zz-<name>.check.cjs` (`fs.writeFileSync` to the scratchpad, or
`pg.screenshot({ path })`), run `python3 tests/e2e/run.py zz-<name>`, read the file, delete the
check. A probe that found a real bug becomes a proper check instead (red first).

**Browser engine:** the user's PWA runs in Epiphany (WebKitGTK). Playwright's WebKit is installed
(`~/.cache/ms-playwright/webkit-2311`, from `~/dev/nb-web-tests/e2e`). It needs `libavif13`, which
isn't on yoga: `apt-get download libavif13 libgav1-0 libyuv0`, `dpkg -x` them, and the three `.so`
files were copied into the bundle's `minibrowser-wpe/lib` and `minibrowser-gtk/lib` (no sudo). A probe
launches it itself: `require('<nb-web-tests>/e2e/node_modules/playwright').webkit.launch()`, run with
`PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`. It is headless WPE, not WebKitGTK: the sticky nav bar
drawn in stale places while the wheel scrolls (2026-10-24, Epiphany only, not Firefox) didn't show in
it. The user's screen recordings did (GNOME: Ctrl+Alt+Shift+R; `ffmpeg -vf fps=4` for frames), and
for Epiphany-only bugs the user tries a scratch server's URL in Epiphany itself.
- **A change that should leave the layout alone: compare the layout shots.** `layout-shots-100` and
  `-133` (shared `tests/e2e/layout.cjs`) shoot six views at four widths, top and after the wheel. Take
  "before" from a detached worktree of main (`git worktree add --detach ../tw-web-base main`; copy the
  branch's `layout.cjs` in if it changed) and "after" on the branch, in one session, then
  `.tools/compare-shots.sh <before> <after>`; crop a differing pair side by side (PIL) to see it. A
  run interrupted mid-way leaves its scratch server up: `.tools/scratch-server.sh down` in that worktree.
  The working minimum is 358 CSS px (the status pill row at 133%, user's call).
- **An Epiphany-only glitch: rule out its state first.** `tw-web-launch.sh --clean` (service-worker
  caches and processes) cured a "fully busted" List and Agenda on 2026-10-24 that no code had caused.
  The PWA keeps a zoom level per *host* (every localhost port): `sqlite3 "file:<profile>/ephy-history.db?mode=ro"
  "select url, zoom_level from hosts"`, profile `~/.local/share/org.gnome.Epiphany.WebApp-tw-web-*`; it read
  1.33, and WebKitGTK draws sticky bars in stale places at such zooms. The user opens another port in
  that profile with `epiphany --application-mode "--profile=<profile>" http://localhost:<port>/`.
- **Bisect servers for code older than 73ff769** (2026-10-22) need a fake `HOME`: those versions
  hard-code `~/.task` for git. `HOME=<tmp>/home` with `.task` linked to the scratch data, and
  `PYTHONUSERBASE=~/.local` so Flask still imports.

## Traps (each one happened)

- **Fixed ports collide.** 5099 is nb-web's e2e port and was taken. `scratch-server.sh` asks the OS for a
  free one.
- **`pkill`/`pgrep "python3 app.py"` hits the wrong things.** nb-web's dev server has the same command
  line, and the unanchored pattern also matches your own Bash tool command, which kills it (exit 144).
  Use `scratch-server.sh down`. If you must look, use `pgrep -f '^(/usr/bin/)?python3 app\.py$'` and check
  `/proc/<pid>/cwd`.
- **Red tests must not launch anything.** A red test against the old `/api/open` opened `/etc/passwd`
  in the user's editor. Stub `subprocess.Popen` (`no_spawn` fixture) for `/api/open` and `/api/launch`. Never call `/api/server/stop`: its PID file can point at the live server.
- **A worktree hides one S7 regression.** `.git` is a file in a worktree, so `/.git/config` gives 404
  there regardless. Only the live probe (step 4) proves the real `.git/` folder is hidden.
- **`$!` after `cd … &&` in a subshell** is the subshell, not Python. `scratch-server.sh` uses `exec` so
  the PID is the server.
- **The pre-commit hook bumps `sw.js`** and blocks on a failing guard, reference check or test. Don't
  bump `CACHE` by hand (CLAUDE.md invariant 11), and don't `--no-verify` past a check you haven't read.

## The installer (`tw-web.install`, `tw -I tw-web`)

Run it against a throwaway HOME, never this checkout: `HOME=$(mktemp -d) bash tw-web.install install`
(clones Codeberg, else GitHub; ~20 s). Cases (2026-10-28): fresh clone; rerun (up to date); `git reset --hard
HEAD~3` then rerun (updated); a local edit and a branch (not updated); a `local.rc` with `tw-web.dir = ~/x`
pointing at a copy (adopted, never pulled); a non-tw-web folder in the way (fails); `remove` (folder stays).
Smoke the clone with `TW_WEB_PORT=5099 .venv/bin/python app.py` and `curl :5099/api/ping`. On yoga itself,
compare `rev-parse HEAD`, `status --porcelain` and the folder listing before and after `tw -I tw-web`: adopting
must change nothing. `tests/test_security.py` checks the installer files are never served.

## When to update this skill

Whenever verification needed something not written here, or something here steered you wrong. Fix it
in the same session.
