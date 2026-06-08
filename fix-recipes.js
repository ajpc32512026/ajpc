#!/usr/bin/env node
/* =========================================================
   RECIPE FIX SCRIPT — AJPC Kitchen Notebook
   Run from your project root:
     node fix-recipes.js

   Fixes (in place):
   1. Removes deprecated "emoji" field
   2. Sets recipe.id to match filename
   3. Adds lastModified if missing (today's date)
   4. Removes related recipe entries whose IDs are not
      in recipe-index.json (broken links)

   Does NOT touch tags — run audit-recipes.js after to
   review any remaining unofficial tag warnings.
   
   Creates a backup folder: data/recipes/_backup_YYYYMMDD/
   before making any changes.
========================================================= */

const fs   = require('fs');
const path = require('path');

const RECIPES_DIR = path.join(__dirname, 'data/recipes');
const INDEX_PATH  = path.join(__dirname, 'json/recipe-index.json');
const TODAY       = new Date().toISOString().split('T')[0];

// ── Load index ────────────────────────────────────────────
let indexIds = new Set();
try {
    const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    indexIds = new Set(index.map(r => r.id));
    console.log(`Loaded recipe index: ${indexIds.size} entries`);
} catch(e) {
    console.error('ERROR: Could not load recipe-index.json —', e.message);
    process.exit(1);
}

// ── Backup ────────────────────────────────────────────────
const backupDir = path.join(RECIPES_DIR, `_backup_${TODAY.replace(/-/g,'')}`);
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`Backup folder created: ${backupDir}`);
}

// ── Process recipes ───────────────────────────────────────
const files = fs.readdirSync(RECIPES_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .sort();

const stats = {
    total: files.length,
    emojiRemoved: 0,
    idFixed: 0,
    dateAdded: 0,
    relatedFixed: 0,
    errors: [],
};

files.forEach(file => {
    const filePath = path.join(RECIPES_DIR, file);
    const expectedId = file.replace('.json', '');
    let recipe;

    // Parse
    try {
        recipe = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch(e) {
        stats.errors.push(`${file}: Invalid JSON — ${e.message}`);
        return;
    }

    // Backup original
    fs.copyFileSync(filePath, path.join(backupDir, file));

    let changed = false;

    // Fix 1: Remove emoji field
    if ('emoji' in recipe) {
        delete recipe.emoji;
        stats.emojiRemoved++;
        changed = true;
    }

    // Fix 2: Set id to match filename
    if (recipe.id !== expectedId) {
        recipe.id = expectedId;
        stats.idFixed++;
        changed = true;
    }

    // Fix 3: Add lastModified if missing
    if (!recipe.lastModified) {
        recipe.lastModified = TODAY;
        stats.dateAdded++;
        changed = true;
    }

    // Fix 4: Remove related entries whose IDs aren't in index
    if (Array.isArray(recipe.related) && recipe.related.length) {
        const before = recipe.related.length;
        recipe.related = recipe.related.filter(r => {
            if (!r.id) return false;
            return indexIds.has(r.id);
        });
        if (recipe.related.length !== before) {
            stats.relatedFixed += (before - recipe.related.length);
            changed = true;
        }
        // Remove empty array
        if (!recipe.related.length) delete recipe.related;
    }

    // Write back only if something changed
    if (changed) {
        fs.writeFileSync(filePath, JSON.stringify(recipe, null, 2) + '\n', 'utf8');
    }
});

// ── Report ────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════╗');
console.log(  '║         AJPC RECIPE FIX REPORT                      ║');
console.log(  '╚══════════════════════════════════════════════════════╝\n');
console.log(`Total recipes processed : ${stats.total}`);
console.log(`Emoji fields removed    : ${stats.emojiRemoved}`);
console.log(`IDs fixed to filename   : ${stats.idFixed}`);
console.log(`lastModified added      : ${stats.dateAdded}`);
console.log(`Broken related removed  : ${stats.relatedFixed}`);

if (stats.errors.length) {
    console.log(`\nERRORS (${stats.errors.length}):`);
    stats.errors.forEach(e => console.log(`  ${e}`));
}

console.log(`\nBackup saved to: ${backupDir}`);
console.log('\nRun node audit-recipes.js to verify.');
console.log('');
