/* =========================================================
   RECIPE RENDERER — AJPC Kitchen Notebook
   Fixed: no inline styles, clean semantic HTML,
   proper error states, correct scaler hook.
   Added: scaled cook time & serving estimator,
   last updated timestamp, ingredient-based related recipes,
   dynamic tip box with structured ingredient data.
   Updated: Bistro category, youWillNeed note key fix.
========================================================= */

(function () {
    'use strict';

    // Pantry staples for ingredient matching
    var PANTRY_STAPLES = [
        'water', 'salt', 'pepper', 'black pepper', 'white pepper',
        'butter', 'unsalted butter', 'oil', 'olive oil', 'vegetable oil', 'canola oil',
        'flour', 'plain flour', 'all-purpose flour', 'bread flour', 'self-raising flour',
        'sugar', 'white sugar', 'caster sugar', 'brown sugar', 'icing sugar',
        'eggs', 'egg', 'milk',
        'baking powder', 'baking soda', 'bi-carb soda', 'bicarbonate of soda',
        'vanilla', 'vanilla extract', 'yeast',
        'stock', 'chicken stock', 'beef stock', 'vegetable stock',
        'garlic', 'onion', 'brown onion', 'red onion', 'spring onion',
        'to taste'
    ];

    // Simple cache for recipe index — avoids re-fetching on every page load
    var recipeIndexCache = {
        data: null,
        timestamp: null,
        maxAge: 30 * 60 * 1000 // 30 minutes
    };

    // Global tip storage
    var currentTipData = null;
    var currentRecipeId = null;
    var currentRecipeTitle = null;

    function getCachedIndex() {
        if (recipeIndexCache.data && recipeIndexCache.timestamp && (Date.now() - recipeIndexCache.timestamp < recipeIndexCache.maxAge)) {
            return Promise.resolve(recipeIndexCache.data);
        }
        return fetch('json/recipe-index.json')
            .then(function(res) { return res.json(); })
            .then(function(data) {
                recipeIndexCache.data = data;
                recipeIndexCache.timestamp = Date.now();
                return data;
            })
            .catch(function() {
                if (recipeIndexCache.data) return recipeIndexCache.data;
                return [];
            });
    }

    const RECIPE_PATH = 'data/recipes/';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    async function init() {
        const container = document.getElementById('recipe-container');
        if (!container) return;

        // Pre-warm the cache immediately — runs in the background
        getCachedIndex();

        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');

        if (!id) {
            renderError('No recipe specified. Please select one from the menu.', container);
            return;
        }

        // Load recipe index for related suggestions
        var recipeIndex = [];
        try {
            var idxRes = await fetch('json/recipe-index.json');
            if (idxRes.ok) recipeIndex = await idxRes.json();
        } catch(e) {
            console.warn('Could not load recipe index for related suggestions');
            recipeIndex = [];
        }

        try {
            const recipe = await fetchRecipe(id);
            currentRecipeId = recipe.id;
            currentRecipeTitle = recipe.title;
            renderRecipe(recipe, container, recipeIndex);
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

    function validateRecipe(recipe, id) {
        var warnings = [];

        if (!recipe.title) {
            warnings.push('Missing recipe title');
        }

        if (recipe.id && recipe.id !== id) {
            warnings.push('Recipe ID "' + recipe.id + '" does not match filename "' + id + '"');
        }

        if (!recipe.ingredients || recipe.ingredients.length === 0) {
            warnings.push('No ingredients listed');
        } else {
            var hasRealIngredient = recipe.ingredients.some(function(ing) {
                return !ing.heading && (ing.item || ing.name || ing.ingredient);
            });
            if (!hasRealIngredient) {
                warnings.push('Ingredients section has only headings — no actual ingredients found');
            }
        }

        if (!recipe.method || recipe.method.length === 0) {
            warnings.push('No method steps listed');
        } else {
            var hasRealStep = recipe.method.some(function(step) {
                return !step.heading && (step.instruction || step.text);
            });
            if (!hasRealStep) {
                warnings.push('Method section has only headings — no actual steps found');
            }
        }

        // FIX: Added Bistro to valid categories
        var validCategories = [
            'Breads', 'Baking', 'Biscuits', 'Bistro', 'Entree', 'Dinner', 'Mains',
            'Filipino', 'Desserts', 'Sauces', 'Pasta', 'Pizza',
            'Soups', 'Salads', 'Sides', 'Snacks', 'Breakfast', 'Other'
        ];
        if (recipe.category && validCategories.indexOf(recipe.category) === -1) {
            warnings.push('Unknown category "' + recipe.category + '" — may not appear in navigation');
        }

        if (recipe.tags && recipe.tags.length) {
            var seen = {};
            var dupes = [];
            recipe.tags.forEach(function(tag) {
                var lower = tag.toLowerCase();
                if (seen[lower]) dupes.push(tag);
                seen[lower] = true;
            });
            if (dupes.length) {
                warnings.push('Duplicate tags found: ' + dupes.join(', '));
            }
        }

        if (recipe.notes && recipe.notes.length) {
            recipe.notes.forEach(function(note, i) {
                if (note.title && !note.content && !note.text) {
                    warnings.push('Note #' + (i + 1) + ' "' + note.title + '" has no content');
                }
                if (!note.type || ['acknowledgement','serving','technique','storage','substitution','variation','tip'].indexOf(note.type) === -1) {
                    if (note.type) {
                        warnings.push('Note #' + (i + 1) + ' has unrecognised type "' + note.type + '"');
                    }
                }
            });
        }

        if (recipe.servings && isNaN(parseInt(recipe.servings))) {
            warnings.push('Servings value "' + recipe.servings + '" is not a number — scaler may not work correctly');
        }

        if (warnings.length > 0) {
            console.warn('[recipe-validator] ' + recipe.title + ' (' + id + '):');
            warnings.forEach(function(w) {
                console.warn('  ⚠ ' + w);
            });
        }

        return warnings;
    }

    /* --------------------------------------------------
       Main render
    -------------------------------------------------- */
    function renderRecipe(r, container, recipeIndex) {
        const title = r.title || r.id || 'Recipe';
        document.title = `${title} | AJPC Kitchen`;

        var metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) {
            metaDesc.setAttribute('content', (r.description || r.title || 'Recipe') + " — Ana & John's Kitchen Notebook.");
        }

        validateRecipe(r, r.id || '');

        const hasIngredients = r.ingredients && r.ingredients.length > 0;
        const hasMethod = r.method && r.method.length > 0;

        container.innerHTML = `
            <div class="recipe-page-wrapper animate-in">
                ${renderBreadcrumb(r)}
                ${renderWarnings(hasIngredients, hasMethod)}
                <p class="print-cue">Print option available at the bottom of this page.</p>
                ${renderHeader(r)}
                ${renderMetadata(r)}
                ${renderToolbar()}
                <hr class="recipe-divider">
                <div id="scalerInfoContainer" class="scaler-info no-print-hide" style="display:none;margin-bottom:var(--sp-lg);padding:0.5rem 0.75rem;background:rgba(201,125,62,0.08);border:1px solid var(--border-dim);border-radius:6px;font-size:0.82rem;color:var(--cream-dim);line-height:1.5;"></div>
                <div class="print-columns">
                    ${renderIngredients(r)}
                    ${renderYouWillNeed(r.youWillNeed)}
                    <div class="print-col-right">
                        ${renderMethod(r)}
                        ${renderNotes(r.notes)}
                    </div>
                </div>
                ${renderJournal(r.journal)}
                ${renderTipBox(r, recipeIndex)}
                ${renderNutrition(r.nutrition)}
                ${renderTags(r.tags)}
                ${renderRelated(r, recipeIndex)}
            </div>
        `;

        setupToolbar(r);

        if (r.lastModified || r.updatedAt) {
            const lastUpdated = r.lastModified || r.updatedAt;
            const date = new Date(lastUpdated);
            const formattedDate = date.toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });
            const lastUpdatedDiv = document.createElement('div');
            lastUpdatedDiv.className = 'recipe-last-updated';
            lastUpdatedDiv.innerHTML = `📝 Last updated: ${formattedDate}`;
            container.querySelector('.recipe-page-wrapper').appendChild(lastUpdatedDiv);
        }

        setTimeout(function() {
            if (typeof window.loadRandomTip === 'function') {
                window.loadRandomTip();
            }
        }, 100);
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
            { label: 'Difficulty', value: r.difficulty }
        ].filter(m => m.value);

        if (!items.length) return '';

        return `<div class="recipe-metadata-table">
            ${items.map(m => `
                <div class="meta-cell">
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

        // Separate regular ingredients from to-taste items
        const regularIngs = r.ingredients.filter(ing => !ing.toTaste);
        const toTasteIngs = r.ingredients.filter(ing => ing.toTaste);

        const items = regularIngs.map(ing => {
            if (ing.heading) {
                return `<li class="ingredient-heading">${escHtml(ing.heading)}</li>`;
            }
            return `<li>${formatIngredient(ing)}</li>`;
        }).join('');

        const toTasteHtml = toTasteIngs.length
            ? `<li class="ingredient-totaste-label">Season to taste</li>` +
              toTasteIngs.map(ing => {
                const note = ing.notes ? ` <span class="ingredient-notes">(${escHtml(ing.notes)})</span>` : '';
                return `<li class="ingredient-totaste">${escHtml(ing.item)}${note}</li>`;
              }).join('')
            : ''

        return `<section class="ingredients">
            <h2>Ingredients</h2>
            ${scaler}
            <ul>${items}${toTasteHtml}</ul>
        </section>`;
    }

    function formatIngredient(ing) {
        if (typeof ing === 'string') return escHtml(ing);

        const qty   = String(ing.quantity ?? '').trim();
        const unit  = String(ing.unit || '').trim();
        const item  = String(ing.item || ing.name || ing.ingredient || '').trim();
        const notes = String(ing.notes || ing.description || '').trim();

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

    // FIX: Changed item.notes → item.note to match JSON key from builder
    function renderYouWillNeed(youWillNeed) {
        if (!youWillNeed || !youWillNeed.length) return '';

        const items = youWillNeed.map(entry => {
            const noteText = entry.note || entry.notes || ''; // accept either key for backwards compat
            const notePart = noteText
                ? `<span class="equipment-notes"> — ${escHtml(noteText)}</span>`
                : '';
            return `<li class="you-will-need-item">
                <span class="you-will-need-checkbox">☐</span>
                <span class="you-will-need-text">${escHtml(entry.item)}${notePart}</span>
            </li>`;
        }).join('');

        return `<section class="you-will-need">
            <h2>You Will Also Need</h2>
            <ul class="you-will-need-list">
                ${items}
            </ul>
        </section>`;
    }

    // Convert [[id|display text]] links in instruction text
    function renderLinkedText(text) {
        const safe = escHtml(text);
        return safe.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, function(match, id, display) {
            return `<a href="recipe.html?id=${encodeURIComponent(id.trim())}" class="recipe-inline-link">${display.trim()}</a>`;
        });
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
            return `<li>${renderLinkedText(text)}</li>`;
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
            if ((content.includes('All rights reserved') || content.includes('©')) && content.length < 100) return '';
            return `<div class="note">
                <h4>${escHtml(title)}</h4>
                <p>${renderLinkedText(content)}</p>
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
    
    const { 
        servings, cal, kj, protein, carbs, sugars, fat, saturated_fat, fiber, sodium, coverage,
        calcium_mg, iron_mg, potassium_mg, magnesium_mg, zinc_mg,
        cholesterol_mg, vitamin_a_ug, vitamin_c_mg, vitamin_d_ug
    } = n;
    
    // Build micronutrients section only if data exists
    let micronutrientsHtml = '';
    const micronutrients = [];
    
    if (calcium_mg) micronutrients.push(`<div class="nutrition-row"><span>Calcium</span><span>${calcium_mg}mg</span></div>`);
    if (iron_mg) micronutrients.push(`<div class="nutrition-row"><span>Iron</span><span>${iron_mg}mg</span></div>`);
    if (potassium_mg) micronutrients.push(`<div class="nutrition-row"><span>Potassium</span><span>${potassium_mg}mg</span></div>`);
    if (magnesium_mg) micronutrients.push(`<div class="nutrition-row"><span>Magnesium</span><span>${magnesium_mg}mg</span></div>`);
    if (zinc_mg) micronutrients.push(`<div class="nutrition-row"><span>Zinc</span><span>${zinc_mg}mg</span></div>`);
    if (cholesterol_mg) micronutrients.push(`<div class="nutrition-row"><span>Cholesterol</span><span>${cholesterol_mg}mg</span></div>`);
    if (vitamin_a_ug) micronutrients.push(`<div class="nutrition-row"><span>Vitamin A</span><span>${vitamin_a_ug}mcg</span></div>`);
    if (vitamin_c_mg) micronutrients.push(`<div class="nutrition-row"><span>Vitamin C</span><span>${vitamin_c_mg}mg</span></div>`);
    if (vitamin_d_ug) micronutrients.push(`<div class="nutrition-row"><span>Vitamin D</span><span>${vitamin_d_ug}mcg</span></div>`);
    
    if (micronutrients.length) {
        micronutrientsHtml = `
            <div class="nutrition-divider thin"></div>
            ${micronutrients.join('')}
        `;
    }
    
    return `<section class="recipe-nutrition">
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
            ${kj ? `<div class="nutrition-kj">
                <span>Energy (kJ)</span>
                <span>${kj}</span>
            </div>` : ''}
            <div class="nutrition-divider thick"></div>
            <div class="nutrition-row"><span><strong>Protein</strong></span><span>${protein || 0}g</span></div>
            <div class="nutrition-row"><span><strong>Total Carbohydrate</strong></span><span>${carbs || 0}g</span></div>
            <div class="nutrition-row indent"><span>Sugars</span><span>${sugars || 0}g</span></div>
            <div class="nutrition-row indent"><span>Dietary Fibre</span><span>${fiber || 0}g</span></div>
            <div class="nutrition-row"><span><strong>Total Fat</strong></span><span>${fat || 0}g</span></div>
            <div class="nutrition-row indent"><span>Saturated Fat</span><span>${saturated_fat || 0}g</span></div>
            <div class="nutrition-row"><span><strong>Sodium</strong></span><span>${sodium || 0}mg</span></div>
            ${micronutrientsHtml}
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

    /* --------------------------------------------------
       Tip Box
    -------------------------------------------------- */
    function renderTipBox(recipe, recipeIndex) {
        if (!recipe.ingredients) return '';

        return '<div class="recipe-tip-box" id="recipeTipBox">' +
            '<div class="tip-box-header">💡 Did You Know?</div>' +
            '<div class="tip-box-content" id="tipBoxContent">' +
            '<div class="tip-loading">Loading kitchen wisdom...</div>' +
            '</div>' +
            '<div class="tip-box-footer">' +
            '<button class="tip-box-refresh" onclick="window.loadRandomTip()">🔄 Another Tip</button>' +
            '<button class="tip-box-save" onclick="window.saveCurrentTip()">📌 Save to My Notebook</button>' +
            '</div>' +
            '</div>';
    }

    window.loadRandomTip = async function() {
        function escHtmlForTip(str) {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function cleanNotesText(notes) {
            if (!notes) return '';
            var cleaned = notes;
            cleaned = cleaned.replace(/\s*-\s*\*\*/g, '');
            cleaned = cleaned.replace(/\*\*/g, '');
            cleaned = cleaned.replace(/(Texture & Flavor:|Usage Tips:|Substitutions:|Usage:|Tips:|Storage:|Pairings:)/g, '<br><strong>$1</strong>');
            cleaned = cleaned.replace(/Usage\s+Tips:/g, 'Usage Tips:');
            cleaned = cleaned.replace(/Storage:\s*/g, '');
            cleaned = cleaned.replace(/\.([A-Z])/g, '. $1');
            cleaned = cleaned.replace(/::/g, ':');
            cleaned = cleaned.replace(/\s+/g, ' ').trim();
            cleaned = cleaned.replace(/<br>\s*<br>/g, '<br>');
            return cleaned;
        }

        var container = document.getElementById('tipBoxContent');
        if (!container) return;

        try {
            var tipInventory = window.tipInventory;
            if (!tipInventory) {
                var res = await fetch('json/ingredient_inventory_v7.json');
                if (!res.ok) throw new Error('Failed to load ingredient directory');
                tipInventory = await res.json();
                window.tipInventory = tipInventory;
            }

            var ingredientsList = [];
            document.querySelectorAll('.ingredients li').forEach(function(li) {
                if (li.classList.contains('ingredient-heading')) return;
                var spans = li.querySelectorAll('span');
                var ingredientName = '';
                for (var s = 0; s < spans.length; s++) {
                    var spanText = spans[s].innerText || '';
                    if (spans[s].classList.contains('ingredient-quantity')) continue;
                    if (spans[s].classList.contains('ingredient-notes')) continue;
                    if (spanText.trim().length > 0) {
                        ingredientName = spanText.trim().toLowerCase();
                        break;
                    }
                }
                if (!ingredientName) {
                    var text = li.innerText || '';
                    text = text.replace(/^\d+[\d\/\s]*\s*/, '');
                    text = text.replace(/^g\s|^ml\s|^kg\s|^cup\s|^tbsp\s|^tsp\s|^oz\s/i, '');
                    ingredientName = text.trim().toLowerCase();
                }
                ingredientName = ingredientName.replace(/[\(\)]/g, '').trim();
                if (ingredientName.length < 3) return;
                var isStaple = false;
                for (var st = 0; st < PANTRY_STAPLES.length; st++) {
                    if (PANTRY_STAPLES[st] === ingredientName || ingredientName.includes(PANTRY_STAPLES[st])) {
                        isStaple = true;
                        break;
                    }
                }
                if (!isStaple && ingredientsList.indexOf(ingredientName) === -1) {
                    ingredientsList.push(ingredientName);
                }
            });

            console.log('Detected ingredients:', ingredientsList);

            var matches = [];
            for (var i = 0; i < ingredientsList.length; i++) {
                for (var ing in tipInventory) {
                    if (ing.toLowerCase().indexOf(ingredientsList[i]) !== -1 ||
                        ingredientsList[i].indexOf(ing.toLowerCase()) !== -1) {
                        matches.push({ name: ing, data: tipInventory[ing] });
                    }
                }
            }

            if (matches.length === 0) {
                container.innerHTML = '<p class="tip-no-results">No tips available for ingredients in this recipe.</p>';
                return;
            }

            var random = matches[Math.floor(Math.random() * matches.length)];
            currentTipData = random;

            var html = '<div class="tip-ingredient">🍽️ <strong>' + escHtmlForTip(random.name) + '</strong>';
            if (random.data.aka && random.data.aka.length) {
                html += ' <span class="tip-aka">(' + random.data.aka.join(', ') + ')</span>';
            }
            html += '</div>';

            if (random.data.purpose) {
                html += '<div class="tip-purpose"><strong>🎯 Purpose:</strong> ' + escHtmlForTip(random.data.purpose) + '</div>';
            }

            if (random.data.usageTips) {
                var cleanUsage = random.data.usageTips.replace(/\*\*/g, '').replace(/Usage:/g, '').trim();
                html += '<div class="tip-usage"><strong>💡 Usage:</strong> ' + escHtmlForTip(cleanUsage) + '</div>';
            }

            if (random.data.storage) {
                var cleanStorage = random.data.storage.replace(/\*\*/g, '').replace(/Storage:/i, '').trim();
                html += '<div class="tip-storage"><strong>📦 Storage:</strong> ' + escHtmlForTip(cleanStorage) + '</div>';
            }

            if (random.data.substitutes) {
                html += '<div class="tip-substitutes"><strong>🔄 Substitute:</strong> ' + escHtmlForTip(random.data.substitutes) + '</div>';
            }

            if (random.data.notes && random.data.notes.trim()) {
                var cleanNote = cleanNotesText(random.data.notes);
                if (cleanNote.indexOf(random.name.toLowerCase()) === 0) {
                    cleanNote = cleanNote.substring(random.name.length).trim();
                    cleanNote = cleanNote.replace(/^is\s+|^are\s+/, '');
                }
                cleanNote = cleanNote.charAt(0).toUpperCase() + cleanNote.slice(1);
                html += '<div class="tip-notes"><strong>📝 Notes:</strong> ' + cleanNote + '</div>';
            }

            container.innerHTML = html;

        } catch(e) {
            console.warn('Tip box error:', e);
            container.innerHTML = '<p class="tip-no-results">Tips coming soon! Could not load ingredient data.</p>';
        }
    };

    window.saveCurrentTip = function() {
        if (!currentTipData) {
            alert('No tip to save. Click "Another Tip" first.');
            return;
        }
        var savedTips = JSON.parse(localStorage.getItem('ajpc_saved_tips') || '[]');
        var newTip = {
            id: Date.now(),
            recipeId: currentRecipeId,
            recipeTitle: currentRecipeTitle,
            ingredient: currentTipData.name,
            tip: currentTipData.data.notes ? currentTipData.data.notes.substring(0, 500) : '',
            substitute: currentTipData.data.substitutes ? currentTipData.data.substitutes : '',
            purpose: currentTipData.data.purpose ? currentTipData.data.purpose : '',
            savedAt: new Date().toISOString().split('T')[0]
        };
        savedTips.unshift(newTip);
        localStorage.setItem('ajpc_saved_tips', JSON.stringify(savedTips));
        alert('✓ Tip saved to your personal notebook!');
    };

    /* --------------------------------------------------
       Related Recipes (Manual + Ingredient-based)
    -------------------------------------------------- */
    function getRelatedByIngredients(recipe, allRecipes, maxResults) {
        maxResults = maxResults || 3;
        if (!recipe.ingredients || !allRecipes || allRecipes.length === 0) return [];

        var currentIngredients = [];
        for (var i = 0; i < recipe.ingredients.length; i++) {
            var ing = recipe.ingredients[i];
            if (ing.heading) continue;
            var item = (ing.item || ing.name || '').toLowerCase().trim();
            if (!item) continue;
            var isStaple = false;
            for (var s = 0; s < PANTRY_STAPLES.length; s++) {
                if (PANTRY_STAPLES[s] === item || item.includes(PANTRY_STAPLES[s])) {
                    isStaple = true;
                    break;
                }
            }
            if (!isStaple && currentIngredients.indexOf(item) === -1) {
                currentIngredients.push(item);
            }
        }

        if (currentIngredients.length === 0) return [];

        var scored = [];
        for (var r = 0; r < allRecipes.length; r++) {
            var otherRecipe = allRecipes[r];
            if (otherRecipe.id === recipe.id) continue;
            var otherIngredients = [];
            if (otherRecipe.ingredients) {
                for (var j = 0; j < otherRecipe.ingredients.length; j++) {
                    var oing = otherRecipe.ingredients[j];
                    if (oing.heading) continue;
                    var oitem = (oing.item || oing.name || '').toLowerCase().trim();
                    if (!oitem) continue;
                    var isStapleOther = false;
                    for (var s = 0; s < PANTRY_STAPLES.length; s++) {
                        if (PANTRY_STAPLES[s] === oitem || oitem.includes(PANTRY_STAPLES[s])) {
                            isStapleOther = true;
                            break;
                        }
                    }
                    if (!isStapleOther && otherIngredients.indexOf(oitem) === -1) {
                        otherIngredients.push(oitem);
                    }
                }
            }
            var matchCount = 0;
            for (var c = 0; c < currentIngredients.length; c++) {
                for (var o = 0; o < otherIngredients.length; o++) {
                    if (otherIngredients[o].indexOf(currentIngredients[c]) !== -1 ||
                        currentIngredients[c].indexOf(otherIngredients[o]) !== -1) {
                        matchCount++;
                        break;
                    }
                }
            }
            if (matchCount > 0) {
                scored.push({ recipe: otherRecipe, matchCount: matchCount });
            }
        }

        scored.sort(function(a, b) { return b.matchCount - a.matchCount; });
        return scored.slice(0, maxResults).map(function(s) { return s.recipe; });
    }

    function renderRelated(recipe, recipeIndex) {
        var manualRelated = recipe.related || [];
        var relatedRecipes = manualRelated.slice();

        if (relatedRecipes.length < 3 && recipeIndex && recipeIndex.length > 0) {
            var suggested = getRelatedByIngredients(recipe, recipeIndex, 3 - relatedRecipes.length);
            for (var s = 0; s < suggested.length; s++) {
                var alreadyExists = relatedRecipes.some(function(e) { return e.id === suggested[s].id; });
                if (!alreadyExists) {
                    relatedRecipes.push({ id: suggested[s].id, title: suggested[s].title });
                }
            }
        }

        if (relatedRecipes.length === 0) return '';

        var cards = relatedRecipes.map(function(rel) {
            return '<a href="recipe.html?id=' + encodeURIComponent(rel.id) + '" class="related-card">' + escHtml(rel.title || rel.id) + '</a>';
        }).join('');

        return '<section class="related-recipes">' +
            '<h3>You Might Also Like</h3>' +
            '<div class="related-cards">' + cards + '</div>' +
            '</section>';
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
       Helper: parse time string to minutes
    -------------------------------------------------- */
    function parseTimeToMinutes(timeStr) {
        if (!timeStr) return 0;
        var str = timeStr.toLowerCase();
        var total = 0;
        var hours = str.match(/(\d+)\s*(h|hr|hour)/);
        if (hours) total += parseInt(hours[1]) * 60;
        var minutes = str.match(/(\d+)\s*(m|min|minute)/);
        if (minutes) total += parseInt(minutes[1]);
        return total;
    }

    /* --------------------------------------------------
       Toolbar actions (Cook Mode, Scaler, Shopping List)
    -------------------------------------------------- */
    function setupToolbar(recipe) {
        var multiplier = 1;

        var scalerDisp = document.getElementById('scalerDisplay');
        if (scalerDisp) scalerDisp.textContent = '1x';

        var cookBtn = document.getElementById('cookModeBtn');
        if (cookBtn) {
            cookBtn.addEventListener('click', function() { enterCookMode(recipe); });
        }

        var scalerUp   = document.getElementById('scalerUp');
        var scalerDown = document.getElementById('scalerDown');
        scalerDisp = document.getElementById('scalerDisplay');
        var scalerInfo = document.getElementById('scalerInfoContainer');

        var baseServings = 1;
        if (recipe.servings) {
            var parsed = parseInt(recipe.servings);
            if (!isNaN(parsed)) baseServings = parsed;
        }

        var baseCookMinutes  = recipe.cookTime  ? parseTimeToMinutes(recipe.cookTime)  : 0;
        var baseTotalMinutes = recipe.totalTime ? parseTimeToMinutes(recipe.totalTime) : 0;
        var basePrepMinutes  = recipe.prepTime  ? parseTimeToMinutes(recipe.prepTime)  : 0;
        if (!baseTotalMinutes && (basePrepMinutes || baseCookMinutes)) {
            baseTotalMinutes = basePrepMinutes + baseCookMinutes;
        }

        function updateScale() {
            scalerDisp.textContent = multiplier + 'x';

            document.querySelectorAll('.ingredient-quantity[data-original]').forEach(function(el) {
                var orig = parseFloat(el.getAttribute('data-original'));
                if (!isNaN(orig)) el.textContent = formatNum(orig * multiplier);
            });

            if (scalerInfo) {
                if (multiplier === 1) {
                    scalerInfo.style.display = 'none';
                    scalerInfo.classList.add('no-print-hide');
                } else {
                    var scaledServings = Math.round(baseServings * multiplier);
                    var isBatchBaked = recipe.category === 'Biscuits' ||
                        (recipe.tags && recipe.tags.some(function(t) {
                            var tag = t.toLowerCase();
                            return tag === 'biscuit' || tag === 'snack';
                        }));

                    var infoHtml = '<strong>Scaled estimates:</strong><br>';
                    infoHtml += '• Serves: <strong>' + scaledServings + '</strong><br>';

                    if (isBatchBaked && recipe.yieldPerBatch && baseCookMinutes > 0) {
                        var perBatch = parseInt(recipe.yieldPerBatch) || baseServings;
                        var totalBatches = Math.ceil(scaledServings / perBatch);
                        var batchesPerRound = 2;
                        var rounds = Math.ceil(totalBatches / batchesPerRound);
                        var batchCookMin = baseCookMinutes;
                        var totalBatchCookMin = rounds * batchCookMin;
                        var totalBatchTimeMin = totalBatchCookMin + basePrepMinutes;
                        var totalDiff = totalBatchTimeMin - baseTotalMinutes;

                        infoHtml += '• Cook time: <strong>' + batchCookMin + ' min per batch</strong><br>';
                        infoHtml += '• Batches needed: <strong>' + totalBatches + '</strong> (' + perBatch + ' per batch, ' + rounds + ' round' + (rounds !== 1 ? 's' : '') + ' in the oven)<br>';
                        infoHtml += '• Total cook time: <strong>~' + totalBatchCookMin + ' min</strong><br>';
                        infoHtml += '• Total time: <strong>~' + totalBatchTimeMin + ' min</strong>';
                        if (Math.abs(totalDiff) >= 5) {
                            infoHtml += ' <span style="color:var(--copper-warm);">(' + (totalDiff > 0 ? '+' : '') + totalDiff + ' min)</span>';
                        }
                        infoHtml += '<br>';
                        infoHtml += '<span style="font-size:0.75rem;color:var(--cream-muted);">Batch cooking — per-batch time stays the same. Total time scales with number of batches.</span><br>';

                    } else if (baseCookMinutes > 0) {
                        var isBaked = !isBatchBaked && recipe.tags && recipe.tags.some(function(t) {
                            return t === 'Baked' || t === 'Bread' || t === 'Cake' || t === 'Pastry';
                        });
                        var timeScaleFactor = isBaked ? Math.pow(multiplier, 0.4) : Math.pow(multiplier, 0.25);
                        var scaledCookMin  = Math.round(baseCookMinutes * timeScaleFactor);
                        var scaledTotalMin = Math.round((baseTotalMinutes - baseCookMinutes) + scaledCookMin);
                        var cookDiff  = scaledCookMin  - baseCookMinutes;
                        var totalDiff = scaledTotalMin - baseTotalMinutes;

                        infoHtml += '• Cook time: <strong>~' + scaledCookMin + ' min</strong>';
                        if (Math.abs(cookDiff) >= 5) {
                            infoHtml += ' <span style="color:var(--copper-warm);">(' + (cookDiff > 0 ? '+' : '') + cookDiff + ' min)</span>';
                        }
                        infoHtml += '<br>';

                        if (baseTotalMinutes > 0) {
                            infoHtml += '• Total time: <strong>~' + scaledTotalMin + ' min</strong>';
                            if (Math.abs(totalDiff) >= 5) {
                                infoHtml += ' <span style="color:var(--copper-warm);">(' + (totalDiff > 0 ? '+' : '') + totalDiff + ' min)</span>';
                            }
                            infoHtml += '<br>';
                        }
                    }

                    infoHtml += '<span style="font-size:0.75rem;color:var(--cream-muted);">Check for doneness — scaled times are a guide only.</span>';
                    scalerInfo.innerHTML = infoHtml;
                    scalerInfo.style.display = 'block';
                    scalerInfo.classList.remove('no-print-hide');
                }
            }
        }

        if (scalerUp && scalerDown && scalerDisp) {
            scalerUp.addEventListener('click', function() {
                multiplier = Math.min(multiplier + 1, 20);
                updateScale();
            });
            scalerDown.addEventListener('click', function() {
                multiplier = Math.max(multiplier - 1, 1);
                updateScale();
            });
        }

        var shopBtn = document.getElementById('shoppingListBtn');
        if (shopBtn && recipe.ingredients) {
            shopBtn.addEventListener('click', function() { buildShoppingList(recipe, multiplier); });
        }
    }

    function buildShoppingList(recipe, scale) {
        var existing = document.getElementById('shoppingPanel');
        if (existing) { existing.remove(); return; }

        var excludeItems = [
            'water', 'hot water', 'cold water', 'warm water', 'boiling water', 'tap water'
        ];

        var lines = (recipe.ingredients || [])
            .filter(function(i) { return !i.heading; })
            .map(function(i) {
                if (typeof i === 'string') return i;
                var scaleFactor = scale || 1;
                var raw = parseFloat(i.quantity);
                var qty;
                if (!isNaN(raw) && scaleFactor > 1) {
                    qty = formatNum(raw * scaleFactor) + (i.unit ? ' ' + i.unit : '');
                } else {
                    qty = i.quantity ? String(i.quantity) + (i.unit ? ' ' + i.unit : '') : '';
                }
                var item = (i.item || i.name || '').toLowerCase().trim();
                return { qty: qty, item: item, original: i };
            })
            .filter(function(entry) {
                if (!entry.item) return false;
                for (var k = 0; k < excludeItems.length; k++) {
                    if (entry.item === excludeItems[k]) return false;
                }
                return true;
            })
            .map(function(entry) {
                return entry.qty ? entry.qty + ' ' + entry.original.item : entry.original.item;
            })
            .filter(Boolean);

        var panel = document.createElement('div');
        panel.id = 'shoppingPanel';

        var inner = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">';
        var scaleDisplay = (scale && scale > 1) ? ' &times; ' + scale : '';
        inner += '<span style="font-size:0.7rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--copper);font-weight:700;">Shopping List' + scaleDisplay + '</span>';
        inner += '<button onclick="document.getElementById(\'shoppingPanel\').remove()" style="background:none;border:none;color:var(--cream-muted);font-size:1.2rem;cursor:pointer;line-height:1;">&times;</button></div>';
        inner += '<p style="font-size:0.85rem;color:var(--cream-muted);margin-bottom:1rem;font-style:italic;">' + escHtml(recipe.title || '') + '</p>';

        if (lines.length === 0) {
            inner += '<p style="color:var(--cream-muted);font-style:italic;">All ingredients are pantry staples — nothing to buy!</p>';
        } else {
            inner += '<p style="font-size:0.7rem;color:var(--cream-muted);margin-bottom:0.75rem;">Check the items you need to buy, then print.</p>';
            inner += '<button id="shoppingSelectAll" style="margin-bottom:0.75rem;padding:0.35rem 0.75rem;background:rgba(201,125,62,0.1);border:1px solid var(--border-copper);border-radius:4px;color:var(--copper-warm);font-family:var(--font-body);font-size:0.72rem;cursor:pointer;">Select All</button>';
            inner += '<ul style="list-style:none;padding:0;margin:0;">';
            for (var j = 0; j < lines.length; j++) {
                inner += '<li style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid var(--border-dim);">';
                inner += '<input type="checkbox" id="shop-' + j + '" class="shop-checkbox" style="width:16px;height:16px;accent-color:var(--copper);cursor:pointer;flex-shrink:0;">';
                inner += '<label for="shop-' + j + '" style="font-size:0.9rem;color:var(--cream-dim);cursor:pointer;line-height:1.4;">' + escHtml(lines[j]) + '</label></li>';
            }
            inner += '</ul>';
            inner += '<button id="shoppingPrintBtn" style="margin-top:1rem;width:100%;padding:0.5rem;background:rgba(201,125,62,0.12);border:1px solid var(--border-copper);border-radius:6px;color:var(--copper-warm);font-family:var(--font-body);font-size:0.82rem;font-weight:500;cursor:pointer;">Print Checked Items</button>';
        }

        panel.innerHTML = inner;
        Object.assign(panel.style, {
            position: 'fixed', top: '0', right: '0',
            width: '320px', height: '100vh',
            background: 'var(--surface-card)',
            borderLeft: '1px solid var(--border-mid)',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
            zIndex: '2000', overflowY: 'auto',
            padding: '1.5rem', boxSizing: 'border-box'
        });

        document.body.appendChild(panel);

        if (!document.getElementById('shopPanelStyle')) {
            var style = document.createElement('style');
            style.id = 'shopPanelStyle';
            style.textContent = '#shoppingPanel input[type="checkbox"]:checked + label { text-decoration: line-through; color: var(--cream-faint); } @media (max-width: 400px) { #shoppingPanel { width: 100vw !important; } }';
            document.head.appendChild(style);
        }

        var selectAllBtn = document.getElementById('shoppingSelectAll');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', function() {
                var checkboxes = panel.querySelectorAll('.shop-checkbox');
                var allChecked = true;
                checkboxes.forEach(function(cb) { if (!cb.checked) allChecked = false; });
                checkboxes.forEach(function(cb) { cb.checked = !allChecked; });
                selectAllBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
            });
        }

        var printBtn = document.getElementById('shoppingPrintBtn');
        if (printBtn) {
            printBtn.addEventListener('click', function() {
                var checkedItems = [];
                panel.querySelectorAll('.shop-checkbox').forEach(function(cb) {
                    if (cb.checked) {
                        var label = cb.nextElementSibling;
                        if (label) checkedItems.push(label.textContent);
                    }
                });
                if (checkedItems.length === 0) {
                    alert('Please check at least one item to print.');
                    return;
                }
                var win = window.open('', '_blank', 'width=420,height=600');
                win.document.write('<!DOCTYPE html><html><head><title>Shopping List</title><style>body{font-family:sans-serif;font-size:13px;padding:20px;color:#1a1814}h2{font-size:16px;margin-bottom:4px}p{font-size:11px;color:#9a9088;margin-bottom:16px}ul{list-style:none;padding:0;margin:0}li{padding:6px 0;border-bottom:1px solid #ece7de;display:flex;align-items:center;gap:10px}li::before{content:"";display:inline-block;width:12px;height:12px;border:1.5px solid #c97d3e;border-radius:2px;flex-shrink:0}@media print{@page{margin:15mm}}</style></head><body><h2>Shopping List</h2><p>' + escHtml(recipe.title || '') + '</p><ul>' + checkedItems.map(function(i) { return '<li>' + escHtml(i) + '</li>'; }).join('') + '</ul></body></html>');
                win.document.close();
                win.focus();
                setTimeout(function() { win.print(); }, 300);
            });
        }

        setTimeout(function() {
            document.addEventListener('click', function closePanel(e) {
                if (!panel.contains(e.target) && e.target.id !== 'shoppingListBtn') {
                    panel.remove();
                    document.removeEventListener('click', closePanel);
                }
            });
        }, 100);
    }

    function formatNum(n) {
        var fracs = { 0.25: '1/4', 0.5: '1/2', 0.75: '3/4', 0.33: '1/3', 0.67: '2/3', 0.125: '1/8' };
        var whole = Math.floor(n);
        var remainder = Math.round((n - whole) * 1000) / 1000;
        var fracPart = fracs[remainder];
        if (whole === 0) return fracPart || String(Math.round(n * 100) / 100);
        if (fracPart) return whole + ' ' + fracPart;
        return String(Math.round(n * 100) / 100);
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* --------------------------------------------------
       Cook Mode
    -------------------------------------------------- */
    function enterCookMode(recipe) {
        var steps = (recipe.method || []).filter(function(s) { return !s.heading; });
        if (!steps.length) return;

        var currentStep = 0;
        var wakeLock = null;

        if ('wakeLock' in navigator) {
            navigator.wakeLock.request('screen')
                .then(function(lock) { wakeLock = lock; })
                .catch(function() {});
        }

        var bar = document.createElement('div');
        bar.className = 'cook-mode-bar';
        bar.id = 'cookModeBar';
        bar.innerHTML =
            '<span class="cook-mode-step-counter" id="cmCounter"></span>' +
            '<span class="cook-mode-step-text" id="cmText"></span>' +
            '<div class="cook-mode-nav">' +
                '<button class="cook-mode-btn" id="cmPrev">&#8592; Prev</button>' +
                '<button class="cook-mode-btn" id="cmNext">Next &#8594;</button>' +
                '<button class="cook-mode-btn exit" id="cmExit">Exit</button>' +
            '</div>';

        document.body.appendChild(bar);
        document.body.classList.add('cook-mode-active');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        var counter = document.getElementById('cmCounter');
        var text    = document.getElementById('cmText');
        var prevBtn = document.getElementById('cmPrev');
        var nextBtn = document.getElementById('cmNext');
        var exitBtn = document.getElementById('cmExit');
        var stepEls = document.querySelectorAll('.method ol li');

        function goTo(n) {
            currentStep = n;
            var step = steps[n];
            var instruction = typeof step === 'string' ? step : (step.instruction || step.text || '');
            counter.textContent = 'Step ' + (n + 1) + ' of ' + steps.length;
            text.textContent = instruction;
            prevBtn.disabled = (n === 0);
            nextBtn.textContent = (n === steps.length - 1) ? 'Done' : 'Next →';
            stepEls.forEach(function(el, i) {
                el.classList.toggle('cook-mode-current', i === n);
            });
            if (stepEls[n]) {
                stepEls[n].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        prevBtn.addEventListener('click', function() { if (currentStep > 0) goTo(currentStep - 1); });
        nextBtn.addEventListener('click', function() {
            if (currentStep < steps.length - 1) goTo(currentStep + 1);
            else exitCookMode();
        });
        exitBtn.addEventListener('click', exitCookMode);

        function exitCookMode() {
            document.body.classList.remove('cook-mode-active');
            var b = document.getElementById('cookModeBar');
            if (b) b.remove();
            stepEls.forEach(function(el) { el.classList.remove('cook-mode-current'); });
            if (wakeLock) { wakeLock.release(); wakeLock = null; }
        }

        goTo(0);
    }

    window.recipeRenderer = { fetchRecipe };

})();
