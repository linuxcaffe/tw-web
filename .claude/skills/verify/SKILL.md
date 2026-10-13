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

# 3. Real server from the worktree, against a throwaway database, on a free port
.tools/scratch-server.sh up            # prints http://localhost:<port>
eval "$(.tools/scratch-server.sh env)" # TASKRC/TASKDATA/TW_WEB_PORT for seeding
task add 'seed task' project:demo      # goes to the throwaway db (check the "TASKRC override" line)
curl -s localhost:$TW_WEB_PORT/api/tasks
.tools/scratch-server.sh probe         # taskutil web probe: 11/11 expected (no Tailscale bind here)
.tools/scratch-server.sh down          # stops exactly that server, deletes the data
unset TASKRC TASKDATA TW_WEB_PORT      # or later `task` commands hit the deleted db

# 4. Merge and clean up
git -C ~/dev/tw-web merge --ff-only <topic>    # live server reloads now
git -C ~/dev/tw-web worktree remove ../tw-web-<topic> && git -C ~/dev/tw-web branch -d <topic>
taskutil web probe --port 5000                 # 21/21 on the live server (with Tailscale)
git -C ~/dev/tw-web push && git -C ~/dev/tw-web fetch -q github
```

If the change touches **binding, the launcher, or runtime paths**, the live server only picks it up
after the user runs `~/dev/tw-web/tw-web-launch.sh --clean`. Ask them, then probe again.

## Headless browser check (UI changes)

There's no Playwright install in tw-web yet. Borrow nb-web-tests', with the scratch server up:

```js
// save as <scratchpad>/check.cjs, run: node check.cjs
const { chromium } = require('/home/djp/dev/nb-web-tests/e2e/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.goto(`http://localhost:${process.env.TW_WEB_PORT}/calendar-planner.html`);
  await pg.waitForSelector('.fc-ev-title'); await pg.click('.fc-ev-title');
  console.log(await pg.textContent('#modal-task-body'));
  await b.close();
})();
```

Seed whatever the page needs first: a calendar event needs `scheduled:today+10h`.

## Traps (each one happened)

- **Fixed ports collide.** 5099 is nb-web's e2e port and was taken. `scratch-server.sh` asks the OS for a
  free one.
- **`pkill`/`pgrep "python3 app.py"` hits the wrong things.** nb-web's dev server has the same command
  line, and the unanchored pattern also matches your own Bash tool command, which kills it (exit 144).
  Use `scratch-server.sh down`. If you must look, use `pgrep -f '^(/usr/bin/)?python3 app\.py$'` and check
  `/proc/<pid>/cwd`.
- **Red tests must not launch anything.** A red test against the old `/api/open` opened `/etc/passwd`
  in the user's editor. Stub `subprocess.Popen` (`no_spawn` fixture) for `/api/open`, `/api/launch` and
  `/api/terminal`. Never call `/api/server/stop`: its PID file can point at the live server.
- **A worktree hides one S7 regression.** `.git` is a file in a worktree, so `/.git/config` gives 404
  there regardless. Only the live probe (step 4) proves the real `.git/` folder is hidden.
- **`$!` after `cd … &&` in a subshell** is the subshell, not Python. `scratch-server.sh` uses `exec` so
  the PID is the server.
- **The pre-commit hook bumps `sw.js`.** Don't bump `CACHE` by hand (see CLAUDE.md invariant 11).

## When to update this skill

Whenever verification needed something not written here, or something here steered you wrong. Fix it
in the same session.
