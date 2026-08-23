/* =========================================================
   MIGRATION & CONSOLIDATION SCRIPT — The Kitchen Notebook
   Run once: node restructure-ingredients.js
========================================================= */

const fs = require('fs');
const path = require('path');

const INVENTORY_PATH = path.join(__dirname, '../json/ingredient_inventory_v7.json');
const MASTER_PATH = path.join(__dirname, '../json/master-ingredients.json');
const STAPLES_PATH = path.join(__dirname, '../json/pantry-staples.json');
const PRICES_PATH = path.join(__dirname, '../json/recipe-prices.json');
const NUTRITION_PATH = path.join(__dirname, '../json/recipe-builder.json');
const OUTPUT_PATH = path.join(__dirname, '../json/ingredients-master.json');

function toTitleCase(s) {
    if (!s) return '';
    return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

const snakeToTitleMap = {
    'baking_extras': 'Baking Extras',
    'bread_bakery': 'Bread Bakery',
    'butter_dairy': 'Butter Dairy',
    'canned_fish_seafood': 'Canned Fish Seafood',
    'canned_fruit': 'Canned Fruit',
    'canned_tomatoes': 'Canned Tomatoes',
    'cheese': 'Cheese',
    'dried_fruit_nuts': 'Dried Fruit Nuts',
    'drinks_alcohol': 'Drinks Alcohol',
    'eggs': 'Eggs',
    'flour_baking': 'Flour Baking',
    'fresh_fruit': 'Fresh Fruit',
    'fresh_herbs': 'Fresh Herbs',
    'fresh_vegetables': 'Fresh Vegetables',
    'meat_poultry': 'Meat Poultry',
    'milk_cream': 'Milk Cream',
    'oils': 'Oils',
    'pasta_noodles': 'Pasta Noodles',
    'rice_grains': 'Rice Grains',
    'sauces_condiments': 'Sauces Condiments',
    'seeds_superfoods': 'Seeds Superfoods',
    'snacks_biscuits': 'Snacks Biscuits',
    'spices_seasonings': 'Spices Seasonings',
    'spreads': 'Spreads',
    'stock_broth': 'Stock Broth',
    'sugar_sweeteners': 'Sugar Sweeteners',
    'yoghurt': 'Yoghurt'
};

async function migrate() {
    console.log('Starting ingredient database consolidation...');

    let inventory = {};
    let master = {};
    let staples = {};
    let prices = {};
    let nutrition = {};

    if (fs.existsSync(INVENTORY_PATH)) {
        inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
    }
    if (fs.existsSync(MASTER_PATH)) {
        master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
    }
    if (fs.existsSync(STAPLES_PATH)) {
        staples = JSON.parse(fs.readFileSync(STAPLES_PATH, 'utf8'));
    }
    if (fs.existsSync(PRICES_PATH)) {
        prices = JSON.parse(fs.readFileSync(PRICES_PATH, 'utf8'));
    }
    if (fs.existsSync(NUTRITION_PATH)) {
        nutrition = JSON.parse(fs.readFileSync(NUTRITION_PATH, 'utf8'));
    }

    const masterMap = {};
    const allKeys = new Set();

    Object.keys(inventory).forEach(k => allKeys.add(k.toLowerCase().trim()));
    Object.keys(master).forEach(k => allKeys.add(k.toLowerCase().trim()));
    Object.keys(nutrition).forEach(k => allKeys.add(k.toLowerCase().trim()));

    allKeys.forEach(rawKey => {
        if (!rawKey) return;

        let displayName = toTitleCase(rawKey);
        let category = 'Other';
        let aka = [];
        let priceData = null;
        let nutrData = null;
        let wikiData = null;

        // Resolve display name and category from original inventory key
        const invKey = Object.keys(inventory).find(k => k.toLowerCase().trim() === rawKey);
        if (invKey) {
            displayName = invKey;
            const item = inventory[invKey];
            if (item.category) category = item.category;
            if (Array.isArray(item.aka)) aka = item.aka.map(a => a.toLowerCase().trim());
            wikiData = {
                purpose: item.purpose || '',
                notes: item.notes || '',
                storage: item.storage || '',
                substitutes: item.substitutes || '',
                usageTips: item.usageTips || '',
                usedIn: item.usedIn || []
            };
        }

        // Merge attributes from master ingredients list
        const mKey = Object.keys(master).find(k => k.toLowerCase().trim() === rawKey);
        if (mKey) {
            const item = master[mKey];
            if (item.displayName) displayName = item.displayName;
            if (item.category) category = item.category;
            if (Array.isArray(item.aliases)) {
                item.aliases.forEach(a => {
                    const norm = a.toLowerCase().trim();
                    if (!aka.includes(norm)) aka.push(norm);
                });
            }
            if (item.priceData) {
                priceData = item.priceData;
            }
        }

        // Fallback category resolution from staples list
        if (category === 'Other') {
            for (const cat in staples) {
                const found = staples[cat].some(s => s.toLowerCase().trim() === rawKey);
                if (found) {
                    category = cat;
                    break;
                }
            }
        }

        // Fallback pricing resolution from nested prices structure
        if (!priceData) {
            for (const snakeCat in prices) {
                if (snakeCat === '_meta') continue;
                const matchName = Object.keys(prices[snakeCat]).find(k => k.toLowerCase().trim() === rawKey);
                if (matchName) {
                    const p = prices[snakeCat][matchName];
                    priceData = {
                        size: p.size,
                        unit: p.unit,
                        price: p.price,
                        brand: p.brand || ''
                    };
                    if (category === 'Other' && snakeToTitleMap[snakeCat]) {
                        category = snakeToTitleMap[snakeCat];
                    }
                    break;
                }
            }
        }

        // Map nutrition profiles
        const nutKey = Object.keys(nutrition).find(k => k.toLowerCase().trim() === rawKey);
        if (nutKey) {
            nutrData = nutrition[nutKey];
        }

        // Clean up list properties
        if (!aka.includes(rawKey)) aka.unshift(rawKey);

        masterMap[rawKey] = {
            name: rawKey,
            displayName: displayName,
            category: category,
            aliases: aka,
            priceData: priceData,
            nutrition: nutrData,
            wiki: wikiData
        };
    });

    // Write unified output
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(masterMap, null, 2), 'utf8');
    console.log(`\nSuccess! Created unified master file at ${OUTPUT_PATH}`);
    console.log(`Consolidated ${Object.keys(masterMap).length} total structured items.\n`);

    // Safely rename obsolete original files to protect user backups
    const filesToDecommission = [
        { path: INVENTORY_PATH, name: 'ingredient_inventory_v7.json' },
        { path: MASTER_PATH, name: 'master-ingredients.json' },
        { path: STAPLES_PATH, name: 'pantry-staples.json' },
        { path: NUTRITION_PATH, name: 'recipe-builder.json' },
        { path: PRICES_PATH, name: 'recipe-prices.json' },
        { path: path.join(__dirname, '../js/pantry-staples.js'), name: 'pantry-staples.js' },
        { path: path.join(__dirname, '../js/check-pantry-sync.js'), name: 'check-pantry-sync.js' }
    ];

    filesToDecommission.forEach(f => {
        if (fs.existsSync(f.path)) {
            const dir = path.dirname(f.path);
            const decommissionedPath = path.join(dir, `DELETEME_${f.name}`);
            fs.renameSync(f.path, decommissionedPath);
            console.log(`Decommissioned: ${f.name} -> DELETEME_${f.name}`);
        }
    });

    console.log('\nMigration and safety backups completed successfully.');
}

migrate();