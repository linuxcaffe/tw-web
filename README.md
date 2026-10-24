# tw-web

A powerful, mobile-friendly web interface for [Taskwarrior](https://taskwarrior.org) 2.6.x —
installable as a PWA, usable from any browser, including on Android via Termux.
Part of the [awesome-taskwarrior](https://github.com/linuxcaffe/awesome-taskwarrior) ecosystem.

**On a phone, two ways:**
- **Connected, over Tailscale:** the phone's browser opens your laptop's tw-web through
  [Tailscale](https://tailscale.com) (`tw-web-launch.sh` listens there; see [Network access](#network-access)).
  Nothing to set up on the phone but the Tailscale app; the laptop has to be on, and both online.
- **On Android itself, with [tw-mobilize](https://github.com/linuxcaffe/tw-mobilize):** the phone becomes
  a station of its own: Taskwarrior 2.6.2, your tasks and tw-web all run in Termux and work offline, and
  [gittw](https://github.com/linuxcaffe/gittw) syncs them with your other stations whenever it's online
  (automatically, from tw-web). Three lines in Termux set it up: see [Android / Termux](#android--termux).

---

## TL;DR

- **Four views** — List, Kanban, Agenda, and Calendar — all driven by the same live task data
- **Powerful filter bar** — description, priority, project, and tags inputs with full Taskwarrior modifier syntax (`.is:`, `.not:`, `.any:`, `>`, etc.)
- **Command bar** — type any `task` command or filter expression; commands open in an inline PTY terminal so hooks, confirmations, and interactive prompts all work naturally
- **Hook-aware** — interactive hooks (subtask prompts, hledger-add, etc.) open a live terminal pane instead of hanging or silently failing
- **Projects and Tags sidebars** — hierarchical project browser with counts; filter-sensitive tag sidebar sorted by frequency
- **Full task lifecycle** — add, edit, annotate, start, stop, complete, delete; bulk operations from the command bar, confirmed in the console as Taskwarrior asks
- **PWA-ready** — install to your home screen on desktop or Android; works offline for the shell
- **Taskwarrior 2.6.x** required

---

## Why this exists

Taskwarrior's command-line interface is expressive and fast, but it assumes you're at a terminal. On a phone, that's friction. In a shared environment, that's a barrier. And even on the desktop, switching windows to check or update a task interrupts flow.

Most Taskwarrior web interfaces solve the viewing problem but stop there. They show you tasks, but the moment you want to filter by a non-trivial expression, run a report, or trigger a hook, you're back at the terminal anyway.

tw-web doesn't try to hide Taskwarrior behind a simpler model. It exposes it. The filter bar accepts the same attribute modifiers Taskwarrior accepts. The command bar runs real `task` commands in a real PTY — which means your hooks fire, Taskwarrior's own confirmations work, and interactive prompts appear right in the browser.

---

## What this means for you

You can manage your entire task system from a phone, a tablet, or a browser tab — filtering with the same precision you'd use at the command line, running bulk operations with safety guards, and triggering interactive workflows without ever leaving the interface.

---

## Core concepts

**PTY console** — a real pseudo-terminal embedded in the page (via WebSocket + xterm.js). Commands run here have a genuine TTY, so Taskwarrior hooks that read from `/dev/tty` work exactly as they do in a real terminal.

**tw_needs_pty** — a signal hooks can emit when they need interactive input. tw-web detects it on any write (as it does the older `TW_INTERACTIVE_REQUIRED` marker) and opens the PTY console with the same command. A write that hits the 15 s limit, or a hook that queues a command for later, gets an "Open in terminal" offer instead. The contract is [awesome-taskwarrior's CONVENTIONS.md](https://github.com/linuxcaffe/awesome-taskwarrior/blob/main/CONVENTIONS.md).

**Filter mode / Command mode** — the nav bar toggles between structured filter inputs (description, priority, project, tags) and a free-form command input. Filter-only expressions set a raw filter; anything with a command word opens in the PTY console. The command words are Taskwarrior's own (`task _commands` and `task _aliases`), so custom reports and aliases count.

**PWA** — Progressive Web App. Install tw-web to your home screen and it behaves like a native app, with offline shell caching via a service worker.

---

## Installation

### Linux

```bash
# 1. Clone the repo
git clone https://github.com/linuxcaffe/tw-web.git
cd tw-web

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Start the server
./tw-web-launch.sh          # kills any existing instance on :5000, then starts
# or: python3 app.py

# 4. Open in your browser
#    http://localhost:5000
```

To install as a PWA on Linux, open `http://localhost:5000` in Chrome or a Chromium-based browser and use the "Install" option from the address bar. In Firefox, use "Install This Site as an App" from the menu.

**Epiphany (GNOME Web)** makes an excellent PWA host — it installs cleanly to the GNOME application launcher and opens without browser chrome.

### Network access

tw-web has no login, and its terminal pane is a real shell — so it only listens where you can trust everyone who can reach it.

| Setting | Effect |
|---|---|
| *(default)* | Listens on `127.0.0.1` only |
| `TW_WEB_TAILSCALE=1` | Also listens on this machine's [Tailscale](https://tailscale.com) addresses, and accepts its Tailscale names (`yoga`, `yoga.<tailnet>.ts.net`). `tw-web-launch.sh` sets this. |
| `TW_WEB_ALLOWED_HOSTS=a,b` | Extra hostnames to accept (e.g. behind a reverse proxy) |
| `TW_WEB_PORT=N` | Port (default 5000) |
| `TW_WEB_DEBUG=1` | Werkzeug debugger — refused unless listening on localhost only |
| `TW_WEB_HOST=0.0.0.0` | Every network, including café Wi-Fi. Prints a warning; not recommended. |
| `TW_WEB_SETTINGS=path` | Settings file (default `settings.json` next to `app.py`). The test scratch server uses its own. |

Whatever the binding, the server refuses requests for unknown hostnames (DNS rebinding) and refuses writes and terminal connections from other websites.

Runtime files (log, PID, hook prompts, spool) live in a private folder: `$XDG_RUNTIME_DIR/tw-web/` (usually `/run/user/<uid>/tw-web/`), or `~/.cache/tw-web/` where that isn't set. The server log is `tw-web.log` there.

### Android / Termux

tw-web runs entirely inside Termux — no root, no external server required.

**The quick way:** [tw-mobilize](https://github.com/linuxcaffe/tw-mobilize)'s quick start, three lines in
Termux. `mobilize init` installs Taskwarrior 2.6.2, clones your gittw task repo, sets up tw-web with its
launcher, and checks the result; `mobilize android` then walks through the phone's own settings. The
steps below are what it does, for doing it by hand.

#### Termux prerequisites

Install Termux from [F-Droid](https://f-droid.org/packages/com.termux/) (recommended over the Play Store build), then:

```bash
pkg update && pkg upgrade -y
pkg install python git openssh
pip install flask flask-cors flask-sock tabulate
```

> **Taskwarrior version:** The Termux package manager provides TW3 (`pkg install taskwarrior`), which tw-web does not support. tw-web requires **Taskwarrior 2.6.x** — install it manually. A pre-built `aarch64` `.deb` for Termux is included in the [gittw repo](https://github.com/linuxcaffe/gittw).

#### Clone and start

```bash
git clone https://github.com/linuxcaffe/tw-web.git ~/dev/tw-web
cd ~/dev/tw-web
python3 app.py
# → Running on http://127.0.0.1:5000
```

Open `http://localhost:5000` in your phone's browser.

#### Install as a PWA

In Chrome / Chromium: **⋮ → Add to Home Screen.**
In Firefox: **⋮ → Install.**

[**Epiphany (GNOME Web) for Android**](https://f-droid.org/packages/org.gnome.Epiphany/) makes the best PWA host — it strips all browser chrome and the app feels fully native.

#### Keep the server running

Android stops background apps when it likes, and Termux with them. [tw-mobilize](https://github.com/linuxcaffe/tw-mobilize)
(`mobilize init`) sets this up for you: a Termux:Widget button that starts tw-web in a loop that
restarts it when it dies, a `~/.bashrc` block that starts it whenever Termux opens, and
`mobilize android`, which walks through the phone's own settings (battery, Huawei's App launch,
"Display over other apps") and opens each screen.

**When the server stops anyway**, the page says so: a banner, "tw-web server isn't answering (last
reached 13:42)", with Retry, and on a phone **Open Termux** (opening Termux starts it again). The
page checks every 30 seconds while it's on screen, and reloads the view when the server is back.
**Settings → Server** restarts it (a fresh server, the page reconnects by itself) or stops it.

**Updates:** the menu shows tw-web's version under the logo (`v2.0.0-27`: the last release and
the commits since; the app cache's number is its tooltip). The server checks for new commits about
once an hour (by the clock: a phone that slept checks within a minute of waking); when there are some, a pill appears there, **Update (3 new)**, listing them on hover.
Tapping it pulls them (fast-forward only, and only on `main` with no local edits) and reloads the
page onto the new version. Updating by hand still works: `git pull` in the tw-web folder.

On Termux tw-web sets `LD_PRELOAD` to Termux's termux-exec when it's missing (as when Termux:Widget
starts it), so hooks starting `#!/usr/bin/env python3` work however the server was started.

Without tw-mobilize, two options:

**tmux**:
```bash
pkg install tmux
tmux new -s tw-web
cd ~/dev/tw-web && python3 app.py
# Ctrl-B D to detach — server stays alive
```

**Termux:Boot** — auto-start on reboot. Requires the [Termux:Boot](https://f-droid.org/packages/com.termux.boot/) add-on:
```bash
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-tw-web.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
cd ~/dev/tw-web
python3 app.py &
EOF
chmod +x ~/.termux/boot/start-tw-web.sh
```

#### Sync tasks with gittw

[gittw](https://github.com/linuxcaffe/gittw) provides git-based Taskwarrior sync — the same tool that powers the tw-web **Sync** button. See the gittw README for the full Termux setup, including how to clone your existing task data and add your phone's SSH key to GitHub without needing the web interface.

Once gittw is installed and your `~/.task/` is cloned from your remote, the tw-web Sync button works out of the box with no further configuration.

**What the Sync dialog tells you** (gittw 0.3+): what's coming in from each other station
("Incoming: 3 changes from s5"; it fetches when it opens), what's here and not pushed yet, when each
station last synced, and how automatic sync is doing. A note typed there becomes the sync's commit
message (`gittw sync -m`), with this station's `Station:` line like every other commit. A sync may
take up to 2 minutes (a phone's pull and push are slow); a task command takes at most 15 seconds.

**Automatic sync** (Settings → General → Sync automatically, on by default when gittw is there): soon
after the server starts, a minute after your last change, and every 15 minutes; after a failed try
(offline) every 5. Changes from another station reload the view, with a note saying where they came
from. A sync and `task` never run at the same time: a sync waits for running commands, and commands
wait for a sync (usually a few seconds), so a pull can't land between task reading and rewriting
its data files.

**Every sync is in the server log** (`tw-web.log`; on a phone started by tw-mobilize,
`~/.cache/tw-web/server.out`), manual or automatic: one line when it works (`sync (auto) ok: 2 from
s5`), and when it fails the reason plus everything gittw said, so a message that flashed past on screen
can be read later: `grep -A12 'sync (' tw-web.log`.

File links (annotations, the `file` launcher) open with `termux-open` on Termux, which has no `xdg-open`.

---

## Firefox Extension

A bundled browser extension lives in `firefox/`. It gives you fast access to tw-web from anywhere in Firefox without switching windows.

### What it does

| Tab | Action |
|-----|--------|
| **Add task** (default) | Type a description, optional project/priority/tags, press Enter — task added, popup closes |
| **Bookmark** | Saves the current page as a `+bkmk` task; the URL goes into an annotation (clickable in tw-web) |
| **tw-web** | Live server status (pending count, uptime, TW version); Stop/Start Flask without touching a terminal |

**Alt+W** opens the popup from anywhere in Firefox.

### Install

**1. Native messaging host** (one-time — enables Start/Stop server from the popup):

```bash
mkdir -p ~/.mozilla/native-messaging-hosts
cp tw-web-native-host.json ~/.mozilla/native-messaging-hosts/tw_web_launcher.json
```

**2. Load the extension:**

- Open [`about:debugging`](about:debugging#/runtime/this-firefox) in Firefox
- Click **This Firefox** → **Load Temporary Add-on…**
- Select `firefox/manifest.json` (path shown on the tw-web About page)

**3. Pin to toolbar** (optional but recommended):

- Click the puzzle-piece Extensions icon → find tw-web → click the pin icon

> The extension uses a stable ID (`tw-web@linuxcaffe`) so the native messaging host always finds it. It only talks to `localhost:5000` — no external network access.

---

## Configuration

Settings are stored in `settings.json` (auto-created, not committed). Edit via the **Settings** panel in the side menu (each change saves as you make it; "Saved" shows beside its section), or directly:

```json
{
  "notification_timeout": 3000,
  "kanban_columns": ["backlog", "todo", "doing", "review", "done"]
}
```

### Optional Taskwarrior UDAs

```ini
# ~/.taskrc — add these if you use Kanban or numeric priority

uda.state.type=string
uda.state.label=State

uda.priority.values=1,2,3,4,5,6,H,M,L
```

---

## Usage

### Views

| View | URL | What it shows |
|------|-----|---------------|
| List | `/` | Filterable task list; card or list layout |
| Kanban | `/kanban.html` | Tasks as cards in `state` UDA columns |
| Agenda | `/agenda.html` | Scheduled and due tasks in chronological order; holidays on the date lines, with a line of their own up to 30 days ahead (Settings) |
| Calendar | `/calendar-planner.html` | Day/week/month views; drag tasks onto dates and times; a cyan stripe in the time column marks sunrise to sunset; holidays as amber all-day bars, your own events (tw-events) in green, the moon's phases, the seasons and the clock changes as a mark at their time |

### Holidays

The Calendar and the Agenda show the holidays your taskrc defines (`holiday.<name>.name` with `.date`, or `.start`/`.end`), the same ones `task calendar` shows. tw-web reads them with `task _show` and never fetches them itself. [tw-events](https://github.com/linuxcaffe/tw-events) writes them from holidata.net for your locale and region (`tw -I events`, then `events init --locale en-CA --regions ON`). They can't be moved or opened, aren't counted, and ignore the nav filter. Settings → Calendar → Holidays turns them off and sets how far ahead the Agenda gives a holiday with no tasks its own line.

tw-events can also compute the moon's phases and the solstices and equinoxes (`events init --moon yes --seasons yes`), as holiday entries with their moment (`.kind`, `.at`). tw-web draws each as a dashed mark at its time in Week and Day views (its icon at the right; hover for the name and time; Day view writes them beside it), just the icon in Month (left of the day number: hover for the name and time, click or tap for that day), and on the date line of the day in the Agenda (never a line of its own). Settings → Calendar → Moon & seasons.

The days the clocks change (tw-events 0.4.0+, `events init --clock yes`: "Clocks forward (EDT)", "Clocks back (EST)", from the machine's own time zone) are drawn the same way, with 🕐. Settings → Calendar → Moon & seasons → clock changes.

Your own events come from tw-events too (0.3.0+): the lines of `~/.task/config/my-events.txt` (`2026-10-29 14:30  Dentist`, `--04-12  Anne's birthday`) and the ghosts of tasks made with `events add <id>`, which stay on the calendar after the task is done or deleted. An all-day one is a green bar; a timed one is a solid green mark at its time in Week and Day with 📌, and a 📌 by the day number in Month. In the Agenda they follow the date and, like holidays, give a day a line of its own. tw-web never edits them: change the file, or delete the ghost's lines. Settings → Calendar → My events.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `L` | List page |
| `K` | Kanban page |
| `A` | Agenda page |
| `C` | Calendar page |
| `f` | Toggle filter / command mode |
| `a` | Add task |
| `t` | Open terminal (shell) |
| `?` | Help |

### Filter bar

The filter bar has four inputs: description, priority, project, and tags. All support Taskwarrior-style modifier syntax:

```
foo              # description contains "foo"
.is:foo          # exact match
.not:foo         # does not match
.any:            # field is set
.none:           # field is empty

next,work        # tags: has BOTH +next and +work (commas or spaces)
+next -waiting   # tags: has +next, does not have +waiting
.hasnt:waiting   # tags: does not have +waiting
OVERDUE          # tags: a virtual tag (+DUE, +TODAY, -BLOCKED, …)

> M              # priority higher than Medium (H, and 1–6 if you use them)
< M              # priority lower than Medium (L)
```

The Projects sidebar (left) and Tags sidebar (right) let you click to filter by project or tag. Tags in active mode show only the tags present in the currently visible task set, sorted by frequency.

**Virtual tags** are the upper-case tags Taskwarrior works out from other fields: `DUE`, `OVERDUE`, `TODAY`, `ACTIVE`, `BLOCKED`, `READY`, `WAITING` and the rest of the list in `man task`. Type one in the tags input, with `+`/`-` or `.has:`/`.hasnt:` like any tag, and mix them with real tags (`home OVERDUE`). Taskwarrior decides which tasks match (`task +OVERDUE _uuids`), so they mean exactly what they mean on the command line, `rc.due` and all. The Tags sidebar and panel list them in a third mode, **[active] [all] [virtual]**; hover one for its description. Upper case matters: `next` is a tag, `NEXT` is too (2.6.2 has no virtual `NEXT`), `DUE` is virtual.

**Adding a run of related tasks:** a new task (Add or Log) starts with the filter bar's project, priority and tags, so with `home` and `H` in the filter every task you add is `project:home priority:H` until you change it. Only values that name one thing count: `home`, `.is:home`, `.has:next`, the `+` tags of `+next -x`; ranges and negatives (`< M`, `.none:`, `.hasnt:x`), virtual tags and the description search don't. Editing a task always shows the task's own values. In both, the project field suggests the projects the Projects sidebar lists.

### Command bar

Press `f` (or the `⇅` button) to switch from filter inputs to the command bar. Type any Taskwarrior command or filter expression:

```
ghistory                        # opens history report in the PTY console
diag                            # task diagnostics
due.before:eow +work            # filter-only expression → applied as raw filter
add Clean the kitchen due:tom   # adds a task
253 mod project:home            # modifies task 253
```

Filter-only expressions are applied as a raw filter on the task list. Anything with a command word, or starting with a task ID, opens in the inline PTY console, where hooks and prompts work normally. Press any key to dismiss the console after the command finishes.

A command word is one Taskwarrior itself would take: a command or report (custom ones too), an alias, or an unambiguous abbreviation of a command at least `abbreviation.minimum` letters long (default 2). So `mod` and `proj` are commands, while `co` is a filter, since it could be `columns`, `config`, `count` and more. Bulk changes ask for confirmation in the console, as they do in a shell (`bulk`, `confirmation`).

**Menu → Terminal** (or `t`) opens the same console with your shell.

### Recurrence

tw-web works with [recurrence-overhaul](https://github.com/linuxcaffe/tw-recurrence_overhaul-hook)'s templates and instances; the hook decides everything, tw-web shows and asks.

- **A ring round the priority dot** marks a recurring task: violet a template (shown with the Recur status button), green an instance. It's there without a priority too.
- **The editor's Recur line:** the rule (`1w`, `1mo`, `m:2tue`, anything the hook reads), period or chain, and an End date (`rend`). A rule on a new task makes it a template, and the hook its first instance; added to an existing task, it turns that task into a template. Hints only: a rule needs a due or scheduled date, and a chain takes no until (End stops it). What the hook refuses comes back in its own words.
- **Editing a template:** its wait, scheduled and until show as dates and save as offsets from its anchor (`rwait:due-604800s`), so later instances follow.
- **Editing an instance** changes that instance only. The line shows its template's rule, with a link to edit the template; the hook's note on what to run to carry a change forward appears after the save.

### Completed and deleted tasks

Switch status via the status button in the nav bar. Completed and deleted tasks are shown newest-first (by end date) by default. Each card shows `uuid:8chars` and `end:date` at the start of its attributes row.

---

## Project status

Active development. The interface is stable for daily use. Hook integration (PTY console, `tw_needs_pty` protocol) is new and well-tested on Linux; Android/Termux hook support depends on which hooks you have installed.

---

## Further reading

- [awesome-taskwarrior](https://github.com/linuxcaffe/awesome-taskwarrior) — the ecosystem this is part of; install hooks and extensions with `tw -I <name>`
- [Taskwarrior docs](https://taskwarrior.org/docs/) — filter syntax, UDAs, hooks
- [tw-nointeract-preflight-hook](https://github.com/linuxcaffe/tw-nointeract-preflight-hook) — bulk operation guard for clients without a terminal (tw-web's console is a terminal, so there Taskwarrior confirms bulk changes itself)

---

## Metadata

- License: MIT
- Language: Python 3 (Flask), JavaScript (vanilla)
- Requires: Taskwarrior 2.6.x, Python 3.8+, Flask 2.3+
- Platforms: Linux, Android/Termux
- PWA: yes (service worker, installable)
