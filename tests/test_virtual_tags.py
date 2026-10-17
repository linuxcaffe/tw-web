"""Virtual tags (+DUE, +OVERDUE, -BLOCKED…) in the nav bar's tags input.

They aren't in the export, so the page can't see them: /api/vtags asks task which tasks have
each one (`+TAG _uuids`), and TW.filter matches the uuids. The list is `man task`'s for 2.6.2,
plus DUETODAY, which the binary accepts but the man page doesn't list. NEXT, NOCOLOR and
RECURRING were in tw-web's old list but are real tags in 2.6.2, so a +NEXT tag was hidden.
"""
import json
import os
import subprocess

MAN_PAGE = {
    'ACTIVE', 'ANNOTATED', 'BLOCKED', 'BLOCKING', 'CHILD', 'COMPLETED', 'DELETED', 'DUE',
    'INSTANCE', 'LATEST', 'MONTH', 'ORPHAN', 'OVERDUE', 'PARENT', 'PENDING', 'PRIORITY',
    'PROJECT', 'QUARTER', 'READY', 'SCHEDULED', 'TAGGED', 'TEMPLATE', 'TODAY', 'TOMORROW',
    'UDA', 'UNBLOCKED', 'UNTIL', 'WAITING', 'WEEK', 'YEAR', 'YESTERDAY',
}


def _task(*args):
    return subprocess.run(['task', 'rc.confirmation=no', *args], capture_output=True, text=True,
                          env=os.environ, timeout=15)


def test_list_is_the_man_page_plus_duetoday(app_module):
    assert set(app_module.TW_VIRTUAL_TAG_HELP) == MAN_PAGE
    assert app_module.TW_VIRTUAL_TAGS == MAN_PAGE | {'DUETODAY'}


def test_list_is_what_task_knows(app_module):
    # `task _tags` lists the virtual tags, then the special lower-case ones (next, nocolor…)
    out = _task('_tags').stdout.split()
    assert {t for t in out if t.isupper()} == app_module.TW_VIRTUAL_TAGS


def test_names_with_descriptions(client, captured):
    d = client.get('/api/vtags').get_json()
    assert d['success'] and not captured
    by = {t['name']: t for t in d['tags']}
    assert set(by) == MAN_PAGE
    assert set(d['names']) == MAN_PAGE | {'DUETODAY'}   # every name TW.filter treats as virtual
    assert by['OVERDUE']['description'] == 'Matches if the task is overdue'
    assert by['CHILD']['deprecated'] and not by['DUE']['deprecated']
    assert 'uuids' not in d


def test_match_asks_task_once_per_known_tag(client, app_module, monkeypatch):
    calls = []
    def fake(args, readonly=False, **kw):
        calls.append((list(args), readonly))
        return {'success': True, 'stdout': 'u1\nu2\n', 'stderr': ''}
    monkeypatch.setattr(app_module, 'run_task_command', fake)
    d = client.get('/api/vtags?match=DUE,bogus,DUE,%2Bx,DUETODAY').get_json()
    assert calls == [(['task', 'rc.context=none', '+DUE', '_uuids'], True),
                     (['task', 'rc.context=none', '+DUETODAY', '_uuids'], True)]
    assert d['uuids'] == {'DUE': ['u1', 'u2'], 'DUETODAY': ['u1', 'u2']}


def test_match_failure_is_an_error(client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, 'run_task_command',
                        lambda args, **kw: {'success': False, 'stdout': '', 'stderr': 'boom',
                                            'returncode': 1})
    r = client.get('/api/vtags?match=DUE')
    assert r.status_code == 500 and not r.get_json()['success']


def test_match_against_task(client):
    def add(*a):
        _task('add', *a)
        return json.loads(_task('+LATEST', 'export').stdout)[0]['uuid']
    late = add('vt late', 'due:yesterday')
    plain = add('vt plain')
    got = client.get('/api/vtags?match=OVERDUE,LATEST').get_json()['uuids']
    assert late in got['OVERDUE'] and plain not in got['OVERDUE']
    assert got['LATEST'] == [plain]


def test_all_tags_keeps_a_real_next_tag(client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, 'run_task_command',
                        lambda args, **kw: {'success': True, 'stdout': 'DUE\nNEXT\nhome\nWAITING\n',
                                            'stderr': ''})
    assert client.get('/api/tags?all=1').get_json()['tags'] == ['NEXT', 'home']
