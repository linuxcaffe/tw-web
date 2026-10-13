"""tw-web's side of the fleet client ↔ hook contract.

The contract is written down in awesome-taskwarrior/CONVENTIONS.md. These tests pin what
tw-web sends to hooks and how it reads what hooks send back, using the document's examples
verbatim, so a change on either side shows up here.
"""
import json

import pytest

# The document's example signal lines, copied exactly.
NEEDS_PTY = '{"type": "tw_needs_pty", "cmd": "12 done"}'
PREFLIGHT = '{"type": "tw_preflight", "count": 7, "verb": "modify", "filter": "project:home", "cmd": "project:home modify +x", "threshold": 3}'
NON_INTERACTIVE = ('TW_NOINTERACT', 'TW_WEB', 'TW_SPOOL_DIR')


# ── client → hook: the environment ────────────────────────────────────────────

def test_every_task_call_says_no_terminal(app_module):
    env = app_module._TW_ENV
    assert env['TW_NOINTERACT'] == '1'
    assert env['TW_WEB'] == '1'                 # legacy alias, kept for older hooks
    assert env['TW_CLIENT'] == 'web'
    assert env['TW_SPOOL_DIR'] == str(app_module._SPOOL_DIR)


def test_spool_dir_is_private_and_exists(app_module):
    d = app_module._SPOOL_DIR
    assert d.is_dir() and (d.stat().st_mode & 0o777) == 0o700


def test_terminal_console_clears_the_no_terminal_variables(app_module):
    """In the terminal console a real terminal exists, so hooks must be free to prompt:
    none of the "no terminal here" variables may leak into it."""
    env = app_module._pty_env()
    for name in NON_INTERACTIVE:
        assert name not in env, name
    assert not [k for k in env if k.startswith('TW_PREFLIGHT_')]
    assert env['TW_CLIENT'] == 'web'            # identity is still fine to pass
    assert env['TERM'] == 'xterm-256color'


def test_preflight_variables_reach_the_hook(client, app_module, monkeypatch):
    seen = {}

    def fake(args, readonly=False, extra_overrides=None, extra_env=None):
        seen.update(extra_env or {})
        return {'success': True, 'stdout': '', 'stderr': ''}
    monkeypatch.setattr(app_module, 'run_task_command', fake)
    client.post('/api/run', json={'cmd': 'project:home modify +x'},
                headers={'Origin': 'http://localhost'})
    assert seen.get('TW_PREFLIGHT_VERB') == 'modify'
    assert seen.get('TW_PREFLIGHT_FILTER') == 'project:home'
    assert seen.get('TW_PREFLIGHT_CMD') == 'project:home modify +x'

    seen.clear()
    client.post('/api/run', json={'cmd': 'project:home modify +x', 'confirmed': True},
                headers={'Origin': 'http://localhost'})
    assert seen.get('TW_PREFLIGHT_CONFIRMED') == '1'


# ── hook → client: signals on stderr ──────────────────────────────────────────

def test_signal_parser_reads_the_documented_lines(app_module):
    stderr = '\n'.join(['Some hook chatter', NEEDS_PTY, 'Hook on-modify_x returned non-zero', PREFLIGHT])
    assert app_module._detect_signal(stderr, 'tw_needs_pty') == json.loads(NEEDS_PTY)
    assert app_module._detect_signal(stderr, 'tw_preflight') == json.loads(PREFLIGHT)
    assert app_module._detect_signal('{"type": "other"}\n{not json', 'tw_needs_pty') is None


@pytest.fixture
def hook_fails_with(app_module, monkeypatch):
    def setup(stderr):
        def fake(args, readonly=False, extra_overrides=None, extra_env=None):
            return {'success': False, 'stdout': '', 'stderr': stderr, 'returncode': 1}
        monkeypatch.setattr(app_module, 'run_task_command', fake)
    return setup


@pytest.mark.parametrize('verb', ['start', 'done'])
def test_needs_pty_turns_into_run_in_terminal(client, hook_fails_with, verb):
    hook_fails_with(NEEDS_PTY)
    r = client.post(f'/api/task/12/{verb}', headers={'Origin': 'http://localhost'}).get_json()
    assert r['needs_pty'] is True and r['cmd'] == '12 done'


def test_needs_pty_without_cmd_falls_back_to_the_route(client, hook_fails_with):
    hook_fails_with('{"type": "tw_needs_pty", "cmd": ""}')
    r = client.post('/api/task/12/start', headers={'Origin': 'http://localhost'}).get_json()
    assert r['needs_pty'] is True and r['cmd'] == '12 start'


def test_preflight_turns_into_a_confirmation(client, hook_fails_with):
    hook_fails_with(PREFLIGHT)
    r = client.post('/api/run', json={'cmd': 'project:home modify +x'},
                    headers={'Origin': 'http://localhost'}).get_json()
    assert r['preflight'] is True and r['count'] == 7 and r['verb'] == 'modify'


def test_legacy_marker_is_still_recognised(app_module):
    assert app_module.TW_INTERACTIVE_MARKER == 'TW_INTERACTIVE_REQUIRED'


# ── spool ─────────────────────────────────────────────────────────────────────

def test_spool_files_are_drained_once(app_module):
    d = app_module._SPOOL_DIR
    (d / '0001.cmd').write_text("hledger add 2026-10-13 'Buy milk'\n")
    (d / 'ignored.txt').write_text('not a command')
    try:
        assert app_module._drain_spool() == ["hledger add 2026-10-13 'Buy milk'"]
        assert app_module._drain_spool() == []
        assert not (d / '0001.cmd').exists()
    finally:
        (d / 'ignored.txt').unlink(missing_ok=True)
