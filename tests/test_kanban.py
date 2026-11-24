"""Kanban lanes (2026-11-23): dragging a card is one write, POST /api/kanban/move {uuid, to}.

Lanes are values of the `state` UDA, with two special ones by name:
- `started`: moving in sets a start time (an already-started task keeps its own); moving
  out clears it. A task started elsewhere keeps its start in whatever lane it is.
- `done`: the lane shows completed tasks; moving in completes the task, moving a completed
  task out reopens it (status:pending, no end) into the target lane.
These run the real `task` against conftest's throwaway database.
"""
import json

import pytest


def _add(client, description, **attrs):
    r = client.post('/api/task/add', json={'description': description}).get_json()
    assert r['success'], r
    uuid = r['task']['uuid']
    if attrs:
        assert client.put(f'/api/task/{uuid}/modify', json=attrs).get_json()['success']
    return uuid


def _get(client, uuid):
    return client.get(f'/api/task/{uuid}').get_json()


def _move(client, uuid, to):
    return client.post('/api/kanban/move', json={'uuid': uuid, 'to': to}).get_json()


def test_default_lanes_have_started_not_doing(app_module):
    cols = app_module._SETTINGS_SCHEMA['kanban_columns']['default']
    assert 'started' in cols and 'doing' not in cols and 'done' in cols


def test_into_started_sets_start(client):
    u = _add(client, 'kb into started', state='todo')
    r = _move(client, u, 'started')
    assert r['success'], r
    t = _get(client, u)
    assert t['state'] == 'started' and t.get('start')


def test_already_started_keeps_its_start(client):
    u = _add(client, 'kb keeps start', state='todo')
    client.post(f'/api/task/{u}/start')
    before = _get(client, u)['start']
    client.put(f'/api/task/{u}/modify', json={'state': 'todo'})
    assert _move(client, u, 'started')['success']
    assert _get(client, u)['start'] == before


def test_out_of_started_clears_start(client):
    u = _add(client, 'kb out of started', state='todo')
    _move(client, u, 'started')
    assert _move(client, u, 'review')['success']
    t = _get(client, u)
    assert t['state'] == 'review' and 'start' not in t


def test_active_task_in_another_lane_stays_active(client):
    """Started from the List, not in the started lane: moving between other lanes keeps start."""
    u = _add(client, 'kb active elsewhere', state='todo')
    client.post(f'/api/task/{u}/start')
    assert _move(client, u, 'review')['success']
    assert _get(client, u).get('start')


def test_into_done_completes(client):
    u = _add(client, 'kb into done', state='todo')
    assert _move(client, u, 'done')['success']
    t = _get(client, u)
    assert t['status'] == 'completed' and t.get('end')


def test_out_of_done_reopens(client):
    u = _add(client, 'kb out of done', state='todo')
    _move(client, u, 'done')
    assert _move(client, u, 'backlog')['success']
    t = _get(client, u)
    assert t['status'] == 'pending' and 'end' not in t and t['state'] == 'backlog'


def test_out_of_done_into_started(client):
    u = _add(client, 'kb done to started')
    _move(client, u, 'done')
    assert _move(client, u, 'started')['success']
    t = _get(client, u)
    assert t['status'] == 'pending' and t['state'] == 'started' and t.get('start')


def test_to_unassigned_clears_state(client):
    u = _add(client, 'kb unassign', state='todo')
    assert _move(client, u, '')['success']
    assert 'state' not in _get(client, u)


def test_move_rejects_unknown_lane_and_bad_uuid(client):
    u = _add(client, 'kb bad lane')
    assert client.post('/api/kanban/move', json={'uuid': u, 'to': 'nope'}).status_code == 400
    assert client.post('/api/kanban/move', json={'uuid': u, 'to': 'todo rc.hooks=off'}).status_code == 400
    assert client.post('/api/kanban/move', json={'uuid': '1;rm', 'to': 'todo'}).status_code == 400


def test_move_is_one_task_call(client, captured, app_module, monkeypatch):
    monkeypatch.setattr(app_module, '_export_one',
                        lambda u: {'uuid': u, 'status': 'pending', 'state': 'started', 'start': 'x'})
    u = '0' * 8 + '-0000-0000-0000-' + '0' * 12
    client.post('/api/kanban/move', json={'uuid': u, 'to': 'review'})
    writes = [c for c in captured if 'export' not in c]
    assert writes == [['task', u, 'modify', 'state:review', 'start:']]


def test_done_lane_pages_by_end_newest_first(client):
    uuids = []
    for i in range(3):
        u = _add(client, f'kb page {i}')
        client.post(f'/api/task/{u}/done')
        uuids.append(u)
    r = client.get('/api/tasks?status=completed&sort=end&limit=2&offset=0').get_json()
    assert r['success'] and len(r['tasks']) == 2 and r['total'] >= 3
    ends = [t['end'] for t in r['tasks']]
    assert ends == sorted(ends, reverse=True)
    r2 = client.get('/api/tasks?status=completed&sort=end&limit=2&offset=2').get_json()
    assert not {t['uuid'] for t in r['tasks']} & {t['uuid'] for t in r2['tasks']}


def test_saving_one_lane_order_keeps_the_others(client, app_module, tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, '_SETTINGS_PATH', tmp_path / 'settings.json')
    a, b, c = (_add(client, f'kb order {x}') for x in 'abc')
    client.put('/api/kanban/order', json={'col': 'todo', 'order': [a, b]})
    client.put('/api/kanban/order', json={'col': 'review', 'order': [c]})
    order = client.get('/api/kanban/order').get_json()['order']
    assert order == {'todo': [a, b], 'review': [c]}


def test_saving_an_order_trims_tasks_no_longer_pending(client, app_module, tmp_path, monkeypatch):
    """The saved order only grew: every completed or deleted task stayed in it. Each save keeps
    pending tasks only, in every lane (a task outside the context is still pending: kept)."""
    monkeypatch.setattr(app_module, '_SETTINGS_PATH', tmp_path / 'settings.json')
    a, b, c, d = (_add(client, f'kb trim {x}') for x in 'abcd')
    client.put('/api/kanban/order', json={'col': 'review', 'order': [c, d]})
    client.post(f'/api/task/{b}/done')
    client.post(f'/api/task/{d}/done')
    client.put('/api/kanban/order', json={'col': 'todo', 'order': [a, b, 'gone-0000']})
    order = client.get('/api/kanban/order').get_json()['order']
    assert order == {'todo': [a], 'review': [c]}


# ── A task in Started that loses its start time goes to the lane before Started (todo) ──

def test_stop_in_started_moves_to_the_lane_before(client):
    u = _add(client, 'kb stop in started', state='todo')
    _move(client, u, 'started')
    r = client.post(f'/api/task/{u}/stop').get_json()
    assert r['success'], r
    t = _get(client, u)
    assert 'start' not in t and t['state'] == 'todo'


def test_stop_elsewhere_keeps_the_lane(client):
    u = _add(client, 'kb stop in review', state='review')
    client.post(f'/api/task/{u}/start')
    client.post(f'/api/task/{u}/stop')
    assert _get(client, u)['state'] == 'review'


def test_undone_from_started_goes_to_the_lane_before(client):
    """Completing drops the start time; reverting must not leave a stopped task in Started."""
    u = _add(client, 'kb revert from started', state='todo')
    _move(client, u, 'started')
    client.post(f'/api/task/{u}/done')
    r = client.post(f'/api/task/{u}/revert').get_json()
    assert r['success'], r
    t = _get(client, u)
    assert t['status'] == 'pending' and t['state'] == 'todo' and 'start' not in t
