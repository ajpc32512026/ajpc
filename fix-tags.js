#!/usr/bin/env node
/* =========================================================
   TAG FIX SCRIPT — AJPC Kitchen Notebook
   Run from your project root:
     node fix-tags.js

   1. Updates official-tag-vocabulary.json with new tags
   2. Fixes recipes with wrong-spelling unofficial tags
   3. Removes recipe tags that are too niche for the vocab
========================================================= */

const fs   = require('fs');
const path = require('path');

const RECIPES_DIR = path.join(__dirname, 'data/recipes');
const TAG_VOC_PATH = path.join(__dirname, 'json/official-tag-vocabulary.json');
const TODAY = new Date().toISOString().split('T')[0];

// ── Tags to ADD to official vocabulary ───────────────────
const VOCAB_ADDITIONS = {
    characteristics: [
        'Easy', 'Retro', 'Healthy', 'Freezer Friendly',
        'Beginner Friendly', 'No-Cook', 'Single Serve', 'Flaky',
    ],
    mealType: [
        'Baking', 'Cookies',
    ],
    keyIngredients: [
        'Apricot', 'Cherry', 'Pineapple', 'Caramel', 'Chia Seeds',
    ],
    time: [
        'Under 10 Minutes', 'Microwave',
    ],
    technique: [
        'Puff Pastry', 'Lamination', 'Multigrain', 'Seeded',
    ],
    style: [
        'Cake', 'Pound Cake', 'Fruit Dessert', 'Pantry Recipe',
        'Upside-Down Cake', 'Foundation', 'Bistro',
    ],
};

// ── Tags to REPLACE in recipes (wrong → correct) ─────────
const REPLACEMENTS = {
    'Gluten Free':  'Gluten-Free',
    'Savory':       'Savoury',
    'No Bake':      'No-Bake',
    'No-Bake':      'No-Bake',   // already correct, no-op
};

// ── Tags to REMOVE from recipes entirely ─────────────────
const REMOVE_TAGS = new Set([
    'Feuilletage', 'Classic Pastry', 'Butter Block',
    'Traditional Puff', 'Quick Puff', 'Pastry Dough',
    'Rough Puff', 'French Pastry', 'Advanced', 'Worth It',
]);

// ── Step 1: Update vocabulary file ───────────────────────
let vocab;
try {
    vocab = JSON.parse(fs.readFileSync(TAG_VOC_PATH, 'utf8'));
} catch(e) {
    console.error('ERROR: Could not load official-tag-vocabulary.json —', e.message);
    process.exit(1);
}

// Backup vocab
fs.copyFileSync(TAG_VOC_PATH, TAG_VOC_PATH.replace('.json', `_backup_${TODAY.replace(/-/g,'')}.json`));

let vocabAdded = 0;
for (const [category, tags] of Object.entries(VOCAB_ADDITIONS)) {
    if (!vocab.tagVocabulary[category]) {
        vocab.tagVocabulary[category] = [];
    }
    tags.forEach(tag => {
        if (!vocab.tagVocabulary[category].includes(tag)) {
            vocab.tagVocabulary[category].push(tag);
            vocabAdded++;
        }
        if (!vocab.flatList.includes(tag)) {
            vocab.flatList.push(tag);
        }
    });
}

// Sort everything
vocab.flatList.sort();
for (const cat of Object.keys(vocab.tagVocabulary)) {
    vocab.tagVocabulary[cat].sort();
}
vocab.notes.totalTags = vocab.flatList.length;
vocab.notes.lastUpdated = TODAY;

fs.writeFileSync(TAG_VOC_PATH, JSON.stringify(vocab, null, 2) + '\n', 'utf8');
console.log(`Vocabulary updated: ${vocabAdded} tags added, total now ${vocab.flatList.length}`);

// ── Step 2: Fix recipes ───────────────────────────────────
const files = fs.readdirSync(RECIPES_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .sort();

const stats = { fixed: 0, replaced: 0, removed: 0 };

files.forEach(file => {
    const filePath = path.join(RECIPES_DIR, file);
    let recipe;
    try {
        recipe = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch(e) { return; }

    if (!Array.isArray(recipe.tags) || !recipe.tags.length) return;

    const before = [...recipe.tags];
    let tags = recipe.tags;

    // Apply replacements
    tags = tags.map(t => REPLACEMENTS[t] !== undefined ? REPLACEMENTS[t] : t);

    // Remove niche tags
    tags = tags.filter(t => !REMOVE_TAGS.has(t));

    // Deduplicate
    tags = [...new Set(tags)];

    const replaced = before.filter((t, i) => REPLACEMENTS[t] && REPLACEMENTS[t] !== t).length;
    const removed  = before.filter(t => REMOVE_TAGS.has(t)).length;

    if (JSON.stringify(tags) !== JSON.stringify(before)) {
        recipe.tags = tags;
        recipe.lastModified = TODAY;
        fs.writeFileSync(filePath, JSON.stringify(recipe, null, 2) + '\n', 'utf8');
        stats.fixed++;
        stats.replaced += replaced;
        stats.removed  += removed;
        if (replaced || removed) {
            console.log(`  ${file}: ${replaced} replaced, ${removed} removed`);
        }
    }
});

// ── Report ────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════╗');
console.log(  '║         AJPC TAG FIX REPORT                         ║');
console.log(  '╚══════════════════════════════════════════════════════╝\n');
console.log(`Vocabulary tags added   : ${vocabAdded}`);
console.log(`Recipes modified        : ${stats.fixed}`);
console.log(`Tags replaced (typos)   : ${stats.replaced}`);
console.log(`Tags removed (niche)    : ${stats.removed}`);
console.log('\nRun node audit-recipes.js to verify.');
console.log('');
