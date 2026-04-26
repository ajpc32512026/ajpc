/* =========================================================
   RECIPE RENDERER — AJPC Kitchen Notebook
   Fixed: no inline styles, clean semantic HTML,
   proper error states, correct scaler hook.
========================================================= */

(function () {
    'use strict';

    const RECIPE_PATH = 'data/recipes/';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    async function init() {
        const container = document.getElementById('recipe-container');
        if (!container) return;

        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');

        if (!id) {
            renderError('No recipe specified. Please select one from the menu.', container);
            return;
        }

        try {
            const recipe = await fetchRecipe(id);
            renderRecipe(recipe, container);
            document.dispatchEvent(new CustomEvent('recipeRendered', { detail: recipe }));
        } catch (err) {
            console.error('[recipe-renderer]', err);
            renderError(`Could not load recipe "${id}". ${err.message}`, container);
        }
    }

    async function fetchRecipe(id) {
        const res = await fetch(`${RECIPE_PATH}${id}.json`);
        if (!res.ok) throw new Error(`Recipe file not found (${res.status})`);
        return res.json();
    }

    /* --------------------------------------------------
       Main render
    -------------------------------------------------- */
    function renderRecipe(r, container) {
        const title = r.title || r.id || 'Recipe';
        document.title = `${title} | AJPC Kitchen`;

        const hasIngredients = r.ingredients && r.ingredients.length > 0;
        const hasMethod      = r.method && r.method.length > 0;

        container.innerHTML = `
            <div class="recipe-page-wrapper animate-in">
                ${renderBreadcrumb(r)}
                ${renderWarnings(hasIngredients, hasMethod)}
                <p class="print-cue">Print option available at the bottom of this page.</p>
                ${renderHeader(r)}
                ${renderMetadata(r)}
                ${renderToolbar()}
                <hr class="recipe-divider">
                <div class="print-columns">
                    ${renderIngredients(r)}
                    <div class="print-col-right">
                        ${renderMethod(r)}
                        ${renderNotes(r.notes)}
                    </div>
                </div>
                ${renderJournal(r.journal)}
                ${renderNutrition(r.nutrition)}
                ${renderTags(r.tags)}
                ${renderRelated(r.related)}
            </div>
        `;

        setupToolbar(r);
    }

    /* --------------------------------------------------
       Sections
    -------------------------------------------------- */
    function renderBreadcrumb(r) {
        return `<div class="recipe-eyebrow">
            <a href="index.html">Home</a>
            <span>/</span>
            ${r.category ? `<a href="search.html?q=${encodeURIComponent(r.category)}">${escHtml(r.category)}</a><span>/</span>` : ''}
            <span>${escHtml(r.title || r.id || 'Recipe')}</span>
        </div>`;
    }

    function renderWarnings(hasIng, hasMethod) {
        const warnings = [];
        if (!hasIng) warnings.push('No ingredients listed for this recipe yet.');
        if (!hasMethod) warnings.push('No method/instructions provided yet.');
        if (!warnings.length) return '';
        return `<div class="recipe-warnings">
            <strong>Incomplete recipe data:</strong>
            <ul>${warnings.map(w => `<li>${w}</li>`).join('')}</ul>
        </div>`;
    }

    function renderHeader(r) {
        return `
            ${r.category ? `<span class="recipe-category-badge">${escHtml(r.category)}</span>` : ''}
            <h1 class="recipe-title">${escHtml(r.title || r.id || 'Recipe')}</h1>
            ${r.description ? `<p class="recipe-description">${escHtml(r.description)}</p>` : ''}
        `;
    }

    function renderMetadata(r) {
        const items = [
            { label: 'Prep',       value: r.prepTime },
            { label: 'Cook',       value: r.cookTime },
            { label: 'Total',      value: r.totalTime },
            { label: 'Serves',     value: r.servings },
            { label: 'Difficulty', value: r.difficulty },
        ].filter(m => m.value);

        if (!items.length) return '';

        return `<div class="recipe-metadata">
            ${items.map(m => `
                <div class="meta-item">
                    <span class="meta-label">${m.label}</span>
                    <span class="meta-value">${escHtml(m.value)}</span>
                </div>`).join('')}
        </div>`;
    }

    function renderToolbar() {
        return `<div class="recipe-toolbar">
            <button class="toolbar-btn primary" id="cookModeBtn">Cook Mode</button>
            <button class="toolbar-btn" id="shoppingListBtn">Shopping List</button>
            <button class="toolbar-btn" onclick="window.print()">Print Recipe</button>
        </div>`;
    }

    function renderIngredients(r) {
        if (!r.ingredients || !r.ingredients.length) {
            return `<section class="ingredients">
                <h2>Ingredients</h2>
                <p>No ingredients listed.</p>
            </section>`;
        }

        const scaler = `<div class="scaler-controls">
            <span class="scaler-label">Scale:</span>
            <button class="scaler-btn" id="scalerDown" aria-label="Decrease serving">-</button>
            <span class="scaler-display" id="scalerDisplay">1x</span>
            <button class="scaler-btn" id="scalerUp" aria-label="Increase serving">+</button>
        </div>`;

        const items = r.ingredients.map(ing => {
            if (ing.heading) {
                return `<li class="ingredient-heading">${escHtml(ing.heading)}</li>`;
            }
            return `<li>${formatIngredient(ing)}</li>`;
        }).join('');

        return `<section class="ingredients">
            <h2>Ingredients</h2>
            ${scaler}
            <ul>${items}</ul>
        </section>`;
    }

    function formatIngredient(ing) {
        if (typeof ing === 'string') return escHtml(ing);

        const qty    = String(ing.quantity ?? '').trim();
        const unit   = String(ing.unit || '').trim();
        const item   = String(ing.item || ing.name || ing.ingredient || '').trim();
        const notes  = String(ing.notes || ing.description || '').trim();

        if (!qty && !unit) {
            return notes
                ? `${escHtml(item)} <span class="ingredient-notes">(${escHtml(notes)})</span>`
                : escHtml(item);
        }

        const num = parseFloat(qty);
        const qtySpan = !isNaN(num)
            ? `<span class="ingredient-quantity" data-original="${num}">${escHtml(qty)}</span>`
            : `<span class="ingredient-quantity">${escHtml(qty)}</span>`;

        const parts = [unit, item].filter(Boolean).map(escHtml).join(' ');
        const notePart = notes ? ` <span class="ingredient-notes">(${escHtml(notes)})</span>` : '';
        return `${qtySpan} ${parts}${notePart}`;
    }

    function renderMethod(r) {
        if (!r.method || !r.method.length) {
            return `<section class="method">
                <h2>Method</h2>
                <p>No instructions provided.</p>
            </section>`;
        }

        const items = r.method.map(step => {
            if (step.heading) {
                return `<li class="method-heading">${escHtml(step.heading)}</li>`;
            }
            const text = typeof step === 'string'
                ? step
                : (step.instruction || step.text || JSON.stringify(step));
            return `<li>${escHtml(text)}</li>`;
        }).join('');

        return `<section class="method">
            <h2>Method</h2>
            <ol>${items}</ol>
        </section>`;
    }

    function renderNotes(notes) {
        if (!notes || !notes.length) return '';
        const items = notes.map(note => {
            if (typeof note === 'string') {
                return `<div class="note"><p>${escHtml(note)}</p></div>`;
            }
            const title   = note.title || note.type || 'Note';
            const content = note.content || note.text || '';
            // Skip copyright/attribution-only notes
            if ((content.includes('All rights reserved') || content.includes('©')) && content.length < 100) return '';
            return `<div class="note">
                <h4>${escHtml(title)}</h4>
                <p>${escHtml(content)}</p>
            </div>`;
        }).filter(Boolean).join('');

        if (!items) return '';
        return `<section class="recipe-notes"><h2>Notes</h2>${items}</section>`;
    }

    function renderJournal(journal) {
        if (!journal || !journal.length) return '';
        const entries = journal.map(e => {
            const dateStr = e.date
                ? new Date(e.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
                : '';
            return `<div class="journal-entry">
                ${dateStr ? `<span class="journal-date">${dateStr}</span>` : ''}
                <p>${escHtml(e.content || '')}</p>
            </div>`;
        }).join('');
        return `<section class="recipe-journal"><h2>Recipe Journal</h2>${entries}</section>`;
    }

    function renderNutrition(n) {
        if (!n) return '';
        const { servings, cal, protein, carbs, fat, fiber, coverage } = n;
        return `<section class="recipe-nutrition no-print-hide">
            <h2>Nutrition Facts</h2>
            <div class="nutrition-label">
                <div class="nutrition-header">
                    <span class="nutrition-title">Nutrition Facts</span>
                    <span class="nutrition-serving">Per serving | ${escHtml(String(servings || '?'))} servings</span>
                </div>
                <div class="nutrition-calories">
                    <span>Calories</span>
                    <span>${cal || 0}</span>
                </div>
                <div class="nutrition-divider thick"></div>
                <div class="nutrition-row"><span><strong>Protein</strong></span><span>${protein || 0}g</span></div>
                <div class="nutrition-row"><span><strong>Total Carbohydrate</strong></span><span>${carbs || 0}g</span></div>
                <div class="nutrition-row indent"><span>Dietary Fibre</span><span>${fiber || 0}g</span></div>
                <div class="nutrition-row"><span><strong>Total Fat</strong></span><span>${fat || 0}g</span></div>
                <div class="nutrition-divider thick"></div>
                ${coverage ? `<div class="nutrition-coverage">Estimated from ${coverage}% of ingredients</div>` : ''}
            </div>
        </section>`;
    }

    function renderTags(tags) {
        if (!tags || !tags.length) return '';
        const chips = tags.map(t =>
            `<a href="search.html?q=${encodeURIComponent(t)}" class="recipe-tag">#${escHtml(t)}</a>`
        ).join('');
        return `<div class="recipe-tags">${chips}</div>`;
    }

    function renderRelated(related) {
        if (!related || !related.length) return '';
        const cards = related.map(r =>
            `<a href="recipe.html?id=${encodeURIComponent(r.id)}" class="related-card">${escHtml(r.title || r.id)}</a>`
        ).join('');
        return `<section class="related-recipes">
            <h3>Related Recipes</h3>
            <div class="related-cards">${cards}</div>
        </section>`;
    }

    function renderError(msg, container) {
        container.innerHTML = `<div class="recipe-page-wrapper">
            <div class="recipe-warnings">
                <strong>Recipe Not Found</strong>
                <p>${escHtml(msg)}</p>
                <p><a href="index.html">Back to Home</a></p>
            </div>
        </div>`;
    }

    /* --------------------------------------------------
       Toolbar actions (Cook Mode, Scaler, Shopping List)
    -------------------------------------------------- */
    function setupToolbar(recipe) {
        // Cook Mode
        const cookBtn = document.getElementById('cookModeBtn');
        if (cookBtn) {
            cookBtn.addEventListener('click', () => {
                const active = document.body.classList.toggle('cook-mode-active');
                cookBtn.textContent = active ? 'Exit Cook Mode' : 'Cook Mode';
                if (active) window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }

        // Ingredient Scaler
        const scalerUp   = document.getElementById('scalerUp');
        const scalerDown  = document.getElementById('scalerDown');
        const scalerDisp  = document.getElementById('scalerDisplay');

        if (scalerUp && scalerDown && scalerDisp) {
            let multiplier = 1;

            function updateScale() {
                scalerDisp.textContent = multiplier + 'x';
                document.querySelectorAll('.ingredient-quantity[data-original]').forEach(el => {
                    const orig = parseFloat(el.getAttribute('data-original'));
                    if (!isNaN(orig)) {
                        el.textContent = formatNum(orig * multiplier);
                    }
                });
            }

            scalerUp.addEventListener('click', () => { multiplier = Math.min(multiplier + 1, 20); updateScale(); });
            scalerDown.addEventListener('click', () => { multiplier = Math.max(multiplier - 1, 1); updateScale(); });
        }

        // Shopping List
        const shopBtn = document.getElementById('shoppingListBtn');
        if (shopBtn && recipe.ingredients) {
            shopBtn.addEventListener('click', () => buildShoppingList(recipe));
        }
    }

    function buildShoppingList(recipe) {
        const lines = recipe.ingredients
            .filter(i => !i.heading)
            .map(i => {
                if (typeof i === 'string') return i;
                const qty  = i.quantity ? String(i.quantity) + (i.unit ? ' ' + i.unit : '') : '';
                const item = i.item || i.name || '';
                return qty ? `${qty} ${item}` : item;
            })
            .filter(Boolean);

        const text = `Shopping list — ${recipe.title || 'Recipe'}\n\n${lines.join('\n')}`;
        const blob = new Blob([text], { type: 'text/plain' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = `shopping-list-${(recipe.id || 'recipe')}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function formatNum(n) {
        // Return clean fractions for common values
        const fracs = { 0.25: '1/4', 0.5: '1/2', 0.75: '3/4', 0.33: '1/3', 0.67: '2/3', 0.125: '1/8' };
        const frac = fracs[Math.round(n * 1000) / 1000];
        if (frac && Number.isInteger(Math.floor(n))) {
            const whole = Math.floor(n);
            const remainder = Math.round((n - whole) * 1000) / 1000;
            const fracPart = fracs[remainder];
            if (whole === 0) return fracPart || String(Math.round(n * 100) / 100);
            if (fracPart) return `${whole} ${fracPart}`;
        }
        return String(Math.round(n * 100) / 100);
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    window.recipeRenderer = { fetchRecipe };

})();
