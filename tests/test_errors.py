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
