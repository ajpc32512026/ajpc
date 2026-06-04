/* =========================================================
   BUILDER MAIN — Global State & Orchestration
   Load order: builder-ui.js, builder-data.js, builder-parser.js,
               builder-nutrition.js, builder-timeline.js, builder-main.js
========================================================= */

// ── Global State ──────────────────────────────────────────
let currentFileHandle = null;
let currentFilename   = '';
let tags              = [];
let recipeIndex       = [];
let selectedEmoji     = '';

// NUTRITION_DB lives here — builder-nutrition.js reads this variable
// It is populated async by loadNutritionDB()
let NUTRITION_DB = {};

// ── Emoji Data ────────────────────────────────────────────
const EMOJI_GROUPS = [
  { label: 'Bread & Baked',    emojis: ['🍞','🥖','🥐','🫓','🥨','🥯','🧁','🍰','🎂','🍮','🥧','🫕','🥞','🧇'] },
  { label: 'Biscuits & Sweets',emojis: ['🍪','🍩','🍫','🍬','🍭','🍮','🍯','🧆','🍡','🍢','🍧','🍨','🍦'] },
  { label: 'Meat & Poultry',   emojis: ['🥩','🍖','🍗','🥓','🌭','🍔','🍟','🌮','🌯','🫔','🥚','🍳'] },
  { label: 'Seafood',          emojis: ['🦐','🦞','🦀','🦑','🐙','🦈','🐟','🐠','🐡','🦪','🍣','🍤','🍱'] },
  { label: 'Vegetables',       emojis: ['🥦','🥕','🌽','🍅','🧅','🧄','🥔','🍆','🫑','🌶️','🥑','🥒','🫒','🍄','🥬','🥗','🫛','🌿'] },
  { label: 'Fruits',           emojis: ['🍎','🍊','🍋','🍇','🍓','🫐','🍈','🍑','🍒','🥭','🍍','🥥','🍌','🍉','🍏','🍐'] },
  { label: 'Misc Food',        emojis: ['🍝','🍜','🍲','🍛','🍚','🍙','🍘','🥟','🥠','🫕','🥘','🥙','🧆','🥗','🥪','🫔','🍱','🥡','🍿','🧂','🍽️'] }
];

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadNutritionDB();
    await loadRecipeIndexForRelated();
    initScrollToTop();
    update();
});

// ── Async Loaders ─────────────────────────────────────────
async function loadNutritionDB() {
    try {
        const res = await fetch('data/nutrition-db.json');
        if (res.ok) {
            NUTRITION_DB = await res.json();
            console.log('✅ Nutrition DB loaded:', Object.keys(NUTRITION_DB).length, 'items');
        }
    } catch(e) { console.warn('Could not load nutrition-db.json — nutrition estimates disabled'); }
}

async function loadRecipeIndexForRelated() {
    try {
        const res = await fetch('json/recipe-index.json?t=' + Date.now());
        if (res.ok) {
            recipeIndex = await res.json();
            if (typeof populateRelatedRecipeDropdown === 'function') populateRelatedRecipeDropdown();
        }
    } catch(e) { console.warn('Could not load recipe index'); }
}

// ── Main Update Loop ──────────────────────────────────────
// Called every time any input changes
function update() {
    const { obj, id, title } = buildJSON();

    // 1. Filename label
    const effectiveId = currentFilename || id || 'recipe';
    const fnLabel = document.getElementById('filename-label');
    if (fnLabel) fnLabel.textContent = effectiveId + '.json';

    // 2. JSON preview
    const jsonOut = document.getElementById('json-output');
    if (jsonOut) jsonOut.innerHTML = highlight(JSON.stringify(obj, null, 2));

    // 3. Nav snippet (elements are optional — only present if nav preview box exists)
    const category = val('category');
    const { snippet, note } = buildNavSnippet(effectiveId, title, category);
    const navNote = document.getElementById('nav-note');
    const navOut  = document.getElementById('nav-output');
    if (navNote) navNote.innerHTML = note ? `<strong>${note}</strong>` : 'Fill in Title &amp; Category to generate the nav snippet.';
    if (navOut)  navOut.innerHTML  = snippet ? highlightHTML(snippet) : '<em style="color:var(--text-dim)">— waiting for title &amp; category —</em>';

    // 4. Nutrition box — driven by builder-nutrition.js
    calculateNutrition();

    // 5. Timeline — driven by builder-timeline.js
    generateTimeline();

    // 6. Misc UI
    updateDuplicateButton();
}

// ── Global Helpers ────────────────────────────────────────
function val(id) { return document.getElementById(id)?.value.trim() ?? ''; }

function toTitleCase(s) {
    if (!s) return '';
    return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ── Scroll-to-Top ─────────────────────────────────────────
function initScrollToTop() {
    const btn = document.getElementById('scrollTopBtn');
    if (!btn) return;
    window.addEventListener('scroll', () => {
        const fromBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
        btn.classList.toggle('show', fromBottom <= 150);
    });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}
