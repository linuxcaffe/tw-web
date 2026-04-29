# tw-web

A powerful, mobile-friendly web interface for [Taskwarrior](https://taskwarrior.org) 2.6.x —
installable as a PWA, usable from any browser, including on Android via Termux.
Part of the [awesome-taskwarrior](https://github.com/linuxcaffe/awesome-taskwarrior) ecosystem.

---

## TL;DR

- **Four views** — List, Kanban, Agenda, and Calendar — all driven by the same live task data
- **Powerful filter bar** — description, priority, project, and tags inputs with full Taskwarrior modifier syntax (`.is:`, `.not:`, `.any:`, `>`, etc.)
- **Command bar** — type any `task` command or filter expression; commands open in an inline PTY terminal so hooks, confirmations, and interactive prompts all work naturally
- **Hook-aware** — interactive hooks (subtask prompts, hledger-add, etc.) open a live terminal pane instead of hanging or silently failing
- **Projects and Tags sidebars** — hierarchical project browser with counts; filter-sensitive tag sidebar sorted by frequency
- **Full task lifecycle** — add, edit, annotate, start, stop, complete, delete; bulk operations with preflight confirmation
- **PWA-ready** — install to your home screen on desktop or Android; works offline for the shell
- **Taskwarrior 2.6.x** required

---

## Why this exists

Taskwarrior's command-line interface is expressive and fast, but it assumes you're at a terminal. On a phone, that's friction. In a shared environment, that's a barrier. And even on the desktop, switching windows to check or update a task interrupts flow.

Most Taskwarrior web interfaces solve the viewing problem but stop there. They show you tasks, but the moment you want to filter by a non-trivial expression, run a report, or trigger a hook, you're back at the terminal anyway.

tw-web doesn't try to hide Taskwarrior behind a simpler model. It exposes it. The filter bar accepts the same attribute modifiers Taskwarrior accepts. The command bar runs real `task` commands in a real PTY — which means your hooks fire, your preflight guards work, and interactive prompts appear right in the browser.

---

## What this means for you

You can manage your entire task system from a phone, a tablet, or a browser tab — filtering with the same precision you'd use at the command line, running bulk operations with safety guards, and triggering interactive workflows without ever leaving the interface.

---

## Core concepts

**PTY console** — a real pseudo-terminal embedded in the page (via WebSocket + xterm.js). Commands run here have a genuine TTY, so Taskwarrior hooks that read from `/dev/tty` work exactly as they do in a real terminal.

**tw_needs_pty** — a signal hooks can emit when they need interactive input. tw-web detects it and opens the PTY console automatically.

**Filter mode / Command mode** — the nav bar toggles between structured filter inputs (description, priority, project, tags) and a free-form command input. Filter-only expressions set a raw filter; anything with a command verb opens in the PTY console.

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

### Android + Termux

tw-web runs entirely inside Termux — no root, no external server required.

```bash
# 1. Install Termux from F-Droid (recommended over Play Store)
#    https://f-droid.org/packages/com.termux/

# 2. Inside Termux, install dependencies
pkg update && pkg install python git taskwarrior

# 3. Clone and install
git clone https://github.com/linuxcaffe/tw-web.git
cd tw-web
pip install -r requirements.txt

# 4. Start the server (runs on localhost:5000)
python3 app.py &

# 5. Open in a browser
#    http://localhost:5000
```

To use tw-web as a PWA on Android, open `http://localhost:5000` in Firefox or a Chromium-based browser, then "Add to Home Screen" from the browser menu. **Epiphany for Android** (GNOME Web) is the recommended PWA host — it hides browser chrome and feels native.

For Taskwarrior sync on Android, [Taskwarrior for Android](https://play.google.com/store/apps/details?id=kvj.taskw) or a git-based sync via Termux work well alongside tw-web.

> **Tip:** To keep the server running while you use other apps, start it in a Termux session and use `Ctrl-Z` + `bg`, or run it inside `tmux`.

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

Settings are stored in `settings.json` (auto-created, not committed). Edit via the **Settings** panel in the side menu, or directly:

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
| Agenda | `/agenda.html` | Scheduled and due tasks in chronological order |
| Calendar | `/calendar-planner.html` | Week/month view; drag tasks onto dates |

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

next,work        # tags: has BOTH +next and +work
.hasnt:waiting   # tags: does not have +waiting

> M              # priority higher than Medium
```

The Projects sidebar (left) and Tags sidebar (right) let you click to filter by project or tag. Tags in active mode show only the tags present in the currently visible task set, sorted by frequency.

### Command bar

Press `f` (or the `⇅` button) to switch from filter inputs to the command bar. Type any Taskwarrior command or filter expression:

```
ghistory                        # opens history report in the PTY console
diag                            # task diagnostics
due.before:eow +work            # filter-only expression → applied as raw filter
add Clean the kitchen due:tom   # adds a task
253 mod project:home            # modifies task 253
```

Filter-only expressions (no command verb) are applied as a raw filter on the task list. Everything else opens in the inline PTY console, where hooks and prompts work normally. Press any key to dismiss the console after the command finishes.

### Completed and deleted tasks

Switch status via the status button in the nav bar. Completed and deleted tasks are shown newest-first (by end date) by default. Each card shows `uuid:8chars` and `end:date` at the start of its attributes row.

---

## Project status

Active development. The interface is stable for daily use. Hook integration (PTY console, `tw_needs_pty` protocol) is new and well-tested on Linux; Android/Termux hook support depends on which hooks you have installed.

---

## Further reading

- [awesome-taskwarrior](https://github.com/linuxcaffe/awesome-taskwarrior) — the ecosystem this is part of; install hooks and extensions with `tw -I <name>`
- [Taskwarrior docs](https://taskwarrior.org/docs/) — filter syntax, UDAs, hooks
- [tw-nointeract-preflight-hook](https://github.com/linuxcaffe/tw-nointeract-preflight-hook) — bulk operation guard; pairs well with tw-web's command bar

---

## Metadata

- License: MIT
- Language: Python 3 (Flask), JavaScript (vanilla)
- Requires: Taskwarrior 2.6.x, Python 3.8+, Flask 2.3+
- Platforms: Linux, Android/Termux
- PWA: yes (service worker, installable)
