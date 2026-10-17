"""The three task-list reads build their filter one way (_task_filter_args).

Known bugs 5, 6 and 13 (tw:docs/tw-web-known-bugs.md): /api/tasks/planned and /api/tasks/due
dropped the raw filter; and reads that use a report (`count`, `projects`) silently applied the
CLI's active context, which tw-web never shows. In 2.6.2 `export` ignores the active context,
but `count` and the `projects` report apply it, so every read says rc.context=none and takes
its context only from the nav bar's `context=` parameter.
"""
import pytest

CTX = 'project:work'
BASE = ['task', 'rc.context=none']


@pytest.fixture
def work_context(app_module, monkeypatch):
    monkeypatch.setattr(app_module, '_get_context_filters', lambda: {'work': CTX})


@pytest.mark.parametrize('url,tail', [
    ('/api/tasks',         ['export']),
    ('/api/tasks/planned', ['scheduled.not:', 'export']),
    ('/api/tasks/due',     ['due.any:', 'scheduled.none:', 'export']),
])
def test_status_and_context(client, captured, work_context, url, tail):
    client.get(url + '?status=pending&context=work')
    assert captured[-1] == BASE + ['(', CTX, ')', 'status:pending'] + tail


@pytest.mark.parametrize('url,tail', [
    ('/api/tasks',         ['export']),
    ('/api/tasks/planned', ['scheduled.not:', 'export']),
    ('/api/tasks/due',     ['due.any:', 'scheduled.none:', 'export']),
])
def test_raw_filter_is_one_parenthesised_term(client, captured, url, tail):
    # Wrapped, so `a or b` can't swallow the route's own terms ('and' binds tighter than 'or').
    client.get(url + '?status=completed&context=work&rawfilter=project:work%20or%20%2Bx')
    assert captured[-1] == BASE + ['(', 'project:work', 'or', '+x', ')'] + tail


@pytest.mark.parametrize('url', ['/api/tasks', '/api/tasks/planned', '/api/tasks/due'])
def test_unparseable_raw_filter_is_refused(client, captured, url):
    r = client.get(url + '?rawfilter=%22unclosed')
    assert r.status_code == 400 and not captured


@pytest.mark.parametrize('url', [
    '/api/tasks', '/api/tasks/planned', '/api/tasks/due', '/api/projects', '/api/projects?active=1',
    '/api/tags', '/api/tags?all=1', '/api/health', '/api/stats', '/api/vtags?match=DUE',
])
def test_reads_never_use_the_cli_context(client, captured, url):
    client.get(url)
    reads = [c for c in captured if c[1] not in ('_show', '_get', '_version')]
    assert reads, url
    for c in reads:
        assert 'rc.context=none' in c, (url, c)


def test_context_expression_is_split_like_task_splits_it(client, captured, app_module, monkeypatch):
    # One argument holding `a or b` matched nothing for contexts with quotes (live, 2026-10-15:
    # 'personal' gave 0 tasks, task's own context 9). Split, it matches task's own count.
    expr = "description.has:'(djp|lena)' or project:friend"
    monkeypatch.setattr(app_module, '_get_context_filters', lambda: {'personal': expr})
    client.get('/api/tasks?status=pending&context=personal')
    assert captured[-1] == BASE + ['(', 'description.has:(djp|lena)', 'or', 'project:friend', ')',
                                   'status:pending', 'export']
