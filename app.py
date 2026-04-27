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

TW_VIRTUAL_TAGS = {
    'ACTIVE','ANNOTATED','BLOCKED','BLOCKING','CHILD','COMPLETED','DELETED',
    'DUE','DUETODAY','LATEST','MONTH','NEXT','NOCOLOR','ORPHAN','OVERDUE',
    'PARENT','PENDING','PRIORITY','PROJECT','QUARTER','READY','RECURRING',
    'SCHEDULED','TAGGED','TODAY','TOMORROW','UDA','UNBLOCKED','WEEK','YEAR',
}

# Accepts a UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) or a plain integer task ID
_TASK_ID_RE = re.compile(
    r'^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$',
    re.IGNORECASE
)

def _valid_task_id(task_id):
    return bool(_TASK_ID_RE.match(str(task_id)))

# ── Settings (settings.json > config.py > hardcoded defaults) ─────────────────
_SETTINGS_PATH = Path(__file__).parent / 'settings.json'

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
_CAL_SLOT_DURS = {'00:15:00', '00:30:00', '01:00:00'}

_SETTINGS_SCHEMA = {
    'notification_timeout': {'type': int,  'default': 3000,
                              'validate': lambda v: v >= 0},
    'kanban_columns':       {'type': None, 'default': ['backlog','todo','doing','review','done'],
                              'coerce': lambda v: [c.strip() for c in
                                  (v if isinstance(v, list) else str(v).split(',')) if c.strip()]},
    'cal_day_start':        {'type': None, 'default': '06:00:00', 'coerce': _valid_hour},
    'cal_day_end':          {'type': None, 'default': '23:00:00', 'coerce': _valid_hour},
    'cal_scroll_time':      {'type': None, 'default': '08:00:00', 'coerce': _valid_hour},
    'cal_default_view':     {'type': str,  'default': 'timeGridWeek',
                              'validate': lambda v: v in _CAL_VIEWS},
    'cal_slot_duration':    {'type': str,  'default': '00:15:00',
                              'validate': lambda v: v in _CAL_SLOT_DURS},
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

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)
sock = Sock(app)

# ── Hook prompt system ────────────────────────────────────────────────────────
_PROMPT_DIR = Path('/tmp/tw-web-prompts')
_PROMPT_DIR.mkdir(exist_ok=True)

# ── Hook spool (deferred interactive commands) ────────────────────────────────
# Hooks that cannot run interactively write a shell command to this directory.
# Flask drains it after every write command and returns deferred_cmd to the UI,
# which offers an "Open in terminal" banner so the user can run it manually.
_SPOOL_DIR = Path('/tmp/tw-web-spool')
_SPOOL_DIR.mkdir(exist_ok=True)

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

# Timeout (seconds) for any single task command.
# Prevents a hung interactive hook from deadlocking the Flask request.
TASK_TIMEOUT = 15

# Marker written to stderr by hooks that abort because they need a terminal.
# Flask detects this and returns deferred_cmd = the original clean command,
# so the frontend can offer "Run in terminal" with the full task command.
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
        clean_cmd = ' '.join(args)   # human-readable before rc overrides
        # Inject web-only rc overrides immediately after 'task'
        overrides = ['rc.confirmation=no']
        if readonly:
            overrides.append('rc.hooks=off')
        if extra_overrides:
            overrides.extend(extra_overrides)
        args = [args[0]] + overrides + args[1:]

        log_command(args)

        if DEVELOPER_MODE:
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
            # Hook signalled it needs a terminal → launch one immediately and
            # let the client know so it can suppress the error notification.
            if not out['success'] and TW_INTERACTIVE_MARKER in result.stderr:
                out['terminal_launched'] = _launch_terminal(clean_cmd)
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
            'cmd':       clean_cmd,
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

# ── Preflight helpers for /api/run ───────────────────────────────────────────
_MUTATING_VERBS = {
    'add', 'modify', 'mod', 'mo',
    'delete', 'del', 'dele',
    'done', 'do', 'don',
    'start', 'sta', 'star',
    'stop', 'sto',
    'annotate', 'ann', 'anno',
    'append', 'app', 'appe',
    'prepend', 'pre', 'prep',
    'duplicate', 'dup', 'dupl',
    'purge', 'pur',
}
# Verbs that act on a single implicit target — no bulk risk
_BULK_SAFE_VERBS = {'add', 'sync', 'sy', 'syn', 'undo', 'un', 'und', 'import', 'im', 'imp'}

def _parse_preflight(args):
    """Split user args into (filter_args, verb).  Ignores rc.xxx tokens."""
    filter_args, verb = [], None
    for tok in args:
        if tok.startswith('rc.') or tok == 'task':
            continue
        if verb is None and tok.lower() in _MUTATING_VERBS:
            verb = tok.lower()
            break
        filter_args.append(tok)
    return filter_args, verb

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


@app.route('/api/run', methods=['POST'])
def api_run():
    """Expert command mode: run an arbitrary task command verbatim.
    On first call, the on-launch preflight hook may block bulk operations and
    return {"preflight":true,...}.  Re-POST with confirmed:true to proceed.
    """
    data = request.get_json(silent=True) or {}
    cmd_str   = (data.get('cmd') or '').strip()
    confirmed = bool(data.get('confirmed', False))

    if not cmd_str:
        return jsonify({'success': False, 'error': 'No command provided'})
    try:
        args = shlex.split(cmd_str)
    except ValueError as e:
        return jsonify({'success': False, 'error': f'Parse error: {e}'})
    if not args:
        return jsonify({'success': False, 'error': 'Empty command'})

    # Build env extras for the preflight hook protocol
    extra_env = {}
    if confirmed:
        extra_env['TW_PREFLIGHT_CONFIRMED'] = '1'
    else:
        filter_args, verb = _parse_preflight(args)
        if verb and verb not in _BULK_SAFE_VERBS and filter_args:
            extra_env['TW_PREFLIGHT_VERB']   = verb
            extra_env['TW_PREFLIGHT_FILTER'] = ' '.join(filter_args)
            extra_env['TW_PREFLIGHT_CMD']    = cmd_str

    result = run_task_command(args, extra_overrides=['rc.bulk=0'], extra_env=extra_env)

    if not result['success'] and not confirmed:
        signal = _detect_signal(result.get('stderr', ''), 'tw_preflight')
        if signal:
            return jsonify({
                'preflight': True,
                'count':     signal['count'],
                'verb':      signal['verb'],
                'filter':    signal['filter'],
                'cmd':       cmd_str,
            })

    return jsonify(result)

@sock.route('/ws/pty')
def ws_pty(ws):
    """WebSocket PTY: run a task command in a real pseudo-terminal.
    Client sends first message: JSON {"cmd": "start 111"}
    Then relays stdin as raw text; receives stdout/stderr as raw text.
    Server closes the socket when the process exits.
    """
    import pty, select, fcntl, termios, struct, signal as _signal

    first = ws.receive(timeout=10)
    if not first:
        return
    try:
        payload = json.loads(first)
        cmd_str = payload.get('cmd', '').strip()
    except (json.JSONDecodeError, AttributeError):
        cmd_str = first.strip()

    try:
        args = shlex.split(cmd_str) if cmd_str else []
    except ValueError as e:
        ws.send(f'\r\n[pty] Parse error: {e}\r\n')
        return

    # Empty cmd → open tw shell
    shell_mode = not args
    master_fd, slave_fd = pty.openpty()

    # Set sane terminal size (80×24)
    winsize = struct.pack('HHHH', 24, 80, 0, 0)
    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)

    env = {k: v for k, v in _TW_ENV.items() if k != 'TW_NOINTERACT'}
    env['TERM'] = 'xterm-256color'

    def _pty_preexec():
        os.setsid()
        fcntl.ioctl(0, termios.TIOCSCTTY, 0)

    shell_bin = os.environ.get('SHELL') or shutil.which('bash') or 'sh'
    cmd_argv = [shell_bin] if shell_mode else (['task'] + args)
    try:
        proc = subprocess.Popen(
            cmd_argv,
            stdin=slave_fd, stdout=slave_fd, stderr=slave_fd,
            close_fds=True, env=env,
            preexec_fn=_pty_preexec,
        )
    except Exception as e:
        os.close(master_fd); os.close(slave_fd)
        ws.send(f'\r\n[pty] Failed to start: {e}\r\n')
        return

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

@app.route('/api/debug', methods=['POST'])
def api_debug():
    """Temporary JS error logging endpoint"""
    data = request.get_json(silent=True) or {}
    print(f"[JS-DEBUG] {data.get('msg', '(no message)')}", flush=True)
    return jsonify({'ok': True})

@app.route('/')
def index():
    """Serve the main HTML page"""
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    """Serve static files (CSS, JS, etc.)"""
    return send_from_directory('.', filename)

@app.route('/api/tasks/due')
def get_due_tasks():
    """Get tasks that have a due date but no scheduled date (for calendar due-event display)."""
    statuses = [s.strip() for s in request.args.get('status', 'pending').split(',') if s.strip()]
    context  = request.args.get('context', '').strip()
    args = ['task']
    if context:
        ctx_expr = _get_context_filters().get(context)
        if ctx_expr:
            args += ['(', ctx_expr, ')']
    args += ['due.any:', 'scheduled.none:'] + _build_task_filter(statuses, None) + ['export']
    result = run_task_command(args, readonly=True)
    if result['success']:
        try:
            tasks = json.loads(result['stdout'])
            return jsonify({'success': True, 'data': tasks})
        except json.JSONDecodeError as e:
            return jsonify({'success': False, 'error': f'JSON decode error: {str(e)}'}), 500
    return jsonify({'success': False, 'error': 'Failed to retrieve due tasks', 'stderr': result['stderr']}), 500

@app.route('/api/tasks/planned')
def get_planned_tasks():
    """Get all planned tasks (with scheduled date) in JSON format"""
    statuses = [s.strip() for s in request.args.get('status', 'pending').split(',') if s.strip()]
    context  = request.args.get('context', '').strip()
    args = ['task']
    if context:
        ctx_expr = _get_context_filters().get(context)
        if ctx_expr:
            args += ['(', ctx_expr, ')']
    args += ['scheduled.not:'] + _build_task_filter(statuses, None) + ['export']
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
            'error': 'Failed to retrieve planned tasks',
            'stderr': result['stderr']
        }), 500

def _build_task_filter(statuses, filter_text):
    """Build a TW filter argument list from status ids and optional filter text.
    Multiple statuses are OR'd; filter text is AND'd with the status block.
    Returns a list of args to insert before 'export'.
    """
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
        args = parts
    else:
        args = ['('] + [p for pair in zip(parts, ['or'] * len(parts)) for p in pair][:-1] + [')']

    if filter_text:
        args.append(f'description.contains:{filter_text}')

    return args


@app.route('/api/tasks')
def get_tasks():
    """Get all pending tasks in JSON format.
    Query params: status (comma-separated), filter (text), context (name).
    rawfilter: complete TW filter expression override — bypasses all other params.
    """
    rawfilter = request.args.get('rawfilter', '').strip()
    if rawfilter:
        try:
            filter_args = shlex.split(rawfilter)
        except ValueError as e:
            return jsonify({'success': False, 'error': f'Invalid filter: {e}'}), 400
        args = ['task', 'rc.context=none'] + filter_args + ['export']
    else:
        statuses    = [s.strip() for s in request.args.get('status', 'pending').split(',') if s.strip()]
        raw_filter  = request.args.get('filter', '').strip()
        filter_text = re.sub(r'[^\w\s\-\.]', '', raw_filter)[:80]
        context     = request.args.get('context', '').strip()

        args = ['task']
        if context:
            ctx_filters = _get_context_filters()
            ctx_expr = ctx_filters.get(context)
            if ctx_expr:
                args += ['(', ctx_expr, ')']
        args += _build_task_filter(statuses, filter_text)
        args.append('export')

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
            'error': 'Failed to retrieve tasks',
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

    r = run_task_command(['task', 'projects'], readonly=True)
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
        result = run_task_command(['task', 'rc.complete.all.tags=yes', '_tags'], readonly=True)
        if result['success']:
            tags = sorted({t.strip() for t in result['stdout'].split('\n')
                           if t.strip() and t.strip() not in TW_VIRTUAL_TAGS})
            counts = {t: 0 for t in tags}
            return jsonify({'success': True, 'tags': tags, 'counts': counts})
        return jsonify({'success': False, 'error': result['stderr']}), 500

    result = run_task_command(['task', 'status:pending', 'export'], readonly=True)
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

@app.route('/api/stats')
def get_stats():
    """Return the output of `task stats` for display in the UI"""
    result = run_task_command(['task', 'rc.context=none', 'stats'], readonly=True)
    return jsonify({'success': result['success'], 'output': result['stdout'], 'error': result['stderr']})

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
    """Return the deferred command for a write result (interactive abort or spool), or None."""
    if result.get('deferred_cmd'):        # interactive abort path (hook exited with marker)
        return result['deferred_cmd']
    cmds = result.get('deferred_cmds', [])  # spool path (hook wrote .cmd file)
    return cmds[0] if cmds else None

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
    extra_env = {'TW_PREFLIGHT_CMD': f'{task_id} start'}
    result = run_task_command([task_id, 'start'], extra_env=extra_env)
    if not result['success']:
        sig = _detect_signal(result.get('stderr', ''), 'tw_needs_pty')
        if sig:
            return jsonify({'success': False, 'needs_pty': True, 'cmd': sig.get('cmd') or f'{task_id} start'})
    resp = {'success': result['success'],
            'message': result['stdout'] if result['success'] else result['stderr'],
            'warnings': _warnings(result)}
    dc = _deferred_cmd(result)
    if dc: resp['deferred_cmd'] = dc
    return jsonify(resp)

@app.route('/api/task/<task_id>/stop', methods=['POST'])
def stop_task(task_id):
    """Stop a task"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400
    result = run_task_command(['task', task_id, 'stop'])
    resp = {'success': result['success'],
            'message': result['stdout'] if result['success'] else result['stderr'],
            'warnings': _warnings(result)}
    dc = _deferred_cmd(result)
    if dc: resp['deferred_cmd'] = dc
    return jsonify(resp)

@app.route('/api/task/<task_id>/done', methods=['POST'])
def complete_task(task_id):
    """Mark a task as done"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400
    extra_env = {'TW_PREFLIGHT_CMD': f'{task_id} done'}
    result = run_task_command([task_id, 'done'], extra_env=extra_env)
    if not result['success']:
        sig = _detect_signal(result.get('stderr', ''), 'tw_needs_pty')
        if sig:
            return jsonify({'success': False, 'needs_pty': True, 'cmd': sig.get('cmd') or f'{task_id} done'})
    dc = _deferred_cmd(result)
    resp = {'success': result['success'],
            'message': result['stdout'] if result['success'] else result['stderr'],
            'warnings': _warnings(result)}
    if dc: resp['deferred_cmd'] = dc
    return jsonify(resp)

@app.route('/api/task/<task_id>/revert', methods=['POST'])
def revert_task(task_id):
    """Revert a completed or deleted task back to pending"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400
    result = run_task_command(['task', task_id, 'modify', 'status:pending'])
    if result['success']:
        export_result = run_task_command(['task', task_id, 'export'], readonly=True)
        if export_result['success'] and export_result['stdout'].strip():
            try:
                tasks = json.loads(export_result['stdout'])
                if tasks:
                    return jsonify({'success': True, 'task': tasks[0], 'warnings': _warnings(result)})
            except (json.JSONDecodeError, IndexError):
                pass
    return jsonify({
        'success': result['success'],
        'message': result['stdout'] if result['success'] else result['stderr'],
        'warnings': _warnings(result)
    })

@app.route('/api/task/<task_id>/delete', methods=['DELETE'])
def delete_task(task_id):
    """Delete a task"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400
    result = run_task_command(['task', task_id, 'delete'])
    resp = {'success': result['success'],
            'message': result['stdout'] if result['success'] else result['stderr'],
            'warnings': _warnings(result)}
    dc = _deferred_cmd(result)
    if dc: resp['deferred_cmd'] = dc
    return jsonify(resp)

@app.route('/api/task/<task_id>/modify', methods=['PUT'])
def modify_task(task_id):
    """Modify a task"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400

    data = request.get_json()
    modifications = []

    if 'description' in data and data['description']:
        modifications.append(f'description:{data["description"]}')

    if 'tags_remove' in data:
        for tag in data['tags_remove']:
            if tag and str(tag).strip():
                modifications.append(f'-{str(tag).strip()}')
    if 'tags_add' in data:
        for tag in data['tags_add']:
            if tag and str(tag).strip():
                modifications.append(f'+{str(tag).strip()}')

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
        result = run_task_command(['task', task_id, 'modify'] + modifications)

        dc = _deferred_cmd(result)
        if result['success']:
            export_result = run_task_command(['task', task_id, 'export'], readonly=True)
            if export_result['success'] and export_result['stdout'].strip():
                try:
                    task = json.loads(export_result['stdout'])
                    if task:
                        resp = {'success': True, 'message': result['stdout'],
                                'task': task[0], 'warnings': _warnings(result)}
                        if dc: resp['deferred_cmd'] = dc
                        return jsonify(resp)
                except (json.JSONDecodeError, IndexError) as e:
                    print(f"Error parsing task data: {e}")
                    resp = {'success': True, 'message': result['stdout'], 'task': None, 'warnings': _warnings(result)}
                    if dc: resp['deferred_cmd'] = dc
                    return jsonify(resp)

        return jsonify({
            'success': False,
            'error': result['stderr'],
            'task': None,
            'warnings': _warnings(result)
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

    args = ['task', 'add', data['description']]

    if data.get('tags'):
        if isinstance(data['tags'], list):
            for tag in data['tags']:
                args.append(f'+{tag}')

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

    create_result = run_task_command(args)

    dc = _deferred_cmd(create_result)
    if create_result['success']:
        export_result = run_task_command(['task', '+LATEST', 'export'], readonly=True)
        if export_result['success'] and export_result['stdout'].strip():
            try:
                task = json.loads(export_result['stdout'])
                if task:
                    resp = {'success': True, 'message': 'Task created successfully',
                            'task': task[0], 'warnings': _warnings(create_result)}
                    if dc: resp['deferred_cmd'] = dc
                    return jsonify(resp)
            except (json.JSONDecodeError, IndexError) as e:
                print(f"Error parsing task data: {e}")

    return jsonify({
        'success': create_result.get('success', False),
        'error': create_result.get('stderr', 'Failed to create task'),
        'task': None,
        'warnings': _warnings(create_result)
    })

@app.route('/api/task/log', methods=['POST'])
def log_task():
    """Log a completed task via 'task log' — same args as add but marks done immediately."""
    data = request.get_json()
    if not data.get('description'):
        return jsonify({'success': False, 'error': 'Description is required'}), 400

    args = ['task', 'log', data['description']]

    if data.get('tags'):
        if isinstance(data['tags'], list):
            for tag in data['tags']:
                args.append(f'+{tag}')
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

    result = run_task_command(args)
    resp = {'success': result['success'],
            'error':   result.get('stderr', '') if not result['success'] else None,
            'warnings': _warnings(result)}
    dc = _deferred_cmd(result)
    if dc: resp['deferred_cmd'] = dc
    return jsonify(resp)

@app.route('/api/task/<task_id>/annotate', methods=['POST'])
def annotate_task(task_id):
    """Add an annotation to an existing task."""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'error': 'Invalid task ID'}), 400
    data = request.get_json() or {}
    text = (data.get('annotation') or '').strip()
    if not text:
        return jsonify({'success': False, 'error': 'Annotation text is required'}), 400
    result = run_task_command(['task', task_id, 'annotate', text])
    resp = {'success': result['success'],
            'error':   result['stderr'] if not result['success'] else None}
    dc = _deferred_cmd(result)
    if dc: resp['deferred_cmd'] = dc
    return jsonify(resp)

@app.route('/api/task/<task_id>/annotation', methods=['DELETE'])
def delete_annotation(task_id):
    """Remove an annotation by matching its text."""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'error': 'Invalid task ID'}), 400
    data = request.get_json() or {}
    text = (data.get('annotation') or '').strip()
    if not text:
        return jsonify({'success': False, 'error': 'Annotation text is required'}), 400
    result = run_task_command(['task', task_id, 'denotate', text])
    return jsonify({
        'success': result['success'],
        'error':   result['stderr'] if not result['success'] else None,
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
    denotate = run_task_command(['task', task_id, 'denotate', old_text])
    if not denotate['success']:
        return jsonify({'success': False, 'error': denotate['stderr']})
    annotate = run_task_command(['task', task_id, 'annotate', new_text])
    return jsonify({
        'success': annotate['success'],
        'error':   annotate['stderr'] if not annotate['success'] else None,
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

# ── Terminal launch ───────────────────────────────────────────────────────────

# Ordered by preference; flag is the arg that separates terminal options from
# the command to run (None = terminal accepts bare command args without a flag).
_TERMINAL_CANDIDATES = [
    ('xterm',           '-e'),
    ('gnome-terminal',  '--'),
    ('alacritty',       '-e'),
    ('konsole',         '-e'),
    ('xfce4-terminal',  '-e'),
    ('mate-terminal',   '-e'),
    ('lxterminal',      '-e'),
    ('tilix',           '-e'),
    ('kitty',           '-e'),
    ('foot',            '-e'),
]

def _find_terminal():
    """Return (exe, flag) for the first terminal emulator found, or (None, None)."""
    for name, flag in _TERMINAL_CANDIDATES:
        if shutil.which(name):
            return name, flag
    return None, None

def _terminal_available():
    display = os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY')
    if not display:
        return False, 'No display — desktop only'
    exe, _ = _find_terminal()
    if not exe:
        return False, 'No terminal emulator found (tried xterm, gnome-terminal, alacritty, …)'
    return True, exe

def _launch_terminal(cmd=''):
    """Launch a terminal window with cmd pre-loaded. Returns True if launched."""
    ok, _ = _terminal_available()
    if not ok:
        return False
    exe, flag = _find_terminal()
    if cmd:
        fd, script_path = tempfile.mkstemp(prefix='tw-web-', suffix='.sh')
        try:
            with os.fdopen(fd, 'w') as f:
                f.write('#!/bin/bash\n')
                f.write(f'{cmd}\n')
                f.write('echo\necho "[done — press Enter to close]"\nread\n')
                f.write(f'rm -f {shlex.quote(script_path)}\n')
            os.chmod(script_path, 0o700)
        except Exception:
            return False
        full_cmd = [exe, flag, script_path]
    else:
        full_cmd = [exe]
    try:
        subprocess.Popen(full_cmd, env=os.environ, start_new_session=True)
        return True
    except Exception:
        return False

@app.route('/api/terminal/check', methods=['GET'])
def terminal_check():
    """Report whether a terminal emulator is available on this display."""
    ok, detail = _terminal_available()
    return jsonify({'available': ok, 'detail': detail})

@app.route('/api/terminal', methods=['POST'])
def open_terminal():
    """Launch a terminal window, optionally pre-loaded with a command.
    JSON body: { "cmd": "task 42 done" }  (omit or empty to open a blank shell)
    """
    ok, detail = _terminal_available()
    if not ok:
        return jsonify({'success': False, 'error': detail}), 400

    data = request.get_json(silent=True) or {}
    cmd  = (data.get('cmd') or '').strip()
    exe, _ = _find_terminal()
    if _launch_terminal(cmd):
        return jsonify({'success': True, 'terminal': exe, 'cmd': cmd or None})
    return jsonify({'success': False, 'error': 'Could not launch terminal'}), 500

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

    print("Starting tw-web...")
    print("Access the interface at: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
