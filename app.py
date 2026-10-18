#!/usr/bin/env python3
"""
tw-web — backend server
A lightweight Flask server for the tw-web Taskwarrior PWA
"""

from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
from flask_sock import Sock
import subprocess
import json
import os
import re
import shlex
import shutil
import time
import threading
from queue import Queue, Empty
from pathlib import Path
from datetime import datetime
import tempfile
from config import DEVELOPER_MODE, DEBUG_FILE

# Taskwarrior 2.6.2's virtual tags, as `man task` lists them. They aren't stored or exported;
# task works them out from other fields (tests/test_virtual_tags.py checks the list against task).
TW_VIRTUAL_TAG_HELP = {
    'ACTIVE':    'Matches if the task is started',
    'ANNOTATED': 'Matches if the task has annotations',
    'BLOCKED':   'Matches if the task is blocked',
    'BLOCKING':  'Matches if the task is blocking',
    'CHILD':     'Matches if the task has a parent (deprecated in 2.6.0)',
    'COMPLETED': 'Matches if the task has completed status',
    'DELETED':   'Matches if the task has deleted status',
    'DUE':       'Matches if the task is due',
    'INSTANCE':  'Matches if the task is a recurrent instance',
    'LATEST':    'Matches if the task is the newest added task',
    'MONTH':     'Matches if the task is due this month',
    'ORPHAN':    'Matches if the task has any orphaned UDA values',
    'OVERDUE':   'Matches if the task is overdue',
    'PARENT':    'Matches if the task is a parent (deprecated in 2.6.0)',
    'PENDING':   'Matches if the task has pending status',
    'PRIORITY':  'Matches if the task has a priority',
    'PROJECT':   'Matches if the task has a project',
    'QUARTER':   'Matches if the task is due this quarter',
    'READY':     'Matches if the task is actionable',
    'SCHEDULED': 'Matches if the task is scheduled',
    'TAGGED':    'Matches if the task has tags',
    'TEMPLATE':  'Matches if the task is a recurrence template',
    'TODAY':     'Matches if the task is due today',
    'TOMORROW':  'Matches if the task is due sometime tomorrow',
    'UDA':       'Matches if the task has any UDA values',
    'UNBLOCKED': 'Matches if the task is not blocked',
    'UNTIL':     'Matches if the task expires',
    'WAITING':   'Matches if the task is waiting',
    'WEEK':      'Matches if the task is due this week',
    'YEAR':      'Matches if the task is due this year',
    'YESTERDAY': 'Matches if the task was due sometime yesterday',
}
TW_VIRTUAL_DEPRECATED = {'CHILD', 'PARENT'}   # INSTANCE and TEMPLATE replace them
# Every name task reads as virtual: the binary also takes DUETODAY (= TODAY), unlisted
TW_VIRTUAL_TAGS = set(TW_VIRTUAL_TAG_HELP) | {'DUETODAY'}

# Accepts a UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) or a plain integer task ID
_TASK_ID_RE = re.compile(
    r'^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$',
    re.IGNORECASE
)

def _valid_task_id(task_id):
    return bool(_TASK_ID_RE.match(str(task_id)))

# ── Settings (settings.json > config.py > hardcoded defaults) ─────────────────
# TW_WEB_SETTINGS moves it: the scratch server keeps its own, so a page check that saves
# settings never writes the folder's (the live one, run from ~/dev/tw-web)
_SETTINGS_PATH = Path(os.environ.get('TW_WEB_SETTINGS') or Path(__file__).parent / 'settings.json')

def _valid_hour(v):
    """Accept 'HH:MM' or plain int/float hours, return 'HH:MM:00'."""
    s = str(v).strip()
    if ':' in s:
        parts = s.split(':')
        h, m = int(parts[0]), int(parts[1])
    else:
        h = int(float(s)); m = 0
    if not (0 <= h <= 24 and 0 <= m < 60):
        raise ValueError(f'Invalid hour value: {v}')
    return f'{h:02d}:{m:02d}:00'

_CAL_VIEWS     = {'timeGridWeek', 'timeGridDay', 'dayGridMonth'}
_CAL_SLOT_DURS = {'00:05:00', '00:10:00', '00:15:00', '00:20:00', '00:30:00', '01:00:00'}

# Calendar zoom: for Week and Day, three steps of [row size, start hour] and the step a view opens
# at. Clicking the active view's button moves to the next step; a reload goes back to the default.
_CAL_ZOOM_DEFAULT = {
    view: {'steps': [['00:15:00', '08:00:00'], ['00:30:00', '08:00:00'], ['01:00:00', '00:00:00']],
           'default': 1}
    for view in ('week', 'day')
}

def _valid_zoom(v):
    """cal_zoom: {'week'|'day': {'steps': three [slot, start], 'default': 0-2}}, times normalised."""
    if not isinstance(v, dict) or set(v) != {'week', 'day'}:
        raise ValueError('cal_zoom needs week and day')
    out = {}
    for view, z in v.items():
        steps = z.get('steps') if isinstance(z, dict) else None
        if not isinstance(steps, list) or len(steps) != 3:
            raise ValueError(f'cal_zoom.{view}: three steps')
        norm = []
        for step in steps:
            slot, start = (_valid_hour(x) for x in step)
            if slot not in _CAL_SLOT_DURS or start > '23:59:00':
                raise ValueError(f'cal_zoom.{view}: bad step {step!r}')
            norm.append([slot, start])
        default = z.get('default')
        if default not in (0, 1, 2):
            raise ValueError(f'cal_zoom.{view}: default is 0, 1 or 2')
        out[view] = {'steps': norm, 'default': default}
    return out

def _valid_bool(v):
    """A JSON boolean, or the strings a form might send."""
    if isinstance(v, bool):
        return v
    if str(v).strip().lower() in ('true', '1', 'yes', 'on'):
        return True
    if str(v).strip().lower() in ('false', '0', 'no', 'off'):
        return False
    raise ValueError(f'not a yes/no value: {v!r}')

_SETTINGS_SCHEMA = {
    'notification_timeout': {'type': int,  'default': 3000,
                              'validate': lambda v: v >= 0},
    'kanban_columns':       {'type': None, 'default': ['backlog','todo','doing','review','done'],
                              'coerce': lambda v: [c.strip() for c in
                                  (v if isinstance(v, list) else str(v).split(',')) if c.strip()]},
    'cal_day_start':        {'type': None, 'default': '06:00:00', 'coerce': _valid_hour},
    'cal_day_end':          {'type': None, 'default': '23:00:00', 'coerce': _valid_hour},
    'cal_default_view':     {'type': str,  'default': 'timeGridWeek',
                              'validate': lambda v: v in _CAL_VIEWS},
    'cal_zoom':             {'type': None, 'default': _CAL_ZOOM_DEFAULT, 'coerce': _valid_zoom},
    # The Calendar's time column tints daylight (sun.js) for this place; default Toronto
    'cal_daylight':         {'type': None, 'default': True, 'coerce': _valid_bool},
    'cal_latitude':         {'type': float, 'default': 43.65,
                              'validate': lambda v: -90 <= v <= 90},
    'cal_longitude':        {'type': float, 'default': -79.38,
                              'validate': lambda v: -180 <= v <= 180},
    # Holidays from the taskrc (/api/holidays) in the Calendar and the Agenda; the Agenda gives a
    # holiday with no tasks its own date line up to this many days ahead (further if tasks are)
    'cal_holidays':         {'type': None, 'default': True, 'coerce': _valid_bool},
    'cal_moon':             {'type': None, 'default': True, 'coerce': _valid_bool},   # tw-events' sky.rc
    'cal_seasons':          {'type': None, 'default': True, 'coerce': _valid_bool},
    'agenda_holiday_days':  {'type': int,  'default': 30,
                              'validate': lambda v: 0 <= v <= 366},
    'pty_height':           {'type': int,  'default': 240,
                              'validate': lambda v: 60 <= v <= 1200},
    'pty_cwd':              {'type': str,  'default': '',
                              'coerce': lambda v: str(v).strip()},
    'pty_init':             {'type': str,  'default': '',
                              'coerce': lambda v: str(v).strip()},
    'annotation_launchers': {'type': None, 'default': {'file': 'xdg-open {value}', 'nb': 'http://localhost:5001/#{value}'},
                              'coerce': lambda v: {str(k).strip(): str(w).strip() for k, w in v.items()} if isinstance(v, dict) else {}},
}

def _load_settings():
    """Return merged settings: schema defaults ← config.py (KANBAN_COLUMNS only) ← settings.json."""
    out = {}
    for key, meta in _SETTINGS_SCHEMA.items():
        out[key] = meta['default']
    # config.py — only KANBAN_COLUMNS (deployment-level override; no other settings live here)
    try:
        import config as _cfg
        if hasattr(_cfg, 'KANBAN_COLUMNS'):
            out['kanban_columns'] = list(_cfg.KANBAN_COLUMNS)
    except Exception:
        pass
    # settings.json — single source of truth for all runtime settings; wins over defaults
    try:
        if _SETTINGS_PATH.exists():
            saved = json.loads(_SETTINGS_PATH.read_text())
            for key, meta in _SETTINGS_SCHEMA.items():
                if key in saved:
                    coerce = meta.get('coerce') or (lambda v, t=meta['type']: t(v))
                    out[key] = coerce(saved[key])
    except Exception:
        pass
    return out

def _save_settings(patch):
    """Atomically merge patch into settings.json."""
    existing = {}
    try:
        if _SETTINGS_PATH.exists():
            existing = json.loads(_SETTINGS_PATH.read_text())
    except Exception:
        pass
    existing.update(patch)
    fd, tmp = tempfile.mkstemp(dir=_SETTINGS_PATH.parent, prefix='.settings.')
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(existing, f, indent=2)
            f.write('\n')
        os.rename(tmp, str(_SETTINGS_PATH))
    except Exception:
        try: os.unlink(tmp)
        except Exception: pass
        raise

# Initialise module-level vars from settings (used by routes before first request)
_s = _load_settings()
NOTIFICATION_TIMEOUT = _s['notification_timeout']
KANBAN_COLUMNS       = _s['kanban_columns']

# Context filter cache — avoids mutating rc.context on every request
_ctx_cache: dict = {}
_ctx_cache_ts: float = 0.0

def _get_context_filters() -> dict:
    """Return {name: read_filter_string} for all defined contexts, cached 30s."""
    global _ctx_cache, _ctx_cache_ts
    if time.time() - _ctx_cache_ts < 30:
        return _ctx_cache
    result = run_task_command(['task', '_show'], readonly=True)
    filters = {}
    if result['success']:
        for line in result['stdout'].splitlines():
            m = re.match(r'^context\.(.+?)\.read=(.+)$', line)
            if m:
                filters[m.group(1)] = m.group(2)
    _ctx_cache, _ctx_cache_ts = filters, time.time()
    return filters

def log_command(args):
    """Log the command to the debug file with a timestamp"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(DEBUG_FILE, 'a') as f:
        f.write(f"[{timestamp}] {' '.join(args)}\n")

# No Flask static folder: static_files() below is the only file route, so the
# asset rule there can't be bypassed (security review S7).
app = Flask(__name__, static_folder=None)
# The Firefox popup (firefox/popup.js) is the only cross-origin client, and it
# needs only these routes. Any installed extension can claim a moz-extension://
# origin, so nothing else is open to them (security review S8). Same-origin
# pages need no CORS.
_EXTENSION_ROUTES = ('/api/health', '/api/server/stop', '/api/task/add', '/api/bookmark')
CORS(app, resources={
    r'^/api/(health|server/stop|task/add|bookmark)$': {'origins': [re.compile(r'^moz-extension://.*')]},
})
sock = Sock(app)

# ── Network exposure guard (security review S1–S5, tw:docs/tw-web-dev-infra-plan.md) ──
# Binding: localhost, plus the Tailscale addresses when TW_WEB_TAILSCALE=1.
# Host allowlist blocks DNS rebinding; the Origin check blocks cross-site
# writes and cross-site WebSocket hijacking of /ws/pty. Requests without an
# Origin header (curl, scripts, the Firefox native host) are not browser
# attacks and pass.
_LOCAL_HOSTS = {'localhost', '127.0.0.1', '::1'}
_WILDCARD_HOSTS = {'0.0.0.0', '::', ''}
_SAFE_METHODS = {'GET', 'HEAD', 'OPTIONS'}

def _tailscale_info():
    """Return {'ips': [...], 'names': [...]} for this node, or None if Tailscale is unavailable."""
    try:
        r = subprocess.run(['tailscale', 'status', '--json'],
                           capture_output=True, text=True, timeout=5)
        me = json.loads(r.stdout)['Self']
    except Exception:
        return None
    names = [n for n in (me.get('HostName', ''), me.get('DNSName', '').rstrip('.')) if n]
    return {'ips': list(me.get('TailscaleIPs') or []), 'names': names}

def _allowed_hosts(env, ts):
    """Hostnames (no port) this server answers to."""
    hosts = set(_LOCAL_HOSTS)
    host = env.get('TW_WEB_HOST', '127.0.0.1')
    if host not in _WILDCARD_HOSTS:
        hosts.add(host)
    if ts:
        hosts.update(ts['ips'])
        hosts.update(n.lower() for n in ts['names'])
    hosts.update(h.strip().lower() for h in env.get('TW_WEB_ALLOWED_HOSTS', '').split(',') if h.strip())
    return hosts

def _server_options(env, ts):
    """Addresses to bind and whether the Werkzeug debugger may run."""
    host = env.get('TW_WEB_HOST', '127.0.0.1')
    binds = [host]
    if env.get('TW_WEB_TAILSCALE') == '1' and ts:
        binds += [ip for ip in ts['ips'] if ip not in binds]
    local_only = all(b in _LOCAL_HOSTS for b in binds)
    return {
        'binds': binds,
        # The debugger console runs arbitrary Python; never expose it beyond localhost.
        'debug': env.get('TW_WEB_DEBUG') == '1' and local_only,
        'use_reloader': True,
    }

def _split_host(netloc):
    """'[::1]:5000' → '::1', 'Yoga:5000' → 'yoga'."""
    netloc = netloc.strip().lower()
    if netloc.startswith('['):
        return netloc[1:].split(']', 1)[0]
    return netloc.rsplit(':', 1)[0] if netloc.count(':') == 1 else netloc

def _origin_allowed(origin, host, path):
    """Same-origin as the (already allowlisted) Host, or a Firefox extension on its own routes."""
    if origin.startswith('moz-extension://'):
        return path in _EXTENSION_ROUTES
    from urllib.parse import urlsplit
    try:
        return urlsplit(origin).netloc.lower() == host.lower()
    except ValueError:
        return False

_TS_INFO = _tailscale_info() if os.environ.get('TW_WEB_TAILSCALE') == '1' else None
_ALLOWED_HOSTS = _allowed_hosts(os.environ, _TS_INFO)

@app.before_request
def _guard_request():
    if _split_host(request.host) not in _ALLOWED_HOSTS:
        return jsonify({'success': False, 'error': 'Host not allowed'}), 400
    origin = request.headers.get('Origin')
    if origin is not None and (request.method not in _SAFE_METHODS or request.path == '/ws/pty'):
        if not _origin_allowed(origin, request.host, request.path):
            return jsonify({'success': False, 'error': 'Cross-origin request refused'}), 403

# ── Hook prompt system ────────────────────────────────────────────────────────
# ── Runtime files: hook prompts, spool, PID ─────────────────────────────────
# A private 0700 dir under $XDG_RUNTIME_DIR (Termux etc.: ~/.cache/tw-web),
# never world-writable /tmp, where another user could plant prompts or
# spooled commands (security review S9). tw-web-launch.sh and
# tw-web-native-host.py compute the same path.
def _runtime_dir(env):
    base = env.get('XDG_RUNTIME_DIR')
    return Path(base) / 'tw-web' if base else Path.home() / '.cache' / 'tw-web'

def _private_dir(path):
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path, 0o700)
    return path

_RUN_DIR = _private_dir(_runtime_dir(os.environ))
_PID_FILE = _RUN_DIR / 'tw-web.pid'
_PROMPT_DIR = _private_dir(_RUN_DIR / 'prompts')

# ── Hook spool (deferred interactive commands) ────────────────────────────────
# Hooks that cannot run interactively write a shell command to this directory.
# Flask drains it after every write command and returns deferred_cmd to the UI,
# which offers an "Open in terminal" banner so the user can run it manually.
_SPOOL_DIR = _private_dir(_RUN_DIR / 'spool')

def _drain_spool():
    """Read and delete all *.cmd files from the spool dir; return list of command strings."""
    cmds = []
    try:
        for f in sorted(_SPOOL_DIR.glob('*.cmd')):
            try:
                cmds.append(f.read_text().strip())
                f.unlink()
            except Exception:
                pass
    except Exception:
        pass
    return cmds

_sse_clients: dict[int, Queue] = {}
_sse_lock = threading.Lock()

def _sse_broadcast(event: dict):
    """Push an event to all connected SSE clients."""
    msg = f"data: {json.dumps(event)}\n\n"
    with _sse_lock:
        for q in list(_sse_clients.values()):
            try:
                q.put_nowait(msg)
            except Exception:
                pass

def _prompt_watcher():
    """Background thread: watch for .prompt files written by hooks."""
    seen: set[str] = set()
    while True:
        try:
            for pf in sorted(_PROMPT_DIR.glob('*.prompt')):
                stem = pf.stem
                if stem not in seen:
                    seen.add(stem)
                    try:
                        _sse_broadcast(json.loads(pf.read_text()))
                    except Exception:
                        pass
            # Prune stale entries no longer on disk
            seen &= {f.stem for f in _PROMPT_DIR.glob('*.prompt')}
        except Exception:
            pass
        time.sleep(0.3)

_watcher_thread = threading.Thread(target=_prompt_watcher, daemon=True, name='prompt-watcher')
_watcher_thread.start()

def _get_recurrence_filter():
    """Return the TW filter string for the 'recurring' status button.
    Reads recurrence.field from tw-web.rc (via task _show):
      recurrence.field=r    → r.any:    (recurrence-overhaul hook)
      recurrence.field=recur or unset → +RECURRING (standard TW)
    Uses rc.hooks=off so slow on-exit hooks don't block Flask startup.
    """
    try:
        result = subprocess.run(
            ['task', 'rc.hooks=off', 'rc.confirmation=no', '_show'],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            if line.startswith('recurrence.field='):
                field = line.split('=', 1)[1].strip()
                if field and field != 'recur':
                    return f'{field}.any:'
    except Exception:
        pass
    return '+RECURRING'

RECURRING_FILTER = _get_recurrence_filter()

# Environment passed to every task/hook subprocess.
# Fleet-wide non-interactive client conventions:
#   TW_WEB=1        — legacy; kept for existing hooks
#   TW_NOINTERACT=1 — any non-terminal client (tw-web, tw-gtk, Electron, …)
#   TW_CLIENT=web   — identifies this specific client for client-specific behaviour
#   TW_SPOOL_DIR    — hooks write deferred commands here instead of blocking
_TW_ENV = {
    **os.environ,
    'TW_WEB':        '1',
    'TW_NOINTERACT': '1',
    'TW_CLIENT':     'web',
    'TW_SPOOL_DIR':  str(_SPOOL_DIR),
}

# A real terminal (the /ws/pty console) can prompt, so none of the "no terminal here"
# variables may reach it: TW_SPOOL_DIR would make a hook queue a command instead of running it.
_NONINTERACTIVE_VARS = ('TW_NOINTERACT', 'TW_WEB', 'TW_SPOOL_DIR')


def _pty_env():
    env = {k: v for k, v in _TW_ENV.items()
           if k not in _NONINTERACTIVE_VARS and not k.startswith('TW_PREFLIGHT_')}
    env['TERM'] = 'xterm-256color'
    return env

# Timeout (seconds) for any single task command.
# Prevents a hung interactive hook from deadlocking the Flask request.
TASK_TIMEOUT = 15

# Legacy marker: a hook that aborts because it needs a terminal may write this anywhere on
# stderr (CONVENTIONS §2). It means tw_needs_pty without a cmd; _hook_signals reads both.
TW_INTERACTIVE_MARKER = 'TW_INTERACTIVE_REQUIRED'

def run_task_command(args, readonly=False, extra_overrides=None, extra_env=None):
    """Execute a TaskWarrior command and return the result.
    args must be a list, e.g. ['task', 'status:pending', 'export'].
    shell=True is intentionally not used.

    rc.confirmation=no is injected per-call (not via tw-web.rc) so it only
    applies to web-context commands, not CLI task/tw invocations.

    readonly=True injects rc.hooks=off to prevent on-exit recurrence hooks from
    firing on every read/export — avoids the reconcile() race condition where
    concurrent requests both see no active instance and both spawn duplicates.
    """
    try:
        if args[0] != 'task':
            args = ['task'] + args
        user_cmd = _console_cmd(args)   # what follows `task`, before the rc overrides
        # Inject web-only rc overrides immediately after 'task'
        overrides = ['rc.confirmation=no']
        if readonly:
            overrides.append('rc.hooks=off')
        if extra_overrides:
            overrides.extend(extra_overrides)
        args = [args[0]] + overrides + args[1:]

        if DEVELOPER_MODE:
            # Developer mode logs the command instead of running it. Never log otherwise:
            # the log held every description and annotation, forever (H3).
            log_command(args)
            return {
                'success': True,
                'stdout': f'[DEV MODE] Command logged to {DEBUG_FILE}: {" ".join(args)}',
                'stderr': '',
                'returncode': 0
            }

        env = {**_TW_ENV, **(extra_env or {})}
        result = subprocess.run(
            args, capture_output=True, text=True,
            env=env, timeout=TASK_TIMEOUT
        )
        out = {
            'success': result.returncode == 0,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        }
        if not readonly:
            # Drain any spool files written by hooks
            spooled = _drain_spool()
            if spooled:
                out['deferred_cmds'] = spooled
        return out
    except subprocess.TimeoutExpired:
        return {
            'success':   False,
            'stdout':    '',
            'stderr':    f'Command timed out after {TASK_TIMEOUT}s — a hook likely needs terminal interaction.',
            'returncode': -1,
            'timed_out': True,
            'cmd':       user_cmd,
        }
    except Exception as e:
        return {
            'success': False,
            'stdout': '',
            'stderr': str(e),
            'returncode': -1
        }

def run_command(args):
    """Run an arbitrary command (not task). Returns same dict as run_task_command."""
    try:
        result = subprocess.run(
            args, capture_output=True, text=True,
            env=_TW_ENV, timeout=TASK_TIMEOUT
        )
        return {
            'success': result.returncode == 0,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        }
    except subprocess.TimeoutExpired:
        return {'success': False, 'stdout': '', 'stderr': f'Command timed out after {TASK_TIMEOUT}s.', 'returncode': -1}
    except Exception as e:
        return {'success': False, 'stdout': '', 'stderr': str(e), 'returncode': -1}

# ── Hook signals → the terminal console (CONVENTIONS §2, §3) ────────────────
def _console_cmd(args):
    """The command as typed after `task`, quoted so the console's shlex.split gives back the
    same arguments: free text stays one argument and never reaches a shell (H2)."""
    if args and args[0] == 'task':
        args = args[1:]
    return shlex.join(args)

def _detect_signal(stderr, sig_type):
    """Return the first parsed JSON signal of sig_type from stderr, else None."""
    for line in stderr.splitlines():
        line = line.strip()
        if not line.startswith('{'):
            continue
        try:
            data = json.loads(line)
            if data.get('type') == sig_type:
                return data
        except json.JSONDecodeError:
            pass
    return None


def _hook_signals(result, args):
    """The write-result signals for the browser (tw-api.js handleWriteResult), from one
    run_task_command result. args is the command that ran; the console runs it as kind 'task'.
      needs_pty + cmd     a hook needs a terminal (tw_needs_pty, or the legacy marker)
      timed_out + cmd     the call hit TASK_TIMEOUT: offer to run it in the console
      deferred_cmd        a hook spooled a shell command (offered as kind 'shell')
    """
    out = {}
    if result.get('timed_out'):
        out.update(timed_out=True, cmd=_console_cmd(args))
    elif not result.get('success'):
        stderr = result.get('stderr', '')
        sig = _detect_signal(stderr, 'tw_needs_pty')
        if sig is not None or TW_INTERACTIVE_MARKER in stderr:
            out.update(needs_pty=True, cmd=(sig or {}).get('cmd') or _console_cmd(args))
    dc = _deferred_cmd(result)
    if dc:
        out['deferred_cmd'] = dc
    return out


def _pty_argv(payload, shell_bin):
    """argv for /ws/pty's first message {kind, cmd}, and whether it's an interactive shell.
    kind 'task' (the default) runs `task <cmd>`; 'shell' runs cmd with `$SHELL -c` (a spooled
    command is a shell command line, CONVENTIONS §3); an empty cmd opens a shell.
    Raises ValueError for an unknown kind or a task command that doesn't split."""
    kind = payload.get('kind') or 'task'
    cmd  = (payload.get('cmd') or '').strip()
    if kind not in ('task', 'shell'):
        raise ValueError(f'unknown kind {kind!r}')
    if not cmd:
        return [shell_bin], True
    if kind == 'shell':
        return [shell_bin, '-c', cmd], False
    return ['task'] + shlex.split(cmd), False


@sock.route('/ws/pty')
def ws_pty(ws):
    """WebSocket PTY: run a command in a real pseudo-terminal.
    Client sends first message: JSON {"kind": "task"|"shell", "cmd": "start 111", "cwd", "init"}
    (see _pty_argv)
    Then relays stdin as raw text; receives stdout/stderr as raw text.
    Server closes the socket when the process exits.
    """
    import pty, select, fcntl, termios, struct, signal as _signal

    first = ws.receive(timeout=10)
    if not first:
        return
    try:
        payload = json.loads(first)
        if not isinstance(payload, dict):
            raise ValueError
    except ValueError:
        payload = {'cmd': first}
    cwd_str  = (payload.get('cwd')  or '').strip()
    init_str = (payload.get('init') or '').strip()

    shell_bin = os.environ.get('SHELL') or shutil.which('bash') or 'sh'
    try:
        cmd_argv, shell_mode = _pty_argv(payload, shell_bin)
    except ValueError as e:
        ws.send(f'\r\n[pty] {e}\r\n')
        return

    # Resolve cwd — fall back to home dir if path doesn't exist
    cwd = None
    if cwd_str:
        cwd_path = Path(cwd_str).expanduser()
        cwd = str(cwd_path) if cwd_path.is_dir() else None

    master_fd, slave_fd = pty.openpty()

    # Set sane terminal size (80×24)
    winsize = struct.pack('HHHH', 24, 80, 0, 0)
    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)

    env = _pty_env()

    def _pty_preexec():
        os.setsid()
        fcntl.ioctl(0, termios.TIOCSCTTY, 0)

    try:
        proc = subprocess.Popen(
            cmd_argv,
            stdin=slave_fd, stdout=slave_fd, stderr=slave_fd,
            close_fds=True, env=env, cwd=cwd,
            preexec_fn=_pty_preexec,
        )
    except Exception as e:
        os.close(master_fd); os.close(slave_fd)
        ws.send(f'\r\n[pty] Failed to start: {e}\r\n')
        return

    # Send init script line-by-line after a brief settle
    if shell_mode and init_str:
        time.sleep(0.15)
        for line in init_str.splitlines():
            line = line.strip()
            if line:
                os.write(master_fd, (line + '\n').encode())
                time.sleep(0.05)


    os.close(slave_fd)

    try:
        while True:
            r, _, _ = select.select([master_fd], [], [], 0.05)
            if r:
                try:
                    data = os.read(master_fd, 4096)
                except OSError:
                    break
                if not data:
                    break
                ws.send(data.decode('utf-8', errors='replace'))

            # Forward input from browser to PTY
            try:
                inp = ws.receive(timeout=0)
                if inp:
                    os.write(master_fd, inp.encode('utf-8'))
            except Exception:
                pass

            if proc.poll() is not None:
                # Drain remaining output
                try:
                    while True:
                        r2, _, _ = select.select([master_fd], [], [], 0.1)
                        if not r2:
                            break
                        data = os.read(master_fd, 4096)
                        if data:
                            ws.send(data.decode('utf-8', errors='replace'))
                except OSError:
                    pass
                break
    finally:
        try:
            os.close(master_fd)
        except OSError:
            pass
        proc.wait()

    if not shell_mode:
        ws.send('\r\n[done]\r\n')

@app.route('/')
def index():
    """Serve the main HTML page"""
    return send_from_directory('.', 'index.html')

# Only top-level app assets are served — never subfolders, dotfiles, source,
# settings or logs (security review S7). A new asset of these types needs no
# change here.
_ASSET_EXTS = {'.html', '.js', '.css', '.png', '.svg', '.ico', '.woff', '.woff2', '.webmanifest'}
_ASSET_NAMES = {'manifest.json'}
_NOT_ASSETS = {'rollup.cm.config.js', 'playwright.config.js', 'codemirror-entry.js'}  # build/dev files

def _is_asset(filename):
    if '/' in filename or '\\' in filename or filename.startswith('.') or filename in _NOT_ASSETS:
        return False
    return filename in _ASSET_NAMES or Path(filename).suffix.lower() in _ASSET_EXTS

@app.route('/<path:filename>')
def static_files(filename):
    """Serve app assets (HTML, JS, CSS, images) from the repo root."""
    if not _is_asset(filename):
        return jsonify({'success': False, 'error': 'Not found'}), 404
    return send_from_directory('.', filename)

@app.route('/api/tasks/due')
def get_due_tasks():
    """Get tasks that have a due date but no scheduled date (for calendar due-event display)."""
    try:
        args = ['task'] + _task_filter_args(request.args) + ['due.any:', 'scheduled.none:', 'export']
    except ValueError as e:
        return jsonify({'success': False, 'error': f'Invalid filter: {e}'}), 400
    result = run_task_command(args, readonly=True)
    if result['success']:
        try:
            tasks = json.loads(result['stdout'])
            return jsonify({'success': True, 'data': tasks})
        except json.JSONDecodeError as e:
            return jsonify({'success': False, 'error': f'JSON decode error: {str(e)}'}), 500
    return jsonify({'success': False, 'error': _task_error('Failed to retrieve due tasks', result), 'stderr': result['stderr']}), 500

@app.route('/api/tasks/planned')
def get_planned_tasks():
    """Get all planned tasks (with scheduled date) in JSON format"""
    try:
        args = ['task'] + _task_filter_args(request.args) + ['scheduled.not:', 'export']
    except ValueError as e:
        return jsonify({'success': False, 'error': f'Invalid filter: {e}'}), 400
    result = run_task_command(args, readonly=True)

    if result['success']:
        try:
            tasks = json.loads(result['stdout'])
            return jsonify({'success': True, 'data': tasks})
        except json.JSONDecodeError as e:
            return jsonify({
                'success': False,
                'error': f'JSON decode error: {str(e)}',
                'stdout': result['stdout'],
                'stderr': result['stderr']
            }), 500
    else:
        return jsonify({
            'success': False,
            'error': _task_error('Failed to retrieve planned tasks', result),
            'stderr': result['stderr']
        }), 500

def _task_error(message, result):
    """`message`, plus Taskwarrior's own reason (last stderr line that isn't an rc override notice),
    so a view says "Could not read include file …" instead of only "Failed to retrieve tasks"."""
    lines = [l.strip() for l in (result.get('stderr') or '').splitlines()
             if l.strip() and not l.startswith(('TASKRC override', 'TASKDATA override', 'Configuration override'))]
    return f'{message}: {lines[-1]}' if lines else message


def _task_filter_args(params):
    """Filter argv for a task-list read (/api/tasks, /planned, /due), before the route's own terms.

    rawfilter= is a whole TW expression and replaces status and context. Otherwise status= (ids,
    OR'd) and context= (a context name, AND'd). Every read says rc.context=none: in 2.6.2 `export`
    ignores the active context but reports apply it, and tw-web takes context only from the nav bar.
    Expressions are split like a shell would (shlex), so a context or raw filter with quotes and
    `or` reaches task as separate terms, and each is parenthesised so its `or` can't swallow the
    route's own terms. Raises ValueError for a raw filter that can't be split.
    """
    raw = params.get('rawfilter', '').strip()
    if raw:
        return ['rc.context=none', '('] + shlex.split(raw) + [')']
    args = ['rc.context=none']
    context = params.get('context', '').strip()
    expr = _get_context_filters().get(context) if context else None
    if expr:
        try:
            terms = shlex.split(expr)
        except ValueError:
            terms = [expr]
        args += ['('] + terms + [')']
    statuses = [s.strip() for s in params.get('status', 'pending').split(',') if s.strip()]
    return args + _build_task_filter(statuses)


# A tag name 2.6.2 reads as a `+tag`/`-tag` term. It takes others ($-13, a-b, 1x, a:b …) for
# description words, and in `modify` bare words replace the description, so those go as one
# whole-list `tags:` attribute, which takes any name. Erring narrow costs nothing: a plain name
# this misses still works through `tags:`.
_PLAIN_TAG_RE = re.compile(r'(?!\d)[\w.]+')
# What a tag can't hold: a comma splits the list; a space or `"` breaks task's own export
_BAD_TAG_RE = re.compile(r'[\s,"]')


def _tag_args(add, remove=(), current=None):
    """argv terms for a write's tag changes: `-t`/`+t`, or `tags:<the whole list>` when a name
    isn't a plain tag term. current: the task's tags now (modify). Raises ValueError for a name
    a tag can't hold."""
    add    = [str(t).strip() for t in add    if t and str(t).strip()]
    remove = [str(t).strip() for t in remove if t and str(t).strip()]
    bad = next((t for t in add if _BAD_TAG_RE.search(t)), None)
    if bad:
        raise ValueError(f'A tag can\'t contain a space, a comma or a quote: {bad}')
    if all(_PLAIN_TAG_RE.fullmatch(t) for t in add + remove):
        return [f'-{t}' for t in remove] + [f'+{t}' for t in add]
    tags = [t for t in (current or []) if t not in remove]
    tags += [t for t in add if t not in tags]
    return ['tags:' + ','.join(tags)]


def _build_task_filter(statuses):
    """TW filter args for status ids; several are OR'd in parentheses."""
    STATUS_MAP = {
        'pending':   'status:pending',
        'waiting':   'status:waiting',
        'completed': 'status:completed',
        'deleted':   'status:deleted',
        'recurring': RECURRING_FILTER,
    }
    parts = [STATUS_MAP[s] for s in statuses if s in STATUS_MAP]
    if not parts:
        parts = ['status:pending']

    if len(parts) == 1:
        return parts
    return ['('] + [p for pair in zip(parts, ['or'] * len(parts)) for p in pair][:-1] + [')']


@app.route('/api/tasks')
def get_tasks():
    """Get all pending tasks in JSON format.
    Query params: status (comma-separated), filter (text), context (name).
    rawfilter: complete TW filter expression override — bypasses status and context.
    """
    try:
        args = ['task'] + _task_filter_args(request.args) + ['export']
    except ValueError as e:
        return jsonify({'success': False, 'error': f'Invalid filter: {e}'}), 400

    result = run_task_command(args, readonly=True)

    if result['success']:
        try:
            tasks = json.loads(result['stdout'])
            tasks.sort(key=lambda x: x.get('urgency', 0), reverse=True)
            warnings = [l for l in result['stderr'].splitlines() if l.strip()]
            return jsonify({'success': True, 'tasks': tasks, 'warnings': warnings})
        except json.JSONDecodeError as e:
            return jsonify({
                'success': False,
                'error': f'JSON decode error: {str(e)}',
                'stdout': result['stdout'],
                'stderr': result['stderr']
            }), 500
    else:
        return jsonify({
            'success': False,
            'error': _task_error('Failed to retrieve tasks', result),
            'stderr': result['stderr']
        }), 500

def _parse_task_projects(output):
    """Parse `task projects` report into {full_name: count} dict.
    Reconstructs dotted full names from indented short names.
    """
    result = {}
    stack = []   # list of (indent, full_name)
    for raw in output.split('\n'):
        line = raw.rstrip()
        if not line:
            continue
        # Skip header, separator, summary line
        if re.match(r'^\s*-+', line) or re.match(r'^\s*Project\s+Tasks', line, re.I):
            continue
        if re.match(r'^\s*\d+\s+projects?', line, re.I):
            continue
        # Match: <indent><name><2+ spaces><count>
        m = re.match(r'^( *)(.*?)\s{2,}(\d+)\s*$', line)
        if not m:
            continue
        short = m.group(2).strip()
        if not short or short == '(none)':
            continue
        indent = len(m.group(1))
        count  = int(m.group(3))
        # Pop stack to parent level
        while stack and stack[-1][0] >= indent:
            stack.pop()
        full = (stack[-1][1] + '.' + short) if stack else short
        stack.append((indent, full))
        result[full] = count
    return result


@app.route('/api/projects')
def get_projects():
    """Return projects with pending-task counts parsed from `task projects`.
    ?active=1: only projects with pending tasks (alpha order).
    Without:   all known names via _projects, counts from pending.
    Returned list preserves alpha order; client sorts by count if needed.
    """
    active_only = request.args.get('active', '0') == '1'

    r = run_task_command(['task', 'rc.context=none', 'projects'], readonly=True)
    counts = _parse_task_projects(r['stdout']) if r['success'] else {}

    if active_only:
        names = sorted(counts.keys())
    else:
        r2 = run_task_command(['task', 'rc.context=none', 'rc.complete.all.projects=yes', '_projects'], readonly=True)
        all_names = sorted({p.strip() for p in r2['stdout'].split('\n') if p.strip()}) \
                    if r2['success'] else sorted(counts.keys())
        names = all_names

    projects = [{'name': n, 'count': counts.get(n, 0)} for n in names]
    return jsonify({'success': True, 'projects': projects})

@app.route('/api/tags')
def get_tags():
    """Get user-visible tags with pending-task counts.
    ?all=1: all tags including completed/deleted (no counts, names only via rc.complete.all.tags).
    Default: pending tags with counts derived from a pending export.
    Active-mode sidebar uses client-side counts from tw-tasks-loaded event instead.
    """
    all_tags = request.args.get('all', '0') == '1'
    if all_tags:
        result = run_task_command(['task', 'rc.context=none', 'rc.complete.all.tags=yes', '_tags'], readonly=True)
        if result['success']:
            tags = sorted({t.strip() for t in result['stdout'].split('\n')
                           if t.strip() and t.strip() not in TW_VIRTUAL_TAGS})
            counts = {t: 0 for t in tags}
            return jsonify({'success': True, 'tags': tags, 'counts': counts})
        return jsonify({'success': False, 'error': result['stderr']}), 500

    result = run_task_command(['task', 'rc.context=none', 'status:pending', 'export'], readonly=True)
    if result['success']:
        try:
            tasks = json.loads(result['stdout'] or '[]')
        except Exception:
            tasks = []
        counts = {}
        for t in tasks:
            for tag in (t.get('tags') or []):
                if tag and tag not in TW_VIRTUAL_TAGS:
                    counts[tag] = counts.get(tag, 0) + 1
        tags = sorted(counts.keys())
        return jsonify({'success': True, 'tags': tags, 'counts': counts})
    return jsonify({'success': False, 'error': result['stderr']}), 500

@app.route('/api/vtags')
def get_virtual_tags():
    """The virtual tags, with man task's descriptions, for the Tags sidebar.
    ?match=DUE,OVERDUE also gives {TAG: [uuid…]}: the tasks task says have each one (all
    statuses; the page intersects with what it shows). Unknown names are ignored, so nothing
    from the request reaches task but a name from TW_VIRTUAL_TAGS.
    """
    tags = [{'name': n, 'description': d, 'deprecated': n in TW_VIRTUAL_DEPRECATED}
            for n, d in sorted(TW_VIRTUAL_TAG_HELP.items())]
    out = {'success': True, 'tags': tags, 'names': sorted(TW_VIRTUAL_TAGS)}
    wanted = dict.fromkeys(n.strip() for n in request.args.get('match', '').split(','))
    names = [n for n in wanted if n in TW_VIRTUAL_TAGS]
    if names:
        out['uuids'] = {}
        for name in names:
            result = run_task_command(['task', 'rc.context=none', f'+{name}', '_uuids'], readonly=True)
            if not result['success']:
                return jsonify({'success': False,
                                'error': _task_error(f'Failed to read +{name}', result)}), 500
            out['uuids'][name] = result['stdout'].split()
    return jsonify(out)

_HOLIDAY_RE = re.compile(r'^holiday\.([^.=]+)\.(name|date|start|end|type|region|kind|at)=(.*)$')
_DATEFMT_PARTS = {'Y': r'(?P<Y>\d{4})', 'y': r'(?P<y>\d{2})', 'M': r'(?P<M>\d{2})',
                  'm': r'(?P<M>\d{1,2})', 'D': r'(?P<D>\d{2})', 'd': r'(?P<D>\d{1,2})'}


def _holiday_date_parser(fmt):
    """dateformat.holiday (2.6.2's letters Y y M m D d; anything non-alphabetic is literal)
    → a function from a value to YYYYMMDD, or None when the value doesn't fit."""
    if any(ch.isalpha() and ch not in _DATEFMT_PARTS for ch in fmt):
        return lambda v: None
    rx = re.compile('^' + ''.join(_DATEFMT_PARTS.get(ch, re.escape(ch)) for ch in fmt) + '$')
    def parse(value):
        m = rx.match(value.strip())
        if not m:
            return None
        g = m.groupdict()
        year = int(g['Y']) if g.get('Y') else 2000 + int(g.get('y') or 0)
        try:
            return datetime(year, int(g['M']), int(g['D'])).strftime('%Y%m%d')
        except (KeyError, TypeError, ValueError):
            return None
    return parse


@app.route('/api/holidays')
def get_holidays():
    """The CLI's holidays: holiday.<key>.name with .date (or .start/.end), as `task calendar`
    shows them. tw-events writes them and adds .type/.region; its moon phases and seasons are
    holiday entries too, with .kind (moon, season; else holiday) and .at (the moment, UTC).
    tw-web never fetches or computes them.
    ?start=YYYYMMDD&end=YYYYMMDD (inclusive, both optional) keeps those that overlap."""
    start, end = request.args.get('start', ''), request.args.get('end', '')
    if any(v and not re.fullmatch(r'\d{8}', v) for v in (start, end)):
        return jsonify({'success': False, 'error': 'start and end are YYYYMMDD'}), 400
    result = run_task_command(['task', 'rc.context=none', '_show'], readonly=True)
    if not result['success']:
        return jsonify({'success': False, 'error': _task_error('Failed to read holidays', result)}), 500
    fmt, entries = 'YMD', {}
    for line in result['stdout'].splitlines():
        if line.startswith('dateformat.holiday='):
            fmt = line.split('=', 1)[1].strip() or 'YMD'
        m = _HOLIDAY_RE.match(line)
        if m:
            entries.setdefault(m.group(1), {})[m.group(2)] = m.group(3).strip()
    parse = _holiday_date_parser(fmt)
    out = []
    for e in entries.values():
        first = parse(e.get('start') or e.get('date') or '')
        last = parse(e.get('end') or e.get('date') or '') or first
        if not first or not e.get('name') or last < first:
            continue
        if (start and last < start) or (end and first > end):
            continue
        out.append({'start': first, 'end': last, 'title': e['name'],
                    'type': e.get('type', ''), 'region': e.get('region', ''),
                    'kind': e.get('kind') or 'holiday', 'at': e.get('at', '')})
    out.sort(key=lambda h: (h['start'], h['title']))
    return jsonify({'success': True, 'holidays': out})

@app.route('/api/extension/info')
def extension_info():
    """Return install path for the bundled Firefox extension."""
    manifest = Path(__file__).parent / 'firefox' / 'manifest.json'
    return jsonify({'manifest_path': str(manifest), 'exists': manifest.exists()})

_START_TIME = time.time()

@app.route('/api/health')
def server_health():
    """Return server uptime and basic TW stats."""
    import signal as _signal
    uptime = int(time.time() - _START_TIME)
    tw = run_task_command(['task', 'rc.context=none', 'status:pending', 'count'], readonly=True)
    count = tw['stdout'].strip() if tw['success'] else '?'
    ver   = run_task_command(['task', '_version'], readonly=True)
    version = ver['stdout'].strip() if ver['success'] else '?'
    return jsonify({
        'uptime_seconds': uptime,
        'pending_count': count,
        'tw_version': version,
    })

@app.route('/api/server/stop', methods=['POST'])
def server_stop():
    """Shut down the Flask server. Kills the reloader parent via PID file."""
    import signal as _signal
    pid_file = _PID_FILE
    def _kill():
        time.sleep(0.15)
        if pid_file.exists():
            try:
                pid = int(pid_file.read_text().strip())
                os.kill(pid, _signal.SIGTERM)
                pid_file.unlink(missing_ok=True)
                return
            except (ValueError, ProcessLookupError):
                pid_file.unlink(missing_ok=True)
        # Fallback: kill process group so reloader parent dies too
        os.killpg(os.getpgid(os.getpid()), _signal.SIGTERM)
    threading.Thread(target=_kill, daemon=True).start()
    return jsonify({'success': True})

def _open_allowed(path, home):
    """Only real paths under $HOME (symlinks resolved), never .desktop launchers (S10)."""
    try:
        real = Path(path).resolve(strict=True)
    except OSError:
        return False
    home = Path(home).resolve()
    if real != home and home not in real.parents:
        return False
    return real.suffix.lower() != '.desktop'

@app.route('/api/open', methods=['POST'])
def open_file():
    """Open a local file or directory with xdg-open (server-side, local machine only)."""
    data = request.get_json(silent=True) or {}
    path = data.get('path', '').strip()
    if not path.startswith('/'):
        return jsonify({'success': False, 'error': 'Absolute path required'}), 400
    if not os.path.exists(path):
        return jsonify({'success': False, 'error': 'Path not found'}), 404
    if not _open_allowed(path, Path.home()):
        return jsonify({'success': False, 'error': 'Only files under your home directory can be opened'}), 403
    subprocess.Popen(['xdg-open', path])
    return jsonify({'success': True})

def _launch_argv(template, value):
    """Split the launcher template first, then substitute: the value is always ONE argument (S10)."""
    tokens = shlex.split(template)
    if not any('{value}' in t for t in tokens):
        tokens.append('{value}')
    return [t.replace('{value}', value) for t in tokens]

@app.route('/api/launch', methods=['POST'])
def launch_annotation():
    """Dispatch an annotation label to a configured launcher command."""
    data  = request.get_json(silent=True) or {}
    label = data.get('label', '').strip().lower()
    value = data.get('value', '').strip()

    if not label or not value:
        return jsonify({'success': False, 'error': 'label and value required'}), 400

    # Reject shell metacharacters (belt and braces: no shell is involved) and
    # values that would read as an option to the launcher program.
    if value.startswith('-') or re.search(r'[;&|`$<>()\\\n]', value):
        return jsonify({'success': False, 'error': 'Invalid characters in value'}), 400

    launchers = _load_settings().get('annotation_launchers', {})
    template  = launchers.get(label)
    if not template:
        return jsonify({'success': False, 'error': f'No launcher configured for label: {label}'}), 404

    try:
        argv = _launch_argv(template, value)
        subprocess.Popen(argv)
        return jsonify({'success': True, 'cmd': shlex.join(argv)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/bookmark', methods=['POST'])
def add_bookmark():
    """Add a bookmark task: description=title, +bkmk tag, url annotated as bare URL."""
    data = request.get_json(silent=True) or {}
    title = data.get('title', '').strip()
    url   = data.get('url',   '').strip()
    if not title or not url:
        return jsonify({'success': False, 'error': 'title and url are required'}), 400

    args = ['task', 'add']
    if data.get('project'):
        args.append(f'project:{data["project"].strip()}')
    try:
        args += _tag_args(['bkmk'] + [t.lstrip('+') for t in (data.get('tags') or '').split()])
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400

    args += ['--', title]   # free text last, after `--` (S11)
    add_result = run_task_command(args)
    if not add_result['success']:
        return jsonify({'success': False, 'error': add_result['stderr']}), 500

    # Annotate the newly created task with the URL
    ann_result = run_task_command(['task', '+LATEST', 'annotate', '--', url])
    if not ann_result['success']:
        return jsonify({'success': False, 'error': ann_result['stderr']}), 500

    export_result = run_task_command(['task', '+LATEST', 'export'], readonly=True)
    try:
        task = json.loads(export_result['stdout'])[0]
        return jsonify({'success': True, 'task': task})
    except Exception:
        return jsonify({'success': True})

@app.route('/api/stats')
def get_stats():
    """Return the output of `task stats` for display in the UI"""
    result = run_task_command(['task', 'rc.context=none', 'stats'], readonly=True)
    return jsonify({'success': result['success'], 'output': result['stdout'], 'error': result['stderr']})

# Command mode tells a command from a filter with task's own vocabulary (bug 9), cached 30s
_commands_cache: dict = {}
_commands_cache_ts: float = 0.0

@app.route('/api/commands')
def get_commands():
    """task _commands (reports included, custom ones too), _aliases, and abbreviation.minimum."""
    global _commands_cache, _commands_cache_ts
    if time.time() - _commands_cache_ts < 30:
        return jsonify(_commands_cache)
    def words(*args):
        r = run_task_command(['task', 'rc.context=none'] + list(args), readonly=True)
        return r['stdout'].split() if r['success'] else None
    commands, aliases = words('_commands'), words('_aliases')
    if commands is None:
        return jsonify({'success': False, 'error': 'task _commands failed'}), 500
    minimum = words('_get', 'rc.abbreviation.minimum') or ['2']
    _commands_cache = {'success': True, 'commands': commands, 'aliases': aliases or [],
                       'abbreviation_minimum': int(minimum[0]) if minimum[0].isdigit() else 2}
    _commands_cache_ts = time.time()
    return jsonify(_commands_cache)

@app.route('/api/contexts')
def get_contexts():
    """Get all defined contexts, their filter definitions, and the active context."""
    filters = _get_context_filters()
    # Exclude cmx composite contexts (contain ':') — they're internal plumbing
    contexts = [k for k in filters if ':' not in k]

    active_result = run_task_command(['task', '_get', 'rc.context'], readonly=True)
    active = active_result['stdout'].strip() if active_result['success'] else ''

    return jsonify({'success': True, 'contexts': contexts, 'filters': filters, 'active': active})

def _warnings(result):
    """Extract non-empty stderr lines as a warnings list."""
    return [l for l in result['stderr'].splitlines() if l.strip()]

def _deferred_cmd(result):
    """The first command a hook spooled during this write (CONVENTIONS §3), or None."""
    cmds = result.get('deferred_cmds', [])
    return cmds[0] if cmds else None

def _export_one(task_id):
    """The task as it is now, or None (read-only export)."""
    r = run_task_command(['task', task_id, 'export'], readonly=True)
    try:
        tasks = json.loads(r['stdout']) if r['success'] and r['stdout'].strip() else []
    except json.JSONDecodeError:
        tasks = []
    return tasks[0] if tasks else None

@app.route('/api/task/<task_id>', methods=['GET'])
def get_task(task_id):
    """Return a single task by UUID or ID (used for annotation refresh)."""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'error': 'Invalid task ID'}), 400
    result = run_task_command(['task', task_id, 'export'], readonly=True)
    if not result['success'] or not result['stdout'].strip():
        return jsonify({'success': False, 'error': 'Task not found'}), 404
    try:
        tasks = json.loads(result['stdout'])
        if not tasks:
            return jsonify({'success': False, 'error': 'Task not found'}), 404
        return jsonify(tasks[0])
    except (json.JSONDecodeError, IndexError):
        return jsonify({'success': False, 'error': 'Failed to parse task'}), 500

@app.route('/api/task/<task_id>/start', methods=['POST'])
def start_task(task_id):
    """Start a task"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400
    args = [task_id, 'start']
    result = run_task_command(args, extra_env={'TW_PREFLIGHT_CMD': _console_cmd(args)})
    signals = _hook_signals(result, args)
    if signals.get('needs_pty'):
        return jsonify({'success': False, **signals})
    resp = {'success': result['success'],
            'message': result['stdout'] if result['success'] else result['stderr'],
            'warnings': _warnings(result), **signals}
    if result['success']:
        resp['task'] = _export_one(task_id)   # so the page can redraw the card (bug 7)
    return jsonify(resp)

@app.route('/api/task/<task_id>/stop', methods=['POST'])
def stop_task(task_id):
    """Stop a task"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400
    args = ['task', task_id, 'stop']
    result = run_task_command(args)
    resp = {'success': result['success'],
            'message': result['stdout'] if result['success'] else result['stderr'],
            'warnings': _warnings(result), **_hook_signals(result, args)}
    if result['success']:
        resp['task'] = _export_one(task_id)
    return jsonify(resp)

@app.route('/api/task/<task_id>/done', methods=['POST'])
def complete_task(task_id):
    """Mark a task as done"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400
    args = [task_id, 'done']
    result = run_task_command(args, extra_env={'TW_PREFLIGHT_CMD': _console_cmd(args)})
    signals = _hook_signals(result, args)
    if signals.get('needs_pty'):
        return jsonify({'success': False, **signals})
    return jsonify({'success': result['success'],
                    'message': result['stdout'] if result['success'] else result['stderr'],
                    'warnings': _warnings(result), **signals})

@app.route('/api/task/<task_id>/revert', methods=['POST'])
def revert_task(task_id):
    """Revert a completed or deleted task back to pending"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400
    args = ['task', task_id, 'modify', 'status:pending']
    result = run_task_command(args)
    signals = _hook_signals(result, args)
    if result['success']:
        export_result = run_task_command(['task', task_id, 'export'], readonly=True)
        if export_result['success'] and export_result['stdout'].strip():
            try:
                tasks = json.loads(export_result['stdout'])
                if tasks:
                    return jsonify({'success': True, 'task': tasks[0], 'warnings': _warnings(result),
                                    **signals})
            except (json.JSONDecodeError, IndexError):
                pass
    return jsonify({
        'success': result['success'],
        'message': result['stdout'] if result['success'] else result['stderr'],
        'warnings': _warnings(result),
        **signals,
    })

@app.route('/api/task/<task_id>/delete', methods=['DELETE'])
def delete_task(task_id):
    """Delete a task"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400
    args = ['task', task_id, 'delete']
    result = run_task_command(args)
    return jsonify({'success': result['success'],
                    'message': result['stdout'] if result['success'] else result['stderr'],
                    'warnings': _warnings(result), **_hook_signals(result, args)})

@app.route('/api/task/<task_id>/modify', methods=['PUT'])
def modify_task(task_id):
    """Modify a task"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400

    data = request.get_json()
    modifications = []

    if 'description' in data and data['description']:
        modifications.append(f'description:{data["description"]}')

    tags_add, tags_remove = data.get('tags_add') or [], data.get('tags_remove') or []
    if tags_add or tags_remove:
        try:
            terms = _tag_args(tags_add, tags_remove)
            if terms and terms[0].startswith('tags:'):   # a whole list: it needs the tags now
                current = run_task_command(['task', task_id, 'export'], readonly=True)
                found = json.loads(current['stdout']) if current['success'] else []
                if not found:
                    return jsonify({'success': False, 'message': 'Task not found'}), 404
                terms = _tag_args(tags_add, tags_remove, found[0].get('tags'))
        except ValueError as e:
            return jsonify({'success': False, 'message': str(e), 'error': str(e)}), 400
        modifications += terms

    if 'due' in data:
        modifications.append(f'due:{data["due"]}' if data['due'] else 'due:')

    if 'scheduled' in data:
        modifications.append(f'scheduled:{data["scheduled"]}' if data['scheduled'] else 'scheduled:')

    if 'priority' in data:
        modifications.append(f'priority:{data["priority"]}' if data['priority'] else 'priority:')

    if 'project' in data:
        modifications.append(f'project:{data["project"]}' if data['project'] else 'project:')

    if 'sched_duration' in data and data['sched_duration']:
        modifications.append(f'sched_duration:{data["sched_duration"]}')

    if 'due_duration' in data and data['due_duration']:
        modifications.append(f'due_duration:{data["due_duration"]}')

    if 'state' in data:
        modifications.append(f'state:{data["state"]}' if data['state'] else 'state:')

    if 'depends' in data:
        modifications.append(f'depends:{data["depends"]}' if data['depends'] else 'depends:')

    if 'wait' in data:
        modifications.append(f'wait:{data["wait"]}' if data['wait'] else 'wait:')

    if 'until' in data:
        modifications.append(f'until:{data["until"]}' if data['until'] else 'until:')

    if modifications:
        args = ['task', task_id, 'modify'] + modifications
        result = run_task_command(args)
        signals = _hook_signals(result, args)
        if result['success']:
            export_result = run_task_command(['task', task_id, 'export'], readonly=True)
            if export_result['success'] and export_result['stdout'].strip():
                try:
                    task = json.loads(export_result['stdout'])
                    if task:
                        return jsonify({'success': True, 'message': result['stdout'],
                                        'task': task[0], 'warnings': _warnings(result), **signals})
                except (json.JSONDecodeError, IndexError) as e:
                    print(f"Error parsing task data: {e}")
                    return jsonify({'success': True, 'message': result['stdout'], 'task': None,
                                    'warnings': _warnings(result), **signals})

        return jsonify({
            'success': False,
            'error': result['stderr'],
            'task': None,
            'warnings': _warnings(result),
            **signals,
        })
    else:
        return jsonify({'success': True, 'message': 'No changes to apply', 'task': None, 'warnings': []})

@app.route('/api/config', methods=['GET'])
def get_config():
    """Return current UI settings (settings.json > config.py > defaults)."""
    return jsonify(_load_settings())

@app.route('/api/config', methods=['POST'])
def set_config():
    """Write one or more settings to settings.json."""
    data = request.get_json(silent=True) or {}
    patch = {}
    for key, val in data.items():
        if key not in _SETTINGS_SCHEMA:
            return jsonify({'success': False, 'error': f'Unknown setting: {key!r}'}), 400
        meta = _SETTINGS_SCHEMA[key]
        try:
            coerce = meta.get('coerce') or (lambda v, t=meta['type']: t(v))
            coerced = coerce(val)
            if 'validate' in meta and not meta['validate'](coerced):
                return jsonify({'success': False, 'error': f'Invalid value for {key!r}'}), 400
            patch[key] = coerced
        except (ValueError, TypeError) as e:
            return jsonify({'success': False, 'error': str(e)}), 400
    try:
        _save_settings(patch)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    # Update in-memory globals so remaining requests in this process see the change
    global NOTIFICATION_TIMEOUT, KANBAN_COLUMNS
    if 'notification_timeout' in patch: NOTIFICATION_TIMEOUT = patch['notification_timeout']
    if 'kanban_columns'       in patch: KANBAN_COLUMNS       = patch['kanban_columns']
    return jsonify({'success': True, 'settings': patch})

@app.route('/api/kanban/columns')
def get_kanban_columns():
    """Return configured kanban column names (live from settings)"""
    return jsonify({'success': True, 'columns': _load_settings()['kanban_columns']})

@app.route('/api/kanban/order', methods=['GET'])
def get_kanban_order():
    """Return saved manual sort order: { col: [uuid, ...] }"""
    # Read raw file — _load_settings() only returns schema-defined keys
    try:
        if _SETTINGS_PATH.exists():
            raw = json.loads(_SETTINGS_PATH.read_text())
            return jsonify({'success': True, 'order': raw.get('kanban_order', {})})
    except Exception:
        pass
    return jsonify({'success': True, 'order': {}})

@app.route('/api/kanban/order', methods=['PUT'])
def set_kanban_order():
    """Save manual sort order for one column."""
    data  = request.get_json() or {}
    col   = data.get('col')
    order = data.get('order', [])
    if col is None:
        return jsonify({'success': False, 'error': 'col required'}), 400
    s  = _load_settings()
    ko = dict(s.get('kanban_order', {}))
    ko[col] = [str(u) for u in order]
    _save_settings({'kanban_order': ko})
    return jsonify({'success': True})

@app.route('/api/task/add', methods=['POST'])
def add_task():
    """Add a new task"""
    data = request.get_json()

    if not data.get('description'):
        return jsonify({'success': False, 'error': 'Description is required'}), 400

    # Validate parent_id before creating the task; capture existing deps for later merge
    parent_id = data.get('parent_id')
    parent_existing_deps = []
    if parent_id:
        try:
            parent_id = int(parent_id)
        except (TypeError, ValueError):
            return jsonify({'success': False, 'error': f'Invalid parent ID: {parent_id}'}), 400
        pr = run_task_command(['task', str(parent_id), 'export'], readonly=True)
        if not pr['success'] or not pr['stdout'].strip():
            return jsonify({'success': False, 'error': f'Parent task {parent_id} not found'}), 400
        try:
            ptasks = json.loads(pr['stdout'])
            if not ptasks:
                return jsonify({'success': False, 'error': f'Parent task {parent_id} not found'}), 400
            pstatus = ptasks[0].get('status', '')
            if pstatus not in ('pending', 'waiting'):
                return jsonify({'success': False,
                    'error': f'Parent task {parent_id} is {pstatus} — cannot add deps to it'}), 400
            raw = ptasks[0].get('depends', [])
            parent_existing_deps = raw if isinstance(raw, list) else [u.strip() for u in raw.split(',') if u.strip()]
        except (json.JSONDecodeError, IndexError):
            return jsonify({'success': False, 'error': f'Could not verify parent task {parent_id}'}), 400

    args = ['task', 'add']

    if isinstance(data.get('tags'), list):
        try:
            args += _tag_args(data['tags'])
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 400

    if data.get('due'):
        args.append(f'due:{data["due"]}')

    if data.get('scheduled'):
        args.append(f'scheduled:{data["scheduled"]}')

    if data.get('priority'):
        args.append(f'priority:{data["priority"]}')

    if data.get('project'):
        args.append(f'project:{data["project"]}')

    if data.get('sched_duration'):
        args.append(f'sched_duration:{data["sched_duration"]}')

    if data.get('due_duration'):
        args.append(f'due_duration:{data["due_duration"]}')

    if data.get('state'):
        args.append(f'state:{data["state"]}')

    if data.get('depends'):
        args.append(f'depends:{data["depends"]}')

    if data.get('wait'):
        args.append(f'wait:{data["wait"]}')

    if data.get('until'):
        args.append(f'until:{data["until"]}')

    args += ['--', data['description']]   # free text last, after `--` (S11)
    create_result = run_task_command(args)
    signals = _hook_signals(create_result, args)
    if create_result['success']:
        export_result = run_task_command(['task', '+LATEST', 'export'], readonly=True)
        if export_result['success'] and export_result['stdout'].strip():
            try:
                task = json.loads(export_result['stdout'])
                if task:
                    new_uuid = task[0]['uuid']
                    warnings = _warnings(create_result)

                    # Wire parent dep: make the new task a prerequisite of parent_id
                    if parent_id:
                        all_deps = ','.join(parent_existing_deps + [new_uuid])
                        mod = run_task_command(['task', str(parent_id), 'modify',
                                                f'depends:{all_deps}'])
                        if not mod['success']:
                            warnings = (warnings or []) + [
                                f'Task created but could not link to parent {parent_id}: '
                                + mod.get('stderr', '').strip()]

                    return jsonify({'success': True, 'message': 'Task created successfully',
                                    'task': task[0], 'warnings': warnings, **signals})
            except (json.JSONDecodeError, IndexError) as e:
                print(f"Error parsing task data: {e}")

    return jsonify({
        'success': create_result.get('success', False),
        'error': create_result.get('stderr', 'Failed to create task'),
        'task': None,
        'warnings': _warnings(create_result),
        **signals,
    })

@app.route('/api/task/log', methods=['POST'])
def log_task():
    """Log a completed task via 'task log' — same args as add but marks done immediately."""
    data = request.get_json()
    if not data.get('description'):
        return jsonify({'success': False, 'error': 'Description is required'}), 400

    args = ['task', 'log']

    if isinstance(data.get('tags'), list):
        try:
            args += _tag_args(data['tags'])
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 400
    if data.get('due'):
        args.append(f'due:{data["due"]}')
    if data.get('scheduled'):
        args.append(f'scheduled:{data["scheduled"]}')
    if data.get('priority'):
        args.append(f'priority:{data["priority"]}')
    if data.get('project'):
        args.append(f'project:{data["project"]}')
    if data.get('sched_duration'):
        args.append(f'sched_duration:{data["sched_duration"]}')
    if data.get('due_duration'):
        args.append(f'due_duration:{data["due_duration"]}')

    args += ['--', data['description']]   # free text last, after `--` (S11)
    result = run_task_command(args)
    return jsonify({'success': result['success'],
                    'error':   result.get('stderr', '') if not result['success'] else None,
                    'warnings': _warnings(result), **_hook_signals(result, args)})

@app.route('/api/task/<task_id>/annotate', methods=['POST'])
def annotate_task(task_id):
    """Add an annotation to an existing task."""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'error': 'Invalid task ID'}), 400
    data = request.get_json() or {}
    text = (data.get('annotation') or '').strip()
    if not text:
        return jsonify({'success': False, 'error': 'Annotation text is required'}), 400
    args = ['task', task_id, 'annotate', '--', text]
    result = run_task_command(args)
    return jsonify({'success': result['success'],
                    'error':   result['stderr'] if not result['success'] else None,
                    **_hook_signals(result, args)})

@app.route('/api/task/<task_id>/annotation', methods=['DELETE'])
def delete_annotation(task_id):
    """Remove an annotation by matching its text."""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'error': 'Invalid task ID'}), 400
    data = request.get_json() or {}
    text = (data.get('annotation') or '').strip()
    if not text:
        return jsonify({'success': False, 'error': 'Annotation text is required'}), 400
    args = ['task', task_id, 'denotate', '--', text]
    result = run_task_command(args)
    return jsonify({
        'success': result['success'],
        'error':   result['stderr'] if not result['success'] else None,
        **_hook_signals(result, args),
    })

@app.route('/api/task/<task_id>/annotation', methods=['PUT'])
def edit_annotation(task_id):
    """Edit an annotation: denotate old text, then annotate with new text."""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'error': 'Invalid task ID'}), 400
    data = request.get_json() or {}
    old_text = (data.get('old_annotation') or '').strip()
    new_text = (data.get('new_annotation') or '').strip()
    if not old_text or not new_text:
        return jsonify({'success': False, 'error': 'old_annotation and new_annotation are required'}), 400
    args = ['task', task_id, 'denotate', '--', old_text]
    denotate = run_task_command(args)
    if not denotate['success']:
        return jsonify({'success': False, 'error': denotate['stderr'], **_hook_signals(denotate, args)})
    args = ['task', task_id, 'annotate', '--', new_text]
    annotate = run_task_command(args)
    return jsonify({
        'success': annotate['success'],
        'error':   annotate['stderr'] if not annotate['success'] else None,
        **_hook_signals(annotate, args),
    })

@app.route('/api/sync/status')
def sync_status():
    task_dir = Path.home() / '.task'
    if not (task_dir / '.git').exists():
        return jsonify({'changes': 0, 'git': False, 'files': [], 'unpushed': 0})

    # Primary: count unpushed commits
    unpushed_r = subprocess.run(
        ['git', '-C', str(task_dir), 'rev-list', '@{u}..HEAD', '--count'],
        capture_output=True, text=True
    )
    unpushed = int(unpushed_r.stdout.strip() or '0') if unpushed_r.returncode == 0 else 0

    # Secondary: uncommitted working-tree changes
    dirty_r = subprocess.run(
        ['git', '-C', str(task_dir), 'status', '--porcelain'],
        capture_output=True, text=True
    )
    files = []
    for line in dirty_r.stdout.splitlines():
        if line.strip():
            files.append({'status': line[:2].strip(), 'path': line[3:].strip()})

    changes = unpushed + len(files)
    return jsonify({'changes': changes, 'git': True, 'files': files, 'unpushed': unpushed})

@app.route('/api/sync/info')
def sync_info():
    import shutil
    if shutil.which('gittw'):
        return jsonify({'method': 'gittw (git-based sync)'})
    result = run_task_command(['task', '_show'], readonly=True)
    has_server = any(
        line.startswith('taskd.server=') and line.split('=', 1)[1].strip()
        for line in result['stdout'].splitlines()
    )
    return jsonify({'method': 'task sync' + (' — server configured' if has_server else ' — no server configured')})

@app.route('/api/sync/log')
def sync_log():
    """Return recent git log for the task directory."""
    task_dir = Path.home() / '.task'
    if not (task_dir / '.git').exists():
        return jsonify({'success': False, 'log': 'No git repository in ~/.task'})
    r = subprocess.run(
        ['git', '-C', str(task_dir), 'log', '--oneline', '-20'],
        capture_output=True, text=True
    )
    return jsonify({'success': r.returncode == 0, 'log': r.stdout.strip() or '(no commits yet)'})

@app.route('/api/sync/undo', methods=['POST'])
def sync_undo():
    """Undo the last task modification via `task undo`."""
    result = run_task_command(['task', 'undo'])
    output = result['stdout'].strip() or result['stderr'].strip()
    return jsonify({'success': result['success'], 'output': output})

@app.route('/api/sync', methods=['POST'])
def sync_tasks():
    import shutil
    data    = request.get_json(silent=True) or {}
    message = (data.get('message') or '').strip()
    task_dir = Path.home() / '.task'

    lines = []

    # If a comment was provided and this is a git-backed task dir,
    # commit any uncommitted changes with that message before syncing.
    if message and (task_dir / '.git').exists():
        cr = subprocess.run(
            ['git', '-C', str(task_dir), 'commit', '-a', '-m', message],
            capture_output=True, text=True
        )
        if cr.returncode == 0:
            lines.append(f'Committed: {message}')
        elif 'nothing to commit' not in cr.stdout + cr.stderr:
            lines.append(f'Commit note: {cr.stderr.strip() or cr.stdout.strip()}')

    if shutil.which('gittw'):
        result = run_command(['gittw', 'sync'])
    else:
        result = run_task_command(['task', 'sync'])

    sync_out = result['stdout'].strip() or result['stderr'].strip()
    if sync_out:
        lines.append(sync_out)
    output = '\n'.join(lines) if lines else ('Sync complete.' if result['success'] else 'Sync failed.')
    return jsonify({
        'success': result['success'],
        'output': output,
        'warnings': _warnings(result)
    })

@app.route('/api/events')
def sse_stream():
    """Server-Sent Events stream — delivers hook prompts to the browser."""
    def generate():
        q: Queue = Queue()
        client_id = id(q)
        with _sse_lock:
            _sse_clients[client_id] = q
        try:
            # Replay any prompt files already waiting (e.g. page reload mid-prompt)
            for pf in sorted(_PROMPT_DIR.glob('*.prompt')):
                if not (_PROMPT_DIR / (pf.stem + '.answer')).exists():
                    try:
                        yield f"data: {json.dumps(json.loads(pf.read_text()))}\n\n"
                    except Exception:
                        pass
            while True:
                try:
                    yield q.get(timeout=20)
                except Empty:
                    yield ': ka\n\n'   # keepalive — prevents proxy timeouts
        finally:
            with _sse_lock:
                _sse_clients.pop(client_id, None)

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/api/hook-answer', methods=['POST'])
def hook_answer():
    """Receive the user's answer to a hook prompt and write it for the hook to read."""
    data = request.get_json(silent=True) or {}
    prompt_id = data.get('id', '')
    answer    = data.get('answer', 'no')
    if not prompt_id or '/' in prompt_id or '..' in prompt_id:
        return jsonify({'ok': False, 'error': 'invalid id'}), 400
    answer_file = _PROMPT_DIR / f'{prompt_id}.answer'
    prompt_file = _PROMPT_DIR / f'{prompt_id}.prompt'
    answer_file.write_text(json.dumps({'answer': answer}))
    # Clean up the prompt file so the watcher stops re-broadcasting it
    prompt_file.unlink(missing_ok=True)
    return jsonify({'ok': True})


if __name__ == '__main__':
    check_result = run_task_command(['task', 'version'], readonly=True)
    if not check_result['success']:
        print("Warning: TaskWarrior doesn't seem to be installed or accessible")
        print("Please install TaskWarrior: sudo apt-get install taskwarrior")
    else:
        print("TaskWarrior found:", check_result['stdout'].split('\n')[0])

    from werkzeug.serving import make_server, is_running_from_reloader
    print("Starting tw-web...")
    opts = _server_options(os.environ, _TS_INFO)
    port = int(os.environ.get('TW_WEB_PORT', 5000))
    if opts['binds'][0] in _WILDCARD_HOSTS:
        print("WARNING: TW_WEB_HOST is a wildcard — tw-web is reachable from every network "
              "this machine joins, with no login. Prefer TW_WEB_TAILSCALE=1.")
    if os.environ.get('TW_WEB_TAILSCALE') == '1' and not _TS_INFO:
        print("WARNING: TW_WEB_TAILSCALE=1 but Tailscale is unavailable — serving localhost only.")
    if os.environ.get('TW_WEB_DEBUG') == '1' and not opts['debug']:
        print("WARNING: TW_WEB_DEBUG refused — the debugger is only allowed on a localhost-only bind.")
    # Extra binds (Tailscale) run as plain threads in the serving process; the
    # reloader's parent only holds the first bind. On reload the child exits
    # and releases them.
    if not opts['use_reloader'] or is_running_from_reloader():
        for extra in opts['binds'][1:]:
            srv = make_server(extra, port, app, threaded=True)
            threading.Thread(target=srv.serve_forever, daemon=True, name=f'serve-{extra}').start()
    for b in opts['binds']:
        print(f"Access the interface at: http://{'[' + b + ']' if ':' in b else b}:{port}")
    app.run(host=opts['binds'][0], port=port, debug=opts['debug'],
            use_reloader=opts['use_reloader'], threaded=True)
