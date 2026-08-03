#!/usr/bin/env node
/* =========================================================
   PANTRY / PRICES SYNC CHECK — The Kitchen Notebook
   Run from your project root:
     node check-pantry-sync.js

   pantry-staples.js (what shows as checkable in the Pantry
   Stocktake tab) and recipe-prices.json (what powers shopping-list
   costs) must always contain the exact same set of ingredient
   names, category by category. If they ever drift apart again,
   an ingredient either:
     - shows up as checkable in the pantry but has no price behind
       it ("Not in database" in every shopping list that uses it),
       or
     - has a real price entry but is invisible in the Stocktake
       checklist, so nobody can ever tick it off.

   This script fails loudly (non-zero exit code + itemised list)
   the moment that happens, instead of it sitting there silently
   until someone notices a broken shopping list months later.

   Run it by hand before a push, or wire it into push_ajpc.bat /
   a pre-commit hook so it runs automatically.
========================================================= */

const fs  = require('fs');
const path = require('path');
const vm  = require('vm');

// ── Config — adjust paths if your folder layout changes ──
const PRICES_PATH  = path.join(__dirname, 'json/recipe-prices.json');
const STAPLES_PATH = path.join(__dirname, 'js/pantry-staples.js');

function fail(msg) {
    console.error(`\nERROR: ${msg}\n`);
    process.exit(1);
}

// ── Load recipe-prices.json ──────────────────────────────
let prices;
try {
    prices = JSON.parse(fs.readFileSync(PRICES_PATH, 'utf8'));
} catch (e) {
    fail(`Could not read/parse ${PRICES_PATH} — ${e.message}`);
}

// ── Load pantry-staples.js — it's real JS (window.PANTRY_STAPLES
// = {...}), not JSON, so execute it in a small sandbox rather than
// trying to string-hack it into JSON. Handles comments, trailing
// commas, etc. without caring about exact formatting.
let staples;
try {
    const code = fs.readFileSync(STAPLES_PATH, 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    staples = sandbox.window.PANTRY_STAPLES;
    if (!staples) throw new Error('window.PANTRY_STAPLES was never set by the file');
} catch (e) {
    fail(`Could not load/run ${STAPLES_PATH} — ${e.message}`);
}

// ── Compare, category by category ────────────────────────
// pantry-staples.js uses "Title Case With Spaces" category names;
// recipe-prices.json uses "snake_case". This is the one place that
// mapping lives — if you ever rename a category, it self-adapts as
// long as both files follow that same naming pattern.
const toSnake = (s) => s.toLowerCase().replace(/\s+/g, '_');

const report = [];
let mismatchCount = 0;

Object.keys(staples).sort().forEach((pantryCat) => {
    const priceCat = toSnake(pantryCat);
    const staplesSet = new Set(staples[pantryCat].map((s) => s.toLowerCase().trim()));
    const priceItems = prices[priceCat];

    if (!priceItems) {
        report.push({ category: pantryCat, error: `No matching category "${priceCat}" exists in recipe-prices.json at all` });
        mismatchCount += staplesSet.size;
        return;
    }

    const pricesSet = new Set(Object.keys(priceItems).map((s) => s.toLowerCase().trim()));
    const missingPrice = [...staplesSet].filter((s) => !pricesSet.has(s)).sort();
    const missingStaple = [...pricesSet].filter((s) => !staplesSet.has(s)).sort();

    if (missingPrice.length || missingStaple.length) {
        report.push({ category: pantryCat, missingPrice, missingStaple });
        mismatchCount += missingPrice.length + missingStaple.length;
    }
});

// Flag any recipe-prices.json category with no pantry-staples.js
// counterpart at all (renamed/typo'd category, etc.)
const staplesCatKeys = new Set(Object.keys(staples).map(toSnake));
Object.keys(prices).forEach((priceCat) => {
    if (priceCat === '_meta') return;
    if (!staplesCatKeys.has(priceCat)) {
        report.push({ category: priceCat, error: 'Category exists in recipe-prices.json but has no matching category in pantry-staples.js' });
        mismatchCount += Object.keys(prices[priceCat]).length;
    }
});

// ── Report ────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║         PANTRY / PRICES SYNC CHECK                    ║');
console.log('╚══════════════════════════════════════════════════════╝\n');

if (!report.length) {
    console.log(`pantry-staples.js and recipe-prices.json are fully in sync.`);
    console.log(`Checked ${Object.keys(staples).length} categories.\n`);
    process.exit(0);
}

report.forEach((r) => {
    console.log(`  [${r.category}]`);
    if (r.error) {
        console.log(`    ERROR   ${r.error}`);
        return;
    }
    (r.missingPrice || []).forEach((name) =>
        console.log(`    ERROR   "${name}" is checkable in pantry-staples.js but has no price entry in recipe-prices.json`));
    (r.missingStaple || []).forEach((name) =>
        console.log(`    ERROR   "${name}" has a price entry in recipe-prices.json but is missing from pantry-staples.js`));
});

console.log(`\n${mismatchCount} mismatch(es) found across ${report.length} categor${report.length === 1 ? 'y' : 'ies'}.`);
console.log('Fix: add the missing entry to whichever file is missing it, or remove it from the other.\n');

process.exit(1);
