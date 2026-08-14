#!/usr/bin/env node
/* ====================================================================
   MASTER INGREDIENTS CONSOLIDATOR — The Kitchen Notebook
   Run from your project root:
     node consolidate-ingredients.js
==================================================================== */

const fs = require('fs');
const path = require('path');

// ── Config: Path structure set to read from the "json" folder ──
const PATHS = {
    STAPLES:   path.join(__dirname, 'json/pantry-staples.json'),
    PRICES:    path.join(__dirname, 'json/recipe-prices.json'),
    INVENTORY: path.join(__dirname, 'json/ingredient_inventory_v7.json'),
    OUTPUT:    path.join(__dirname, 'json/master-ingredients.json')
};

// ── Merge Map: Defines which duplicates/variants merge into which targets ──
const MERGE_MAP = {
    "apples": ["apple", "apple whole"],
    "apricots": ["apricot", "apricots dried"],
    "bananas": ["banana", "banana cavendish"],
    "carrots": ["carrot", "carrot baby", "baby carrots"],
    "chicken breast": ["chicken breasts"],
    "tomatoes": ["tomato", "tomato whole", "tomatoes"],
    "shallots": ["shallot"],
    "jalapenos": ["jalapeno", "pickled jalapenos", "jalapeno pickled", "jalapenos fresh"],
    "mushrooms": ["mushrooms sliced", "sliced mushrooms"],
    "parmesan": ["cheese parmesan", "cheese parmesan shaved", "cheese parmesan shredded", "shredded parmesan", "parmesan cheese", "parmesan shaved"],
    "mozzarella": ["cheese mozzarella", "mozzarella cheese"],
    "cheddar": ["cheese cheddar", "cheese cheddar vintage", "vintage cheddar"],
    "tasty cheese": ["cheese tasty", "cheese tasty block", "tasty cheese block"],
    "cream cheese": ["cheese cream", "philadelphia cream cheese"],
    "sour cream": ["cream sour"],
    "thickened cream": ["cream thickened"],
    "pure cream": ["cream pure"],
    "cooking cream": ["cream cooking"],
    "full-cream milk": ["milk full-cream", "milk powder full-cream"],
    "skim milk": ["milk skim", "milk powder skim"],
    "olive oil": ["oil olive"],
    "sesame oil": ["oil sesame"],
    "vegetable oil": ["oil vegetable"],
    "peanut oil": ["oil peanut"],
    "sunflower oil": ["oil sunflower"],
    "coconut oil": ["oil coconut"],
    "pineapple slices": ["pineapple rings", "pineapple pieces", "pineapple chunks", "pineapple crushed", "crushed pineapple", "pineapple slices"],
    "salt": ["fine salt", "sea salt flakes", "salt & pepper"]
};

// Inverse lookup helper to find the target master term for any given synonym
function getMasterTarget(name) {
    const cleaned = name.toLowerCase().trim();
    for (const [target, aliases] of Object.entries(MERGE_MAP)) {
        if (aliases.map(a => a.toLowerCase().trim()).includes(cleaned) || target.toLowerCase().trim() === cleaned) {
            return target;
        }
    }
    return cleaned;
}

function loadJSON(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(`Warning: Could not load/parse ${filePath}. Error: ${e.message}`);
        return null;
    }
}

function capitalize(str) {
    return str.replace(/\b\w/g, c => c.toUpperCase());
}

function run() {
    console.log('Starting ingredient database consolidation...\n');

    const staples = loadJSON(PATHS.STAPLES);
    const prices = loadJSON(PATHS.PRICES);
    const inventory = loadJSON(PATHS.INVENTORY);

    if (!staples) {
        console.error('CRITICAL: pantry-staples.json is required to build the master list. Aborting.');
        process.exit(1);
    }

    const master = {};

    // 1. Build normalized lookup for ingredient inventory (case-insensitive)
    const inventoryLookup = {};
    if (inventory) {
        Object.keys(inventory).forEach(key => {
            inventoryLookup[key.toLowerCase().trim()] = inventory[key];
        });
    }

    // Helper mapping for category snake_case conversion
    const toSnake = (s) => s.toLowerCase().replace(/\s+/g, '_');

    // 2. Process all entries from pantry-staples.json
    Object.keys(staples).forEach(categoryName => {
        const items = staples[categoryName];
        const priceCatKey = toSnake(categoryName);
        const priceCategory = prices ? prices[priceCatKey] : null;

        items.forEach(rawItemName => {
            const itemName = rawItemName.toLowerCase().trim();
            const targetName = getMasterTarget(itemName);

            // Initialize master entry if it doesn't exist yet
            if (!master[targetName]) {
                master[targetName] = {
                    name: targetName,
                    displayName: capitalize(targetName),
                    category: categoryName,
                    aliases: [],
                    priceData: null,
                    wiki: null
                };
            }

            // Ensure the raw synonym/alias is documented in the aliases array
            if (!master[targetName].aliases.includes(itemName)) {
                master[targetName].aliases.push(itemName);
            }
            if (!master[targetName].aliases.includes(targetName)) {
                master[targetName].aliases.unshift(targetName);
            }

            // Bind pricing data (merging first match, favoring target match if possible)
            if (priceCategory) {
                const itemPrice = priceCategory[itemName];
                if (itemPrice) {
                    if (!master[targetName].priceData || itemName === targetName) {
                        master[targetName].priceData = {
                            size: itemPrice.size,
                            unit: itemPrice.unit,
                            price: itemPrice.price,
                            brand: itemPrice.brand
                        };
                    }
                }
            }

            // Bind wiki/inventory metadata
            const wikiData = inventoryLookup[itemName] || inventoryLookup[targetName];
            if (wikiData) {
                if (!master[targetName].wiki || itemName === targetName) {
                    master[targetName].wiki = {
                        purpose: wikiData.purpose || "",
                        storage: wikiData.storage || "",
                        substitutes: wikiData.substitutes || "",
                        notes: wikiData.notes || "",
                        nutrition: wikiData.nutrition || null
                    };
                }
            }
        });
    });

    // 3. Post-processing: clean up lists and sort aliases
    Object.keys(master).forEach(key => {
        const entry = master[key];
        // Deduplicate and sort aliases
        entry.aliases = [...new Set(entry.aliases)].sort();
    });

    // 4. Output the master file
    try {
        const outDir = path.dirname(PATHS.OUTPUT);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        fs.writeFileSync(PATHS.OUTPUT, JSON.stringify(master, null, 2), 'utf8');
        console.log(`Success: Unified database generated at ${PATHS.OUTPUT}`);
        console.log(`Consolidated ${Object.keys(master).length} unique Master ingredients.`);
    } catch (e) {
        console.error(`Error saving master file: ${e.message}`);
        process.exit(1);
    }
}

run();