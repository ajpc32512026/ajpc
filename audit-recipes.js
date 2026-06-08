#!/usr/bin/env node
/* =========================================================
   RECIPE AUDIT SCRIPT — AJPC Kitchen Notebook
   Run from your project root:
     node audit-recipes.js

   Checks every JSON file in data/recipes/ for:
   1. Emoji in any string field
   2. The deprecated "emoji" field
   3. Missing required fields (id, title, category, description)
   4. Missing difficulty field
   5. Ingredients with no quantity AND no unit AND no toTaste flag
   6. Method steps with no instruction text
   7. Broken internal links (related recipe IDs not in index)
   8. Nutrition block present but missing key fields
   9. Tags not in official-tag-vocabulary.json (if present)
  10. lastModified field missing
========================================================= */

const fs   = require('fs');
const path = require('path');

// ── Config — adjust paths if needed ──────────────────────
const RECIPES_DIR   = path.join(__dirname, 'data/recipes');
const INDEX_PATH    = path.join(__dirname, 'json/recipe-index.json');
const TAG_VOC_PATH  = path.join(__dirname, 'json/official-tag-vocabulary.json');

// ── Emoji detector ────────────────────────────────────────
function hasEmoji(str) {
    if (typeof str !== 'string') return false;
    return /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(str);
}

function findEmoji(obj, path = '') {
    const found = [];
    if (typeof obj === 'string') {
        if (hasEmoji(obj)) found.push({ path, value: obj.slice(0, 60) });
    } else if (Array.isArray(obj)) {
        obj.forEach((v, i) => found.push(...findEmoji(v, `${path}[${i}]`)));
    } else if (obj && typeof obj === 'object') {
        for (const k in obj) found.push(...findEmoji(obj[k], path ? `${path}.${k}` : k));
    }
    return found;
}

// ── Load support files ────────────────────────────────────
let recipeIndex = [];
let officialTags = new Set();

try {
    recipeIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
} catch(e) {
    console.warn('Warning: could not load recipe-index.json —', e.message);
}

try {
    const vocab = JSON.parse(fs.readFileSync(TAG_VOC_PATH, 'utf8'));
    officialTags = new Set(vocab.flatList || []);
} catch(e) {
    console.warn('Warning: could not load official-tag-vocabulary.json —', e.message);
}

const indexIds = new Set(recipeIndex.map(r => r.id));

// ── Run audit ─────────────────────────────────────────────
if (!fs.existsSync(RECIPES_DIR)) {
    console.error(`ERROR: Recipes directory not found: ${RECIPES_DIR}`);
    process.exit(1);
}

const files = fs.readdirSync(RECIPES_DIR).filter(f => f.endsWith('.json')).sort();
const results = { clean: [], issues: [] };

files.forEach(file => {
    const filePath = path.join(RECIPES_DIR, file);
    let recipe;

    try {
        recipe = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch(e) {
        results.issues.push({ file, errors: [`INVALID JSON: ${e.message}`] });
        return;
    }

    const errors   = [];
    const warnings = [];

    // 1. Emoji anywhere in the recipe
    const emojiHits = findEmoji(recipe);
    emojiHits.forEach(h => errors.push(`Emoji in ${h.path}: "${h.value}"`));

    // 2. Deprecated emoji field
    if ('emoji' in recipe) errors.push('Deprecated "emoji" field present');

    // 3. Required fields
    ['id','title','category','description'].forEach(f => {
        if (!recipe[f] || !String(recipe[f]).trim()) errors.push(`Missing required field: ${f}`);
    });

    // 4. Difficulty
    if (!recipe.difficulty) warnings.push('Missing difficulty field');

    // 5. lastModified
    if (!recipe.lastModified) warnings.push('Missing lastModified field');

    // 6. Ingredients
    (recipe.ingredients || []).forEach((ing, i) => {
        if (ing.heading || ing.toTaste) return;
        if (!ing.quantity && !ing.unit && !ing.toTaste) {
            warnings.push(`Ingredient [${i}] "${ing.item || '?'}" has no quantity or unit`);
        }
    });

    // 7. Method steps
    (recipe.method || []).forEach((step, i) => {
        if (step.heading) return;
        if (!step.instruction || !String(step.instruction).trim()) {
            errors.push(`Method step [${i}] has no instruction text`);
        }
    });

    // 8. Related recipe IDs
    (recipe.related || []).forEach(r => {
        if (r.id && !indexIds.has(r.id)) {
            warnings.push(`Related recipe ID not in index: "${r.id}"`);
        }
    });

    // 9. Nutrition block completeness
    if (recipe.nutrition) {
        ['cal','protein','carbs','fat','sodium'].forEach(f => {
            if (recipe.nutrition[f] === undefined) {
                warnings.push(`Nutrition block missing field: ${f}`);
            }
        });
    }

    // 10. Tags not in official vocabulary
    if (officialTags.size && recipe.tags) {
        recipe.tags.forEach(t => {
            if (!officialTags.has(t)) warnings.push(`Unofficial tag: "${t}"`);
        });
    }

    // 11. ID matches filename
    const expectedId = file.replace('.json', '');
    if (recipe.id && recipe.id !== expectedId) {
        errors.push(`ID mismatch: file is "${expectedId}" but recipe.id is "${recipe.id}"`);
    }

    if (errors.length || warnings.length) {
        results.issues.push({ file, errors, warnings });
    } else {
        results.clean.push(file);
    }
});

// ── Report ────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════╗');
console.log(  '║         AJPC RECIPE AUDIT REPORT                    ║');
console.log(  '╚══════════════════════════════════════════════════════╝\n');

console.log(`Total recipes scanned : ${files.length}`);
console.log(`Clean                 : ${results.clean.length}`);
console.log(`Has issues            : ${results.issues.length}`);

if (results.issues.length) {
    console.log('\n── ISSUES ──────────────────────────────────────────────\n');
    results.issues.forEach(({ file, errors, warnings }) => {
        console.log(`  ${file}`);
        errors.forEach(e   => console.log(`    ERROR   ${e}`));
        warnings.forEach(w => console.log(`    WARN    ${w}`));
    });
} else {
    console.log('\nAll recipes passed audit.');
}

// ── Summary of error types ────────────────────────────────
const errorTypes = {};
results.issues.forEach(({ errors, warnings }) => {
    [...errors, ...warnings].forEach(msg => {
        const key = msg.split(':')[0].trim();
        errorTypes[key] = (errorTypes[key] || 0) + 1;
    });
});

if (Object.keys(errorTypes).length) {
    console.log('\n── ERROR SUMMARY ───────────────────────────────────────\n');
    Object.entries(errorTypes)
        .sort((a, b) => b[1] - a[1])
        .forEach(([k, v]) => console.log(`  ${v}x  ${k}`));
}

console.log('\n────────────────────────────────────────────────────────\n');

// Exit code 1 if any hard errors found
const hasHardErrors = results.issues.some(r => r.errors.length > 0);
process.exit(hasHardErrors ? 1 : 0);
