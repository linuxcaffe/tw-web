// tw-web — the nav filter and the task sort, one copy for every view (consolidation step 2).
// Loads after tw-api.js, which declares TW. Pure functions: tests/js/tw-filter.test.cjs runs them in Node.

// ── TW.sort ───────────────────────────────────────────────────────────────────
// Priority order, highest first: uda.priority.values=1,2,3,4,5,6,H,M,L
TW.sort = (() => {
    const PRI_ORDER = ['1','2','3','4','5','6','H','M','L'];

    // Higher rank = higher priority; no priority (or an unknown one) ranks 0
    function priRank(p) {
        const i = PRI_ORDER.indexOf(String(p || '').toUpperCase());
        return i === -1 ? 0 : PRI_ORDER.length - i;
    }

    // The List's sort (also the Calendar sidebar's). The server sends tasks in urgency order,
    // so 'urgency' keeps it (or reverses it). Ascending puts low priority and early dates first.
    function tasks(list, field, reverse) {
        const rev = reverse ? -1 : 1;
        if (field === 'urgency') return reverse ? [...list].reverse() : list;
        return [...list].sort((a, b) => {
            let av = a[field], bv = b[field];
            if (field === 'priority') { av = priRank(av); bv = priRank(bv); }
            else if (field === 'tags') { av = (av || []).join(','); bv = (bv || []).join(','); }
            // Dates: ISO strings sort lexicographically = chronologically
            av = av ?? '';
            bv = bv ?? '';
            if (av < bv) return -1 * rev;
            if (av > bv) return  1 * rev;
            return 0;
        });
    }

    return { PRI_ORDER, priRank, tasks };
})();

// ── TW.filter ─────────────────────────────────────────────────────────────────
// The nav bar's filter, priority, project and tags inputs, applied client-side.
TW.filter = (() => {
    // Recognised modifiers for text/ordered fields
    const TEXT_MODS = new Set(['is','isnt','not','contains','startswith','endswith','any','none']);
    const ORD_MODS  = new Set(['is','isnt','any','none']);

    // Parse a leading modifier prefix from input: ".mod:val" → {mod, val}
    // or "< val" / "> val" → {mod:'lt'/'gt', val}. Returns null if no prefix.
    function parseModifier(input) {
        const m = input.match(/^\.([a-z]+):(.*)/i);
        if (m) return { mod: m[1].toLowerCase(), val: m[2] };
        const c = input.match(/^([<>])\s+(.*)/);
        if (c) return { mod: c[1] === '<' ? 'lt' : 'gt', val: c[2] };
        return null;
    }

    // Compare a scalar field value against a filter string, with optional modifier.
    // type: 'text' (case-insensitive string ops) | 'ord' (priority order: "> M" = higher than M)
    function matchAttr(fieldVal, input, type) {
        const p = parseModifier(input);
        const fv = String(fieldVal);

        if (!p) {
            // default: contains (text) or is (ord)
            return type === 'ord'
                ? fv.toLowerCase() === input.toLowerCase()
                : fv.toLowerCase().includes(input.toLowerCase());
        }

        const { mod, val } = p;
        const fvl = fv.toLowerCase();
        const vl  = val.toLowerCase();

        if (mod === 'lt' || mod === 'gt') {
            const ai = TW.sort.PRI_ORDER.indexOf(fv.toUpperCase());
            const bi = TW.sort.PRI_ORDER.indexOf(val.toUpperCase());
            if (ai === -1 || bi === -1) {
                // fall back to numeric if both parse as numbers
                const an = parseFloat(fv), bn = parseFloat(val);
                if (isNaN(an) || isNaN(bn)) return false;
                return mod === 'lt' ? an < bn : an > bn;
            }
            // PRI_ORDER runs highest first, so "> M" (higher than M) means an earlier index
            return mod === 'gt' ? ai < bi : ai > bi;
        }

        const allowed = type === 'ord' ? ORD_MODS : TEXT_MODS;
        if (!allowed.has(mod)) return false;  // unrecognised modifier → no match

        switch (mod) {
            case 'any':        return fv !== '';
            case 'none':       return fv === '';
            case 'is':         return fvl === vl;
            case 'isnt':
            case 'not':        return fvl !== vl;
            case 'contains':   return fvl.includes(vl);
            case 'startswith': return fvl.startsWith(vl);
            case 'endswith':   return fvl.endsWith(vl);
            default:           return false;
        }
    }

    // Virtual tags (+DUE, +OVERDUE, -BLOCKED…) aren't in the export: task decides which tasks
    // have them. nav.js asks /api/vtags and hands the answer here: names, the virtual tags
    // 2.6.2 knows, and sets, {TAG: [uuid…]} for the ones the tags input uses.
    let _virtual = { names: [], sets: {} };
    function setVirtual(v) {
        _virtual = { names: v.names || [], sets: v.sets || {} };
    }
    function getVirtual() { return _virtual; }

    // The terms of a tags input without a modifier: "a, +b -c" → [['+','a'], ['+','b'], ['-','c']]
    function _terms(input) {
        return input.split(/[\s,]+/).filter(Boolean).map(t =>
            t[0] === '+' || t[0] === '-' ? [t[0], t.slice(1)] : ['+', t]).filter(([, tag]) => tag);
    }

    // The tags a filter asks for (not those it excludes): the sidebar's highlight
    function tagTerms(input) {
        input = (input || '').trim();
        const p = parseModifier(input);
        if (p) return p.mod === 'has' && p.val ? [p.val.trim()] : [];
        return _terms(input).filter(([sign]) => sign === '+').map(([, tag]) => tag);
    }

    // The virtual tags an input uses, so nav.js knows which to fetch
    function virtualTerms(input, v = _virtual) {
        input = (input || '').trim();
        const p = parseModifier(input);
        const tags = p ? (p.val ? [p.val.trim()] : []) : _terms(input).map(([, tag]) => tag);
        return [...new Set(tags.filter(t => v.names.includes(t)))];
    }

    // Match a task's tags against a tags filter string. Terms, all of which must hold, are
    // separated by commas or spaces: "x" or "+x" has x, "-x" hasn't. Or one modifier for the
    // whole input: .has:x .hasnt:x .any: .none:. A virtual tag (upper case, one of v.names)
    // matches the tasks task said have it; one not fetched yet matches nothing.
    function matchTags(taskTags, input, task = {}, v = _virtual) {
        const has = tag => v.names.includes(tag)
            ? (v.sets[tag] || []).includes(task.uuid)
            : taskTags.includes(tag);
        const p = parseModifier(input);

        if (!p) return _terms(input).every(([sign, tag]) => (sign === '+') === has(tag));

        const { mod, val } = p;
        switch (mod) {
            case 'has':    return has(val);
            case 'hasnt':  return !has(val);
            case 'any':    return taskTags.length > 0;
            case 'none':   return taskTags.length === 0;
            default:       return false;
        }
    }

    // Does a task pass the nav state's filter/priority/project/tags inputs? (twNav.getState())
    function matchesNav(task, state, v = _virtual) {
        const filter   = (state.filter   || '').trim();
        const priority = (state.priority || '').trim();
        const project  = (state.project  || '').trim();
        const tags     = (state.tags     || '').trim();
        if (filter   && !matchAttr(task.description || '', filter,   'text')) return false;
        if (priority && !matchAttr(task.priority    || '', priority, 'ord'))  return false;
        if (project  && !matchAttr(task.project     || '', project,  'text')) return false;
        if (tags     && !matchTags(task.tags        || [], tags, task, v))    return false;
        return true;
    }

    // The tasks that pass the current nav state (all of them on a page without twNav)
    function navTasks(list) {
        if (!window.twNav) return list;
        const state = window.twNav.getState();
        return list.filter(t => matchesNav(t, state));
    }

    // Defaults for a new task from the nav state: the project, priority and tags it names, so a
    // run of related tasks needs no retyping. A plain value or .is:/.has: names one value;
    // ranges, negatives and other modifiers name none; "+x -y" gives x. The description search is never one.
    function addDefaults(state) {
        const out = {};
        const one = (input, mod) => {
            input = (input || '').trim();
            const p = parseModifier(input);
            if (!p) return input;
            return p.mod === mod ? p.val.trim() : '';
        };
        const project = one(state.project, 'is');
        if (project) out.project = project;
        const pri = one(state.priority, 'is').toUpperCase();
        if (pri && TW.sort.PRI_ORDER.includes(pri)) out.priority = pri;
        // Tags: the ones asked for, less virtual ones (task won't add those)
        const tags = tagTerms(state.tags).filter(t => !_virtual.names.includes(t));
        if (tags.length) out.tags = tags;
        return out;
    }

    return { parseModifier, matchAttr, matchTags, matchesNav, navTasks, addDefaults,
             setVirtual, getVirtual, tagTerms, virtualTerms };
})();
