"""tw-nb-interop M7, step 3 (djp 2026-11-04): a task's note when nb-web doesn't answer.

tw-web opens an `nb:` link in nb-web when it's up; else, from the note file on this device:
termux-open (Android hands it to Documents) or tw-web's own read-only view. The two endpoints
read only notes in the tasknotes notebook, never a dotfile, an encrypted note, or a path out of
it: tw-web has no login and may listen on Tailscale.

GET  /api/nb/note?value=<annotation value>   the note's text, read-only
POST /api/nb/open  {value}                   Documents, else termux-open, on the note (Android)

Documents through the tasknotes folder it was given (djp 2026-11-05): termux-open hands a
Termux file to another app only with allow-external-apps=true, so Documents got nothing and
closed. Asked by its document address in that folder, Documents reads it with its own access.
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
    monkeypatch.setattr(app_module, '_documents_app', lambda: '')
    monkeypatch.setattr(app_module.shutil, 'which', lambda name: '/bin/termux-open' if name == 'termux-open' else None)
    monkeypatch.setattr(app_module.subprocess, 'Popen', lambda argv, **k: calls.append(argv))
    r = client.post('/api/nb/open', json={'value': 'tasknotes:retile-0badc0de.note.md'})
    assert r.status_code == 200 and r.get_json()['success']
    assert calls == [['termux-open', str(notes / 'retile-0badc0de.note.md')]]


def test_open_without_termux_open_says_so(client, notes, app_module, monkeypatch):
    monkeypatch.setattr(app_module.shutil, 'which', lambda name: None)
    monkeypatch.setattr(app_module, '_documents_app', lambda: '')
    r = client.post('/api/nb/open', json={'value': 'tasknotes:retile-0badc0de.note.md'})
    assert r.status_code == 409 and 'termux-open' in r.get_json()['error']


def test_open_refuses_what_read_refuses(client, notes, app_module, monkeypatch):
    calls = []
    monkeypatch.setattr(app_module.shutil, 'which', lambda name: '/bin/termux-open')
    monkeypatch.setattr(app_module.subprocess, 'Popen', lambda argv, **k: calls.append(argv))
    assert client.post('/api/nb/open', json={'value': 'djp:private.md'}).status_code in (403, 404)
    assert calls == []


def test_open_asks_documents_through_its_tasknotes_folder(client, notes, app_module, monkeypatch):
    calls = []
    monkeypatch.setattr(app_module, '_documents_app', lambda: 'org.fossify.documents.debug')
    monkeypatch.setattr(app_module.shutil, 'which', lambda name: '/bin/' + name)
    monkeypatch.setattr(app_module.subprocess, 'Popen', lambda argv, **k: calls.append(argv))
    r = client.post('/api/nb/open', json={'value': 'tasknotes:legal/call-00f04687.note.md'})
    assert r.status_code == 200 and r.get_json()['success']
    from urllib.parse import quote
    tree, doc = quote(str(notes.resolve()), safe=''), quote(str((notes / 'legal' / 'call-00f04687.note.md').resolve()), safe='')
    assert calls == [['am', 'start', '-a', 'android.intent.action.VIEW', '-t', 'text/markdown',
                      '-d', f'content://com.termux.documents/tree/{tree}/document/{doc}',
                      '-n', 'org.fossify.documents.debug/org.fossify.documents.activities.DocumentOpenActivity']]


def test_health_says_a_note_can_open_with_documents_alone(client, notes, app_module, monkeypatch):
    monkeypatch.setattr(app_module, '_documents_app', lambda: 'org.fossify.documents')
    monkeypatch.setattr(app_module.shutil, 'which', lambda name: '/bin/am' if name == 'am' else None)
    assert client.get('/api/nb/health').get_json()['termux_open']['ok'] is True


# nb Docs (djp 2026-11-05): the fork, rebranded, installs as io.github.linuxcaffe.nbdocs (a debug
# build adds .debug). It comes first; Fossify's own apps still work. The activity keeps Fossify's
# class name: nb Docs keeps Fossify's code package, only the app id changed.

def _found(app_module, monkeypatch, installed):
    import types
    monkeypatch.setattr(app_module, '_documents_found', None)
    monkeypatch.setattr(app_module.shutil, 'which', lambda c: '/bin/pm' if c == 'pm' else None)
    def pm(argv, **k):           # as pm does: a last word not an option filters by substring
        f = argv[-1] if argv[-1] != 'packages' and not argv[-1].startswith('-') else ''
        out = ''.join(f'package:{p}\n' for p in installed if f in p)
        return types.SimpleNamespace(stdout=out, returncode=0)
    monkeypatch.setattr(app_module.subprocess, 'run', pm)
    return app_module._documents_app()


def test_nb_docs_is_found(app_module, monkeypatch):
    assert _found(app_module, monkeypatch, ['io.github.linuxcaffe.nbdocs']) == 'io.github.linuxcaffe.nbdocs'


def test_nb_docs_comes_before_fossifys(app_module, monkeypatch):
    assert _found(app_module, monkeypatch, ['org.fossify.documents.debug', 'io.github.linuxcaffe.nbdocs',
                                            'org.fossify.documents']) == 'io.github.linuxcaffe.nbdocs'


def test_a_nb_docs_debug_build_is_found_too(app_module, monkeypatch):
    assert _found(app_module, monkeypatch, ['io.github.linuxcaffe.nbdocs.debug']) == 'io.github.linuxcaffe.nbdocs.debug'


def test_fossifys_still_works(app_module, monkeypatch):
    assert _found(app_module, monkeypatch, ['org.fossify.documents']) == 'org.fossify.documents'
