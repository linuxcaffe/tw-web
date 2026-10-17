// Shared helpers for tests/e2e/*.check.cjs. Run through tests/e2e/run.py, which sets
// TW_WEB_PORT, TASKRC and TASKDATA for a scratch server and seeds it before each check.
//
//   const { check, expect, task, exportOne, B, sleep, cardTexts } = require('./lib.cjs');
//   check(async pg => { await pg.goto(B + '/'); expect(cond, 'what went wrong'); });
//
// Exit codes: 0 pass, 1 an expect() failed (the bug is there), 2 the check itself broke
// (timeout, missing selector, Playwright not found). run.py never counts 2 as an expected
// failure, so a broken check can't hide behind xfail.txt.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

class Expectation extends Error {}

function expect(cond, message) {
    if (!cond) throw new Expectation(message);
}

// Playwright: $TW_E2E_PLAYWRIGHT, else this repo's node_modules, else nb-web-tests' copy.
function loadPlaywright() {
    const candidates = [
        process.env.TW_E2E_PLAYWRIGHT,
        path.join(__dirname, '..', '..', 'node_modules', 'playwright'),
        path.join(os.homedir(), 'dev', 'nb-web-tests', 'e2e', 'node_modules', 'playwright'),
    ].filter(Boolean);
    for (const c of candidates) {
        if (fs.existsSync(path.join(c, 'package.json'))) return require(c);
    }
    throw new Error('Playwright not found; set TW_E2E_PLAYWRIGHT to its package folder');
}

// Refuse anything that could be the live server or the real task database.
function guard() {
    const port = process.env.TW_WEB_PORT || '';
    const rc   = process.env.TASKRC || '';
    const data = process.env.TASKDATA || '';
    const sets = process.env.TW_WEB_SETTINGS || '';   // its own settings.json, not the folder's
    if (!port || port === '5000' || !rc.includes('/tw-web-scratch.') ||
        data.startsWith(path.join(os.homedir(), '.task')) || !sets.includes('/tw-web-scratch.')) {
        throw new Error(`not a scratch server (port ${port}, TASKRC ${rc}); run through tests/e2e/run.py`);
    }
}

const B = `http://localhost:${process.env.TW_WEB_PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function task(...args) {
    guard();
    return execFileSync('task', ['rc.verbose=nothing', ...args], { encoding: 'utf8', env: process.env });
}

function exportOne(filter) {
    return JSON.parse(task(filter, 'export'))[0];
}

async function cardTexts(pg, scope = '#tasks-container') {
    return pg.$$eval(`${scope} .card-desc-text`, els => els.map(e => e.textContent));
}

function check(fn) {
    (async () => {
        guard();
        const { chromium } = loadPlaywright();
        const browser = await chromium.launch();
        try {
            const pg = await browser.newPage();
            pg.on('dialog', d => d.accept());
            await fn(pg);
        } finally {
            await browser.close();
        }
    })().then(
        () => { console.log('ok'); process.exit(0); },
        e => {
            const failed = e instanceof Expectation;
            console.log((failed ? 'expected: ' : 'error: ') + e.message);
            process.exit(failed ? 1 : 2);
        });
}

module.exports = { check, expect, task, exportOne, B, sleep, cardTexts };
