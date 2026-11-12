#!/usr/bin/env python3
"""Import Taskwarrior 2.x docs from a local tw.org clone into docs/help/taskwarrior/.

    python3 .tools/import-tw-docs.py ~/dev/tw.org d69bc610 [--force]

Reads the pages from <commit> with `git show` (local only, no network) and writes
docs/help/taskwarrior/*.md, docs/help/taskwarrior/commands/*.md and SOURCE.
Run once: upstream's 2.x docs are frozen, so after the import the pages are ours,
and SOURCE records every later change. --force overwrites an earlier import.

What it changes, and nothing else:
  - front matter: just `title` (the "Taskwarrior - " prefix dropped), `category` and
    `summary` (from the snapshot's docs index), `source` (the tw.org path)
  - Hugo shortcodes: {{< label >}}2.4.0{{< /label >}} -> "(2.4.0)", {{< lead >}} dropped
  - links: /docs/x -> relative x.md (so they work on GitHub and in the help page);
    a dropped page's link becomes plain text; other site paths -> https://taskwarrior.org/...
  - images: a line `[image: <alt>](https://taskwarrior.org/images/...)` (help is text for now)
Refuses <script>, <iframe>, <object>, <embed> and on*= attributes.
Plan: tw:docs/tw-web-help-plan.md
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / 'docs' / 'help' / 'taskwarrior'
SITE = 'https://taskwarrior.org'

# Plan, "Prune list": everything that isn't TaskChampion or stale.
TOPICS = [
    'start', 'introduction', 'configuration', '30second', 'help',
    'syntax', 'best-practices', 'examples', 'workflow', 'using_dates', 'unicode',
    'searching', 'report', 'filter', 'priority', 'tags', 'dates', 'named_dates', 'durations',
    'verbosity', 'themes', 'terminology',
    'urgency', 'ids', 'context', 'recurrence', 'udas', 'escapes', 'dom', 'task',
    'deprecated', 'philosophy',
    'review',
    'hooks', 'hooks2', 'hooks_guide', '3rd-party',
    'history', 'license', 'bugs', 'features', 'triage', 'advice',
]
COMMANDS = [
    'add', 'append', 'prepend', 'burndown', 'calc', 'columns', 'count', 'done',
    'export', 'info', 'list', 'log', 'modify', '_get', '_unique',
]
DROPPED = {
    'upgrade-3': '3.x only', 'sync': '3.x only (TaskChampion)',
    'taskserver/*': 'stale: Taskserver is unmaintained; the fleet syncs with gittw',
    'commands/synchronize': 'stale: Taskserver', 'history_td': 'stale: Taskserver',
    'build': 'stale: upstream develop builds 3.x', 'jobs': 'stale: old call for volunteers',
    '_index': 'replaced by the help index', 'commands/_index': 'replaced by the Commands tab',
    'commands/missing': "the site's broken-link page", 'man/*': 'not in this snapshot; task ships its man pages',
}
# Pages the snapshot's index doesn't list.
EXTRA_CATEGORY = {
    'philosophy': 'Advanced Topics', 'triage': 'Feedback', 'advice': 'About',
    'task': 'Advanced Topics', 'best-practices': 'Basic Usage',
}

UNSAFE = re.compile(r'<\s*(script|iframe|object|embed)\b|\son[a-z]+\s*=', re.I)


def git_show(clone, commit, path):
    r = subprocess.run(['git', '-C', str(clone), 'show', f'{commit}:content/docs/{path}'],
                       capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'git show {commit}:content/docs/{path} failed: {r.stderr.strip()}')
    return r.stdout


def split_front(text):
    m = re.match(r'---\n(.*?)\n---\n', text, re.S)
    if not m:
        return {}, text
    front = {}
    for line in m.group(1).splitlines():
        k, sep, v = line.partition(':')
        if sep and re.fullmatch(r'[a-z_]+', k):
            front[k] = v.strip().strip('\'"')
    return front, text[m.end():]


def shortcodes(text):
    text = re.sub(r'\s*\{\{<\s*label\s*>\}\}\s*(.*?)\s*\{\{<\s*/label\s*>\}\}', r' (\1)', text)
    return re.sub(r'\{\{<\s*/?lead\s*>\}\}', '', text)


def index_meta(clone, commit):
    """category and summary per page from docs/_index.md; summary per command from commands/_index.md."""
    cat, summ = {}, {}
    heading = None
    for line in shortcodes(git_show(clone, commit, '_index.md')).splitlines():
        if line.startswith('## '):
            heading = line[3:].strip()
        m = re.match(r'\s*[-*] \[[^\]]*\]\(/docs/([\w/-]+)/?\)\s*(?:\([\d.]+\))?\s*(?:-\s*(.*))?$', line)
        if m and heading:
            cat.setdefault(m.group(1), heading)
            if m.group(2):
                summ.setdefault(m.group(1), m.group(2).strip())
    for line in shortcodes(git_show(clone, commit, 'commands/_index.md')).splitlines():
        m = re.match(r'\s*[-*] \[`([\w-]+)`(?:\s*\([\d.]+\))?\s*-\s*(.*?)\]\(/docs/commands/', line)
        if m:
            summ['commands/' + m.group(1)] = m.group(2).strip()
    return cat, summ


def rewrite_links(text, in_commands, kept):
    up = '../' if in_commands else ''

    def image(m):
        alt, path = m.group(1).strip() or Path(m.group(2)).stem, m.group(2)
        return f'[image: {alt}]({SITE}{path})'
    text = re.sub(r'\[!\[([^\]]*)\]\((/images/[^)\s]+)\)\]\(/images/[^)\s]+\)', image, text)  # linked image
    text = re.sub(r'!\[([^\]]*)\]\((/images/[^)\s]+)\)', image, text)

    def link(m):
        label, target = m.group(1), m.group(2)
        path, _, anchor = target.partition('#')
        anchor = '#' + anchor if anchor else ''
        if path.startswith('/docs'):
            page = path[len('/docs'):].strip('/')
            if page in kept:
                rel = (up + page + '.md') if not page.startswith('commands/') else \
                      (('' if in_commands else 'commands/') + page.split('/', 1)[1] + '.md')
                return f'[{label}]({rel}{anchor})'
            return label                       # dropped page or the old index: plain text
        if path.startswith('/'):
            return f'[{label}]({SITE}{target})'
        return m.group(0)                      # http(s), mailto, #anchor: unchanged
    return re.sub(r'(?<!!)\[([^\]]+)\]\(([^)\s]+)\)', link, text)


def front_matter(title, category, summary, source):
    def q(s):
        return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'
    lines = ['---', f'title: {q(title)}', f'category: {q(category)}']
    if summary:
        lines.append(f'summary: {q(summary)}')
    lines += [f'source: {q(source)}', '---', '']
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('clone', type=Path)
    ap.add_argument('commit')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    if OUT.exists() and any(OUT.iterdir()) and not a.force:
        sys.exit(f'{OUT} already holds an import; pages are edited after import. --force to overwrite.')
    full = subprocess.run(['git', '-C', str(a.clone), 'log', '-1', '--format=%H %ad', '--date=short', a.commit],
                          capture_output=True, text=True, check=True).stdout.split()
    cat, summ = index_meta(a.clone, a.commit)
    kept = set(TOPICS) | {'commands/' + c for c in COMMANDS}
    (OUT / 'commands').mkdir(parents=True, exist_ok=True)
    problems = []
    for page in sorted(kept):
        in_commands = page.startswith('commands/')
        front, body = split_front(git_show(a.clone, a.commit, page + '.md'))
        title = re.sub(r'^Taskwarrior\s*-\s*', '', front.get('title', page)).strip()
        if in_commands:
            title, category = page.split('/', 1)[1], 'Commands'
        else:
            category = cat.get(page) or EXTRA_CATEGORY.get(page)
            if not category:
                problems.append(f'{page}: no category')
                continue
        body = rewrite_links(shortcodes(body), in_commands, kept)
        if UNSAFE.search(body):
            problems.append(f'{page}: unsafe HTML ({UNSAFE.search(body).group(0).strip()})')
            continue
        out = front_matter(title, category, summ.get(page, ''), f'content/docs/{page}.md') + body.lstrip('\n')
        (OUT / (page + '.md')).write_text(out)
    if problems:
        sys.exit('import stopped:\n  ' + '\n  '.join(problems))
    (OUT / 'SOURCE').write_text(f'''Imported from tw.org (https://github.com/GothenburgBitFactory/tw.org),
commit {full[0]} ({full[1]}), the last before Taskwarrior 3.0, by .tools/import-tw-docs.py.
Taskwarrior and its documentation are MIT licensed (see license.md); credit to the
Taskwarrior authors and the tw.org contributors.

Kept: {len(TOPICS)} topic pages and {len(COMMANDS)} command pages.
Dropped:
''' + ''.join(f'  {k}: {v}\n' for k, v in DROPPED.items()) + '''
The import changed only front matter, Hugo shortcodes, site links and images
(see the script's docstring). The pages are ours from here: upstream's 2.x docs are frozen.

Changed since the import (page: what and why):
  (none yet)
''')
    print(f'imported {len(kept)} pages from {full[0][:8]} into {OUT.relative_to(REPO)}')


if __name__ == '__main__':
    main()
