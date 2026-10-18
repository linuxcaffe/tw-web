"""Tag names 2.6.2 won't read as a `+tag`/`-tag` term (`$-13`, `a-b`, `1x`, `a:b` …).

The modify route sent `-$-13` to remove such a tag. 2.6.2 took it for description words, and bare
words in `modify` replace the description, even after a `description:` argument: the task's
description became "-$-13" and the tag stayed, so every later save did it again. Adding one did
the same (`+a-b` appended to the description on add, replaced it on modify). Those names now go
as one whole-list `tags:` attribute, which 2.6.2 takes for any name. These run the real `task`
against the throwaway database from conftest.py.
"""
import json
import subprocess

import pytest

ODD = ['$-13', 'a-b', '1x', 'a:b', 'x(y']


def _add(client, description, tags=None):
    body = {'description': description}
    if tags is not None:
        body['tags'] = tags
    r = client.post('/api/task/add', json=body).get_json()
    assert r['success'], r
    return r['task']


def _modify(client, uuid, body):
    r = client.put(f'/api/task/{uuid}/modify', json=body)
    return r.status_code, r.get_json()


def _get(client, uuid):
    return client.get(f'/api/task/{uuid}').get_json()


@pytest.mark.parametrize('tag', ODD)
def test_add_with_an_odd_tag_keeps_the_description(client, tag):
    t = _add(client, 'odd add', ['keep', tag])
    assert t['description'] == 'odd add'
    assert sorted(t['tags']) == sorted(['keep', tag])


@pytest.mark.parametrize('tag', ODD)
def test_removing_an_odd_tag_keeps_the_description(client, tag):
    uuid = _add(client, 'register pulltrainer.com', ['domain', tag])['uuid']
    code, r = _modify(client, uuid, {'tags_remove': [tag], 'tags_add': ['flagged']})
    assert code == 200 and r['success'], r
    t = _get(client, uuid)
    assert t['description'] == 'register pulltrainer.com'
    assert sorted(t['tags']) == ['domain', 'flagged']


def test_odd_tag_and_new_description_both_apply(client):
    uuid = _add(client, 'old name', ['keep'])['uuid']
    code, r = _modify(client, uuid, {'description': 'new name', 'tags_add': ['a-b']})
    assert code == 200 and r['success'], r
    t = _get(client, uuid)
    assert t['description'] == 'new name' and sorted(t['tags']) == ['a-b', 'keep']


def test_removing_the_last_odd_tag_leaves_none(client):
    uuid = _add(client, 'only odd', ['a-b'])['uuid']
    code, r = _modify(client, uuid, {'tags_remove': ['a-b']})
    assert code == 200 and r['success'], r
    t = _get(client, uuid)
    assert t['description'] == 'only odd' and not t.get('tags')


def test_log_with_an_odd_tag(client):
    r = client.post('/api/task/log', json={'description': 'odd log', 'tags': ['a-b']}).get_json()
    assert r['success'], r
    out = subprocess.run(['task', 'rc.verbose=nothing', 'status:completed', 'export'],
                         capture_output=True, text=True).stdout
    t = next(t for t in json.loads(out) if 'odd log' in t['description'])
    assert t['description'] == 'odd log' and t['tags'] == ['a-b']


def test_plain_tags_still_go_as_plus_minus(client, captured):
    client.put('/api/task/1/modify', json={'tags_add': ['work'], 'tags_remove': ['home']})
    assert captured[0] == ['task', '1', 'modify', '-home', '+work']


def test_bookmark_with_an_odd_tag(client, captured):
    client.post('/api/bookmark', json={'title': 'T', 'url': 'https://example.org', 'tags': 'a-b keep'})
    add = next(c for c in captured if c[:2] == ['task', 'add'])
    assert 'tags:bkmk,a-b,keep' in add and '+a-b' not in add


@pytest.mark.parametrize('tag', ['a b', 'a,b', 'a"b'])
def test_a_tag_task_cannot_hold_is_refused(client, captured, tag):
    r = client.post('/api/task/add', json={'description': 'x', 'tags': [tag]})
    assert r.status_code == 400 and not r.get_json()['success']
    r = client.put('/api/task/1/modify', json={'tags_add': [tag]})
    assert r.status_code == 400 and not r.get_json()['success']
    assert not captured
