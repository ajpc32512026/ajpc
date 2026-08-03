#!/usr/bin/env node
/* =========================================================
   DATABASE PATCH SCRIPT — The Kitchen Notebook
   Run from your project root:
     node patch-builder-db.js

   Adds your preferred 76 ingredient names directly into 
   recipe-builder.json so they are recognized as Standard.
========================================================= */

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'json/recipe-builder.json');
const TODAY   = new Date().toISOString().split('T')[0];

if (!fs.existsSync(DB_PATH)) {
    console.error(`ERROR: recipe-builder.json not found at: ${DB_PATH}`);
    process.exit(1);
}

// Load current database
let db;
try {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
} catch(e) {
    console.error('ERROR: Could not parse recipe-builder.json —', e.message);
    process.exit(1);
}

// Backup current database first
fs.copyFileSync(DB_PATH, DB_PATH.replace('.json', `_backup_${TODAY.replace(/-/g,'')}.json`));

// Zeroed-out nutritional profile for water/seasonings
const ZERO_PROFILE = {
    "cal": 0, "carbs": 0, "fat": 0, "fiber": 0, "protein": 0, "saturated_fat": 0, "sodium": 0, "sugars": 0
};

// Map your exact recipe terms to existing nutritional equivalents in the database
const DB_MAP = {
    "apple juice": "apple",
    "apricot": "apricots (dried)",
    "apricot jam": "jam",
    "bakers flour": "bread flour",
    "beef bones": "beef",
    "beef knuckles": "beef",
    "beef scraps": "beef",
    "beef shanks": "beef",
    "beef, scotch fillet": "scotch fillet",
    "bihon rice noodles": "vermicelli rice noodles",
    "black chia seeds": "chia seeds",
    "black peppercorns": "black pepper",
    "black quinoa": "quinoa",
    "breadcrumbs": "bread",
    "butter": "unsalted butter",
    "cake crumbs": "bread",
    "camembert cheese": "cheese",
    "carrots": "carrot",
    "chicken drum sticks": "chicken",
    "chicken stock cube": "chicken stock",
    "chilli garlic sauce": "chili garlic sauce",
    "chocolate sprinkles": "chocolate",
    "cinnamon stick": "cinnamon",
    "coffee": "coffee (brewed)",
    "cumin seeds": "cumin",
    "dark chocolate chips": "chocolate chips",
    "diced lamb": "lamb rack",
    "dried dates": "dates",
    "dried red chilli": "red chili",
    "fish fillet": "fish",
    "fresh coriander": "coriander",
    "fresh ginger": "ginger (fresh)",
    "fresh oregano": "oregano",
    "fresh oysters": "oysters",
    "fresh parsley": "parsley",
    "fresh rosemary": "rosemary",
    "fresh thyme": "thyme",
    "frozen puff pastry": "puff pastry",
    "gentle fibre": "bran",
    "granny smith apple": "apple",
    "greek yoghurt": "greek yogurt",
    "green cardamom pods": "cardamom",
    "ground allspice": "allspice",
    "ground cardamom": "cardamom",
    "ground cinnamon": "cinnamon",
    "ground coriander": "coriander",
    "ground cumin": "cumin",
    "ground red chilli": "red chili",
    "ground turmeric": "turmeric",
    "hemp seed protein": "hemp protein powder",
    "ketchup": "tomato sauce",
    "lamb cutlets": "lamb rack",
    "lemon juice": "lemon",
    "light brown sugar": "brown sugar",
    "naan bread": "bread",
    "natural vanilla extract": "vanilla",
    "pepitas": "pumpkin seeds",
    "philadelphia cream cheese": "cream cheese",
    "pure cream": "cream",
    "pure icing sugar": "icing sugar",
    "quinoa tri colour": "quinoa",
    "red chilli": "red chili",
    "red chilli flakes": "chili flakes",
    "salt & pepper": "salt",
    "slivered almonds": "almonds",
    "snow peas": "peas",
    "spreadable butter": "unsalted butter",
    "sugar": "white sugar",
    "thickened cream": "cream",
    "white chia seeds": "chia seeds",
    "white quinoa": "quinoa",
    "whole cloves": "cloves"
};

const ZERO_ITEMS = ["boiling water", "hot water", "warm water", "water"];

let addedCount = 0;

// Add mapped items
for (const [newKey, baseKey] of Object.entries(DB_MAP)) {
    if (!db[newKey]) {
        if (db[baseKey]) {
            db[newKey] = { ...db[baseKey] };
            addedCount++;
        } else {
            console.warn(`Warning: Base key "${baseKey}" not found in database for "${newKey}"`);
        }
    }
}

// Add zero-profile items
ZERO_ITEMS.forEach(key => {
    if (!db[key]) {
        db[key] = { ...ZERO_PROFILE };
        addedCount++;
    }
});

if (addedCount > 0) {
    // Sort database keys alphabetically
    const sortedDb = {};
    Object.keys(db).sort().forEach(k => {
        sortedDb[k] = db[k];
    });

    fs.writeFileSync(DB_PATH, JSON.stringify(sortedDb, null, 2) + '\n', 'utf8');
    console.log(`\nSuccess: Added ${addedCount} missing ingredients to recipe-builder.json`);
    console.log(`Total database entries: ${Object.keys(sortedDb).length}`);
} else {
    console.log("\nAll items are already supported in your recipe-builder.json.");
}