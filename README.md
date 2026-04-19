# tw-web

A lightweight PWA web interface for [Taskwarrior](https://taskwarrior.org) 2.6.x.
Part of the [awesome-taskwarrior](https://github.com/linuxcaffe/awesome-taskwarrior) fleet.

## Features

- **Task List** — browse, filter, add, edit, and action pending tasks
- **Kanban** — drag tasks between workflow columns by `state` UDA
- **Agenda** — chronological view of scheduled and due tasks
- **Calendar** — week/month FullCalendar view with drag-and-drop scheduling
- **Full CRUD** — add, edit, complete, delete, revert; annotation management with CodeMirror editor
- **PWA-ready** — installable, offline shell cache via service worker
- **Side menu** — Projects (hierarchical, foldable, with counts), Tags, Stats, Settings panels; sync

## Prerequisites

- **Taskwarrior 2.6.x** — must be installed and configured
- **Python 3.8+**
- **Flask** (installed via `requirements.txt`)

## Optional UDAs

```
# Kanban column assignment
uda.state.type=string
uda.state.label=State

# Numeric priority (works with need-priority hook)
uda.priority.values=1,2,3,4,5,6,H,M,L
```

See `example_taskrc.txt` for a full example.

## Installation

```bash
git clone https://github.com/linuxcaffe/tw-web.git
cd tw-web
pip install -r requirements.txt
```

## Usage

```bash
./tw-web-launch.sh      # kills any existing instance on :5000, then starts
# or
python3 app.py
```

Open `http://localhost:5000` in your browser, or install as a PWA.

## Configuration

Settings are stored in `settings.json` (auto-created, not committed). Edit via the
**Settings** panel in the side menu, or directly:

```json
{
  "notification_timeout": 3000,
  "kanban_columns": ["backlog", "todo", "doing", "review", "done"]
}
```

`config.py` holds developer/debug flags and hardcoded defaults.

## Keyboard Shortcuts

All shortcuts are suppressed when focus is inside any input field.

| Key | Action |
|-----|--------|
| `L` | List page |
| `K` | Kanban page |
| `A` | Agenda page |
| `C` | Calendar page |
| `D` | Day view (calendar page only) |
| `W` | Week view (calendar page only) |
| `M` | Month view (calendar page only) |
| `a` | Open Add task dialog |
| `f` | Focus description filter input |

## Filter Syntax

The nav bar filter inputs support Taskwarrior-style attribute modifiers, applied client-side.

### Description, Project

| Input | Meaning |
|-------|---------|
| `foo` | contains "foo" (default) |
| `.is:foo` | exact match |
| `.not:foo` | not equal |
| `.startswith:foo` | starts with |
| `.endswith:foo` | ends with |
| `.any:` | field is set (non-empty) |
| `.none:` | field is absent/empty |

### Priority

| Input | Meaning |
|-------|---------|
| `H` | exact match (default) |
| `.is:M` | exact match |
| `.isnt:L` | not equal |
| `> 3` | higher priority (uses order `1 2 3 4 5 6 H M L`) |
| `< H` | lower priority |

### Tags

| Input | Meaning |
|-------|---------|
| `next,work` | has ALL listed tags (default) |
| `.has:next` | has tag "next" |
| `.hasnt:work` | does not have tag "work" |
| `.any:` | has at least one tag |
| `.none:` | has no tags |

The Projects and Tags panels also offer **No project** / **No tags** buttons that apply `.none:` directly.

## Development

```bash
# Rebuild the CodeMirror bundle (only needed after updating CM deps)
npm install
npx rollup -c rollup.cm.config.js
```

### Notes to self

- **`task` binary** is hardcoded as `'task'` in `run_task_command()` (app.py). No `TASK_BIN` config yet — future improvement for non-standard installs.
- **Service worker cache** (`sw.js`): bump `CACHE` version constant on every JS/CSS/HTML change or clients won't pick up updates.
- **Projects panel** is sourced from `task projects` output (parsed for hierarchy + counts), not `task _projects`. The `_projects` helper is only used for the "all" toggle (historical names). Counts are direct (not rolled up), matching TW's own report.
- **Stats panel** uses `rc.context=none` so it always reflects the full task database.
- **Settings panel** convention: use `class="tw-settings-row stack"` for any setting with a wide or variable-length value — renders as label / full-width input / note (3 lines). Side-by-side layout is for short fixed-width inputs (number, time, select).
- **Filter changes** that only affect client-side fields (project, tags, priority, description) dispatch `tw-filter-change` with `clientOnly: true` — no server re-fetch.
- **Hook compatibility**: hooks detect the web context via `TW_WEB=1` env var (set in `_TW_ENV`).

## License

MIT
