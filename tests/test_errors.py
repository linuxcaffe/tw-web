"""When `task` itself fails, the views show Taskwarrior's reason, not just "Failed to retrieve tasks".
(2026-10-13: after `tw -r daily-email` left a dangling include, every view said only that.)"""
import pytest

STDERR = "Could not read include file '/home/u/.task/config/daily-email.rc'.\n"


@pytest.fixture
def task_fails(app_module, monkeypatch):
    def fake(args, readonly=False, extra_overrides=None, extra_env=None):
        return {'success': False, 'stdout': '', 'stderr': 'TASKRC override: x\n' + STDERR, 'returncode': 2}
    monkeypatch.setattr(app_module, 'run_task_command', fake)


@pytest.mark.parametrize('url', ['/api/tasks', '/api/tasks/due', '/api/tasks/planned'])
def test_list_errors_carry_the_reason(client, task_fails, url):
    r = client.get(url)
    body = r.get_json()
    assert r.status_code == 500 and body['success'] is False
    assert body['error'].startswith('Failed to retrieve')
    assert "Could not read include file '/home/u/.task/config/daily-email.rc'." in body['error']
    assert 'TASKRC override' not in body['error']


def test_reason_helper_without_stderr(app_module):
    assert app_module._task_error('Failed to retrieve tasks', {'stderr': ''}) == 'Failed to retrieve tasks'


# ── H3: command.debug only in developer mode ─────────────────────────────────

def _fake_run(*a, **k):
    import subprocess
    return subprocess.CompletedProcess(a[0], 0, '[]', '')


def test_commands_are_not_logged_normally(app_module, monkeypatch, tmp_path):
    log = tmp_path / 'command.debug'
    monkeypatch.setattr(app_module, 'DEBUG_FILE', str(log))
    monkeypatch.setattr(app_module, 'DEVELOPER_MODE', False)
    monkeypatch.setattr(app_module.subprocess, 'run', _fake_run)
    app_module.run_task_command(['task', 'add', '--', 'private description'])
    assert not log.exists()


def test_developer_mode_logs_instead_of_running(app_module, monkeypatch, tmp_path):
    log = tmp_path / 'command.debug'
    monkeypatch.setattr(app_module, 'DEBUG_FILE', str(log))
    monkeypatch.setattr(app_module, 'DEVELOPER_MODE', True)
    out = app_module.run_task_command(['task', '12', 'done'])
    assert out['success'] and '[DEV MODE]' in out['stdout']
    assert 'task rc.confirmation=no 12 done' in log.read_text()
