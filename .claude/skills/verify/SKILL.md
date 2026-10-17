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
- Bug checks go in `tests/e2e/xfail.txt` until the fix. Read the `xfail` reason line in the output, so a
  check doesn't count as reproducing the bug when it failed for another reason.
- Playwright is borrowed from `~/dev/nb-web-tests/e2e/node_modules` (or `$TW_E2E_PLAYWRIGHT`); tw-web has
  no install of its own.
- Use substrings that are unique among the seeds: `hasText: 'eta home due'` also matched "beta home due".

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

## When to update this skill

Whenever verification needed something not written here, or something here steered you wrong. Fix it
in the same session.
