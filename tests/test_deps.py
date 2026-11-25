"""The editor's deps field on an edit (djp 2026-11-24 review).

- 2.6.2's `modify depends:X` adds to the list (verified: depends:2,3 then depends:4 leaves 2,3,4),
  so the field's list was never set: removing a dependency in the dialog did nothing. The modify
  route clears and sets in one modify (`depends: depends:<list>`), which leaves exactly the list.
- `-ID` (this task blocks ID) worked only when adding; an edit dropped it silently. Now an edit
  adds this task to ID's depends too, checked first (exists, pending, not this task)."""
import json

OWN = {'id': 1, 'uuid': 'own-uuid-1', 'status': 'pending', 'description': 'step'}
PARENT = {'id': 12, 'uuid': 'parent-uuid-12', 'status': 'pending', 'description': 'goal',
          'depends': ['other-uuid']}


def fake_task(app_module, monkeypatch, tasks=None, fail_modify_of=None):
    """`task <ref> export` answers from tasks (by id or uuid); writes are recorded."""
    tasks = tasks if tasks is not None else [OWN, PARENT]
    writes = []
    def run(args, readonly=False, **k):
        if args[-1] == 'export':
            ref = args[1]
            found = [t for t in tasks if ref in (str(t['id']), t['uuid'])]
            return {'success': True, 'stdout': json.dumps(found), 'stderr': '', 'returncode': 0}
        writes.append(list(args))
        if fail_modify_of and args[1] == fail_modify_of:
            return {'success': False, 'stdout': '', 'stderr': 'Circular dependency detected and disallowed.',
                    'returncode': 1}
        return {'success': True, 'stdout': '', 'stderr': '', 'returncode': 0}
    monkeypatch.setattr(app_module, 'run_task_command', run)
    return writes


def put(client, body):
    return client.put('/api/task/1/modify', json=body)


def test_a_deps_list_replaces_the_old_one(client, app_module, monkeypatch):
    writes = fake_task(app_module, monkeypatch)
    put(client, {'depends': '42'})
    args = writes[0]
    assert args[:3] == ['task', '1', 'modify']
    i = args.index('depends:')
    assert args[i + 1] == 'depends:42'            # cleared, then set: exactly 42
    assert args.count('depends:') == 1


def test_an_empty_deps_field_clears(client, app_module, monkeypatch):
    writes = fake_task(app_module, monkeypatch)
    put(client, {'depends': ''})
    assert [a for a in writes[0] if a.startswith('depends')] == ['depends:']


def test_minus_id_on_an_edit_makes_that_task_wait_for_this_one(client, app_module, monkeypatch):
    writes = fake_task(app_module, monkeypatch)
    body = put(client, {'depends': '', 'parent_id': 12}).get_json()
    assert body['success'], body
    assert ['task', 'parent-uuid-12', 'modify', 'depends:own-uuid-1'] in writes


def test_minus_id_alone_is_a_change(client, app_module, monkeypatch):
    writes = fake_task(app_module, monkeypatch)
    body = put(client, {'parent_id': 12}).get_json()
    assert body['success'] and body.get('message') != 'No changes to apply', body
    assert writes == [['task', 'parent-uuid-12', 'modify', 'depends:own-uuid-1']]


def test_minus_own_id_is_refused_before_any_write(client, app_module, monkeypatch):
    writes = fake_task(app_module, monkeypatch)
    r = put(client, {'description': 'x', 'parent_id': 1})
    assert r.status_code == 400 and 'itself' in r.get_json()['error']
    assert writes == []


def test_minus_id_of_a_missing_or_closed_task_is_refused_before_any_write(client, app_module, monkeypatch):
    writes = fake_task(app_module, monkeypatch, [OWN, dict(PARENT, status='completed')])
    r = put(client, {'description': 'x', 'parent_id': 12})
    assert r.status_code == 400 and 'completed' in r.get_json()['error']
    r = put(client, {'description': 'x', 'parent_id': 99})
    assert r.status_code == 400 and 'not found' in r.get_json()['error']
    assert writes == []


def test_a_refused_link_comes_back_as_a_warning(client, app_module, monkeypatch):
    fake_task(app_module, monkeypatch, fail_modify_of='parent-uuid-12')
    body = put(client, {'description': 'x', 'parent_id': 12}).get_json()
    assert body['success']                        # the edit itself was saved
    assert any('12' in w and 'Circular' in w for w in body['warnings']), body['warnings']
