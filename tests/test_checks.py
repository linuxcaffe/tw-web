"""The static checks the pre-commit hook runs (.tools/check-refs.py, .tools/check-guards.py).

Each rule is shown failing on a small made-up page and, where possible, on a mutated copy
of the real pages, so a check that silently stops checking shows up here.
"""
import importlib.util
import shutil
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent


def _load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), REPO / '.tools' / f'{name}.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


refs = _load('check-refs')
guards = _load('check-guards')


def site(tmp_path, files):
    for name, text in files.items():
        (tmp_path / name).write_text(text)
    return tmp_path


def run_refs(repo, capsys):
    code = refs.main(repo)
    return code, capsys.readouterr().out


def page(*scripts):
    return '<html><head>' + ''.join(f'<script src="{s}"></script>' for s in scripts) + '</head></html>'


# ── check-refs ────────────────────────────────────────────────────────────────

def test_real_pages_are_clean(capsys):
    code, out = run_refs(REPO, capsys)
    assert code == 0, out


def test_rule1_used_while_loading_before_defined(tmp_path, capsys):
    repo = site(tmp_path, {
        'base.js': 'class Base {}\n',
        'view.js': 'class View extends Base {}\n',
        'p.html': page('view.js', 'base.js'),
    })
    code, out = run_refs(repo, capsys)
    assert code == 1 and 'rule 1' in out and '`Base`' in out


def test_rule1_ok_when_defined_first(tmp_path, capsys):
    repo = site(tmp_path, {
        'base.js': 'class Base {}\n',
        'view.js': 'class View extends Base {}\nconst v = new Base();\n',
        'p.html': page('base.js', 'view.js'),
    })
    assert run_refs(repo, capsys)[0] == 0


def test_rule1_call_time_reference_may_come_later(tmp_path, capsys):
    repo = site(tmp_path, {
        'base.js': 'function helper() {}\n',
        'view.js': "document.addEventListener('x', () => { helper(); });\n",
        'p.html': page('view.js', 'base.js'),
    })
    assert run_refs(repo, capsys)[0] == 0


def test_rule2_global_not_on_page(tmp_path, capsys):
    repo = site(tmp_path, {
        'base.js': 'function helper() {}\n',
        'view.js': 'function go() { helper(); }\n',
        'a.html': page('base.js', 'view.js'),
        'b.html': page('view.js'),
    })
    code, out = run_refs(repo, capsys)
    assert code == 1 and 'b.html' in out and 'rule 2' in out and 'a.html' not in out


def test_rule2_typeof_guard_is_accepted(tmp_path, capsys):
    repo = site(tmp_path, {
        'base.js': 'function helper() {}\n',
        'view.js': "function go() { if (typeof helper !== 'undefined') helper(); }\n",
        'b.html': page('view.js'),
        'a.html': page('base.js'),
    })
    assert run_refs(repo, capsys)[0] == 0


def test_rule3_declared_twice(tmp_path, capsys):
    repo = site(tmp_path, {
        'one.js': 'let taskEditor;\n',
        'two.js': 'let taskEditor;\n',
        'p.html': page('one.js', 'two.js'),
    })
    code, out = run_refs(repo, capsys)
    assert code == 1 and 'rule 3' in out and '`taskEditor`' in out


def test_implicit_global_and_inline_script(tmp_path, capsys):
    """main.js creates `taskCardManager` by plain assignment; an inline script can use it."""
    repo = site(tmp_path, {
        'main.js': "document.addEventListener('x', () => { taskCardManager = 1; });\n",
        'p.html': page('main.js') + '<script>function f() { return taskCardManager; }</script>',
        'q.html': '<script>function f() { return taskCardManager; }</script>',
    })
    code, out = run_refs(repo, capsys)
    assert code == 1 and 'q.html' in out and 'p.html' not in out


def test_comments_strings_and_templates_dont_confuse_it(tmp_path, capsys):
    repo = site(tmp_path, {
        'base.js': 'class Base {}\n',
        'view.js': (
            "// don't { panic\n"
            "const css = `a { color: red; } ${ 1 + 1 } }`;\n"
            "const re = /[{}]/g;\n"
            "const s = 'it\\'s {';\n"
            "class View extends Base {}\n"),
        'p.html': page('view.js', 'base.js'),
    })
    code, out = run_refs(repo, capsys)
    assert code == 1 and 'view.js:5' in out


@pytest.fixture
def real_copy(tmp_path):
    for f in list(REPO.glob('*.html')) + list(REPO.glob('*.js')):
        shutil.copy(f, tmp_path / f.name)
    return tmp_path


def test_mutation_kanban_loads_task_card_too_late(real_copy, capsys):
    """kanban.js builds its TaskCardManager while loading, so task-card.js must come first."""
    html = (real_copy / 'kanban.html').read_text()
    html = html.replace('<script src="task-card.js"></script>\n', '')
    html = html.replace('<script src="kanban.js"></script>',
                        '<script src="kanban.js"></script>\n<script src="task-card.js"></script>')
    (real_copy / 'kanban.html').write_text(html)
    code, out = run_refs(real_copy, capsys)
    assert code == 1 and 'kanban.html' in out and '`TaskCardManager`' in out and 'rule 1' in out


def test_mutation_agenda_drops_task_editor(real_copy, capsys):
    html = (real_copy / 'agenda.html').read_text().replace('<script src="task-editor.js"></script>', '')
    (real_copy / 'agenda.html').write_text(html)
    code, out = run_refs(real_copy, capsys)
    assert code == 1 and 'agenda.html' in out and '`TaskEditor`' in out and 'rule 2' in out


def test_mutation_second_page_declares_task_editor(real_copy, capsys):
    (real_copy / 'task-card.js').write_text((real_copy / 'task-card.js').read_text() + '\nlet taskEditor;\n')
    code, out = run_refs(real_copy, capsys)
    assert code == 1 and 'rule 3' in out and '`taskEditor`' in out


# ── check-guards ──────────────────────────────────────────────────────────────

def test_guards_present_in_repo():
    assert guards.check(REPO) == []


def test_guard_missing_identifier(tmp_path):
    site(tmp_path, {'.guards': '# c\napp.py:def _is_asset\n', 'app.py': 'def _is_asset_old(f):\n    pass\n'})
    assert len(guards.check(tmp_path)) == 1


def test_guard_word_boundary_and_missing_file(tmp_path):
    site(tmp_path, {'.guards': 'app.py:def _is_asset\ngone.py:x\n', 'app.py': 'def _is_asset(f):\n    pass\n'})
    out = guards.check(tmp_path)
    assert len(out) == 1 and 'gone.py' in out[0]


def test_guard_deleting_the_request_guard_is_caught(tmp_path):
    shutil.copy(REPO / '.guards', tmp_path / '.guards')
    guarded = {line.split(':', 1)[0] for line in (REPO / '.guards').read_text().splitlines()
               if line.strip() and not line.startswith('#')}
    for f in guarded:
        shutil.copy(REPO / f, tmp_path / f)
    app = (tmp_path / 'app.py').read_text().replace('def _guard_request', 'def _guard_request_disabled')
    (tmp_path / 'app.py').write_text(app)
    out = guards.check(tmp_path)
    assert len(out) == 1 and '_guard_request' in out[0]
