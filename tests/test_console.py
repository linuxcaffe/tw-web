"""The terminal console and the signals that lead to it (consolidation step 4).

- /ws/pty's first message says what to run: {kind: 'task' | 'shell', cmd, cwd, init}.
- A write whose hook needs a terminal (tw_needs_pty, or the legacy marker), times out, or spools
  a command tells the browser so in one shape, built by _hook_signals; the command it names is
  what follows `task`, quoted so the console splits it back into the same arguments (bugs 3, H2).
- /api/commands lists task's commands and aliases, so command mode needs no hand-kept list (bug 9).
- Nothing opens a desktop terminal or runs a request's text through a shell any more; /api/run is
  gone (no client called it; the console gives Taskwarrior's own bulk confirmation).
"""
import shlex
import subprocess

import pytest

O = {'Origin': 'http://localhost'}
SH = '/bin/zsh'


# ── /ws/pty: what the first message runs ──────────────────────────────────────

@pytest.mark.parametrize('payload, argv, interactive', [
    ({'cmd': '12 done'},                         ['task', '12', 'done'], False),   # no kind = task
    ({'kind': 'task', 'cmd': "add -- 'a b'"},    ['task', 'add', '--', 'a b'], False),
    ({'kind': 'shell', 'cmd': 'hledger add; ls'}, [SH, '-c', 'hledger add; ls'], False),
    ({'cmd': ''},                                [SH], True),                      # empty = a shell
    ({'kind': 'shell', 'cmd': ''},               [SH], True),
])
def test_pty_request_kinds(app_module, payload, argv, interactive):
    assert app_module._pty_argv(payload, SH) == (argv, interactive)


@pytest.mark.parametrize('payload', [{'kind': 'bash', 'cmd': 'ls'}, {'kind': 'task', 'cmd': "add 'oops"}])
def test_pty_request_refuses_bad_input(app_module, payload):
    with pytest.raises(ValueError):
        app_module._pty_argv(payload, SH)


# ── write results: the signals, one shape for every write route ───────────────

@pytest.fixture
def task_returns(app_module, monkeypatch):
    calls = []
    def setup(result):
        def fake(args, readonly=False, extra_overrides=None, extra_env=None):
            calls.append(list(args))
            return {'stdout': '', 'stderr': '', 'returncode': 1, **result}
        monkeypatch.setattr(app_module, 'run_task_command', fake)
        return calls
    return setup


TIMEOUT = {'success': False, 'timed_out': True, 'stderr': 'Command timed out after 15s'}
MARKER  = {'success': False, 'stderr': 'Hook on-modify_x: TW_INTERACTIVE_REQUIRED'}

WRITES = [
    ('post',   '/api/task/12/start', None,                        '12 start'),
    ('post',   '/api/task/12/stop',  None,                        '12 stop'),
    ('post',   '/api/task/12/done',  None,                        '12 done'),
    ('delete', '/api/task/12/delete', None,                       '12 delete'),
    ('put',    '/api/task/12/modify', {'project': 'home'},        '12 modify project:home'),
    ('post',   '/api/task/12/annotate', {'annotation': 'a; b'},   "12 annotate -- 'a; b'"),
    ('post',   '/api/task/add',      {'description': 'x $(id)'},  "add -- 'x $(id)'"),
    ('post',   '/api/task/log',      {'description': 'y'},        'log -- y'),
    ('post',   '/api/task/12/revert', None,                       '12 modify status:pending'),
    ('delete', '/api/task/12/annotation', {'annotation': 'old'},  '12 denotate -- old'),
    ('put',    '/api/task/12/annotation', {'old_annotation': 'o', 'new_annotation': 'n'}, '12 denotate -- o'),
]


@pytest.mark.parametrize('method, url, body, cmd', WRITES)
def test_timeout_offers_the_command_without_task(client, task_returns, method, url, body, cmd):
    task_returns(TIMEOUT)
    r = getattr(client, method)(url, json=body, headers=O).get_json()
    assert r['timed_out'] is True and r['cmd'] == cmd


@pytest.mark.parametrize('method, url, body, cmd', WRITES)
def test_legacy_marker_opens_the_console(client, task_returns, method, url, body, cmd):
    task_returns(MARKER)
    r = getattr(client, method)(url, json=body, headers=O).get_json()
    assert r['needs_pty'] is True and r['cmd'] == cmd
    assert r['success'] is False


@pytest.mark.parametrize('method, url, body, cmd', WRITES)
def test_needs_pty_on_any_write(client, task_returns, method, url, body, cmd):
    task_returns({'success': False, 'stderr': '{"type": "tw_needs_pty", "cmd": ""}'})
    r = getattr(client, method)(url, json=body, headers=O).get_json()
    assert r['needs_pty'] is True and r['cmd'] == cmd


def test_spooled_command_is_offered(client, task_returns):
    task_returns({'success': True, 'deferred_cmds': ["hledger add 'Buy milk'"]})
    r = client.post('/api/task/12/stop', headers=O).get_json()
    assert r['deferred_cmd'] == "hledger add 'Buy milk'"


def test_offered_command_splits_back_into_the_same_arguments(app_module):
    # H2: a description with shell syntax stays one argument, and no shell ever sees it
    args = ['task', 'add', '--', 'buy milk; rm -rf ~ $(id)']
    sig = app_module._hook_signals(dict(MARKER), args)
    assert app_module._pty_argv({'cmd': sig['cmd']}, SH)[0] == args


def test_marker_never_launches_anything(app_module, monkeypatch):
    spawned = []
    monkeypatch.setattr(app_module.subprocess, 'Popen', lambda *a, **k: spawned.append(a[0]))
    monkeypatch.setattr(app_module, 'DEVELOPER_MODE', False)
    monkeypatch.setattr(app_module.subprocess, 'run', lambda *a, **k: subprocess.CompletedProcess(
        a[0], 1, '', 'TW_INTERACTIVE_REQUIRED'))
    out = app_module.run_task_command(['task', '12', 'modify', '+x'])
    assert spawned == [] and 'terminal_launched' not in out


def test_timeout_result_names_the_command_after_task(app_module, monkeypatch):
    def slow(*a, **k):
        raise subprocess.TimeoutExpired(a[0], 15)
    monkeypatch.setattr(app_module, 'DEVELOPER_MODE', False)
    monkeypatch.setattr(app_module.subprocess, 'run', slow)
    out = app_module.run_task_command(['task', '12', 'done'])
    assert out['timed_out'] is True and out['cmd'] == '12 done'


# ── what's gone ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize('method, url', [
    ('post', '/api/run'), ('post', '/api/terminal'), ('get', '/api/terminal/check')])
def test_removed_routes(client, method, url):
    assert getattr(client, method)(url, json={'cmd': 'ls'}, headers=O).status_code in (404, 405)


@pytest.mark.parametrize('name', ['_launch_terminal', '_find_terminal', '_terminal_available',
                                  '_TERMINAL_CANDIDATES', 'api_run', '_parse_preflight',
                                  '_MUTATING_VERBS', '_BULK_SAFE_VERBS'])
def test_removed_helpers(app_module, name):
    assert not hasattr(app_module, name)


# ── /api/commands ─────────────────────────────────────────────────────────────

def test_commands_lists_commands_aliases_and_abbreviation(client, app_module, monkeypatch):
    calls = []
    out = {'_commands': 'add\nlist\nmine\nsynchronize\n', '_aliases': 'burndown\nrm\n', '_get': '3\n'}
    def fake(args, readonly=False, extra_overrides=None, extra_env=None):
        calls.append((list(args), readonly))
        return {'success': True, 'stdout': out[next(a for a in args if a in out)], 'stderr': ''}
    monkeypatch.setattr(app_module, 'run_task_command', fake)
    app_module._commands_cache_ts = 0
    r = client.get('/api/commands').get_json()
    assert r == {'success': True, 'commands': ['add', 'list', 'mine', 'synchronize'],
                 'aliases': ['burndown', 'rm'], 'abbreviation_minimum': 3}
    assert all(ro for _, ro in calls)                       # reads: hooks off
    n = len(calls)
    client.get('/api/commands')
    assert len(calls) == n                                  # cached


def test_commands_route_is_not_open_to_the_extension(app_module):
    assert not app_module._origin_allowed('moz-extension://abc', 'localhost:5000', '/api/commands')


def test_debug_route_is_gone(client):
    assert client.post('/api/debug', json={'msg': 'x'}, headers=O).status_code in (404, 405)
