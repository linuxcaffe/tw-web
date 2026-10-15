#!/usr/bin/env python3
"""check-refs.py — cross-file JavaScript reference check for tw-web's pages.

tw-web has no modules: each page loads plain <script> files that share globals
(`TaskCardManager`, `TaskEditor`, `taskEditor`, `app`, `showNotification`…).
That breaks in three ways, none of them a syntax error, and each one only
on the pages that load the files in a particular order:

  1. Used before defined. A top-level statement (`class X extends Y`,
     `const m = new Y()`) runs while the script loads, so the script that
     defines Y must come earlier on the page.
  2. Not on the page. Code inside a function runs later, but the script that
     defines the global must still be on that page, or the call throws a
     ReferenceError when someone clicks the button.
  3. Declared twice. Two scripts on one page that both declare a global with
     `let`, `const` or `class` make the second one fail to load at all.

The check reads every top-level *.html page, its local <script src> files in
order and its inline <script> blocks, and applies those three rules to the
globals our own files declare. Vendored files (*.min.js, codemirror-bundle.js,
xterm.js) and sw.js are not analysed.

A reference counts as guarded, and is skipped for rule 2, when the same file
tests it with `typeof X`. To accept a call-time reference that only ever runs
on some pages, list it in ALLOWED below with the reason.

Usage: check-refs.py [repo-dir]. Exit 0 = clean, 1 = findings. Standard library only.
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
VENDOR = re.compile(r'(\.min\.js|^codemirror-bundle\.js|^xterm\.js|^sw\.js)$')

# (file, identifier): why a reference to a global from a script that isn't on
# every page loading this file is acceptable.
ALLOWED = {
    ('task-card.js', 'app'): 'ScriptTaskActionHandler is the list page\'s handler; only main.js creates one',
}

IDENT = re.compile(r'[A-Za-z_$][\w$]*')
KEYWORDS = set('''break case catch class const continue debugger default delete do else
export extends finally for function if import in instanceof new return super switch this
throw try typeof var void while with yield let static async await of get set true false
null undefined'''.split())
REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^') | {''}


def tokens(src):
    """Yield (kind, text, depth, line) for identifiers and punctuation, skipping
    comments, strings, template text and regex literals. depth is the brace depth."""
    i, n, depth, line = 0, len(src), 0, 1
    prev = ''           # previous significant char or identifier
    tpl = []            # brace depth at each open `${` of a template literal
    while i < n:
        c = src[i]
        if c == '\n':
            line += 1
            i += 1
            continue
        if c.isspace():
            i += 1
            continue
        if src.startswith('//', i):
            j = src.find('\n', i)
            i = n if j < 0 else j
            continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2)
            j = n if j < 0 else j + 2
            line += src.count('\n', i, j)
            i = j
            continue
        if c in '\'"':
            j = i + 1
            while j < n and src[j] != c and src[j] != '\n':
                j += 2 if src[j] == '\\' else 1
            i = j + 1
            prev = 'str'
            continue
        if c == '`' or (c == '}' and tpl and tpl[-1] == depth):
            if c == '}':
                tpl.pop()
            j = i + 1
            while j < n and src[j] != '`':
                if src[j] == '\\':
                    j += 2
                    continue
                if src.startswith('${', j):
                    break
                if src[j] == '\n':
                    line += 1
                j += 1
            if j < n and src[j] == '$':
                tpl.append(depth)
                i = j + 2
            else:
                i = j + 1
            prev = 'str'
            continue
        if c == '/' and (prev in REGEX_PREV or prev in ('return', 'typeof')):
            j, cls = i + 1, False
            while j < n and src[j] != '\n':
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == '[':
                    cls = True
                elif src[j] == ']':
                    cls = False
                elif src[j] == '/' and not cls:
                    break
                j += 1
            i = j + 1
            while i < n and src[i].isalpha():
                i += 1
            prev = 'regex'
            continue
        m = IDENT.match(src, i)
        if m:
            yield 'id', m.group(), depth, line
            prev = m.group()
            i = m.end()
            continue
        if c.isdigit():
            j = i
            while j < n and (src[j].isalnum() or src[j] in '._'):
                j += 1
            i, prev = j, 'num'
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
        yield 'p', c, depth, line
        prev = c
        i += 1


class Unit:
    """One script: a local .js file or an inline <script> block."""

    def __init__(self, name, src):
        self.name = name
        self.toks = list(tokens(src))
        # A file wrapped in one IIFE runs its body at load time: count from inside.
        self.base = 1 if re.match(r'\s*(/\*.*?\*/\s*)?\(\s*(function|\()', src, re.S) else 0
        self.decls = {}      # top-level name -> 'lexical' | 'var'
        self.local = set()   # every name this file declares at any depth
        self.typeof = set()
        self.assigned = set()
        self.refs = []       # (name, line, load_time)
        self._scan(src)

    def _scan(self, src):
        t = self.toks
        for k, (kind, text, depth, line) in enumerate(t):
            if kind != 'id':
                continue
            before = t[k - 1][1] if k else ''
            after = t[k + 1][1] if k + 1 < len(t) else ''
            if before in ('let', 'const', 'var', 'class', 'function', 'static') or (before == ',' and self._in_decl(k)):
                self.local.add(text)
                if depth == 0:
                    kw = before if before != ',' else self._in_decl(k)
                    self.decls[text] = 'var' if kw in ('var', 'function') else 'lexical'
                continue
            if before == 'typeof':
                self.typeof.add(text)
            if before == '.' or text in KEYWORDS:
                continue
            if after == ':' and before in ('{', ','):     # object key
                continue
            nxt = t[k + 2][1] if k + 2 < len(t) else ''
            if after == '=' and nxt != '=' and before not in ('=', '!', '<', '>'):
                self.assigned.add(text)                    # `x = …`: maybe an implicit global
            self.refs.append((text, line, depth <= self.base))
        for m in re.finditer(r'window\.([A-Za-z_$][\w$]*)\s*=(?!=)', src):
            self.decls.setdefault(m.group(1), 'var')
        # Parameters and method names are local too; a regex is enough for this codebase.
        for m in re.finditer(r'(?:function\s*[\w$]*|^\s*(?:async\s+)?[\w$]+)\s*\(([^)]*)\)\s*\{', src, re.M):
            self.local.update(IDENT.findall(m.group(1)))
        for m in re.finditer(r'\(([^()]*)\)\s*=>|([A-Za-z_$][\w$]*)\s*=>', src):
            self.local.update(IDENT.findall(m.group(1) or m.group(2) or ""))
        for m in re.finditer(r'^\s*(?:async\s+|static\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{', src, re.M):
            self.local.add(m.group(1))
        # Sloppy-mode scripts create a global by assigning an undeclared name
        # (main.js: `taskCardManager = new TaskCardManager(…)`).
        for name in self.assigned - self.local:
            self.decls.setdefault(name, 'var')

    def _in_decl(self, k):
        """For `let a = 1, b`: the declaring keyword if token k continues a declaration list."""
        depth = self.toks[k][2]
        for j in range(k - 1, -1, -1):
            kind, text, d, _ = self.toks[j]
            if d < depth or text in (';', '{', '}'):
                return None
            if d == depth and text in ('let', 'const', 'var'):
                return text
            if d == depth and text in ('(', '[', '=') and j == k - 1:
                return None
        return None


def page_units(page, repo):
    html = page.read_text(encoding='utf-8', errors='replace')
    units = []
    for k, m in enumerate(re.finditer(r'<script\b([^>]*)>(.*?)</script>', html, re.S | re.I)):
        attrs, body = m.group(1), m.group(2)
        src = re.search(r'src="([^"]+)"', attrs)
        if src:
            path = src.group(1).lstrip('/')
            if '://' in path or VENDOR.search(path) or not (repo / path).is_file():
                continue
            units.append(path)
        elif body.strip():
            units.append((f'{page.name}<inline {k + 1}>', body))
    return units


def main(repo=REPO):
    cache = {}

    def unit(u):
        if u not in cache:
            cache[u] = Unit(u[0], u[1]) if isinstance(u, tuple) else \
                Unit(u, (repo / u).read_text(encoding='utf-8', errors='replace'))
        return cache[u]

    # Read every page's scripts first: rule 2 needs to know every definer, not only those
    # on pages already checked (a page sorting first used to hide its own missing script).
    pages = {page: [unit(u) for u in page_units(page, repo)] for page in sorted(repo.glob('*.html'))}
    ours = {name for c in cache.values() for name in c.decls}

    findings, checked = [], 0
    for page, units in pages.items():
        if not units:
            continue
        checked += 1
        owner = {}   # global -> (position, unit) of its first declaration on this page
        for pos, u in enumerate(units):
            for name, kind in u.decls.items():
                if name in owner:
                    first = owner[name][1]
                    if kind == 'lexical' or first.decls[name] == 'lexical':
                        findings.append(f'{page.name}: `{name}` is declared by both {first.name} and '
                                        f'{u.name}; the second script fails to load (rule 3)')
                else:
                    owner[name] = (pos, u)
        for pos, u in enumerate(units):
            seen = set()
            for name, line, load_time in u.refs:
                if name not in ours or name in u.decls or (name, load_time) in seen:
                    continue
                seen.add((name, load_time))
                if name in owner and owner[name][0] < pos:
                    continue
                if name in owner and not load_time:
                    continue
                if load_time and name in owner:
                    findings.append(f'{page.name}: {u.name}:{line} uses `{name}` while loading, but '
                                    f'{owner[name][1].name} defines it later on the page (rule 1)')
                    continue
                if name in u.local or name in u.typeof or (u.name, name) in ALLOWED:
                    continue
                definers = sorted({c.name for c in cache.values() if name in c.decls})
                findings.append(f'{page.name}: {u.name}:{line} uses `{name}`, defined in '
                                f'{", ".join(definers)}, which this page doesn\'t load (rule 2)')

    if findings:
        print(f'check-refs: {len(findings)} problem(s):\n')
        for f in findings:
            print(f'  {f}')
        return 1
    print(f'check-refs: OK ({checked} pages)')
    return 0


if __name__ == '__main__':
    sys.exit(main(Path(sys.argv[1]) if len(sys.argv) > 1 else REPO))
