"""api/help: the index, pages by name only (never a path from the request), and the
Commands list parsed from `task commands`. Plan: tw:docs/tw-web-help-plan.md, step 2."""
import pytest

SAMPLE = '''Command          Category  R/W ID GC Context Filter Mods Misc Description
---------------- --------- --- -- -- ------- ------ ---- ---- ----------------------------------
_aliases         internal   RO                                Generates a list of all aliases
add              operation  RW     GC   Yes            Yes    Adds a new task
                                                              to the list
burndown.daily   graphs     RO  ID      Yes     Yes           Shows a graphical burndown chart, by day
next             report     RO  ID GC   Yes     Yes           Most urgent tasks
'''


def test_index_lists_the_four_tabs(client):
    d = client.get('/api/help').get_json()
    assert d['success']
    assert set(d['tabs']) == {'keys', 'tw-web', 'commands', 'taskwarrior'}
    names = {p['name'] for p in d['tabs']['taskwarrior']}
    assert {'filter', 'context', 'udas'} <= names
    assert 'add' in {p['name'] for p in d['tabs']['commands']}
    assert [p['name'] for p in d['tabs']['keys']] == ['keys']
    filt = next(p for p in d['tabs']['taskwarrior'] if p['name'] == 'filter')
    assert filt['title'] == 'Filters' and filt['category'] == 'Basic Usage'
    assert 'path' not in filt
    assert d['categories']['taskwarrior'][0] == 'Getting Started'


def test_page_has_markdown_without_front_matter(client):
    d = client.get('/api/help/page/taskwarrior/filter').get_json()
    assert d['success'] and d['title'] == 'Filters'
    assert d['markdown'].startswith('# Filters')
    d = client.get('/api/help/page/commands/_get').get_json()
    assert d['success'] and '_get' in d['markdown']
    assert client.get('/api/help/page/keys/keys').get_json()['success']


@pytest.mark.parametrize('url', [
    '/api/help/page/taskwarrior/nope',
    '/api/help/page/nope/filter',
    '/api/help/page/taskwarrior/..%2F..%2Fapp',
    '/api/help/page/taskwarrior/../../app.py',
    '/api/help/page/keys/filter',              # a page of another tab
    '/api/help/page/commands/filter',
    '/api/help/page/taskwarrior/SOURCE',
    '/api/help/page/taskwarrior/Filter',
])
def test_unknown_or_outside_pages_are_404(client, url):
    r = client.get(url)
    assert r.status_code == 404
    assert b'"success"' not in r.data or not r.get_json()['success']


def test_parse_task_commands(app_module):
    rows = app_module._parse_task_commands(SAMPLE)
    assert [r['command'] for r in rows] == ['_aliases', 'add', 'burndown.daily', 'next']
    add = rows[1]
    assert add['category'] == 'operation'
    assert add['description'] == 'Adds a new task to the list'
    assert rows[2]['category'] == 'graphs'


def test_commands_route_reads_task_commands(client, app_module, monkeypatch):
    calls = []

    def fake(args, readonly=False, extra_overrides=None, extra_env=None):
        calls.append((list(args), readonly))
        return {'success': True, 'stdout': SAMPLE, 'stderr': ''}
    monkeypatch.setattr(app_module, 'run_task_command', fake)
    monkeypatch.setattr(app_module, '_help_commands_ts', 0.0)
    d = client.get('/api/help/commands').get_json()
    assert d['success'] and len(d['commands']) == 4
    args, readonly = calls[0]
    assert readonly and args[-1] == 'commands' and 'rc.context=none' in args
