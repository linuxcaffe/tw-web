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
- **Side menu** — Projects, Tags, Stats, Settings panels; sync status

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

## Development

```bash
# Rebuild the CodeMirror bundle (only needed after updating CM deps)
npm install
npx rollup -c rollup.cm.config.js
```

## License

MIT
