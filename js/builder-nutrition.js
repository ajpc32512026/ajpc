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
    const unmatchedItems = [];

    ingredients.forEach(ing => {
        // Skip headings and "To Taste" items entirely from nutrition calculations
        if (ing.heading || ing.toTaste) return;
        
        const itemName = (ing.item || '').toLowerCase().trim();
        if (!itemName || SKIP_ITEMS.includes(itemName)) return;

        totalCount++;
        const qty  = parseFloat(ing.quantity) || 0;
        const unit = (ing.unit || '').toLowerCase().trim();

        // Exact match first, then fuzzy
        let nd = NUTRITION_DB[itemName];
        if (!nd) {
            for (const key in NUTRITION_DB) {
                if (itemName.includes(key) || key.includes(itemName)) {
                    nd = NUTRITION_DB[key];
                    break;
                }
            }
        }
        
        // If not found in database, mark as unmatched
        if (!nd) {
            unmatchedItems.push(ing.item || ing.name || itemName);
            return;
        }
        
        // If found but has no quantity, we can't calculate it
        if (!qty) {
            unmatchedItems.push(ing.item || ing.name || itemName);
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
        unmatchedItems
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
        </div>
    `;
    box.style.display = 'block';
}
