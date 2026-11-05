"""tw-nb-interop M7, step 3 (djp 2026-11-04): a task's note when nb-web doesn't answer.

tw-web opens an `nb:` link in nb-web when it's up; else, from the note file on this device:
termux-open (Android hands it to Documents) or tw-web's own read-only view. The two endpoints
read only notes in the tasknotes notebook, never a dotfile, an encrypted note, or a path out of
it: tw-web has no login and may listen on Tailscale.

GET  /api/nb/note?value=<annotation value>   the note's text, read-only
POST /api/nb/open  {value}                   termux-open on the note file (Android)
"""
import pytest

NOTE = '---\ntype: task\ntw: 0badc0de-1234-4abc-8def-0123456789ab\ntitle: Retile\n---\n# Retile\n\nGrout: grey.\n'


@pytest.fixture
def notes(app_module, tmp_path, monkeypatch):
    nb = tmp_path / 'nb'
    tn = nb / 'tasknotes'
    (tn / 'legal').mkdir(parents=True)
    (tn / 'retile-0badc0de.note.md').write_text(NOTE)
    (tn / 'legal' / 'call-00f04687.note.md').write_text('# Call\n')
    (tn / '.tasknotes.md').write_text('---\naccess: djp\n---\n')
    (tn / 'secret.md.enc').write_bytes(b'\x00enc')
    (nb / 'djp').mkdir()
    (nb / 'djp' / 'private.md').write_text('# mine\n')
    monkeypatch.setenv('NB_DIR', str(nb))
    return tn


def read(client, value):
    return client.get('/api/nb/note', query_string={'value': value})


@pytest.mark.parametrize('value, name', [
    ('tasknotes:retile-0badc0de.note.md', 'retile-0badc0de.note.md'),
    ('tasknotes:legal/call-00f04687.note.md', 'call-00f04687.note.md'),
    ('retile-0badc0de.note.md', 'retile-0badc0de.note.md'),          # bare: tasknotes (M1)
    ('retile-0badc0de.note', 'retile-0badc0de.note.md'),             # without .md, as nb allows
])
def test_reads_a_task_note(client, notes, value, name):
    r = read(client, value)
    assert r.status_code == 200
    d = r.get_json()
    assert d['name'] == name and d['text'].startswith(('---', '# '))
    assert d['selector'].startswith('tasknotes:')


@pytest.mark.parametrize('value', [
    'djp:private.md',                         # another notebook
    'tasknotes:../djp/private.md',            # out of it
    'tasknotes:/etc/passwd',
    'tasknotes:.tasknotes.md',                # a dotfile (config)
    'tasknotes:secret.md.enc',                # encrypted
    'tasknotes:legal',                        # a folder
    'tasknotes:missing.md',
    'tasks:5',                                # a numeric id needs nb itself
    '',
])
def test_refuses_anything_else(client, notes, value):
    r = read(client, value)
    assert r.status_code in (400, 403, 404)
    assert 'text' not in r.get_json()


def test_open_runs_termux_open_on_the_file(client, notes, app_module, monkeypatch):
    calls = []
    monkeypatch.setattr(app_module.shutil, 'which', lambda name: '/bin/termux-open' if name == 'termux-open' else None)
    monkeypatch.setattr(app_module.subprocess, 'Popen', lambda argv, **k: calls.append(argv))
    r = client.post('/api/nb/open', json={'value': 'tasknotes:retile-0badc0de.note.md'})
    assert r.status_code == 200 and r.get_json()['success']
    assert calls == [['termux-open', str(notes / 'retile-0badc0de.note.md')]]


def test_open_without_termux_open_says_so(client, notes, app_module, monkeypatch):
    monkeypatch.setattr(app_module.shutil, 'which', lambda name: None)
    r = client.post('/api/nb/open', json={'value': 'tasknotes:retile-0badc0de.note.md'})
    assert r.status_code == 409 and 'termux-open' in r.get_json()['error']


def test_open_refuses_what_read_refuses(client, notes, app_module, monkeypatch):
    calls = []
    monkeypatch.setattr(app_module.shutil, 'which', lambda name: '/bin/termux-open')
    monkeypatch.setattr(app_module.subprocess, 'Popen', lambda argv, **k: calls.append(argv))
    assert client.post('/api/nb/open', json={'value': 'djp:private.md'}).status_code in (403, 404)
    assert calls == []
