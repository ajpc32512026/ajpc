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

    ingredients.forEach(ing => {
        if (ing.heading) return;
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
        if (!nd || !qty) return;

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
        coverage
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
        `<div style="display:flex;justify-content:space-between;padding:0.25rem 0${indent?' 0.25rem 1rem':''};border-bottom:1px solid var(--border);color:var(--text-dim);">
            <span${indent?'':' style="font-weight:600;"'}>${label}</span><span>${value}</span>
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

    out.innerHTML = `
        <div style="border:2px solid var(--border);border-radius:8px;padding:1rem;max-width:400px;font-family:var(--sans);">
            <div style="font-weight:600;font-size:1.2rem;border-bottom:4px solid var(--text);padding-bottom:0.5rem;margin-bottom:0.5rem;color:var(--text);">Nutrition Facts</div>
            <div style="font-size:0.85rem;margin-bottom:0.5rem;color:var(--text-dim);">Per serving (1 of ${n.servings})</div>
            <div style="display:flex;justify-content:space-between;font-weight:600;font-size:1.1rem;margin-bottom:0.1rem;color:var(--text);">
                <span>Calories</span><span>${n.cal}</span>
            </div>
            <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:0.5rem;">${n.kj} kJ</div>
            <div style="border-top:4px solid var(--text);margin:0.5rem 0;"></div>
            ${row('Protein',         n.protein       + 'g')}
            ${row('Total Carbs',     n.carbs         + 'g')}
            ${row('— Sugars',        n.sugars        + 'g', true)}
            ${row('— Dietary Fibre', n.fiber         + 'g', true)}
            ${row('Total Fat',       n.fat           + 'g')}
            ${row('— Saturated Fat', n.saturated_fat + 'g', true)}
            ${row('Sodium',          n.sodium        + 'mg')}
            ${micros.length ? `<div style="border-top:4px solid var(--text);margin:0.5rem 0;"></div>${micros.join('')}` : ''}
            <div style="margin-top:0.75rem;font-size:0.72rem;color:var(--text-dim);font-style:italic;">
                Estimates only — ${n.coverage}% ingredient coverage.
            </div>
        </div>
    `;
    box.style.display = 'block';
}
