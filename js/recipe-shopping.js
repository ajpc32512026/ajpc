// recipe-shopping.js - KitchenNotebook Kitchen Notebook
// Loads price database via HTTP once, caches in sessionStorage
// No file picker, no prompts, no "Load Price DB" button
// Saves by downloading the file (you replace manually)

(function() {
    'use strict';

    const CACHE_KEY = 'ajpc_price_database';
    const CACHE_TIMESTAMP_KEY = 'ajpc_price_timestamp';
    const MASTER_CACHE_KEY = 'ajpc_ingredients_master_raw';

    let priceDatabase = null;
    let fullIngredientsMaster = null; // the raw, complete ingredients-master.json — needed so saves can download the WHOLE file (aliases, nutrition, reference) intact, not just prices
    let currentRecipeData = null;
    let currentMultiplier = 1;
    let currentBaseServings = 1;
    let currentPanel = null;

    // Single shared list — calculateRecipeCost and showShoppingList used to
    // keep their own copies of this and had quietly drifted apart (one
    // excluded "ice-cold water", the other didn't). One list now, used by
    // both, so a recipe using either water phrasing is treated the same
    // way everywhere on the site.
    const EXCLUDE_ITEMS = ['water', 'hot water', 'cold water', 'warm water', 'boiling water', 'tap water', 'ice-cold water', 'salt', 'pepper', 'black pepper', 'white pepper', 'to taste'];

    // Parses a recipe's raw ingredient lines into {name, displayName, qty,
    // unit}, scaled by `multiplier` and filtered against EXCLUDE_ITEMS, then
    // MERGES lines that share the same ingredient name — a recipe with
    // multiple sections (e.g. "Bakers Flour" in both a Poolish and a Bread
    // Dough section) would otherwise be priced and pantry-checked as if it
    // were two separate ingredients, double-counting cost and rounding
    // package quantities up twice instead of once. Quantities combine via
    // UNIT_TO_BASE when the units differ but are both weight/volume; lines
    // with incompatible units (e.g. "each" vs "g") are left as separate
    // lines rather than guessing a conversion. Used by both
    // calculateRecipeCost and showShoppingList so this logic lives in
    // exactly one place.
    function buildMergedIngredientList(recipe, multiplier) {
        const raw = [];
        (recipe.ingredients || []).forEach(function(ing) {
            if (ing.heading || ing.toTaste) return;
            const rawQty = parseFloat(ing.quantity);
            const qtyVal = (isNaN(rawQty) ? 0 : rawQty) * multiplier;
            const unit = (ing.unit || '').toLowerCase();
            const rawItem = (ing.item || ing.name || '').trim();
            const parsed = splitIngredientAndNotes(rawItem);
            const name = parsed.ingredient.toLowerCase();
            if (!name || EXCLUDE_ITEMS.includes(name)) return;
            raw.push({ name: name, displayName: ing.item || ing.name || name, qty: qtyVal, unit: unit });
        });

        const merged = [];
        const indexByName = {};
        raw.forEach(function(ing) {
            const idx = indexByName.hasOwnProperty(ing.name) ? indexByName[ing.name] : -1;
            if (idx === -1) {
                indexByName[ing.name] = merged.length;
                merged.push(Object.assign({}, ing));
                return;
            }
            const existing = merged[idx];
            const eu = normaliseUnit(existing.unit);
            const nu = normaliseUnit(ing.unit);
            if (eu === nu) { existing.qty += ing.qty; return; }
            const eb = UNIT_TO_BASE[eu];
            const nb = UNIT_TO_BASE[nu];
            if (eb && nb) { existing.qty = existing.qty + (ing.qty * nb) / eb; return; }
            // No safe conversion — keep as its own line rather than guess
            indexByName[ing.name + '|' + ing.unit] = merged.length;
            merged.push(Object.assign({}, ing));
        });
        return merged;
    }

    window.ShoppingList = {
        show: showShoppingList,
        updatePrice: updatePrice,
        addNewItem: addNewItem,
        closePanel: closePanel,
        calculateCost: calculateRecipeCost
    };

    // Standalone cost summary — same pricing engine as the shopping panel
    // (lookupPrice, convertToPackageUnits, AVG_UNIT_WEIGHT), but returns
    // just the totals instead of building a panel. Used by the recipe
    // page's "Estimated Cost" box so there's only ONE place this math
    // lives — no more two scripts silently disagreeing on the price.
    async function calculateRecipeCost(recipe, scale) {
        await loadPriceDatabase();
        if (!recipe || !recipe.ingredients) return null;

        const multiplier = scale || 1;

        let totalBuyCost = 0;
        let totalMakeCost = 0;
        let matched = 0;

        const merged = buildMergedIngredientList(recipe, multiplier);
        const total = merged.length;

        merged.forEach(function(ing) {
            const { exists, data } = lookupPrice(ing.name);
            const hasPriceData = exists && data && data.price > 0 && data.size > 0;
            if (!hasPriceData) return;

            const itemKey = (data.originalKey || ing.name || '').toLowerCase().trim();
            const neededInPackageUnits = convertToPackageUnits(ing.qty, ing.unit, data.unit, itemKey);
            const pricePerUnit = data.price / data.size;
            const packagesNeeded = Math.ceil(neededInPackageUnits / data.size);

            totalBuyCost += packagesNeeded * data.price;
            totalMakeCost += neededInPackageUnits * pricePerUnit;
            matched++;
        });

        if (!matched) return null;
        const servingsNum = (parseInt(recipe.servings) || 1) * multiplier;
        return {
            totalBuy: totalBuyCost.toFixed(2),
            totalMake: totalMakeCost.toFixed(2),
            buyPerServing: (totalBuyCost / servingsNum).toFixed(2),
            makePerServing: (totalMakeCost / servingsNum).toFixed(2),
            coverage: Math.round((matched / total) * 100),
            servings: servingsNum
        };
    }

    // Load price data - from cache or fetch ONCE per session.
    // Source is now json/ingredients-master.json (the unified ingredient
    // file) rather than a dedicated recipe-prices.json. Both the flattened
    // price lookup AND the full raw object get cached, since saves need to
    // download the whole file intact (see savePriceDatabase below).
    async function loadPriceDatabase() {
        if (priceDatabase) return priceDatabase;

        const cachedFlat = sessionStorage.getItem(CACHE_KEY);
        const cachedFull = sessionStorage.getItem(MASTER_CACHE_KEY);
        const timestamp = sessionStorage.getItem(CACHE_TIMESTAMP_KEY);

        if (cachedFlat && cachedFull && timestamp) {
            try {
                priceDatabase = JSON.parse(cachedFlat);
                fullIngredientsMaster = JSON.parse(cachedFull);
                console.log('[ShoppingList] Loaded from cache, items:', Object.keys(priceDatabase).length);
                return priceDatabase;
            } catch(e) {
                console.log('Cache parse failed, fetching fresh');
            }
        }

        try {
            const response = await fetch('json/ingredients-master.json?t=' + Date.now());
            if (!response.ok) throw new Error('Failed to load');
            fullIngredientsMaster = await response.json();
            priceDatabase = flattenPriceDatabase(fullIngredientsMaster);

            sessionStorage.setItem(CACHE_KEY, JSON.stringify(priceDatabase));
            sessionStorage.setItem(MASTER_CACHE_KEY, JSON.stringify(fullIngredientsMaster));
            sessionStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
            console.log('[ShoppingList] Loaded from server, items:', Object.keys(priceDatabase).length);
            return priceDatabase;

        } catch (error) {
            console.error('[ShoppingList] Failed to load:', error);
            toast('Could not load ingredients-master.json');
            priceDatabase = {};
            return priceDatabase;
        }
    }

    // Flatten ingredients-master.json into { lowercaseName: {size,unit,price,brand,section,originalKey,canonicalKey} }
    // Every alias gets its own flat entry pointing at the SAME price data as
    // its canonical ingredient, so a recipe written with older/alias wording
    // still prices correctly without needing fuzzy substring matching.
    function flattenPriceDatabase(masterData) {
        const flatDB = {};
        for (const canonicalKey in masterData) {
            const entry = masterData[canonicalKey];
            if (!entry || !entry.priceData) continue; // no pricing yet (e.g. _needsPricing entries) - not shoppable
            const record = {
                size: entry.priceData.size,
                unit: entry.priceData.unit,
                price: entry.priceData.price,
                brand: entry.priceData.brand,
                section: entry.category,
                originalKey: canonicalKey,
                canonicalKey: canonicalKey
            };
            flatDB[canonicalKey.toLowerCase().trim()] = record;
            (entry.aliases || []).forEach(alias => {
                const aKey = alias.toLowerCase().trim();
                if (!flatDB[aKey]) flatDB[aKey] = record; // canonical wins on collision
            });
        }
        return flatDB;
    }

    // rebuildJsonStructure() removed - saves now patch fullIngredientsMaster
    // directly and download the whole file (see savePriceDatabase below),
    // instead of reconstructing a price-only category-nested file. A
    // price-only rebuild would have silently wiped every alias, nutrition
    // record, and reference note on every ingredient in the file.


    // Full unit conversion to package units
    const UNIT_TO_BASE = {
        'g': 1, 'gram': 1, 'grams': 1,
        'kg': 1000,
        'ml': 1, 'l': 1000,
        'tsp': 5, 'teaspoon': 5,
        'tbsp': 15, 'tablespoon': 15,
        'cup': 240, 'cups': 240,
        'oz': 28, 'lb': 454
    };

    // Normalises spelling/plural variants so "ea", blank, "clove" etc. all
    // resolve to the same canonical word before we look anything up.
    const UNIT_SYNONYMS = {
        '': 'each', 'ea': 'each', 'each': 'each',
        'clove': 'cloves', 'cloves': 'cloves',
        'sheet': 'sheets', 'sheets': 'sheets',
        'sprig': 'sprigs', 'sprigs': 'sprigs',
        'rasher': 'rashers', 'rashers': 'rashers',
        'stalk': 'stalks', 'stalks': 'stalks',
        'pod': 'pods', 'pods': 'pods',
        'packet': 'pack', 'pack': 'pack'
    };
    function normaliseUnit(u) {
        const x = (u || '').toLowerCase().trim();
        return UNIT_SYNONYMS.hasOwnProperty(x) ? UNIT_SYNONYMS[x] : x;
    }

    // What ONE physical unit (1 clove, 1 sheet, 1 medium onion...) weighs,
    // in grams (or ml for liquids) — used only when the recipe's unit and
    // the price-database's unit don't match directly (e.g. recipe says
    // "3 cloves", price is per 70g pack; recipe says "1 Brown Onion",
    // price is per 1000g bag). Keyed by the matched price-database item
    // name (lowercase). Each line states plainly what "1 unit" is assumed
    // to be — edit the number directly if your usual size runs bigger or
    // smaller; nothing else in the code needs to change.
    const AVG_UNIT_WEIGHT = {
        'garlic':                 { bulb: 45, cloves: 5 },   // 1 bulb ≈ 45g · 1 clove ≈ 5g
        'garlic cloves':          { cloves: 5 },              // 1 clove ≈ 5g
        'brown onion':            { each: 150 },              // 1 medium onion ≈ 150g
        'onion':                  { each: 150 },              // 1 medium onion ≈ 150g
        'carrot':                 { each: 70 },               // 1 medium carrot ≈ 70g
        'carrots':                { each: 70 },               // 1 medium carrot ≈ 70g
        'celery':                 { bunch: 500, stalks: 40 }, // 1 bunch ≈ 500g · 1 stalk ≈ 40g
        'leek':                   { each: 150, stalks: 150 }, // 1 leek ≈ 150g
        'spring onion':           { bunch: 60, each: 10 },    // 1 bunch ≈ 60g · 1 stalk ≈ 10g
        'tomatoes':               { each: 120 },              // 1 medium tomato ≈ 120g
        'apples':                 { each: 150 },              // 1 medium apple ≈ 150g
        'granny smith apples':    { each: 150 },              // 1 medium apple ≈ 150g
        'bananas':                { each: 120 },              // 1 medium banana ≈ 120g
        'pineapple':              { each: 1000 },             // 1 whole pineapple ≈ 1000g
        'asparagus':              { bunch: 250 },             // 1 bunch ≈ 250g
        'lemon zest':             { each: 5 },                // zest yield from 1 lemon ≈ 5g
        'orange zest':            { each: 8 },                // zest yield from 1 orange ≈ 8g
        'chicken breast':         { each: 200 },              // 1 medium chicken breast ≈ 200g
        'chicken breasts':        { each: 200 },              // 1 medium chicken breast ≈ 200g
        'chicken thigh fillets':  { each: 150 },              // 1 chicken thigh fillet ≈ 150g
        'chicken drum sticks':    { each: 120 },              // 1 chicken drumstick ≈ 120g
        'beef, scotch fillet':    { each: 250 },               // 1 steak-cut portion ≈ 250g
        'scotch fillet':          { each: 250 },               // 1 steak-cut portion ≈ 250g
        'lamb cutlets':           { each: 100 },               // 1 lamb cutlet ≈ 100g
        'lamb rack':              { rack: 600 },               // 1 rack ≈ 600g
        'fish fillet':            { each: 180 },               // 1 fish fillet ≈ 180g
        'bacon':                  { rashers: 30 },              // 1 rasher ≈ 30g
        'bay leaves':             { each: 0.15 },               // 1 dried bay leaf ≈ 0.15g
        'cinnamon stick':         { stick: 3 },                 // 1 cinnamon stick ≈ 3g
        'cloves':                 { each: 0.06 },               // 1 whole spice clove ≈ 0.06g
        'green cardamom pods':    { pods: 0.3 },                // 1 pod ≈ 0.3g
        'dried red chilli':       { each: 1 },                  // 1 dried chilli ≈ 1g
        'dried red chillies':     { each: 1 },                  // 1 dried chilli ≈ 1g
        'puff pastry':            { sheets: 150 },              // 1 sheet ≈ 150g
        'shortcrust pastry':      { sheets: 150 },              // 1 sheet ≈ 150g
        'cabbage':                { each: 1000 },               // 1 whole cabbage ≈ 1000g
        'potato':                 { each: 180 },                // 1 medium potato ≈ 180g
        'calamansi':              { each: 15 },                 // 1 calamansi ≈ 15g
        'mushrooms':              { each: 20 },                 // 1 medium button mushroom ≈ 20g
        'chinese sausage':        { each: 45 },                 // 1 lap cheong link ≈ 45g
        'kalamata olives':        { each: 5 },                  // 1 olive ≈ 5g
        'rosemary':               { sprigs: 1 },                // 1 sprig ≈ 1g
        'thyme':                  { sprigs: 1 },                // 1 sprig ≈ 1g
        'oregano':                { sprigs: 1 },                // 1 sprig ≈ 1g
        'taco seasoning':         { batch: 30 }                 // 1 homemade batch ≈ 1 packet ≈ 30g
    };

    function convertToPackageUnits(qty, recipeUnit, pkgUnit, itemKey) {
        const ru = normaliseUnit(recipeUnit);
        const pu = normaliseUnit(pkgUnit);
        if (ru === pu) return qty;

        const rb = UNIT_TO_BASE[ru];
        const pb = UNIT_TO_BASE[pu];
        if (rb && pb) return (qty * rb) / pb;

        // One side is weight/volume, the other is a countable unit (or both
        // are different countable units) — bridge them via AVG_UNIT_WEIGHT
        // when we have data for this specific item.
        const avg = itemKey ? AVG_UNIT_WEIGHT[itemKey] : null;
        const ruGrams = rb ? rb : (avg && avg[ru] != null ? avg[ru] : null);
        const puGrams = pb ? pb : (avg && avg[pu] != null ? avg[pu] : null);
        if (ruGrams != null && puGrams != null) {
            return (qty * ruGrams) / puGrams;
        }

        // Countable: no unit in recipe, price stored per-each
        if (ru === 'each' && pu === 'each') return qty;
        // No conversion data available — fall back to raw qty (old
        // behaviour). This can still be wrong, but only for combinations
        // we don't have weight data for yet; extend AVG_UNIT_WEIGHT above
        // to fix a specific ingredient.
        return qty;
    }

    // Exact price lookup only — the old fuzzy substring fallback
    // (`key.includes(k) || k.includes(key)`) is gone. It's no longer
    // needed: flattenPriceDatabase() now gives every alias its own exact
    // flat key pointing at the right price, and without generic bucket
    // entries backing it, substring matching would just risk false
    // positives (same reasoning as the fix in builder-nutrition.js).
    function lookupPrice(itemName) {
        if (!priceDatabase) return { exists: false };
        const key = (itemName || '').toLowerCase().trim();
        if (priceDatabase[key]) return { exists: true, data: priceDatabase[key] };
        return { exists: false };
    }

    // Downloads the WHOLE ingredients-master.json, not just prices. Any
    // price edit patches fullIngredientsMaster in place first (see
    // updatePrice), so aliases/nutrition/reference/per on every other
    // ingredient - and on this one - survive the round trip untouched.
    async function savePriceDatabase() {
        if (!fullIngredientsMaster) return false;

        const jsonString = JSON.stringify(fullIngredientsMaster, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ingredients-master.json';
        a.click();
        URL.revokeObjectURL(a.href);

        sessionStorage.setItem(CACHE_KEY, JSON.stringify(priceDatabase));
        sessionStorage.setItem(MASTER_CACHE_KEY, JSON.stringify(fullIngredientsMaster));
        toast('File downloaded — replace in D:\\mysites\\ajpc\\json\\');
        return true;
    }

    // Updates or creates one ingredient's priceData on the full master
    // object, then re-flattens and saves. Editing an existing ingredient
    // (found via exact name or alias match) patches its priceData in place
    // — its aliases, nutrition, and reference notes are left exactly as
    // they were. A genuinely new ingredient name gets added as a new
    // top-level entry with just the price fields, same as any other
    // pricing-only addition would need review later.
    async function updatePrice(itemName, size, unit, price, brand, section) {
        if (!fullIngredientsMaster) {
            await loadPriceDatabase();
        }
        const key = itemName.toLowerCase().trim();
        const existingLookup = priceDatabase[key];
        const targetKey = existingLookup ? existingLookup.canonicalKey : key;

        if (!fullIngredientsMaster[targetKey]) {
            fullIngredientsMaster[targetKey] = {
                displayName: itemName,
                category: section || 'Uncategorized',
                aliases: [],
                priceData: null
            };
        }
        fullIngredientsMaster[targetKey].priceData = {
            size: parseFloat(size),
            unit: unit,
            price: parseFloat(price),
            brand: brand || ''
        };
        delete fullIngredientsMaster[targetKey]._needsPricing;

        priceDatabase = flattenPriceDatabase(fullIngredientsMaster);
        await savePriceDatabase();
        if (currentPanel && currentRecipeData) {
            closePanel();
            await showShoppingList(currentRecipeData, currentMultiplier);
        }
    }

    async function addNewItem(itemName, size, unit, price, brand, section) {
        await updatePrice(itemName, size, unit, price, brand, section);
    }

    function closePanel() {
        if (currentPanel) {
            currentPanel.remove();
            currentPanel = null;
        }
    }

    function formatQuantity(qty, unit) {
        if (!qty || qty === 0) return '';
        if (unit === 'g') return qty + 'g';
        if (unit === 'kg') return qty + 'kg';
        if (unit === 'ml') return qty + 'ml';
        if (unit === 'l') return qty + 'L';
        if (unit === 'tsp') return qty + ' tsp';
        if (unit === 'tbsp') return qty + ' tbsp';
        if (unit === 'cup') return qty + ' cup' + (qty !== 1 ? 's' : '');
        if (unit === 'each' || !unit) return Math.round(qty * 10) / 10 + '';
        return Math.round(qty * 10) / 10 + ' ' + unit;
    }

    function splitIngredientAndNotes(raw) {
        const text = raw.trim();
        let ingredient = text;
        let notes = '';
        const parenIndex = text.indexOf('(');
        if (parenIndex !== -1) {
            ingredient = text.substring(0, parenIndex).trim();
            const closeParen = text.indexOf(')', parenIndex);
            if (closeParen !== -1) {
                notes = text.substring(parenIndex + 1, closeParen).trim();
            }
        }
        return { ingredient, notes };
    }

    // Expresses a package's price as a simple rate: per kg/L for large
    // weight/volume packs, per g/ml for small ones, or per each/bulb/
    // bunch/etc for countable items — whatever reads most naturally.
    function formatUnitPrice(price, size, unit) {
        const u = (unit || '').toLowerCase();
        if (u === 'g' && size >= 1000) return '$' + (price / (size / 1000)).toFixed(2) + '/kg';
        if (u === 'ml' && size >= 1000) return '$' + (price / (size / 1000)).toFixed(2) + '/L';
        if (u === 'g' || u === 'ml') return '$' + (price / size).toFixed(3) + '/' + u;
        if (u === 'kg' || u === 'l') return '$' + (price / size).toFixed(2) + '/' + u;
        return '$' + (price / size).toFixed(2) + '/' + (u || 'each');
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toast(msg) {
        const t = document.getElementById('toast');
        if (!t) {
            const newToast = document.createElement('div');
            newToast.id = 'toast';
            newToast.className = 'toast';
            document.body.appendChild(newToast);
            setTimeout(() => {
                newToast.textContent = msg;
                newToast.classList.add('show');
                setTimeout(() => {
                    newToast.classList.remove('show');
                    setTimeout(() => { if (newToast.parentNode) newToast.remove(); }, 300);
                }, 2200);
            }, 10);
            return;
        }
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2200);
    }
    // itemExistsInDB replaced by lookupPrice() — see above


    function getActionButton(itemName, existsInDB, existingData) {
        // Mobile check — hides editing capabilities on mobile viewports
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (isMobile) return '';

        const safeName = escapeHtml(itemName).replace(/"/g, '&quot;');
        if (existsInDB) {
            return `<button class="action-btn update-btn" data-item="${safeName}" data-action="update" data-section="${existingData?.section || 'uncategorized'}" data-size="${existingData?.size || ''}" data-unit="${existingData?.unit || 'g'}" data-price="${existingData?.price || ''}" data-brand="${existingData?.brand || ''}">Update</button>`;
        } else {
            return `<button class="action-btn new-btn" data-item="${safeName}" data-action="new" data-section="uncategorized">New</button>`;
        }
    }

    async function showShoppingList(recipe, scale) {
        if (currentPanel) {
            currentPanel.remove();
            currentPanel = null;
        }

        await loadPriceDatabase();

        currentRecipeData = recipe;
        currentMultiplier = scale || 1;
        currentBaseServings = parseInt(recipe.servings) || 1;
        const scaledServings = Math.round(currentBaseServings * currentMultiplier);

        const multiplier = currentMultiplier;

        const mergedIngredients = buildMergedIngredientList(recipe, multiplier);

        const shoppingItems = [];
        let totalBuyCost = 0;
        let totalMakeCost = 0;

        mergedIngredients.forEach(function(ing) {
            const { exists, data } = lookupPrice(ing.name);
            const pantryLevel = (window.KitchenNotebook && window.KitchenNotebook.Pantry)
                ? window.KitchenNotebook.Pantry.getLevel(ing.name)
                : null;

            if (!exists) {
                shoppingItems.push({
                    name: ing.displayName,
                    needed: formatQuantity(ing.qty, ing.unit),
                    hasPrice: false,
                    existsInDB: false,
                    pantryLevel: pantryLevel
                });
                return;
            }

            const hasPriceData = data && data.price && data.price > 0 && data.size && data.size > 0;
            if (!hasPriceData) {
                shoppingItems.push({
                    name: ing.displayName,
                    needed: formatQuantity(ing.qty, ing.unit),
                    hasPrice: false,
                    existsInDB: true,
                    existingData: data,
                    pantryLevel: pantryLevel
                });
                return;
            }

            const itemKey = (data.originalKey || ing.name || '').toLowerCase().trim();
            const neededInPackageUnits = convertToPackageUnits(ing.qty, ing.unit, data.unit, itemKey);

            const pricePerUnit = data.price / data.size;
            const packagesNeeded = Math.ceil(neededInPackageUnits / data.size);
            const buyCost = packagesNeeded * data.price;
            totalBuyCost += buyCost;
            const makeCost = neededInPackageUnits * pricePerUnit;
            totalMakeCost += makeCost;

            shoppingItems.push({
                name: ing.displayName,
                needed: formatQuantity(ing.qty, ing.unit),
                packagesNeeded: packagesNeeded,
                packageSize: data.size + data.unit,
                packagePrice: data.price.toFixed(2),
                unitPrice: formatUnitPrice(data.price, data.size, data.unit),
                makeCost: makeCost.toFixed(2),
                brand: data.brand,
                buyCost: buyCost.toFixed(2),
                hasPrice: true,
                existsInDB: true,
                existingData: data,
                pantryLevel: pantryLevel
            });
        });

        const panel = document.createElement('div');
        panel.id = 'shoppingPanel';

        let inner = '<div class="shopping-panel-header"><span>Shopping List</span><button class="shopping-panel-close" onclick="window.ShoppingList.closePanel()">&times;</button></div>';
        inner += '<div class="shopping-panel-body">';
        inner += '<div class="recipe-title-small">' + escapeHtml(recipe.title || recipe.name || '') + '</div>';

        if (multiplier > 1) {
            inner += '<div class="scale-indicator">Scaled ' + multiplier + 'x — Serves: <strong>' + scaledServings + '</strong> (from ' + currentBaseServings + ')</div>';
        }

        if (shoppingItems.length === 0) {
            inner += '<p class="shopping-empty">No ingredients found.</p>';
        } else {
            // ── Pantry check ──────────────────────────────
            if (window.KitchenNotebook && window.KitchenNotebook.Pantry) {
                const pantryResult = window.KitchenNotebook.Pantry.analyseRecipe(recipe.ingredients || []);
                const hasAnyPantryData = window.KitchenNotebook.Pantry.list().length > 0;

                if (hasAnyPantryData && (pantryResult.have.length || pantryResult.low.length || pantryResult.subs.length)) {
                    inner += '<div class="pantry-check-section">';
                    inner += '<div class="pantry-check-header">Pantry Check</div>';

                    if (pantryResult.have.length) {
                        pantryResult.have.forEach(function(ing) {
                            inner += '<div class="pantry-check-row">';
                            inner += '<span class="pantry-have-dot"></span>';
                            inner += '<span>' + escapeHtml(ing.item || ing.name || '') + '</span>';
                            inner += '<span style="margin-left:auto;font-size:0.72rem;color:var(--cream-muted)">Have it</span>';
                            inner += '</div>';
                        });
                    }

                    if (pantryResult.low.length) {
                        pantryResult.low.forEach(function(entry) {
                            inner += '<div class="pantry-check-row">';
                            inner += '<span class="pantry-low-dot"></span>';
                            inner += '<span>' + escapeHtml(entry.ing.item || entry.ing.name || '') + '</span>';
                            inner += '<span class="pantry-sub-note">Running ' + entry.level.toLowerCase() + ' — buy more</span>';
                            inner += '</div>';
                        });
                    }

                    if (pantryResult.subs.length) {
                        pantryResult.subs.forEach(function(sub) {
                            inner += '<div class="pantry-check-row">';
                            inner += '<span class="pantry-have-dot" style="background:var(--copper)"></span>';
                            inner += '<span>' + escapeHtml(sub.ingredient) + '</span>';
                            inner += '<span class="pantry-sub-note">Use ' + escapeHtml(sub.useInstead) + ' — ' + escapeHtml(sub.note) + '</span>';
                            inner += '</div>';
                        });
                    }

                    inner += '</div>';
                } else if (!hasAnyPantryData) {
                    inner += '<div class="pantry-check-section">';
                    inner += '<div class="pantry-check-header">Pantry</div>';
                    inner += '<p style="font-size:0.8rem;color:var(--cream-muted);margin:0">Set up your <a href="pantry.html" style="color:var(--copper)">pantry</a> to see what you already have.</p>';
                    inner += '</div>';
                }
            }
            // ── Cost summary ──────────────────────────────
            const savings = totalBuyCost - totalMakeCost;
            inner += '<div class="cost-summary">';
            inner += '<div class="cost-row"><span>Cost to MAKE:</span><span>$' + totalMakeCost.toFixed(2) + '</span></div>';
            inner += '<div class="cost-row"><span>Cost to BUY:</span><span>$' + totalBuyCost.toFixed(2) + '</span></div>';
            if (savings > 0) inner += '<div class="cost-row savings"><span>Leftover value:</span><span>$' + savings.toFixed(2) + '</span></div>';
            inner += '<div class="cost-row serving"><span>Serves (scaled):</span><span><strong>' + scaledServings + '</strong></span></div>';
            if (scaledServings > 0) inner += '<div class="cost-row serving"><span>Cost per serving:</span><span><strong>$' + (totalMakeCost / scaledServings).toFixed(2) + '</strong></span></div>';
            inner += '</div>';
            inner += '<div class="shopping-items-header">To Buy (' + shoppingItems.length + ' item' + (shoppingItems.length !== 1 ? 's' : '') + ')</div>';
            inner += '<ul class="shopping-items-list">';

            const LEVEL_FLAG = {
                FULL:  { cls: 'shopping-item-lvl-full',  badge: 'FULL — have plenty' },
                HALF:  { cls: 'shopping-item-lvl-half',  badge: 'HALF stock left' },
                LOW:   { cls: 'shopping-item-lvl-low',   badge: 'LOW — running out' },
                EMPTY: { cls: 'shopping-item-lvl-empty', badge: 'OUT — need it' }
            };

            shoppingItems.forEach(function(item, idx) {
                const actionButton = getActionButton(item.name, item.existsInDB, item.existingData);
                const flag = item.pantryLevel ? LEVEL_FLAG[item.pantryLevel] : null;
                const liClass = 'shopping-item' + (flag ? ' ' + flag.cls : '');
                const isBlocked = item.pantryLevel === 'FULL';
                const isPreChecked = item.pantryLevel === 'EMPTY';

                inner += '<li class="' + liClass + '"><div class="shopping-item-content">';
                inner += '<input type="checkbox" id="shop-' + idx + '" data-idx="' + idx + '" class="shopping-checkbox"'
                    + (isBlocked ? ' disabled title="You already have plenty — untick pantry stock first if you still want to buy more."' : '')
                    + (isPreChecked ? ' checked' : '') + '>';
                inner += '<div class="shopping-item-details">';
                inner += '<div class="shopping-item-name">' + escapeHtml(item.name) + '</div>';
                if (flag) inner += '<span class="pantry-flag pantry-flag-' + item.pantryLevel.toLowerCase() + '">' + flag.badge + '</span>';
                inner += '<div class="shopping-price-details">';
                if (item.hasPrice && item.brand) inner += '<div class="shopping-brand">' + escapeHtml(item.brand) + '</div>';
                inner += '<div class="shopping-needed">Needs: ' + item.needed + '</div>';
                if (item.hasPrice) {
                    inner += '<div class="shopping-unit-price">' + item.unitPrice + '</div>';
                    inner += '<div class="shopping-package">Buy: ' + item.packagesNeeded + ' × ' + item.packageSize + ' @ $' + item.packagePrice + '</div>';
                    inner += '<div class="shopping-make-cost">Cost for this recipe: $' + item.makeCost + '</div>';
                    inner += '<div class="shopping-cost">Buy total: <strong>$' + item.buyCost + '</strong></div>';
                } else if (item.existsInDB) {
                    inner += '<div class="shopping-no-price">Missing price/size — click Update</div>';
                } else {
                    inner += '<div class="shopping-no-price">Not in database — click New</div>';
                }
                inner += '</div>' + actionButton + '</div></div></li>';
            });


            inner += '</ul>';
        }
        inner += '</div>';
        if (shoppingItems.length > 0) {
            inner += '<div class="shopping-panel-footer"><button id="shoppingSelectAll">Select All</button><button id="shoppingPrintBtn">Print</button></div>';
        }

        panel.innerHTML = inner;
        document.body.appendChild(panel);
        currentPanel = panel;

        document.getElementById('shoppingSelectAll')?.addEventListener('click', function() {
            const checkboxes = panel.querySelectorAll('.shopping-checkbox:not(:disabled)');
            let allChecked = true;
            checkboxes.forEach(cb => { if (!cb.checked) allChecked = false; });
            checkboxes.forEach(cb => { cb.checked = !allChecked; });
            this.textContent = allChecked ? 'Select All' : 'Deselect All';
        });

        document.getElementById('shoppingPrintBtn')?.addEventListener('click', function() {
            const allBoxes = Array.from(panel.querySelectorAll('.shopping-checkbox'));
            let selectedBoxes = allBoxes.filter(cb => cb.checked);
            if (!selectedBoxes.length) {
                // Nothing manually picked — default to everything you don't
                // already have plenty of, rather than literally everything.
                selectedBoxes = allBoxes.filter(cb => !cb.disabled);
            }
            const printItems = selectedBoxes
                .map(cb => shoppingItems[parseInt(cb.dataset.idx, 10)])
                .filter(Boolean);

            if (!printItems.length) return alert('Nothing to print.');

            let estTotal = 0;
            const rows = printItems.map(function(item) {
                if (item.hasPrice) estTotal += parseFloat(item.buyCost);
                let meta = 'Needs: ' + item.needed;
                let priceLine = '';
                if (item.hasPrice) {
                    meta += ' &middot; ' + item.unitPrice;
                    priceLine = '<div class="price">Buy: ' + item.packagesNeeded + ' × ' + item.packageSize
                        + ' @ $' + item.packagePrice + ' — <strong>$' + item.buyCost + '</strong></div>';
                } else {
                    priceLine = '<div class="price no-price">No price on file</div>';
                }
                return '<li><label><input type="checkbox"> <strong>' + escapeHtml(item.name) + '</strong>'
                    + (item.hasPrice && item.brand ? ' <span class="brand">(' + escapeHtml(item.brand) + ')</span>' : '')
                    + '</label><div class="meta">' + meta + '</div>' + priceLine + '</li>';
            }).join('');

            const win = window.open('', '_blank');
            win.document.write(`<!DOCTYPE html><html><head><title>Shopping List</title><link rel="stylesheet" href="css/shopping-list-print.css"></head><body><h1>Shopping List</h1><div>${escapeHtml(recipe.title || '')}</div>${multiplier > 1 ? `<div>Scaled ${multiplier}x — Serves: ${scaledServings}</div>` : ''}<ul>${rows}</ul><div class="total-row">Estimated total: <strong>$${estTotal.toFixed(2)}</strong></div><div class="disclaimer">Prices are estimates</div></body></html>`);
            win.document.close();
            win.print();
        });

        panel.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', async function(e) {
                e.stopPropagation();
                const itemName = this.getAttribute('data-item');
                const action = this.getAttribute('data-action');
                const existingSection = this.getAttribute('data-section');
                const existingSize = this.getAttribute('data-size');
                const existingUnit = this.getAttribute('data-unit');
                const existingPrice = this.getAttribute('data-price');
                const existingBrand = this.getAttribute('data-brand');

                const li = this.closest('.shopping-item');
                const originalContent = li.innerHTML;
                const uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 6);

                li.innerHTML = `<div class="price-edit-form">
                    <div class="edit-status-note ${action === 'new' ? 'new-note' : 'update-note'}">${action === 'new' ? 'NEW ITEM' : 'UPDATE ITEM'}: "${escapeHtml(itemName)}"</div>
                    <div class="edit-field"><label>Package Size</label><input type="number" id="size-${uniqueId}" value="${existingSize || ''}" step="any" placeholder="e.g. 500"></div>
                    <div class="edit-field"><label>Unit</label><select id="unit-${uniqueId}"><option value="g"${existingUnit === 'g' ? ' selected' : ''}>grams (g)</option><option value="kg"${existingUnit === 'kg' ? ' selected' : ''}>kilograms (kg)</option><option value="ml"${existingUnit === 'ml' ? ' selected' : ''}>milliliters (ml)</option><option value="l"${existingUnit === 'l' ? ' selected' : ''}>liters (L)</option><option value="each"${existingUnit === 'each' ? ' selected' : ''}>each</option></select></div>
                    <div class="edit-field"><label>Price ($AUD)</label><input type="number" id="price-${uniqueId}" value="${existingPrice || ''}" step="0.01" placeholder="e.g. 4.50"></div>
                    <div class="edit-field"><label>Brand</label><input type="text" id="brand-${uniqueId}" value="${existingBrand || ''}" placeholder="Brand name"></div>
                    <div class="edit-field"><label>Section</label><select id="section-${uniqueId}"><option value="uncategorized"${existingSection === 'uncategorized' ? ' selected' : ''}>Uncategorized</option><option value="flour_baking"${existingSection === 'flour_baking' ? ' selected' : ''}>Flour & Baking</option><option value="sugar_sweeteners"${existingSection === 'sugar_sweeteners' ? ' selected' : ''}>Sugar & Sweeteners</option><option value="eggs"${existingSection === 'eggs' ? ' selected' : ''}>Eggs</option><option value="butter_dairy"${existingSection === 'butter_dairy' ? ' selected' : ''}>Butter & Dairy</option><option value="milk_cream"${existingSection === 'milk_cream' ? ' selected' : ''}>Milk & Cream</option><option value="cheese"${existingSection === 'cheese' ? ' selected' : ''}>Cheese</option><option value="oils"${existingSection === 'oils' ? ' selected' : ''}>Oils</option><option value="rice_grains"${existingSection === 'rice_grains' ? ' selected' : ''}>Rice & Grains</option><option value="pasta_noodles"${existingSection === 'pasta_noodles' ? ' selected' : ''}>Pasta & Noodles</option><option value="canned_tomatoes"${existingSection === 'canned_tomatoes' ? ' selected' : ''}>Canned Tomatoes</option><option value="canned_fish_seafood"${existingSection === 'canned_fish_seafood' ? ' selected' : ''}>Canned Fish & Seafood</option><option value="canned_fruit"${existingSection === 'canned_fruit' ? ' selected' : ''}>Canned Fruit</option><option value="sauces_condiments"${existingSection === 'sauces_condiments' ? ' selected' : ''}>Sauces & Condiments</option><option value="spreads"${existingSection === 'spreads' ? ' selected' : ''}>Spreads</option><option value="spices_seasonings"${existingSection === 'spices_seasonings' ? ' selected' : ''}>Spices & Seasonings</option><option value="meat_poultry"${existingSection === 'meat_poultry' ? ' selected' : ''}>Meat & Poultry</option><option value="fresh_vegetables"${existingSection === 'fresh_vegetables' ? ' selected' : ''}>Fresh Vegetables</option><option value="fresh_fruit"${existingSection === 'fresh_fruit' ? ' selected' : ''}>Fresh Fruit</option></select></div>
                    <div class="edit-actions"><button class="save-price-btn" data-item="${escapeHtml(itemName).replace(/"/g, '&quot;')}" data-action="${action}" data-unique="${uniqueId}">Save</button><button class="cancel-edit-btn">Cancel</button></div>
                </div>`;

                li.querySelector('.save-price-btn').onclick = async function() {
                    const uid = this.getAttribute('data-unique');
                    const act = this.getAttribute('data-action');
                    const size = document.getElementById('size-' + uid).value;
                    const unit = document.getElementById('unit-' + uid).value;
                    const price = document.getElementById('price-' + uid).value;
                    const brand = document.getElementById('brand-' + uid).value;
                    const section = document.getElementById('section-' + uid).value;
                    if (!size || !price) {
                        alert('Please fill in size and price');
                        return;
                    }
                    if (act === 'new') {
                        await addNewItem(itemName, size, unit, price, brand, section);
                        toast('Added: ' + itemName);
                    } else {
                        await updatePrice(itemName, size, unit, price, brand, section);
                        toast('Updated: ' + itemName);
                    }
                };

                li.querySelector('.cancel-edit-btn').onclick = () => {
                    li.innerHTML = originalContent;
                };
            });
        });
    }
})();