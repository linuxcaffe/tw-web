"""/api/tasks/dated: the tasks the Agenda and Calendar place (tw:docs/tw-web-edate-plan.md, step 2).

A task with any of scheduled, due, wait or until; the page picks its one date (TW.edate). Under
the Pending status the read also takes waiting tasks: they're hidden on the List, but the Agenda
and Calendar answer "what's coming up?" (djp 2026-11-23). In 2.6.2 a waiting task is stored as
pending, yet `status:pending` leaves it out, so the read asks for `status:waiting` too.
"""
import os
import subprocess
import uuid

import pytest

CTX = 'project:work'
BASE = ['task', 'rc.context=none']
DATED = ['(', 'scheduled.any:', 'or', 'due.any:', 'or', 'wait.any:', 'or', 'until.any:', ')', 'export']


@pytest.fixture
def work_context(app_module, monkeypatch):
    monkeypatch.setattr(app_module, '_get_context_filters', lambda: {'work': CTX})


def test_pending_takes_waiting_too(client, captured, work_context):
    client.get('/api/tasks/dated?status=pending&context=work')
    assert captured[-1] == BASE + ['(', CTX, ')', '(', 'status:pending', 'or', 'status:waiting', ')'] + DATED


def test_default_status_is_pending_with_waiting(client, captured):
    client.get('/api/tasks/dated')
    assert captured[-1] == BASE + ['(', 'status:pending', 'or', 'status:waiting', ')'] + DATED


@pytest.mark.parametrize('status,terms', [
    ('completed', ['status:completed']),
    ('deleted',   ['status:deleted']),
    ('waiting',   ['status:waiting']),
    ('pending,waiting', ['(', 'status:pending', 'or', 'status:waiting', ')']),
])
def test_other_statuses_unchanged(client, captured, status, terms):
    client.get('/api/tasks/dated?status=' + status)
    assert captured[-1] == BASE + terms + DATED


def test_raw_filter_replaces_status(client, captured):
    client.get('/api/tasks/dated?status=pending&rawfilter=project:work%20or%20%2Bx')
    assert captured[-1] == BASE + ['(', 'project:work', 'or', '+x', ')'] + DATED


def test_unparseable_raw_filter_is_refused(client, captured):
    r = client.get('/api/tasks/dated?rawfilter=%22unclosed')
    assert r.status_code == 400 and not captured


def _task(*args):
    return subprocess.run(['task', 'rc.confirmation=no', 'rc.verbose=nothing', *args],
                          capture_output=True, text=True, env=os.environ, timeout=15, check=True)


def test_real_task_returns_every_dated_kind_and_the_waiting_one(client):
    # Against the scratch database (conftest): each kind once, one undated, one waiting
    tag = 'dated' + uuid.uuid4().hex[:8]
    _task('add', '+' + tag, 'scheduled:tomorrow', '--', 'k-sched')
    _task('add', '+' + tag, 'due:tomorrow', '--', 'k-due')
    _task('add', '+' + tag, 'wait:tomorrow', '--', 'k-wait')        # waiting until tomorrow
    _task('add', '+' + tag, 'until:tomorrow', '--', 'k-until')
    _task('add', '+' + tag, '--', 'k-none')
    d = client.get('/api/tasks/dated?status=pending').get_json()
    assert d['success']
    mine = sorted(t['description'] for t in d['data'] if tag in (t.get('tags') or []))
    assert mine == ['k-due', 'k-sched', 'k-until', 'k-wait']
    # The List's own read still hides the waiting task
    listed = client.get('/api/tasks?status=pending').get_json()
    names = {t['description'] for t in listed.get('tasks') or listed.get('data') or [] if tag in (t.get('tags') or [])}
    assert 'k-wait' not in names and 'k-sched' in names
