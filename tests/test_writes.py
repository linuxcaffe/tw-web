"""Write routes return the task as it now is, so a page can redraw it without refetching.

Known bug 7 (tw:docs/tw-web-known-bugs.md): start and stop returned no task, so the List
re-rendered its old copy and the card kept offering Start. These run the real `task`
against the throwaway database from conftest.py.
"""


def _add(client, description):
    r = client.post('/api/task/add', json={'description': description}).get_json()
    assert r['success'], r
    return r['task']['uuid']


def test_start_returns_the_started_task(client):
    uuid = _add(client, 'write-route start')
    r = client.post(f'/api/task/{uuid}/start').get_json()
    assert r['success'] and r['task']['uuid'] == uuid and r['task'].get('start')


def test_stop_returns_the_stopped_task(client):
    uuid = _add(client, 'write-route stop')
    client.post(f'/api/task/{uuid}/start')
    r = client.post(f'/api/task/{uuid}/stop').get_json()
    assert r['success'] and r['task']['uuid'] == uuid and 'start' not in r['task']
