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
