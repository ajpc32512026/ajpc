/* =========================================================
   BUILDER NUTRITION — Nutrition Calculator & Renderer
   Depends on: NUTRITION_DB (global, set by builder-main.js)
   
   computeNutrition(ingredients, servings)
     → returns a nutrition object (or null) for embedding in JSON
   
   calculateNutrition()
     → calls computeNutrition, renders the preview panel
========================================================= */

const UNIT_TO_GRAMS = {
    'g': 1, 'gram': 1, 'grams': 1,
    'kg': 1000,
    'ml': 1, 'l': 1000,
    'cup': 240, 'cups': 240,
    'tbsp': 15, 'tablespoon': 15,
    'tsp': 5,  'teaspoon': 5,
    'oz': 28,  'lb': 454
};

const SKIP_ITEMS = ['water','hot water','cold water','warm water','boiling water','tap water'];

// Ingredients where a bare item name is deliberately non-specific (per the
// pantry naming rule: item = plain name, variety/prep goes in notes) but
// still needs ONE sensible default when notes don't resolve to a specific
// database entry. "Flour" with no more specific match defaults to Plain
// Flour — Alex's stated assumption for the generic case.
const GENERIC_ITEM_DEFAULTS = {
    'flour': 'plain flour'
};

// ── Nutrition lookup ───────────────────────────────────────
// Looks up an ingredient in NUTRITION_DB. Tries, in order:
//   1. The bare item name (works for single-form ingredients like "Yeast", "Salt")
//   2. "<item> <notes-segment>" for each comma-separated notes segment,
//      e.g. item "Flour" + notes "bakers, remaining, for Main Dough"
//      → tries "flour bakers" — which matches the "flour bakers" alias
//      already used on entries like Bakers/Bread/Plain/Self-Raising Flour.
//   3. "<notes-segment> <item>" the other word order, e.g. "bakers flour"
//   4. A generic default for that item (see GENERIC_ITEM_DEFAULTS above),
//      so a bare "Flour" with no matching notes still resolves sensibly
//      instead of going unmatched.
function findNutritionEntry(itemName, notesRaw) {
    if (!itemName) return null;
    if (NUTRITION_DB[itemName]) return NUTRITION_DB[itemName];

    const notesName = (notesRaw || '').toLowerCase().trim();
    if (notesName) {
        const segments = notesName.split(',').map(s => s.trim()).filter(Boolean);
        for (const seg of segments) {
            if (NUTRITION_DB[`${itemName} ${seg}`]) return NUTRITION_DB[`${itemName} ${seg}`];
            if (NUTRITION_DB[`${seg} ${itemName}`]) return NUTRITION_DB[`${seg} ${itemName}`];
        }
    }

    const fallbackKey = GENERIC_ITEM_DEFAULTS[itemName];
    if (fallbackKey && NUTRITION_DB[fallbackKey]) return NUTRITION_DB[fallbackKey];

    return null;
}

const MICRO_FIELDS = [
    'calcium_mg','iron_mg','potassium_mg','magnesium_mg',
    'zinc_mg','cholesterol_mg','vitamin_a_ug','vitamin_c_mg','vitamin_d_ug'
];

// ── Core compute — returns nutrition obj or null ──────────
function computeNutrition(ingredients, servingsNum) {
    if (!ingredients || !ingredients.length) return null;
    if (!NUTRITION_DB || !Object.keys(NUTRITION_DB).length) return null;

    const total = {
        cal: 0, protein: 0, carbs: 0, sugars: 0,
        fat: 0, saturated_fat: 0, fiber: 0, sodium: 0,
        calcium_mg: 0, iron_mg: 0, potassium_mg: 0, magnesium_mg: 0,
        zinc_mg: 0, cholesterol_mg: 0, vitamin_a_ug: 0, vitamin_c_mg: 0, vitamin_d_ug: 0
    };

    let foundCount = 0;
    let totalCount = 0;
    const unmatchedItems = [];      // genuinely not in the database
    const noQuantityItems = [];     // found in the database, but no usable quantity on this line

    ingredients.forEach(ing => {
        // Skip headings and "To Taste" items entirely from nutrition calculations
        if (ing.heading || ing.toTaste) return;
        
        const itemName = (ing.item || '').toLowerCase().trim();
        if (!itemName || SKIP_ITEMS.includes(itemName)) return;

        totalCount++;
        const qty  = parseFloat(ing.quantity) || 0;
        const unit = (ing.unit || '').toLowerCase().trim();

        // Exact match only (canonical name, alias, or item+notes combo —
        // see findNutritionEntry above) — the old fuzzy substring fallback
        // (`itemName.includes(key)`) existed because nutrition-db.json used
        // to carry generic bucket entries ("cheese", "chicken", "beef"...)
        // as a safety net. Those were deliberately dropped when this got
        // unified into ingredients-master.json, so substring matching now
        // has no safety net backing it and would just produce wrong matches
        // (e.g. an unrelated ingredient whose text happens to contain
        // another ingredient's canonical name). Ingredients not written
        // using canonical wording, and not resolvable via notes or a
        // generic default, simply won't match — that's the point, not a
        // bug to work around here.
        const nd = findNutritionEntry(itemName, ing.notes);
        
        // If not found in database, mark as unmatched
        if (!nd) {
            unmatchedItems.push(ing.item || ing.name || itemName);
            return;
        }
        
        // Found in the database, but this line has no usable quantity
        // (blank, "to taste", a non-numeric amount) — this is NOT the same
        // problem as being missing from the database, and used to be
        // reported as if it were ("Missing from database: Sesame Seeds"
        // even when Sesame Seeds is right there with full nutrition data).
        // The fix here is in the recipe's ingredient line, not the database.
        if (!qty) {
            noQuantityItems.push(ing.item || ing.name || itemName);
            return;
        }

        foundCount++;

        const factor = nd.per === 'each'
            ? qty
            : (qty * (UNIT_TO_GRAMS[unit] || 100)) / 100;

        for (const key in total) {
            total[key] += (nd[key] || 0) * factor;
        }
    });

    if (foundCount === 0) return null;

    const servings = servingsNum || 1;
    const per  = v => Math.round(v / servings);
    const perF = v => parseFloat((v / servings).toFixed(1));
    const coverage = Math.round((foundCount / totalCount) * 100);

    const nutrition = {
        servings,
        cal:           per(total.cal),
        kj:            Math.round((total.cal / servings) * 4.184),
        protein:       per(total.protein),
        carbs:         per(total.carbs),
        sugars:        per(total.sugars),
        fat:           per(total.fat),
        saturated_fat: perF(total.saturated_fat),
        fiber:         per(total.fiber),
        sodium:        per(total.sodium),
        coverage,
        foundCount,
        totalCount,
        unmatchedItems,
        noQuantityItems
    };

    // Only include micros with a non-zero value
    MICRO_FIELDS.forEach(f => {
        const v = per(total[f]);
        if (v > 0) nutrition[f] = v;
    });

    return nutrition;
}

// ── Preview renderer ──────────────────────────────────────
function calculateNutrition() {
    const box = document.getElementById('nutrition-box');
    const out = document.getElementById('nutrition-output');
    if (!box || !out) return;

    const { obj } = buildJSON();
    const servings = parseInt(obj.servings) || 1;
    const n = computeNutrition(obj.ingredients || [], servings);

    if (!n) {
        box.style.display = 'none';
        return;
    }

    const row = (label, value, indent=false) =>
        `<div class="nf-row${indent ? ' nf-row-indent' : ''}">
            <span class="${indent ? '' : 'nf-row-bold'}">${label}</span><span>${value}</span>
        </div>`;

    const micros = [
        ['Calcium',     n.calcium_mg,    'mg'],
        ['Iron',        n.iron_mg,       'mg'],
        ['Potassium',   n.potassium_mg,  'mg'],
        ['Magnesium',   n.magnesium_mg,  'mg'],
        ['Zinc',        n.zinc_mg,       'mg'],
        ['Cholesterol', n.cholesterol_mg,'mg'],
        ['Vitamin A',   n.vitamin_a_ug,  'mcg'],
        ['Vitamin C',   n.vitamin_c_mg,  'mg'],
        ['Vitamin D',   n.vitamin_d_ug,  'mcg'],
    ].filter(([,v]) => v).map(([label, v, unit]) => row(label, v + unit));

    // Safety check for the HTML escaper function
    // Safety check for the HTML escaper function
    const esc = typeof escHtml === 'function' ? escHtml : s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    out.innerHTML = `
        <div class="nf-box">
            <div class="nf-title">Nutrition Facts</div>
            <div class="nf-serving">Per serving (1 of ${n.servings})</div>
            <div class="nf-calories">
                <span>Calories</span><span>${n.cal}</span>
            </div>
            <div class="nf-kj">${n.kj} kJ</div>
            <div class="nf-divider"></div>
            ${row('Protein',         n.protein       + 'g')}
            ${row('Total Carbs',     n.carbs         + 'g')}
            ${row('— Sugars',        n.sugars        + 'g', true)}
            ${row('— Dietary Fibre', n.fiber         + 'g', true)}
            ${row('Total Fat',       n.fat           + 'g')}
            ${row('— Saturated Fat', n.saturated_fat + 'g', true)}
            ${row('Sodium',          n.sodium        + 'mg')}
            ${micros.length ? `<div class="nf-divider"></div>${micros.join('')}` : ''}
            <div class="nf-footnote">
                Estimates only — ${n.foundCount}/${n.totalCount} ingredients matched (${n.coverage}% coverage).
            </div>
            ${n.unmatchedItems && n.unmatchedItems.length > 0 ? `
                <div class="nf-missing">
                    Missing from database: <strong>${n.unmatchedItems.map(esc).join(', ')}</strong>
                </div>
            ` : ''}
            ${n.noQuantityItems && n.noQuantityItems.length > 0 ? `
                <div class="nf-missing">
                    In database, but no usable quantity on this line: <strong>${n.noQuantityItems.map(esc).join(', ')}</strong> — add a quantity to include it.
                </div>
            ` : ''}
        </div>
    `;
    box.style.display = 'block';
}

// Called by the "Copy" button on the Nutrition Facts preview box.
// Was referenced in recipe-builder.html but never defined here —
// clicking it threw a ReferenceError and did nothing.
function copyNutrition() {
    const el = document.getElementById('nutrition-output');
    if (!el || !el.innerText.trim()) {
        toast('Add ingredients with quantities first');
        return;
    }
    navigator.clipboard.writeText(el.innerText)
        .then(() => toast('Nutrition facts copied!'))
        .catch(() => toast('Copy failed'));
}
