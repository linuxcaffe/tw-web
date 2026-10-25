#!/usr/bin/env python3
"""check-breakpoints.py — every layout width tw-web tests comes from one table.

The table is `BP` at the top of nav.js (name: max-width in CSS px). CSS can't read a
variable in `@media`, so the stylesheets repeat the numbers; this check keeps them
honest (tw:docs/tw-web-layout-plan.md, step 2):

  1. Every `@media (max-width: N…)` or `(min-width: N…)` line carries a
     `/* bp: <name> */` tag, the name is in BP, and BP[name] is N. Inside nav.js's
     CSS string a query may say `${BP.<name>}px` instead, which needs no tag.
  2. JavaScript never tests a width with a number: no `innerWidth`/`outerWidth`
     compared with a literal, no `matchMedia('(max-width: N…)')`. Pages use
     `twNav.narrow` / `twNav.phone` (or `twNav.bp`), which nav.js builds from BP.

It reads every top-level *.css, *.js and *.html file; vendored files (*.min.*,
codemirror-bundle.js, xterm.*) are skipped. Queries on anything but width
(`prefers-reduced-motion`, `pointer`) are not its business.

Usage: check-breakpoints.py [repo-dir]. Exit 0 = clean, 1 = findings. Standard library only.
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
VENDOR = re.compile(r'(\.min\.(js|css)|^codemirror-bundle\.js|^xterm\.(js|css))$')

TABLE = re.compile(r'const BP\s*=\s*\{(.*?)\};', re.S)
ENTRY = re.compile(r'(\w+)\s*:\s*(\d+)')
WIDTH = re.compile(r'\((?:max|min)-width:\s*(\d+)px')
WIDTH_VAR = re.compile(r'\((?:max|min)-width:\s*\$\{BP\.(\w+)\}px')
TAG = re.compile(r'/\*\s*bp:\s*(\w+)\s*\*/')
JS_WIDTH = re.compile(r'\b(?:innerWidth|outerWidth|clientWidth)\s*[<>]=?\s*\d|\d\s*[<>]=?\s*(?:window\.)?(?:innerWidth|outerWidth)\b')
JS_MEDIA = re.compile(r'matchMedia\(\s*[\'"`][^\'"`]*\((?:max|min)-width:\s*\d')


def table(repo):
    m = TABLE.search((repo / 'nav.js').read_text())
    return {k: int(v) for k, v in ENTRY.findall(m.group(1))} if m else None


def main(repo=REPO):
    repo = Path(repo)
    bp = table(repo)
    if not bp:
        print('nav.js: no `const BP = { … };` table')
        return 1
    findings = []
    for f in sorted(repo.iterdir()):
        if f.suffix not in ('.css', '.js', '.html') or VENDOR.search(f.name):
            continue
        for n, line in enumerate(f.read_text().splitlines(), 1):
            where = f'{f.name}:{n}'
            if '@media' in line:
                for name in WIDTH_VAR.findall(line):
                    if name not in bp:
                        findings.append(f'{where}: ${{BP.{name}}} is not in nav.js BP')
                widths = WIDTH.findall(line)
                if widths:
                    tag = TAG.search(line)
                    if not tag:
                        findings.append(f'{where}: @media at {"/".join(widths)}px has no /* bp: <name> */ tag')
                    elif tag.group(1) not in bp:
                        findings.append(f'{where}: bp "{tag.group(1)}" is not in nav.js BP')
                    elif any(int(w) != bp[tag.group(1)] for w in widths):
                        findings.append(f'{where}: bp "{tag.group(1)}" is {bp[tag.group(1)]}px, the query says {"/".join(widths)}px')
            if f.suffix == '.js' and (JS_WIDTH.search(line) or JS_MEDIA.search(line)):
                findings.append(f'{where}: a width tested with a number; use twNav.narrow/phone or twNav.bp')
    for x in findings:
        print(x)
    return 1 if findings else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else REPO))
