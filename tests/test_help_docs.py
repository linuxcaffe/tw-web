"""docs/help/: every page has the front matter the help index needs, every in-help link
resolves, and no page carries active HTML. Plan: tw:docs/tw-web-help-plan.md."""
import importlib.util
import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
HELP = ROOT / 'docs' / 'help'
PAGES = sorted(HELP.rglob('*.md'))
LINK = re.compile(r'\]\(([^)\s]+)\)')


def _front(text):
    m = re.match(r'---\n(.*?)\n---\n', text, re.S)
    assert m, 'no front matter'
    return dict(re.match(r'([a-z_]+):\s*(.*)', l).groups() for l in m.group(1).splitlines() if ':' in l)


def test_pages_exist():
    assert len(PAGES) >= 58
    assert (HELP / 'taskwarrior' / 'SOURCE').is_file()


def test_no_page_is_gitignored():
    """.gitignore's `_*` once kept commands/_get.md and _unique.md out of the import commit."""
    r = subprocess.run(['git', '-C', str(ROOT), 'check-ignore', '--no-index', *map(str, PAGES)],
                       capture_output=True, text=True)
    if r.returncode == 128:
        pytest.skip('not a git checkout')
    assert r.stdout == '', f'ignored by .gitignore: {r.stdout}'


@pytest.mark.parametrize('page', PAGES, ids=lambda p: str(p.relative_to(HELP)))
def test_front_matter(page):
    front = _front(page.read_text())
    assert front.get('title', '').strip('"'), 'title'
    assert front.get('category', '').strip('"'), 'category'


@pytest.mark.parametrize('page', PAGES, ids=lambda p: str(p.relative_to(HELP)))
def test_links_resolve(page):
    for target in LINK.findall(page.read_text()):
        path = target.split('#')[0]
        if not path or re.match(r'(https?|mailto):', path):
            continue
        assert not path.startswith('/'), f'site-absolute link {target}'
        resolved = (page.parent / path).resolve()
        assert resolved.is_relative_to(HELP), f'link leaves docs/help: {target}'
        assert resolved.is_file(), f'broken link {target}'


@pytest.mark.parametrize('page', PAGES, ids=lambda p: str(p.relative_to(HELP)))
def test_no_active_html(page):
    text = page.read_text()
    assert not re.search(r'<\s*(script|iframe|object|embed)\b|\son[a-z]+\s*=', text, re.I)
    assert '{{<' not in text, 'Hugo shortcode left over'


def _importer():
    spec = importlib.util.spec_from_file_location('import_tw_docs', ROOT / '.tools' / 'import-tw-docs.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_importer_rewrites():
    imp = _importer()
    kept = {'filter', 'commands/add'}
    assert imp.shortcodes('Context {{< label >}}2.4.2{{< /label >}}') == 'Context (2.4.2)'
    assert imp.rewrite_links('[f](/docs/filter#x)', False, kept) == '[f](filter.md#x)'
    assert imp.rewrite_links('[f](/docs/filter)', True, kept) == '[f](../filter.md)'
    assert imp.rewrite_links('[a](/docs/commands/add)', False, kept) == '[a](commands/add.md)'
    assert imp.rewrite_links('[a](/docs/commands/add)', True, kept) == '[a](add.md)'
    assert imp.rewrite_links('[u](/docs/upgrade-3)', False, kept) == 'u'
    assert imp.rewrite_links('[t](/tools)', False, kept) == '[t](https://taskwarrior.org/tools)'
    assert imp.rewrite_links('[![s](/images/a.png)](/images/a.png)', False, kept) == \
        '[image: s](https://taskwarrior.org/images/a.png)'
