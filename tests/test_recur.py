"""The editor's recur line (recurrence-overhaul): add and modify pass r, type and rend, and a
template's relative dates (rwait, runtil, rscheduled), to `task` as attributes before `--`.
The hook decides what's valid; its messages come back without Taskwarrior's override notices."""


def task_args(calls, verb):
    return next(c for c in calls if verb in c)


def test_add_passes_the_recurrence_before_the_description(client, captured):
    client.post('/api/task/add', json={'description': 'rent', 'due': '2030-01-31T00:00:00',
                                       'r': 'm:1 | m:last-fri', 'type': 'chain', 'rend': '2030-06-01T00:00:00'})
    args = task_args(captured, 'add')
    end = args.index('--')
    for a in ('r:m:1 | m:last-fri', 'type:chain', 'rend:2030-06-01T00:00:00'):
        assert args.index(a) < end            # one argument each, before --
    assert args[end + 1:] == ['rent']


def test_add_without_r_sends_no_recurrence(client, captured):
    client.post('/api/task/add', json={'description': 'plain', 'r': '', 'rend': ''})
    args = task_args(captured, 'add')
    assert not [a for a in args if a.startswith(('r:', 'type:', 'rend:'))]


def test_modify_sets_and_clears_the_recurrence_fields(client, captured):
    client.put('/api/task/1/modify', json={'r': '2w', 'type': 'period', 'rend': '',
                                           'rwait': 'due-604800s', 'runtil': '', 'rscheduled': 'due-7200s'})
    args = task_args(captured, 'modify')
    for a in ('r:2w', 'type:period', 'rend:', 'rwait:due-604800s', 'runtil:', 'rscheduled:due-7200s'):
        assert a in args


def test_modify_sends_only_what_it_is_given(client, captured):
    client.put('/api/task/1/modify', json={'priority': 'H'})
    args = task_args(captured, 'modify')
    assert not [a for a in args if a.startswith(('r:', 'type:', 'rend:', 'rwait:', 'runtil:', 'rscheduled:'))]


def fake_result(app_module, monkeypatch, success, stderr):
    def fake(args, readonly=False, extra_overrides=None, extra_env=None):
        if 'export' in args:
            return {'success': True, 'stdout': '[{"uuid": "u1", "id": 1}]', 'stderr': ''}
        return {'success': success, 'stdout': '', 'stderr': stderr, 'returncode': 0 if success else 1}
    monkeypatch.setattr(app_module, 'run_task_command', fake)


NOTE = ('TASKRC override: /tmp/x\nConfiguration override rc.confirmation=no\n'
        'Non-recurrence fields changed: priority\nTo apply to template (future instances):\n'
        'task 1 mod priority:H\n')


def test_a_hooks_note_comes_back_without_override_notices(client, app_module, monkeypatch):
    fake_result(app_module, monkeypatch, True, NOTE)
    body = client.put('/api/task/1/modify', json={'priority': 'H'}).get_json()
    assert body['warnings'] == ['Non-recurrence fields changed: priority',
                                'To apply to template (future instances):', 'task 1 mod priority:H']


def test_a_hooks_refusal_comes_back_without_override_notices(client, app_module, monkeypatch):
    fake_result(app_module, monkeypatch, False,
                'TASKRC override: /tmp/x\nERROR: a chained template (ty:c) takes no until:\n'
                '  each expired instance would spawn the next; use rend: to stop the chain\n')
    body = client.post('/api/task/add', json={'description': 'gym', 'r': '2d', 'type': 'chain'}).get_json()
    assert not body['success']
    assert body['error'].startswith('ERROR: a chained template')
    assert 'override' not in body['error'] and 'use rend:' in body['error']


def test_the_recur_button_lists_live_templates_only(app_module, monkeypatch):
    # 2026-10-23: a deleted template keeps its r, so `r.any:` listed it under Recur as a ghost.
    # A live template is status:recurring; a deleted or completed one isn't.
    class Shown:
        stdout = 'recurrence.field=r\n'
    monkeypatch.setattr(app_module.subprocess, 'run', lambda *a, **k: Shown)
    assert app_module._get_recurrence_filter() == 'status:recurring'


def test_native_recurrence_keeps_the_virtual_tag(app_module, monkeypatch):
    class Shown:
        stdout = 'recurrence.field=recur\n'
    monkeypatch.setattr(app_module.subprocess, 'run', lambda *a, **k: Shown)
    assert app_module._get_recurrence_filter() == '+RECURRING'


# A station without recurrence-overhaul (s5 runs a few hooks of its own, hooks.location) stores r
# as a plain field and makes no template (task 123, 2026-11-24). Recurring tasks are made on a
# station that runs the hook (djp: "keep recurrence on yoga only"); tw-web says so, never blocks.

def _station(app_module, monkeypatch, tmp_path, hooks=(), name='s5'):
    d = tmp_path / 'hooks.d'
    d.mkdir()
    for h in hooks:
        (d / h).write_text('#!/bin/sh\n')
        (d / h).chmod(0o755)
    calls = []
    def run(args, readonly=False, **k):
        calls.append(args)
        if args[1:] == ['_get', 'rc.hooks.location']:
            out = str(d)
        elif args[1:] == ['_get', 'rc.gittw.device']:
            out = name
        elif 'export' in args:
            out = '[{"uuid": "u1", "id": 1}]'
        else:
            out = ''
        return {'success': True, 'stdout': out + '\n', 'stderr': '', 'returncode': 0}
    monkeypatch.setattr(app_module, 'run_task_command', run)
    return calls


RECUR_HOOKS = ('on-add_recurrence.py', 'on-modify_recurrence.py')
LOCAL = {'Host': 'localhost:5000'}


def test_station_says_whether_it_runs_the_recurrence_hook(client, app_module, monkeypatch, tmp_path):
    _station(app_module, monkeypatch, tmp_path, hooks=('on-add_need-priority.py',))
    assert client.get('/api/station', headers=LOCAL).get_json() == {'station': 's5', 'recurrence': False}


def test_a_station_with_the_hook_runs_recurrence(client, app_module, monkeypatch, tmp_path):
    _station(app_module, monkeypatch, tmp_path, hooks=RECUR_HOOKS, name='yoga')
    assert client.get('/api/station', headers=LOCAL).get_json() == {'station': 'yoga', 'recurrence': True}


def test_a_hook_that_cannot_run_does_not_count(client, app_module, monkeypatch, tmp_path):
    _station(app_module, monkeypatch, tmp_path, hooks=RECUR_HOOKS)
    (tmp_path / 'hooks.d' / 'on-modify_recurrence.py').chmod(0o644)
    assert client.get('/api/station', headers=LOCAL).get_json()['recurrence'] is False


def test_add_with_r_without_the_hook_warns(client, app_module, monkeypatch, tmp_path):
    _station(app_module, monkeypatch, tmp_path)
    body = client.post('/api/task/add', json={'description': 'pay', 'due': '2030-01-31T00:00:00',
                                              'r': '1mo'}).get_json()
    assert body['success']
    assert any('s5' in w and 'recurrence' in w for w in body['warnings']), body['warnings']


def test_add_with_r_and_the_hook_does_not_warn(client, app_module, monkeypatch, tmp_path):
    _station(app_module, monkeypatch, tmp_path, hooks=RECUR_HOOKS)
    body = client.post('/api/task/add', json={'description': 'pay', 'r': '1mo'}).get_json()
    assert not any('recurrence' in w for w in body['warnings'] or [])


def test_modify_setting_r_without_the_hook_warns_clearing_does_not(client, app_module, monkeypatch, tmp_path):
    _station(app_module, monkeypatch, tmp_path)
    body = client.put('/api/task/1/modify', json={'r': '1mo'}).get_json()
    assert any('recurrence' in w for w in body['warnings']), body['warnings']
    body = client.put('/api/task/1/modify', json={'r': ''}).get_json()
    assert not any('recurrence' in w for w in body['warnings'] or [])
