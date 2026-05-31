// scan-recipes.js
// Run with: node scan-recipes.js

const fs = require('fs');
const path = require('path');

const RECIPES_DIR = 'D:/mysites/ajpc/data/recipes';
const PRICE_DB_PATH = 'D:/mysites/ajpc/json/recipe-prices.json';

// Load price database
let priceDB = {};
try {
    const priceData = JSON.parse(fs.readFileSync(PRICE_DB_PATH, 'utf8'));
    for (const section in priceData) {
        if (section === '_meta') continue;
        for (const key in priceData[section]) {
            priceDB[key.toLowerCase().trim()] = true;
            // Also add singular form for matching
            if (key.endsWith('s') && !key.endsWith('ss') && !key.endsWith('us')) {
                const singular = key.slice(0, -1);
                priceDB[singular] = true;
            }
        }
    }
    console.log(`✅ Loaded price database: ${Object.keys(priceDB).length} entries\n`);
} catch(e) {
    console.error('❌ Could not load price database:', e.message);
    process.exit(1);
}

// Get all recipe files
const recipeFiles = fs.readdirSync(RECIPES_DIR).filter(f => f.endsWith('.json'));
console.log(`📁 Found ${recipeFiles.length} recipe files\n`);

// Helper: normalize ingredient name
function normalizeIngredient(name) {
    if (!name) return '';
    let n = name.toLowerCase().trim();
    // Remove parentheses content
    n = n.replace(/\([^)]*\)/g, '').trim();
    // Remove common prefixes
    const prefixes = ['fresh ', 'dried ', 'ground ', 'whole ', 'shredded ', 'shaved ', 'pure ', 'roasted ', 'toasted ', 'crushed ', 'minced ', 'chopped ', 'sliced ', 'diced ', 'grated ', 'melted ', 'softened ', 'cold ', 'warm ', 'hot ', 'boiling ', 'ice-cold '];
    for (const p of prefixes) {
        if (n.startsWith(p)) {
            n = n.substring(p.length);
            break;
        }
    }
    // Remove common suffixes
    const suffixes = [' powder', ' leaves', ' leaf', ' flakes', ' seeds', ' seed', ' whole', ' pieces', ' piece', ' chunks', ' chunk', ' slices', ' slice', ' sprigs', ' sprig'];
    for (const s of suffixes) {
        if (n.endsWith(s)) {
            n = n.substring(0, n.length - s.length);
            break;
        }
    }
    return n.trim();
}

// Check if ingredient exists in price DB
function ingredientExists(ing) {
    const raw = ing.item || ing.name || '';
    if (!raw) return false;
    
    const normalized = normalizeIngredient(raw);
    
    // Exact match
    if (priceDB[normalized]) return true;
    
    // Contains match
    for (const dbKey of Object.keys(priceDB)) {
        if (dbKey.includes(normalized) || normalized.includes(dbKey)) {
            return true;
        }
    }
    
    return false;
}

// Scan all recipes
const missing = new Map();
let totalIngredients = 0;
let matchedIngredients = 0;
let recipesScanned = 0;

for (const file of recipeFiles) {
    const filePath = path.join(RECIPES_DIR, file);
    try {
        const recipeData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const recipeTitle = recipeData.title || file.replace('.json', '');
        const ingredients = recipeData.ingredients || [];
        
        recipesScanned++;
        let recipeMissing = [];
        
        for (const ing of ingredients) {
            if (ing.heading) continue;
            const ingName = ing.item || ing.name || '';
            if (!ingName) continue;
            
            totalIngredients++;
            
            if (!ingredientExists(ing)) {
                matchedIngredients++; // This is wrong - fix logic
                const displayName = ingName;
                if (!missing.has(displayName)) {
                    missing.set(displayName, []);
                }
                missing.get(displayName).push(recipeTitle);
                recipeMissing.push(displayName);
            } else {
                matchedIngredients++;
            }
        }
        
        if (recipeMissing.length > 0) {
            // console.log(`   ⚠️ ${recipeTitle}: missing ${recipeMissing.length} ingredient(s)`);
        }
        
    } catch(e) {
        console.error(`❌ Error reading ${file}:`, e.message);
    }
}

// Fix the matched count logic
matchedIngredients = totalIngredients - Array.from(missing.values()).reduce((sum, arr) => sum + arr.length, 0);

// Sort missing by frequency
const sortedMissing = Array.from(missing.entries())
    .map(([name, recipes]) => ({ 
        name, 
        count: recipes.length, 
        recipes: [...new Set(recipes)] 
    }))
    .sort((a, b) => b.count - a.count);

// Output results
console.log('\n📊 SCAN RESULTS');
console.log('================');
console.log(`Recipes scanned: ${recipesScanned}/${recipeFiles.length}`);
console.log(`Total ingredients scanned: ${totalIngredients}`);
console.log(`Matched ingredients: ${matchedIngredients}`);
console.log(`Missing ingredients: ${sortedMissing.length}\n`);

if (sortedMissing.length === 0) {
    console.log('🎉 All ingredients are in the price database!');
} else {
    console.log('❌ MISSING INGREDIENTS (need to add to recipe-prices.json):\n');
    
    for (const item of sortedMissing) {
        console.log(`📌 "${item.name}" - appears in ${item.count} recipe(s):`);
        for (const recipe of item.recipes.slice(0, 5)) {
            console.log(`     → ${recipe}`);
        }
        if (item.recipes.length > 5) {
            console.log(`     ... and ${item.recipes.length - 5} more`);
        }
        console.log('');
    }
}

// Output as JSON for easy copying
console.log('\n📋 JSON SUMMARY (copy this for reference):');
const jsonOutput = {};
for (const item of sortedMissing) {
    jsonOutput[item.name] = {
        appears_in: item.count,
        recipes: item.recipes
    };
}
console.log(JSON.stringify(jsonOutput, null, 2));

// Also output a suggested SQL/JSON insert format
console.log('\n📝 SUGGESTED JSON ENTRIES TO ADD (with status "edit"):');
console.log('Add these to the appropriate sections in recipe-prices.json:\n');

for (const item of sortedMissing.slice(0, 20)) {
    // Skip water variations
    if (item.name.toLowerCase().includes('water')) continue;
    
    console.log(`"${item.name.toLowerCase()}": {`);
    console.log(`  "brand": null,`);
    console.log(`  "note": "Need size and price",`);
    console.log(`  "price": null,`);
    console.log(`  "size": null,`);
    console.log(`  "status": "edit",`);
    console.log(`  "unit": null`);
    console.log(`},`);
    console.log('');
}