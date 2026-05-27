/* =========================================================
   RECIPE RENDERER — AJPC Kitchen Notebook
   Fixed: shopping list now matches ingredients correctly
   Added: simple ingredient keys for price matching
   Added: brand display in shopping list
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

    // Simple cache for recipe index
    var recipeIndexCache = {
        data: null,
        timestamp: null,
        maxAge: 30 * 60 * 1000
    };

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

        getCachedIndex();

        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');

        if (!id) {
            renderError('No recipe specified. Please select one from the menu.', container);
            return;
        }

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

    function renderRecipe(r, container, recipeIndex) {
        const title = r.title || r.id || 'Recipe';
        document.title = title + ' | AJPC Kitchen';

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
            lastUpdatedDiv.innerHTML = '📝 Last updated: ' + formattedDate;
            container.querySelector('.recipe-page-wrapper').appendChild(lastUpdatedDiv);
        }

        setTimeout(function() {
            if (typeof window.loadRandomTip === 'function') {
                window.loadRandomTip();
            }
        }, 100);
    }

    function renderBreadcrumb(r) {
        return '<div class="recipe-eyebrow">' +
            '<a href="index.html">Home</a>' +
            '<span>/</span>' +
            (r.category ? '<a href="search.html?q=' + encodeURIComponent(r.category) + '">' + escHtml(r.category) + '</a><span>/</span>' : '') +
            '<span>' + escHtml(r.title || r.id || 'Recipe') + '</span>' +
            '</div>';
    }

    function renderWarnings(hasIng, hasMethod) {
        var warnings = [];
        if (!hasIng) warnings.push('No ingredients listed for this recipe yet.');
        if (!hasMethod) warnings.push('No method/instructions provided yet.');
        if (!warnings.length) return '';
        return '<div class="recipe-warnings">' +
            '<strong>Incomplete recipe data:</strong>' +
            '<ul>' + warnings.map(function(w) { return '<li>' + w + '</li>'; }).join('') + '</ul>' +
            '</div>';
    }

    function renderHeader(r) {
        return (r.category ? '<span class="recipe-category-badge">' + escHtml(r.category) + '</span>' : '') +
            '<h1 class="recipe-title">' + escHtml(r.title || r.id || 'Recipe') + '</h1>' +
            (r.description ? '<p class="recipe-description">' + escHtml(r.description) + '</p>' : '');
    }

    function renderMetadata(r) {
        var items = [];
        if (r.prepTime) items.push({ label: 'Prep', value: r.prepTime });
        if (r.cookTime) items.push({ label: 'Cook', value: r.cookTime });
        if (r.totalTime) items.push({ label: 'Total', value: r.totalTime });
        if (r.servings) items.push({ label: 'Serves', value: r.servings });
        if (r.difficulty) items.push({ label: 'Difficulty', value: r.difficulty });

        if (!items.length) return '';

        return '<div class="recipe-metadata-table">' +
            items.map(function(m) {
                return '<div class="meta-cell">' +
                    '<span class="meta-label">' + m.label + '</span>' +
                    '<span class="meta-value">' + escHtml(m.value) + '</span>' +
                    '</div>';
            }).join('') +
            '</div>';
    }

    function renderToolbar() {
        return '<div class="recipe-toolbar">' +
            '<button class="toolbar-btn primary" id="cookModeBtn">Cook Mode</button>' +
            '<button class="toolbar-btn" id="shoppingListBtn">Shopping List</button>' +
            '<button class="toolbar-btn" onclick="window.print()">Print Recipe</button>' +
            '</div>';
    }

    function renderIngredients(r) {
        if (!r.ingredients || !r.ingredients.length) {
            return '<section class="ingredients">' +
                '<h2>Ingredients</h2>' +
                '<p>No ingredients listed.</p>' +
                '</section>';
        }

        var scaler = '<div class="scaler-controls">' +
            '<span class="scaler-label">Scale:</span>' +
            '<button class="scaler-btn" id="scalerDown" aria-label="Decrease serving">-</button>' +
            '<span class="scaler-display" id="scalerDisplay">1x</span>' +
            '<button class="scaler-btn" id="scalerUp" aria-label="Increase serving">+</button>' +
            '</div>';

        var regularIngs = r.ingredients.filter(function(ing) { return !ing.toTaste; });
        var toTasteIngs = r.ingredients.filter(function(ing) { return ing.toTaste; });

        var items = regularIngs.map(function(ing) {
            if (ing.heading) {
                return '<li class="ingredient-heading">' + escHtml(ing.heading) + '</li>';
            }
            return '<li>' + formatIngredient(ing) + '</li>';
        }).join('');

        var toTasteHtml = '';
        if (toTasteIngs.length) {
            toTasteHtml = '<li class="ingredient-totaste-label">Season to taste</li>' +
                toTasteIngs.map(function(ing) {
                    var note = ing.notes ? ' <span class="ingredient-notes">(' + escHtml(ing.notes) + ')</span>' : '';
                    return '<li class="ingredient-totaste">' + escHtml(ing.item) + note + '</li>';
                }).join('');
        }

        return '<section class="ingredients">' +
            '<h2>Ingredients</h2>' +
            scaler +
            '<ul>' + items + toTasteHtml + '</ul>' +
            '</section>';
    }

    function formatIngredient(ing) {
        if (typeof ing === 'string') return escHtml(ing);

        var qty = String(ing.quantity !== undefined && ing.quantity !== null ? ing.quantity : '').trim();
        var unit = String(ing.unit || '').trim();
        var item = String(ing.item || ing.name || ing.ingredient || '').trim();
        var notes = String(ing.notes || ing.description || '').trim();

        if (!qty && !unit) {
            return notes
                ? escHtml(item) + ' <span class="ingredient-notes">(' + escHtml(notes) + ')</span>'
                : escHtml(item);
        }

        var num = parseFloat(qty);
        var qtySpan = !isNaN(num)
            ? '<span class="ingredient-quantity" data-original="' + num + '">' + escHtml(qty) + '</span>'
            : '<span class="ingredient-quantity">' + escHtml(qty) + '</span>';

        var parts = [unit, item].filter(Boolean).map(escHtml).join(' ');
        var notePart = notes ? ' <span class="ingredient-notes">(' + escHtml(notes) + ')</span>' : '';
        return qtySpan + ' ' + parts + notePart;
    }

    function renderYouWillNeed(youWillNeed) {
        if (!youWillNeed || !youWillNeed.length) return '';

        var items = youWillNeed.map(function(entry) {
            var noteText = entry.note || entry.notes || '';
            var notePart = noteText ? '<span class="equipment-notes"> — ' + escHtml(noteText) + '</span>' : '';
            return '<li class="you-will-need-item">' +
                '<span class="you-will-need-checkbox">☐</span>' +
                '<span class="you-will-need-text">' + escHtml(entry.item) + notePart + '</span>' +
                '</li>';
        }).join('');

        return '<section class="you-will-need">' +
            '<h2>You Will Also Need</h2>' +
            '<ul class="you-will-need-list">' + items + '</ul>' +
            '</section>';
    }

    function renderLinkedText(text) {
        var safe = escHtml(text);
        return safe.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, function(match, id, display) {
            return '<a href="recipe.html?id=' + encodeURIComponent(id.trim()) + '" class="recipe-inline-link">' + display.trim() + '</a>';
        });
    }

    function renderMethod(r) {
        if (!r.method || !r.method.length) {
            return '<section class="method">' +
                '<h2>Method</h2>' +
                '<p>No instructions provided.</p>' +
                '</section>';
        }

        var items = r.method.map(function(step) {
            if (step.heading) {
                return '<li class="method-heading">' + escHtml(step.heading) + '</li>';
            }
            var text = typeof step === 'string' ? step : (step.instruction || step.text || JSON.stringify(step));
            return '<li>' + renderLinkedText(text) + '</li>';
        }).join('');

        return '<section class="method">' +
            '<h2>Method</h2>' +
            '<ol>' + items + '</ol>' +
            '</section>';
    }

    function renderNotes(notes) {
        if (!notes || !notes.length) return '';
        var items = notes.map(function(note) {
            if (typeof note === 'string') {
                return '<div class="note"><p>' + escHtml(note) + '</p></div>';
            }
            var title = note.title || note.type || 'Note';
            var content = note.content || note.text || '';
            if ((content.includes('All rights reserved') || content.includes('©')) && content.length < 100) return '';
            return '<div class="note">' +
                '<h4>' + escHtml(title) + '</h4>' +
                '<p>' + renderLinkedText(content) + '</p>' +
                '</div>';
        }).filter(Boolean).join('');

        if (!items) return '';
        return '<section class="recipe-notes"><h2>Notes</h2>' + items + '</section>';
    }

    function renderJournal(journal) {
        if (!journal || !journal.length) return '';
        var entries = journal.map(function(e) {
            var dateStr = e.date
                ? new Date(e.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
                : '';
            return '<div class="journal-entry">' +
                (dateStr ? '<span class="journal-date">' + dateStr + '</span>' : '') +
                '<p>' + escHtml(e.content || '') + '</p>' +
                '</div>';
        }).join('');
        return '<section class="recipe-journal"><h2>Recipe Journal</h2>' + entries + '</section>';
    }

    function renderNutrition(n) {
        if (!n) return '';

        var servings = n.servings, cal = n.cal, kj = n.kj, protein = n.protein, carbs = n.carbs, sugars = n.sugars, fat = n.fat, saturated_fat = n.saturated_fat, fiber = n.fiber, sodium = n.sodium, coverage = n.coverage;
        var calcium_mg = n.calcium_mg, iron_mg = n.iron_mg, potassium_mg = n.potassium_mg, magnesium_mg = n.magnesium_mg, zinc_mg = n.zinc_mg;
        var cholesterol_mg = n.cholesterol_mg, vitamin_a_ug = n.vitamin_a_ug, vitamin_c_mg = n.vitamin_c_mg, vitamin_d_ug = n.vitamin_d_ug;

        var micronutrients = [];
        if (calcium_mg) micronutrients.push('<div class="nutrition-row"><span>Calcium</span><span>' + calcium_mg + 'mg</span></div>');
        if (iron_mg) micronutrients.push('<div class="nutrition-row"><span>Iron</span><span>' + iron_mg + 'mg</span></div>');
        if (potassium_mg) micronutrients.push('<div class="nutrition-row"><span>Potassium</span><span>' + potassium_mg + 'mg</span></div>');
        if (magnesium_mg) micronutrients.push('<div class="nutrition-row"><span>Magnesium</span><span>' + magnesium_mg + 'mg</span></div>');
        if (zinc_mg) micronutrients.push('<div class="nutrition-row"><span>Zinc</span><span>' + zinc_mg + 'mg</span></div>');
        if (cholesterol_mg) micronutrients.push('<div class="nutrition-row"><span>Cholesterol</span><span>' + cholesterol_mg + 'mg</span></div>');
        if (vitamin_a_ug) micronutrients.push('<div class="nutrition-row"><span>Vitamin A</span><span>' + vitamin_a_ug + 'mcg</span></div>');
        if (vitamin_c_mg) micronutrients.push('<div class="nutrition-row"><span>Vitamin C</span><span>' + vitamin_c_mg + 'mg</span></div>');
        if (vitamin_d_ug) micronutrients.push('<div class="nutrition-row"><span>Vitamin D</span><span>' + vitamin_d_ug + 'mcg</span></div>');

        var micronutrientsHtml = '';
        if (micronutrients.length) {
            micronutrientsHtml = '<div class="nutrition-divider thin"></div>' + micronutrients.join('');
        }

        return '<section class="recipe-nutrition">' +
            '<h2>Nutrition Facts</h2>' +
            '<div class="nutrition-label">' +
            '<div class="nutrition-header">' +
            '<span class="nutrition-title">Nutrition Facts</span>' +
            '<span class="nutrition-serving">Per serving | ' + escHtml(String(servings || '?')) + ' servings</span>' +
            '</div>' +
            '<div class="nutrition-calories">' +
            '<span>Calories</span>' +
            '<span>' + (cal || 0) + '</span>' +
            '</div>' +
            (kj ? '<div class="nutrition-kj"><span>Energy (kJ)</span><span>' + kj + '</span></div>' : '') +
            '<div class="nutrition-divider thick"></div>' +
            '<div class="nutrition-row"><span><strong>Protein</strong></span><span>' + (protein || 0) + 'g</span></div>' +
            '<div class="nutrition-row"><span><strong>Total Carbohydrate</strong></span><span>' + (carbs || 0) + 'g</span></div>' +
            '<div class="nutrition-row indent"><span>Sugars</span><span>' + (sugars || 0) + 'g</span></div>' +
            '<div class="nutrition-row indent"><span>Dietary Fibre</span><span>' + (fiber || 0) + 'g</span></div>' +
            '<div class="nutrition-row"><span><strong>Total Fat</strong></span><span>' + (fat || 0) + 'g</span></div>' +
            '<div class="nutrition-row indent"><span>Saturated Fat</span><span>' + (saturated_fat || 0) + 'g</span></div>' +
            '<div class="nutrition-row"><span><strong>Sodium</strong></span><span>' + (sodium || 0) + 'mg</span></div>' +
            micronutrientsHtml +
            '<div class="nutrition-divider thick"></div>' +
            (coverage ? '<div class="nutrition-coverage">Estimated from ' + coverage + '% of ingredients</div>' : '') +
            '</div>' +
            '</section>';
    }

    function renderTags(tags) {
        if (!tags || !tags.length) return '';
        var chips = tags.map(function(t) {
            return '<a href="search.html?q=' + encodeURIComponent(t) + '" class="recipe-tag">#' + escHtml(t) + '</a>';
        }).join('');
        return '<div class="recipe-tags">' + chips + '</div>';
    }

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
        container.innerHTML = '<div class="recipe-page-wrapper">' +
            '<div class="recipe-warnings">' +
            '<strong>Recipe Not Found</strong>' +
            '<p>' + escHtml(msg) + '</p>' +
            '<p><a href="index.html">Back to Home</a></p>' +
            '</div>' +
            '</div>';
    }

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

    function setupToolbar(recipe) {
        var multiplier = 1;

        var scalerDisp = document.getElementById('scalerDisplay');
        if (scalerDisp) scalerDisp.textContent = '1x';

        var cookBtn = document.getElementById('cookModeBtn');
        if (cookBtn) {
            cookBtn.addEventListener('click', function() { enterCookMode(recipe); });
        }

        var scalerUp = document.getElementById('scalerUp');
        var scalerDown = document.getElementById('scalerDown');
        scalerDisp = document.getElementById('scalerDisplay');
        var scalerInfo = document.getElementById('scalerInfoContainer');

        var baseServings = 1;
        if (recipe.servings) {
            var parsed = parseInt(recipe.servings);
            if (!isNaN(parsed)) baseServings = parsed;
        }

        var baseCookMinutes = recipe.cookTime ? parseTimeToMinutes(recipe.cookTime) : 0;
        var baseTotalMinutes = recipe.totalTime ? parseTimeToMinutes(recipe.totalTime) : 0;
        var basePrepMinutes = recipe.prepTime ? parseTimeToMinutes(recipe.prepTime) : 0;
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
                        var scaledCookMin = Math.round(baseCookMinutes * timeScaleFactor);
                        var scaledTotalMin = Math.round((baseTotalMinutes - baseCookMinutes) + scaledCookMin);
                        var cookDiff = scaledCookMin - baseCookMinutes;
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

    // ========== PRICE DATABASE ==========
    const PRICE_STORAGE_KEY = 'ajpc_prices';
    const PRICE_DISCLAIMER_KEY = 'ajpc_prices_last_updated';

 const DEFAULT_PRICES = {
    // ========== FLOUR & BAKING ==========
    "plain flour": { size: 2000, unit: "g", price: 2.50, brand: "Essentials" },
    "self raising flour": { size: 2000, unit: "g", price: 2.50, brand: "Essentials" },
    "bread flour": { size: 5000, unit: "g", price: 14.60, brand: "Laucke Wallaby" },
    "rye flour": { size: 1000, unit: "g", price: 4.50, brand: "Laucke" },
    "gluten free plain flour": { size: 750, unit: "g", price: 3.60, brand: "Woolworths" },
    "cornflour": { size: 500, unit: "g", price: 2.85, brand: "McKenzie's" },
    "tapioca flour": { size: 300, unit: "g", price: 4.00, brand: "McKenzie's" },
    "buckwheat flour": { size: 500, unit: "g", price: 5.50, brand: "Macro" },
    "almond meal": { size: 400, unit: "g", price: 13.30, brand: "Macro" },
    "vital wheat gluten": { size: 500, unit: "g", price: 12.00, brand: "Laucke" },
    "bran": { size: 500, unit: "g", price: 3.50, brand: "Woolworths" },

    // ========== SUGAR & SWEETENERS ==========
    "white sugar": { size: 2000, unit: "g", price: 2.60, brand: "Essentials" },
    "brown sugar": { size: 1000, unit: "g", price: 4.90, brand: "CSR" },
    "light brown sugar": { size: 1000, unit: "g", price: 4.90, brand: "CSR" },
    "caster sugar": { size: 500, unit: "g", price: 2.00, brand: "CSR" },
    "icing sugar": { size: 1000, unit: "g", price: 5.00, brand: "CSR" },
    "pure icing sugar": { size: 1000, unit: "g", price: 5.00, brand: "CSR" },
    "golden syrup": { size: 850, unit: "g", price: 6.00, brand: "CSR" },
    "honey": { size: 680, unit: "g", price: 9.90, brand: "Archibald's" },
    "maple syrup": { size: 250, unit: "ml", price: 6.00, brand: "Maple Grove" },
    "molasses": { size: 500, unit: "g", price: 5.00, brand: "CSR" },
    "condensed milk": { size: 395, unit: "g", price: 3.50, brand: "Nestle" },
    "malt powder": { size: 500, unit: "g", price: 8.00, brand: "Malt-O-Milk" },

    // ========== EGGS ==========
    "eggs": { size: 18, unit: "each", price: 11.00, brand: "Sunny Queen" },
    "egg": { size: 1, unit: "each", price: 0.61, brand: "Sunny Queen" },
    "egg whites": { size: 250, unit: "ml", price: 4.50, brand: "Puregg" },
    "egg yolk": { size: 1, unit: "each", price: 0.30, brand: "Sunny Queen" },
    "egg yolks": { size: 6, unit: "each", price: 1.80, brand: "Sunny Queen" },

    // ========== BUTTER ==========
    "unsalted butter": { size: 500, unit: "g", price: 7.00, brand: "Essentials" },
    "salted butter": { size: 500, unit: "g", price: 7.00, brand: "Woolworths" },
    "spreadable butter": { size: 500, unit: "g", price: 7.00, brand: "Western Star" },
    "butter": { size: 500, unit: "g", price: 7.00, brand: "Essentials" },

    // ========== MILK & CREAM ==========
    "full cream milk": { size: 3000, unit: "ml", price: 5.15, brand: "Woolworths" },
    "whole milk": { size: 3000, unit: "ml", price: 5.15, brand: "Woolworths" },
    "thickened cream": { size: 600, unit: "ml", price: 5.20, brand: "Woolworths" },
    "cooking cream": { size: 300, unit: "ml", price: 4.10, brand: "Bulla" },
    "pure cream": { size: 500, unit: "ml", price: 6.80, brand: "Dairy Farmers" },
    "heavy cream": { size: 500, unit: "ml", price: 6.80, brand: "Dairy Farmers" },
    "sour cream": { size: 400, unit: "ml", price: 5.95, brand: "Bulla" },
    "half and half": { size: 500, unit: "ml", price: 3.50, brand: "Woolworths" },
    "milk powder": { size: 1000, unit: "g", price: 10.50, brand: "Woolworths" },
    "coconut cream": { size: 400, unit: "ml", price: 1.70, brand: "Essentials" },
    "coconut milk": { size: 400, unit: "ml", price: 1.70, brand: "Essentials" },
    "cream": { size: 600, unit: "ml", price: 5.20, brand: "Woolworths" },

    // ========== CHEESE ==========
    "tasty cheese block": { size: 500, unit: "g", price: 7.70, brand: "Woolworths" },
    "tasty cheese": { size: 500, unit: "g", price: 7.70, brand: "Woolworths" },
    "extra tasty cheese": { size: 500, unit: "g", price: 11.80, brand: "Mainland" },
    "mozzarella cheese": { size: 500, unit: "g", price: 8.30, brand: "Woolworths" },
    "mozzarella": { size: 500, unit: "g", price: 8.30, brand: "Woolworths" },
    "shredded parmesan": { size: 250, unit: "g", price: 5.70, brand: "Woolworths" },
    "parmesan shaved": { size: 125, unit: "g", price: 4.80, brand: "Perfect Italiano" },
    "parmesan cheese": { size: 170, unit: "g", price: 5.50, brand: "Mil Lel" },
    "parmesan": { size: 170, unit: "g", price: 5.50, brand: "Mil Lel" },
    "mascarpone": { size: 250, unit: "g", price: 4.80, brand: "Woolworths" },
    "cream cheese": { size: 500, unit: "g", price: 9.00, brand: "Philadelphia" },
    "philadelphia cream cheese": { size: 500, unit: "g", price: 9.00, brand: "Philadelphia" },
    "camembert cheese": { size: 250, unit: "g", price: 6.00, brand: "Tasmanian Heritage" },
    "gruyere": { size: 200, unit: "g", price: 8.00, brand: "Mainland" },
    "cheddar cheese": { size: 500, unit: "g", price: 7.70, brand: "Woolworths" },
    "vintage cheddar": { size: 500, unit: "g", price: 11.80, brand: "Mainland" },

    // ========== YOGHURT ==========
    "greek yoghurt": { size: 500, unit: "g", price: 4.90, brand: "Farmers Union" },
    "greek yogurt": { size: 500, unit: "g", price: 4.90, brand: "Farmers Union" },

    // ========== OILS ==========
    "vegetable oil": { size: 2000, unit: "ml", price: 6.00, brand: "Woolworths" },
    "olive oil": { size: 750, unit: "ml", price: 20.00, brand: "Cobram Estate" },
    "coconut oil": { size: 300, unit: "g", price: 4.40, brand: "Only Organic" },
    "sesame oil": { size: 150, unit: "ml", price: 4.50, brand: "Ayam" },

    // ========== RICE & GRAINS ==========
    "jasmine rice": { size: 2000, unit: "g", price: 8.60, brand: "Sunrice" },
    "white rice": { size: 1000, unit: "g", price: 3.00, brand: "Woolworths" },
    "black quinoa": { size: 500, unit: "g", price: 6.00, brand: "Macro" },
    "white quinoa": { size: 500, unit: "g", price: 6.00, brand: "Macro" },
    "quinoa": { size: 500, unit: "g", price: 6.00, brand: "Macro" },
    "rolled oats": { size: 1000, unit: "g", price: 6.50, brand: "Uncle Tobys" },
    "freekeh": { size: 500, unit: "g", price: 7.00, brand: "Macro" },
    "bulgur wheat": { size: 500, unit: "g", price: 5.30, brand: "Macro" },
    "bihon rice noodles": { size: 400, unit: "g", price: 3.50, brand: "Fantastic" },
    "vermicelli rice noodles": { size: 400, unit: "g", price: 3.50, brand: "Fantastic" },
    "canton egg noodles": { size: 375, unit: "g", price: 4.00, brand: "Fantastic" },
    "egg noodles": { size: 375, unit: "g", price: 4.00, brand: "Fantastic" },

    // ========== PASTA ==========
    "spaghetti": { size: 500, unit: "g", price: 2.50, brand: "San Remo" },
    "elbows pasta": { size: 500, unit: "g", price: 2.50, brand: "San Remo" },
    "fettuccine": { size: 500, unit: "g", price: 2.50, brand: "San Remo" },
    "lasagne sheets": { size: 250, unit: "g", price: 3.00, brand: "San Remo" },
    "mi goreng noodles": { size: 425, unit: "g", price: 3.95, brand: "Indomie" },
    "instant noodles": { size: 340, unit: "g", price: 3.00, brand: "Trident" },

    // ========== CANNED TOMATOES ==========
    "diced tomatoes": { size: 400, unit: "g", price: 1.10, brand: "Woolworths" },
    "peeled tomatoes": { size: 400, unit: "g", price: 1.10, brand: "Woolworths" },
    "diced tomatoes basil & oregano": { size: 400, unit: "g", price: 1.30, brand: "Woolworths" },
    "tomato puree": { size: 690, unit: "g", price: 2.00, brand: "Annalisa" },
    "passata": { size: 680, unit: "g", price: 1.95, brand: "La Gina" },
    "tomato paste": { size: 140, unit: "g", price: 1.55, brand: "Leggo's" },
    "tomato soup": { size: 420, unit: "g", price: 2.50, brand: "Heinz" },
    "tomatoes": { size: 400, unit: "g", price: 1.10, brand: "Woolworths" },

    // ========== CANNED FISH & SEAFOOD ==========
    "tuna in brine": { size: 425, unit: "g", price: 3.30, brand: "Essentials" },
    "salmon": { size: 415, unit: "g", price: 6.50, brand: "Ocean Harvest" },
    "seafood mix": { size: 500, unit: "g", price: 12.00, brand: "Woolworths" },
    "oysters": { size: 12, unit: "each", price: 15.00, brand: "Sydney Rock" },
    "fresh oysters": { size: 12, unit: "each", price: 15.00, brand: "Sydney Rock" },
    "prawns": { size: 500, unit: "g", price: 14.00, brand: "Woolworths" },
    "fish fillet": { size: 500, unit: "g", price: 12.00, brand: "Woolworths" },

    // ========== CANNED FRUIT ==========
    "apricot halves": { size: 825, unit: "g", price: 3.00, brand: "Woolworths" },
    "canned apricot halves": { size: 825, unit: "g", price: 3.00, brand: "Woolworths" },
    "dried apricots": { size: 500, unit: "g", price: 5.00, brand: "Woolworths" },
    "apple slices": { size: 385, unit: "g", price: 3.50, brand: "Woolworths" },
    "pineapple pieces": { size: 432, unit: "g", price: 3.90, brand: "Dole" },
    "pineapple slices": { size: 432, unit: "g", price: 3.90, brand: "Dole" },
    "pineapple chunks": { size: 432, unit: "g", price: 3.90, brand: "Dole" },
    "crushed pineapple": { size: 439, unit: "g", price: 3.90, brand: "Dole" },
    "pineapple": { size: 1, unit: "each", price: 3.90, brand: "Dole" },

    // ========== SAUCES & CONDIMENTS ==========
    "tomato sauce": { size: 2000, unit: "ml", price: 5.00, brand: "Woolworths" },
    "barbecue sauce": { size: 500, unit: "ml", price: 3.20, brand: "Eta" },
    "sweet chilli sauce": { size: 730, unit: "ml", price: 5.50, brand: "Trident" },
    "soy sauce": { size: 1000, unit: "ml", price: 10.20, brand: "Kikkoman" },
    "light soy sauce": { size: 500, unit: "ml", price: 5.50, brand: "Kikkoman" },
    "dark soy sauce": { size: 500, unit: "ml", price: 5.50, brand: "Kikkoman" },
    "mayonnaise": { size: 490, unit: "g", price: 4.50, brand: "Praise" },
    "mustard": { size: 250, unit: "g", price: 4.20, brand: "MasterFoods" },
    "dijon mustard": { size: 170, unit: "g", price: 4.50, brand: "MasterFoods" },
    "wholegrain mustard": { size: 175, unit: "g", price: 4.50, brand: "MasterFoods" },
    "mild english mustard": { size: 175, unit: "g", price: 4.50, brand: "MasterFoods" },
    "hot english mustard": { size: 175, unit: "g", price: 4.50, brand: "MasterFoods" },
    "australian mustard": { size: 175, unit: "g", price: 4.50, brand: "MasterFoods" },
    "mint sauce": { size: 250, unit: "ml", price: 3.80, brand: "Fountain" },
    "oyster sauce": { size: 210, unit: "ml", price: 4.00, brand: "Ayam" },
    "hoisin sauce": { size: 210, unit: "ml", price: 4.00, brand: "Ayam" },
    "fish sauce": { size: 500, unit: "ml", price: 5.50, brand: "Squid" },
    "worcestershire sauce": { size: 290, unit: "ml", price: 4.00, brand: "Lea & Perrins" },
    "sweet & sour sauce": { size: 270, unit: "g", price: 3.50, brand: "MasterFoods" },
    "seafood cocktail sauce": { size: 260, unit: "g", price: 3.80, brand: "MasterFoods" },
    "tartare sauce": { size: 220, unit: "g", price: 3.80, brand: "MasterFoods" },
    "chili garlic sauce": { size: 250, unit: "ml", price: 4.00, brand: "Sriracha" },
    "sambal oelek": { size: 250, unit: "ml", price: 4.00, brand: "Ayam" },
    "plum jam": { size: 375, unit: "g", price: 3.80, brand: "Cottee's" },
    "apricot jam": { size: 375, unit: "g", price: 3.80, brand: "Cottee's" },
    "demi glace": { size: 200, unit: "g", price: 5.00, brand: "Continental" },

    // ========== SPREADS ==========
    "nutella": { size: 400, unit: "g", price: 6.70, brand: "Nutella" },
    "vegemite": { size: 380, unit: "g", price: 7.70, brand: "Vegemite" },
    "peanut butter": { size: 500, unit: "g", price: 3.40, brand: "Woolworths" },
    "strawberry jam": { size: 375, unit: "g", price: 3.80, brand: "Cottee's" },
    "raspberry jam": { size: 375, unit: "g", price: 3.80, brand: "Cottee's" },
    "liver spread": { size: 120, unit: "g", price: 4.00, brand: "Devondale" },

    // ========== SPICES & SEASONINGS ==========
    "basil": { size: 10, unit: "g", price: 3.50, brand: "MasterFoods" },
    "oregano": { size: 10, unit: "g", price: 3.50, brand: "MasterFoods" },
    "parsley": { size: 7, unit: "g", price: 3.50, brand: "MasterFoods" },
    "thyme leaves": { size: 10, unit: "g", price: 3.50, brand: "MasterFoods" },
    "rosemary leaves": { size: 18, unit: "g", price: 3.50, brand: "MasterFoods" },
    "paprika": { size: 33, unit: "g", price: 3.50, brand: "MasterFoods" },
    "smoked paprika": { size: 35, unit: "g", price: 3.50, brand: "MasterFoods" },
    "cumin": { size: 28, unit: "g", price: 3.50, brand: "MasterFoods" },
    "cumin seeds": { size: 28, unit: "g", price: 3.50, brand: "MasterFoods" },
    "turmeric": { size: 34, unit: "g", price: 3.50, brand: "MasterFoods" },
    "cinnamon": { size: 28, unit: "g", price: 3.50, brand: "MasterFoods" },
    "cinnamon stick": { size: 10, unit: "g", price: 2.00, brand: "Hoyt's" },
    "cayenne pepper": { size: 30, unit: "g", price: 3.50, brand: "MasterFoods" },
    "chilli powder": { size: 27, unit: "g", price: 3.50, brand: "MasterFoods" },
    "red chili powder": { size: 27, unit: "g", price: 3.50, brand: "MasterFoods" },
    "red chili flakes": { size: 100, unit: "g", price: 5.00, brand: "Hoyt's" },
    "chilli dried crushed": { size: 100, unit: "g", price: 5.00, brand: "Hoyt's" },
    "ground ginger": { size: 25, unit: "g", price: 3.50, brand: "MasterFoods" },
    "fresh ginger": { size: 80, unit: "g", price: 2.64, brand: "Woolworths" },
    "ginger": { size: 80, unit: "g", price: 2.64, brand: "Woolworths" },
    "cajun seasoning": { size: 35, unit: "g", price: 3.50, brand: "MasterFoods" },
    "moroccan spice": { size: 52, unit: "g", price: 3.50, brand: "MasterFoods" },
    "fennel seeds": { size: 26, unit: "g", price: 3.50, brand: "MasterFoods" },
    "garlic powder": { size: 45, unit: "g", price: 3.50, brand: "MasterFoods" },
    "onion powder": { size: 44, unit: "g", price: 3.50, brand: "MasterFoods" },
    "chicken seasoning": { size: 41, unit: "g", price: 3.50, brand: "MasterFoods" },
    "chicken salt": { size: 65, unit: "g", price: 3.50, brand: "MasterFoods" },
    "steak seasoning": { size: 45, unit: "g", price: 3.50, brand: "MasterFoods" },
    "cardamom": { size: 35, unit: "g", price: 3.50, brand: "MasterFoods" },
    "green cardamom pods": { size: 20, unit: "g", price: 4.00, brand: "Hoyt's" },
    "cloves whole": { size: 20, unit: "g", price: 3.50, brand: "MasterFoods" },
    "cloves": { size: 20, unit: "g", price: 3.50, brand: "MasterFoods" },
    "cloves ground": { size: 26, unit: "g", price: 3.50, brand: "MasterFoods" },
    "nutmeg": { size: 35, unit: "g", price: 3.50, brand: "MasterFoods" },
    "curry powder": { size: 60, unit: "g", price: 4.30, brand: "Keen's" },
    "garam masala": { size: 30, unit: "g", price: 3.50, brand: "MasterFoods" },
    "chinese 5 spice": { size: 30, unit: "g", price: 3.50, brand: "MasterFoods" },
    "chinese five spice": { size: 30, unit: "g", price: 3.50, brand: "MasterFoods" },
    "coriander seeds": { size: 28, unit: "g", price: 3.50, brand: "MasterFoods" },
    "coriander": { size: 25, unit: "g", price: 2.50, brand: "Woolworths" },
    "fenugreek": { size: 30, unit: "g", price: 3.50, brand: "MasterFoods" },
    "fenugreek seeds": { size: 30, unit: "g", price: 3.50, brand: "MasterFoods" },
    "nigella seeds": { size: 50, unit: "g", price: 4.00, brand: "Hoyt's" },
    "poppy seed": { size: 240, unit: "g", price: 5.00, brand: "Hoyt's" },
    "poppy seeds": { size: 240, unit: "g", price: 5.00, brand: "Hoyt's" },
    "sesame seeds": { size: 230, unit: "g", price: 5.20, brand: "Hoyt's" },
    "mixed herbs": { size: 70, unit: "g", price: 3.40, brand: "Hoyt's" },
    "italian herbs": { size: 35, unit: "g", price: 3.50, brand: "MasterFoods" },
    "italian herb mix": { size: 140, unit: "g", price: 6.00, brand: "Hoyt's" },
    "bay leaves": { size: 5, unit: "g", price: 2.00, brand: "Hoyt's" },
    "baking powder": { size: 125, unit: "g", price: 2.85, brand: "McKenzie's" },
    "bicarb soda": { size: 500, unit: "g", price: 3.10, brand: "McKenzie's" },
    "bi-carb soda": { size: 500, unit: "g", price: 3.10, brand: "McKenzie's" },
    "black peppercorns": { size: 45, unit: "g", price: 4.00, brand: "McKenzie's" },
    "white pepper": { size: 50, unit: "g", price: 3.90, brand: "McKenzie's" },
    "black pepper": { size: 45, unit: "g", price: 4.00, brand: "McKenzie's" },
    "green peppercorns": { size: 50, unit: "g", price: 5.00, brand: "Hoyt's" },
    "himalayan pink salt": { size: 100, unit: "g", price: 4.00, brand: "McKenzie's" },
    "sea salt flakes": { size: 250, unit: "g", price: 5.50, brand: "Murray River" },
    "table salt": { size: 750, unit: "g", price: 4.50, brand: "Saxa" },
    "salt": { size: 750, unit: "g", price: 4.50, brand: "Saxa" },
    "desiccated coconut": { size: 250, unit: "g", price: 3.70, brand: "McKenzie's" },
    "dry yeast": { size: 84, unit: "g", price: 6.00, brand: "Tandaco" },
    "dried yeast": { size: 84, unit: "g", price: 6.00, brand: "Tandaco" },
    "yeast": { size: 84, unit: "g", price: 6.00, brand: "Tandaco" },
    "bread improver": { size: 125, unit: "g", price: 4.40, brand: "Wallaby" },
    "taco seasoning": { size: 30, unit: "g", price: 2.70, brand: "Old El Paso" },
    "achiote powder": { size: 50, unit: "g", price: 4.00, brand: "Hoyt's" },

    // ========== SEEDS & SUPERFOODS ==========
    "chia seeds": { size: 350, unit: "g", price: 6.00, brand: "Macro" },
    "black chia seeds": { size: 350, unit: "g", price: 6.00, brand: "Macro" },
    "white chia seeds": { size: 350, unit: "g", price: 6.40, brand: "Macro" },
    "linseed": { size: 500, unit: "g", price: 4.40, brand: "Macro" },
    "flaxseed meal": { size: 500, unit: "g", price: 6.30, brand: "Macro" },
    "hemp seeds": { size: 200, unit: "g", price: 6.60, brand: "Macro" },
    "hemp protein powder": { size: 200, unit: "g", price: 8.60, brand: "Macro" },
    "psyllium husk": { size: 250, unit: "g", price: 7.00, brand: "Macro" },
    "soy lecithin": { size: 250, unit: "g", price: 10.00, brand: "Macro" },
    "soy lecithin granules": { size: 250, unit: "g", price: 10.00, brand: "Macro" },
    "xanthan gum": { size: 100, unit: "g", price: 5.50, brand: "Macro" },
    "pumpkin seeds": { size: 250, unit: "g", price: 5.70, brand: "Macro" },
    "pumpkin kernels": { size: 250, unit: "g", price: 5.70, brand: "Macro" },
    "sunflower seeds": { size: 500, unit: "g", price: 5.00, brand: "Macro" },
    "sunflower kernels": { size: 500, unit: "g", price: 5.00, brand: "Macro" },
    "almonds": { size: 500, unit: "g", price: 12.00, brand: "Woolworths" },
    "slivered almonds": { size: 500, unit: "g", price: 13.00, brand: "Woolworths" },
    "cashews": { size: 500, unit: "g", price: 14.00, brand: "Woolworths" },
    "pecans": { size: 500, unit: "g", price: 16.00, brand: "Woolworths" },
    "walnuts": { size: 1000, unit: "g", price: 18.00, brand: "Woolworths" },
    "pine nuts": { size: 100, unit: "g", price: 8.00, brand: "Woolworths" },

    // ========== STOCK ==========
    "beef stock cubes": { size: 12, unit: "cubes", price: 2.80, brand: "OXO" },
    "chicken stock cubes": { size: 12, unit: "cubes", price: 2.80, brand: "OXO" },
    "chicken stock cube": { size: 1, unit: "cube", price: 0.23, brand: "OXO" },
    "beef stock": { size: 500, unit: "ml", price: 2.50, brand: "Campbell's" },
    "chicken stock": { size: 500, unit: "ml", price: 2.50, brand: "Campbell's" },
    "pork stock": { size: 500, unit: "ml", price: 2.50, brand: "Campbell's" },
    "pork stock cube": { size: 1, unit: "cube", price: 0.23, brand: "OXO" },
    "gravy mix": { size: 425, unit: "g", price: 5.60, brand: "Gravox" },

    // ========== BAKING EXTRAS ==========
    "vanilla extract": { size: 50, unit: "ml", price: 6.00, brand: "Queen" },
    "vanilla essence": { size: 50, unit: "ml", price: 4.00, brand: "Queen" },
    "vanilla": { size: 50, unit: "ml", price: 6.00, brand: "Queen" },
    "cocoa powder": { size: 190, unit: "g", price: 8.00, brand: "Nestle" },
    "dark chocolate melts": { size: 225, unit: "g", price: 6.00, brand: "Nestle" },
    "dark choc bits": { size: 200, unit: "g", price: 7.00, brand: "Nestle" },
    "dark chocolate": { size: 200, unit: "g", price: 7.00, brand: "Nestle" },
    "dark chocolate chips": { size: 200, unit: "g", price: 7.00, brand: "Nestle" },
    "milk choc bits": { size: 200, unit: "g", price: 7.00, brand: "Nestle" },
    "white chocolate chips": { size: 200, unit: "g", price: 7.50, brand: "Cadbury" },
    "white chocolate": { size: 200, unit: "g", price: 7.50, brand: "Cadbury" },
    "chocolate chips": { size: 200, unit: "g", price: 7.00, brand: "Nestle" },
    "chocolate sprinkles": { size: 100, unit: "g", price: 3.50, brand: "Dollar Sweets" },
    "custard powder": { size: 350, unit: "g", price: 3.20, brand: "Foster Clark's" },
    "gelatine": { size: 30, unit: "g", price: 4.50, brand: "McKenzie's" },
    "cake crumbs": { size: 200, unit: "g", price: 3.00, brand: "Woolworths" },

    // ========== BREAD & BAKERY ==========
    "breadcrumbs": { size: 750, unit: "g", price: 3.00, brand: "Essentials" },
    "puff pastry": { size: 500, unit: "g", price: 4.50, brand: "Pampas" },
    "frozen puff pastry": { size: 500, unit: "g", price: 4.50, brand: "Pampas" },
    "shortcrust pastry": { size: 500, unit: "g", price: 4.00, brand: "Pampas" },
    "naan bread": { size: 4, unit: "pack", price: 4.50, brand: "Mighty Soft" },
    "sourdough starter": { size: 200, unit: "g", price: 1.00, brand: "Homemade" },

    // ========== FRESH VEGETABLES ==========
    "banana": { size: 1, unit: "each", price: 0.72, brand: "Woolworths" },
    "bananas": { size: 1, unit: "each", price: 0.72, brand: "Woolworths" },
    "cavendish banana": { size: 1, unit: "each", price: 0.72, brand: "Woolworths" },
    "apple": { size: 1, unit: "each", price: 1.31, brand: "Woolworths" },
    "apples": { size: 1, unit: "each", price: 1.31, brand: "Woolworths" },
    "pink lady apple": { size: 1, unit: "each", price: 1.31, brand: "Woolworths" },
    "granny smith apple": { size: 1, unit: "each", price: 1.31, brand: "Woolworths" },
    "granny smith apples": { size: 1, unit: "each", price: 1.31, brand: "Woolworths" },
    "bravo apple": { size: 1, unit: "each", price: 1.38, brand: "Woolworths" },
    "avocado": { size: 1, unit: "each", price: 2.20, brand: "Woolworths" },
    "brown onion": { size: 1, unit: "each", price: 0.63, brand: "Woolworths" },
    "onion": { size: 1, unit: "each", price: 0.63, brand: "Woolworths" },
    "broccoli": { size: 1, unit: "each", price: 1.49, brand: "Woolworths" },
    "cucumber": { size: 1, unit: "each", price: 1.53, brand: "Woolworths" },
    "lebanese cucumber": { size: 1, unit: "each", price: 1.53, brand: "Woolworths" },
    "red capsicum": { size: 1, unit: "each", price: 1.98, brand: "Woolworths" },
    "green capsicum": { size: 1, unit: "each", price: 1.98, brand: "Woolworths" },
    "capsicum": { size: 1, unit: "each", price: 1.98, brand: "Woolworths" },
    "zucchini": { size: 1, unit: "each", price: 1.18, brand: "Woolworths" },
    "sweet potato": { size: 1, unit: "each", price: 1.96, brand: "Woolworths" },
    "carrot": { size: 1, unit: "each", price: 0.36, brand: "Woolworths" },
    "carrots": { size: 1000, unit: "g", price: 1.70, brand: "Woolworths" },
    "baby carrots": { size: 500, unit: "g", price: 1.90, brand: "Woolworths" },
    "potato": { size: 1, unit: "each", price: 0.60, brand: "Woolworths" },
    "potatoes": { size: 2000, unit: "g", price: 6.00, brand: "Woolworths" },
    "roasting potatoes": { size: 1500, unit: "g", price: 7.50, brand: "Woolworths" },
    "brushed potato": { size: 1, unit: "each", price: 1.18, brand: "Woolworths" },
    "cherry tomatoes": { size: 250, unit: "g", price: 3.20, brand: "Woolworths" },
    "gourmet tomato": { size: 1, unit: "each", price: 0.54, brand: "Woolworths" },
    "truss tomatoes": { size: 1, unit: "each", price: 1.11, brand: "Woolworths" },
    "mini roma tomatoes": { size: 250, unit: "g", price: 3.50, brand: "Woolworths" },
    "iceberg lettuce": { size: 1, unit: "each", price: 2.50, brand: "Woolworths" },
    "spinach": { size: 120, unit: "g", price: 2.70, brand: "Woolworths" },
    "baby spinach": { size: 120, unit: "g", price: 2.70, brand: "Woolworths" },
    "cabbage": { size: 1, unit: "each", price: 3.50, brand: "Woolworths" },
    "savoy cabbage": { size: 1, unit: "half", price: 4.25, brand: "Woolworths" },
    "leek": { size: 1, unit: "each", price: 2.50, brand: "Woolworths" },
    "celery": { size: 1, unit: "bunch", price: 3.00, brand: "Woolworths" },
    "asparagus": { size: 1, unit: "bunch", price: 4.00, brand: "Woolworths" },
    "green beans": { size: 250, unit: "g", price: 2.50, brand: "Woolworths" },
    "snow peas": { size: 150, unit: "g", price: 3.00, brand: "Woolworths" },
    "sugar snap peas": { size: 150, unit: "g", price: 3.00, brand: "Woolworths" },
    "corn cobs": { size: 500, unit: "g", price: 4.50, brand: "Woolworths" },
    "corn on cob": { size: 500, unit: "g", price: 4.50, brand: "Woolworths" },
    "mushrooms": { size: 200, unit: "g", price: 2.50, brand: "Woolworths" },
    "sliced mushrooms": { size: 375, unit: "g", price: 6.00, brand: "Woolworths" },
    "mushrooms punnet 500g": { size: 500, unit: "g", price: 7.00, brand: "Woolworths" },
    "ginger": { size: 80, unit: "g", price: 2.64, brand: "Woolworths" },
    "fresh ginger": { size: 80, unit: "g", price: 2.64, brand: "Woolworths" },
    "garlic cloves": { size: 70, unit: "g", price: 2.90, brand: "Woolworths" },
    "garlic": { size: 1, unit: "bulb", price: 1.20, brand: "Woolworths" },
    "shallot": { size: 1, unit: "each", price: 0.50, brand: "Woolworths" },
    "shallots": { size: 1, unit: "each", price: 0.50, brand: "Woolworths" },
    "spring onion": { size: 1, unit: "bunch", price: 2.50, brand: "Woolworths" },
    "lemon": { size: 1, unit: "each", price: 1.56, brand: "Woolworths" },
    "lemon juice": { size: 500, unit: "ml", price: 1.65, brand: "Woolworths" },
    "lemon zest": { size: 1, unit: "each", price: 0.50, brand: "Woolworths" },
    "lime juice": { size: 250, unit: "ml", price: 2.50, brand: "Woolworths" },
    "pumpkin": { size: 1, unit: "kg", price: 3.33, brand: "Woolworths" },
    "kent pumpkin": { size: 1, unit: "each", price: 3.33, brand: "Woolworths" },
    "butternut pumpkin": { size: 1, unit: "each", price: 3.51, brand: "Woolworths" },
    "whole pumpkin": { size: 1, unit: "each", price: 9.45, brand: "Woolworths" },
    "red chili": { size: 1, unit: "each", price: 0.60, brand: "Woolworths" },
    "red cayenne chilli": { size: 1, unit: "each", price: 0.60, brand: "Woolworths" },
    "jalapeno chilli": { size: 1, unit: "each", price: 1.01, brand: "Woolworths" },
    "dried red chili": { size: 25, unit: "g", price: 2.00, brand: "Hoyt's" },
    "dried red chilies": { size: 25, unit: "g", price: 2.00, brand: "Hoyt's" },
    "watermelon": { size: 1, unit: "each", price: 25.52, brand: "Woolworths" },
    "mandarin": { size: 1, unit: "each", price: 0.85, brand: "Woolworths" },

    // ========== FRESH FRUIT ==========
    "kiwi fruit": { size: 1, unit: "each", price: 1.00, brand: "Woolworths" },
    "kiwifruit": { size: 1, unit: "each", price: 1.00, brand: "Woolworths" },
    "mango": { size: 1, unit: "each", price: 3.00, brand: "Woolworths" },
    "nectarine": { size: 1, unit: "each", price: 1.50, brand: "Woolworths" },
    "plum": { size: 1, unit: "each", price: 1.50, brand: "Woolworths" },
    "peach": { size: 1, unit: "each", price: 1.50, brand: "Woolworths" },
    "apricot": { size: 1, unit: "each", price: 1.50, brand: "Woolworths" },
    "cherries": { size: 250, unit: "g", price: 6.00, brand: "Woolworths" },
    "blueberries": { size: 125, unit: "g", price: 5.00, brand: "Woolworths" },
    "strawberries": { size: 250, unit: "g", price: 5.00, brand: "Woolworths" },
    "grapes": { size: 900, unit: "g", price: 5.50, brand: "Woolworths" },
    "white grapes": { size: 900, unit: "g", price: 5.50, brand: "Woolworths" },
    "red grapes": { size: 900, unit: "g", price: 5.50, brand: "Woolworths" },
    "black grapes": { size: 950, unit: "g", price: 6.00, brand: "Woolworths" },
    "passionfruit": { size: 1, unit: "each", price: 1.20, brand: "Woolworths" },
    "pineapple": { size: 1, unit: "each", price: 4.00, brand: "Woolworths" },
    "orange": { size: 1, unit: "each", price: 1.20, brand: "Woolworths" },
    "orange juice": { size: 2000, unit: "ml", price: 7.80, brand: "Golden Circle" },
    "orange zest": { size: 1, unit: "each", price: 0.50, brand: "Woolworths" },
    "pineapple juice": { size: 2000, unit: "ml", price: 6.50, brand: "Golden Circle" },
    "apple juice": { size: 2000, unit: "ml", price: 2.70, brand: "Golden Circle" },
    "apricot nectar": { size: 2000, unit: "ml", price: 3.50, brand: "Golden Circle" },
    "mango nectar": { size: 2000, unit: "ml", price: 3.50, brand: "Golden Circle" },
    "calamansi": { size: 100, unit: "g", price: 4.00, brand: "Woolworths" },

    // ========== MEAT & POULTRY ==========
    "chicken breast": { size: 1500, unit: "g", price: 18.70, brand: "Woolworths RSPCA" },
    "chicken breasts": { size: 1500, unit: "g", price: 18.70, brand: "Woolworths RSPCA" },
    "chicken breast fillet 350g": { size: 350, unit: "g", price: 9.00, brand: "Woolworths RSPCA" },
    "chicken thigh": { size: 1000, unit: "g", price: 15.50, brand: "Woolworths RSPCA" },
    "chicken thigh fillet": { size: 150, unit: "g", price: 8.00, brand: "Woolworths RSPCA" },
    "chicken thigh fillets": { size: 150, unit: "g", price: 8.00, brand: "Woolworths RSPCA" },
    "chicken thigh cutlets": { size: 180, unit: "g", price: 8.00, brand: "Woolworths RSPCA" },
    "chicken drumsticks": { size: 150, unit: "g", price: 4.80, brand: "Woolworths RSPCA" },
    "chicken maryland": { size: 665, unit: "g", price: 7.20, brand: "Woolworths RSPCA" },
    "chicken schnitzel": { size: 1, unit: "each", price: 2.80, brand: "Chicken Sandwich" },
    "chicken kebab": { size: 1, unit: "each", price: 1.00, brand: "Woolworths RSPCA" },
    "beef mince": { size: 1000, unit: "g", price: 19.35, brand: "Woolworths" },
    "beef mince 500g": { size: 500, unit: "g", price: 11.00, brand: "Woolworths" },
    "beef": { size: 1000, unit: "g", price: 19.35, brand: "Woolworths" },
    "beef sausages": { size: 550, unit: "g", price: 6.50, brand: "Woolworths" },
    "beef bones": { size: 1000, unit: "g", price: 5.00, brand: "Woolworths" },
    "beef knuckles": { size: 1000, unit: "g", price: 8.00, brand: "Woolworths" },
    "beef shanks": { size: 1000, unit: "g", price: 12.00, brand: "Woolworths" },
    "beef scraps": { size: 500, unit: "g", price: 6.00, brand: "Woolworths" },
    "scotch fillet": { size: 1000, unit: "g", price: 26.00, brand: "Woolworths" },
    "beef, scotch fillet": { size: 1000, unit: "g", price: 26.00, brand: "Woolworths" },
    "rump steak": { size: 950, unit: "g", price: 31.20, brand: "Woolworths" },
    "lamb": { size: 1000, unit: "g", price: 18.00, brand: "Woolworths" },
    "lamb leg roast": { size: 1500, unit: "g", price: 39.60, brand: "Woolworths" },
    "lamb forequarter chops": { size: 1050, unit: "g", price: 31.20, brand: "Woolworths" },
    "lamb cutlets": { size: 500, unit: "g", price: 22.00, brand: "Woolworths" },
    "lamb rack": { size: 600, unit: "g", price: 28.00, brand: "Woolworths" },
    "pork": { size: 1000, unit: "g", price: 12.00, brand: "Woolworths" },
    "pork leg roast": { size: 1900, unit: "g", price: 31.20, brand: "Woolworths" },
    "pork chops": { size: 1200, unit: "g", price: 25.00, brand: "Woolworths" },
    "pork shoulder": { size: 1500, unit: "g", price: 18.00, brand: "Woolworths" },
    "pork mince": { size: 500, unit: "g", price: 6.50, brand: "Woolworths" },
    "bacon": { size: 1000, unit: "g", price: 12.50, brand: "Woolworths" },
    "middle bacon": { size: 1000, unit: "g", price: 12.50, brand: "Woolworths" },
    "hans middle bacon": { size: 170, unit: "g", price: 19.00, brand: "Hans" },
    "leg ham": { size: 100, unit: "g", price: 19.90, brand: "Woolworths" },
    "champagne ham": { size: 100, unit: "g", price: 23.00, brand: "D'Orsogna" },
    "shredded ham": { size: 100, unit: "g", price: 22.00, brand: "Don" },
    "ham": { size: 100, unit: "g", price: 19.90, brand: "Woolworths" },
    "prosciutto": { size: 100, unit: "g", price: 8.00, brand: "Woolworths" },
    "salami": { size: 80, unit: "g", price: 3.95, brand: "Primo" },
    "pepperoni": { size: 100, unit: "g", price: 35.00, brand: "Don" },
    "chinese sausage": { size: 200, unit: "g", price: 6.00, brand: "Woolworths" },
    "hot dogs": { size: 1000, unit: "g", price: 6.90, brand: "Primo" },
    "frankfurts": { size: 100, unit: "g", price: 8.50, brand: "Don" },
    "cocktail frankfurts": { size: 100, unit: "g", price: 8.50, brand: "Don" },
    "veal": { size: 500, unit: "g", price: 18.00, brand: "Woolworths" },

    // ========== SNACKS & BISCUITS ==========
    "butternut snap cookies": { size: 250, unit: "g", price: 2.80, brand: "Arnott's" },
    "arnotts butternut snap cookies": { size: 250, unit: "g", price: 2.80, brand: "Arnott's" },
    "nice biscuits": { size: 250, unit: "g", price: 2.80, brand: "Arnott's" },
    "arnotts nice biscuits": { size: 250, unit: "g", price: 2.80, brand: "Arnott's" },

    // ========== DRINKS ==========
    "instant coffee": { size: 150, unit: "g", price: 14.50, brand: "Nescafe" },
    "coffee": { size: 150, unit: "g", price: 14.50, brand: "Nescafe" },
    "espresso": { size: 50, unit: "ml", price: 2.00, brand: "Nescafe" },
    "tia maria": { size: 700, unit: "ml", price: 35.00, brand: "Tia Maria" },
    "brandy": { size: 700, unit: "ml", price: 30.00, brand: "St Remy" },
    "rum": { size: 700, unit: "ml", price: 35.00, brand: "Bundaberg" },
    "grand marnier": { size: 700, unit: "ml", price: 55.00, brand: "Grand Marnier" },
    "white wine": { size: 750, unit: "ml", price: 12.00, brand: "Lindeman's" },
    "red wine": { size: 750, unit: "ml", price: 12.00, brand: "Lindeman's" },
    "mirin": { size: 500, unit: "ml", price: 8.00, brand: "Mizkan" },
    "chinese rice wine": { size: 600, unit: "ml", price: 10.00, brand: "Shaoxing" },

    // ========== DRIED FRUIT & NUTS ==========
    "dates": { size: 500, unit: "g", price: 3.00, brand: "Woolworths" },
    "sultanas": { size: 375, unit: "g", price: 4.20, brand: "Woolworths" },
    "walnuts": { size: 1000, unit: "g", price: 18.00, brand: "Woolworths" },
    "almonds": { size: 500, unit: "g", price: 12.00, brand: "Woolworths" },
    "cashews": { size: 500, unit: "g", price: 14.00, brand: "Woolworths" },
    "pecans": { size: 500, unit: "g", price: 16.00, brand: "Woolworths" },
    "pine nuts": { size: 100, unit: "g", price: 8.00, brand: "Woolworths" },
    "dried apricots": { size: 500, unit: "g", price: 5.00, brand: "Woolworths" },
    "apricot": { size: 500, unit: "g", price: 5.00, brand: "Woolworths" }
};
    function getPriceDB() {
        var saved = localStorage.getItem(PRICE_STORAGE_KEY);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch(e) { return DEFAULT_PRICES; }
        }
        localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify(DEFAULT_PRICES));
        localStorage.setItem(PRICE_DISCLAIMER_KEY, new Date().toISOString());
        return DEFAULT_PRICES;
    }

        function updatePriceDB(itemName, size, unit, price) {
        var db = getPriceDB();
        var key = itemName.toLowerCase().trim();
        db[key] = { size: parseFloat(size), unit: unit, price: parseFloat(price) };
        localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify(db));
        localStorage.setItem(PRICE_DISCLAIMER_KEY, new Date().toISOString());
        
        // Force reload the shopping list to show updated prices
        var panel = document.getElementById('shoppingPanel');
        if (panel) {
            var recipe = window.currentRecipeData || {};
            var multiplier = window.currentMultiplier || 1;
            buildShoppingList(recipe, multiplier);
        }
    }

    function splitIngredientAndNotes(raw) {
        var text = raw.trim();
        var ingredient = text;
        var notes = '';
        
        // Find the first opening parenthesis
        var parenIndex = text.indexOf('(');
        if (parenIndex !== -1) {
            ingredient = text.substring(0, parenIndex).trim();
            var closeParen = text.indexOf(')', parenIndex);
            if (closeParen !== -1) {
                notes = text.substring(parenIndex + 1, closeParen).trim();
            }
        }
        
        return { ingredient: ingredient, notes: notes };
    }
	
    function buildShoppingList(recipe, scale) {
        var existingPanel = document.getElementById('shoppingPanel');
        if (existingPanel) { existingPanel.remove(); return; }

        var excludeItems = ['water', 'hot water', 'cold water', 'warm water', 'boiling water', 'tap water'];
        var priceDB = getPriceDB();
        var multiplier = scale || 1;
        
        // Store current recipe and multiplier for edit button refresh
        window.currentRecipeData = recipe;
        window.currentMultiplier = multiplier;

        var ingredients = [];
        (recipe.ingredients || []).forEach(function(ing) {
            if (ing.heading || ing.toTaste) return;

            var raw = parseFloat(ing.quantity);
            var qtyVal = isNaN(raw) ? 0 : raw * multiplier;
            var unit = (ing.unit || '').toLowerCase();
            var rawItem = (ing.item || ing.name || '').trim();
            var parsed = splitIngredientAndNotes(rawItem);
            var item = parsed.ingredient.toLowerCase();
            if (!item) return;

            // ONLY skip plain water
            if (excludeItems.indexOf(item) !== -1) return;

            // Store notes if they exist
            if (parsed.notes && !ing.notes) {
                ing.notes = parsed.notes;
            }

            ingredients.push({
                name: item,
                qty: qtyVal,
                unit: unit,
                originalQty: ing.quantity,
                originalUnit: ing.unit
            });
        });

        var shoppingItems = [];
        var totalBuyCost = 0;
        var totalMakeCost = 0;
        var missingPrices = [];

        ingredients.forEach(function(ing) {
            var ingredientName = ing.name;
            var priceInfo = null;
            var matchedKey = null;
            
            // Try exact match first
            if (priceDB[ingredientName]) {
                priceInfo = priceDB[ingredientName];
                matchedKey = ingredientName;
            }
            
                        // Try contains match
            if (!priceInfo) {
                for (var key in priceDB) {
                    if (ingredientName.indexOf(key) !== -1 || key.indexOf(ingredientName) !== -1) {
                        priceInfo = priceDB[key];
                        matchedKey = key;
                        break;
                    }
                }
            }
            
            // Try removing 's' from end (plural to singular)
            if (!priceInfo && ingredientName.endsWith('s')) {
                var singular = ingredientName.slice(0, -1);
                if (priceDB[singular]) {
                    priceInfo = priceDB[singular];
                    matchedKey = singular;
                }
            }
            
            // Try removing common prefixes like 'ground', 'fresh', 'dried', 'whole', 'shredded', 'shaved'
            if (!priceInfo) {
                var prefixes = ['ground ', 'fresh ', 'dried ', 'whole ', 'shredded ', 'shaved ', 'pure '];
                for (var p = 0; p < prefixes.length; p++) {
                    if (ingredientName.indexOf(prefixes[p]) === 0) {
                        var withoutPrefix = ingredientName.substring(prefixes[p].length);
                        if (priceDB[withoutPrefix]) {
                            priceInfo = priceDB[withoutPrefix];
                            matchedKey = withoutPrefix;
                            break;
                        }
                    }
                }
            }
            
            // Try removing common suffixes like 'powder', 'leaves', 'flakes'
            if (!priceInfo) {
                var suffixes = [' powder', ' leaves', ' flakes', ' seeds', ' whole'];
                for (var s = 0; s < suffixes.length; s++) {
                    if (ingredientName.indexOf(suffixes[s]) !== -1) {
                        var withoutSuffix = ingredientName.replace(suffixes[s], '');
                        if (priceDB[withoutSuffix]) {
                            priceInfo = priceDB[withoutSuffix];
                            matchedKey = withoutSuffix;
                            break;
                        }
                    }
                }
            }
            
            if (!priceInfo) {
                missingPrices.push(ing.name);
                shoppingItems.push({
                    name: ing.name,
                    needed: formatQuantity(ing.qty, ing.unit),
                    hasPrice: false
                });
                return;
            }
            
            // Convert needed amount to match package unit
            var neededInPackageUnits = ing.qty;
            if (ing.unit === 'g' && priceInfo.unit === 'kg') neededInPackageUnits = ing.qty / 1000;
            if (ing.unit === 'ml' && priceInfo.unit === 'l') neededInPackageUnits = ing.qty / 1000;
            if (ing.unit === 'each' && priceInfo.unit === 'each') neededInPackageUnits = ing.qty;
            
            // Calculate price per unit
            var pricePerUnit = priceInfo.price / priceInfo.size;
            
            // Cost to BUY (what you pay at checkout)
            var packagesNeeded = Math.ceil(neededInPackageUnits / priceInfo.size);
            var buyCost = packagesNeeded * priceInfo.price;
            totalBuyCost += buyCost;
            
            // Cost to MAKE (value of what you actually use)
            var makeCost = neededInPackageUnits * pricePerUnit;
            totalMakeCost += makeCost;
            
            var leftoverAmount = (packagesNeeded * priceInfo.size) - neededInPackageUnits;
            var leftoverValue = leftoverAmount * pricePerUnit;
            var leftoverText = '';
            if (leftoverAmount > 0.01) {
                if (priceInfo.unit === 'g' && leftoverAmount > 1000) {
                    leftoverText = (leftoverAmount / 1000).toFixed(1) + 'kg left ($' + leftoverValue.toFixed(2) + ')';
                } else if (priceInfo.unit === 'ml' && leftoverAmount > 1000) {
                    leftoverText = (leftoverAmount / 1000).toFixed(1) + 'L left ($' + leftoverValue.toFixed(2) + ')';
                } else {
                    leftoverText = Math.round(leftoverAmount * 10) / 10 + priceInfo.unit + ' left ($' + leftoverValue.toFixed(2) + ')';
                }
            }
            
            shoppingItems.push({
                name: ing.name,
                needed: formatQuantity(ing.qty, ing.unit),
                neededValue: makeCost.toFixed(2),
                packagesNeeded: packagesNeeded,
                packageSize: priceInfo.size + priceInfo.unit,
                packagePrice: priceInfo.price.toFixed(2),
                brand: priceInfo.brand,
                buyCost: buyCost.toFixed(2),
                leftover: leftoverText,
                hasPrice: true
            });
        });

        var panel = document.createElement('div');
        panel.id = 'shoppingPanel';
        
        var disclaimerDate = localStorage.getItem(PRICE_DISCLAIMER_KEY);
        var disclaimerDateStr = disclaimerDate ? new Date(disclaimerDate).toLocaleDateString() : 'Never';
        
        var inner = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">';
        inner += '<span style="font-size:0.7rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--copper);font-weight:700;">🛒 Shopping List</span>';
        inner += '<button onclick="document.getElementById(\'shoppingPanel\').remove()" style="background:none;border:none;color:var(--cream-muted);font-size:1.2rem;cursor:pointer;line-height:1;">&times;</button></div>';
        
        inner += '<div style="background:rgba(201,125,62,0.1);padding:0.5rem 0.75rem;margin-bottom:1rem;border-left:3px solid var(--copper);font-size:0.7rem;color:var(--cream-muted);">';
        inner += '⚠️ <strong>Prices are estimates</strong> based on last recorded purchases.<br>';
        inner += 'Actual prices vary by store, season, and location.<br>';
        inner += '<small>Last updated: ' + disclaimerDateStr + '</small></div>';
        
        inner += '<p style="font-size:0.85rem;color:var(--cream-dim);margin-bottom:0.5rem;">' + escHtml(recipe.title || '') + '</p>';
        
        if (multiplier > 1) {
            inner += '<div style="background:rgba(201,125,62,0.08);padding:0.3rem 0.6rem;margin-bottom:1rem;border-radius:4px;font-size:0.7rem;">';
            inner += '📏 Scaled ' + multiplier + 'x — quantities adjusted.</div>';
        }
        
        if (shoppingItems.length === 0) {
            inner += '<p style="color:var(--cream-muted);font-style:italic;">No ingredients found.</p>';
        } else {
            if (missingPrices.length > 0) {
                inner += '<div style="background:rgba(192,57,43,0.15);padding:0.5rem;margin-bottom:1rem;border-left:3px solid #c0392b;font-size:0.7rem;">';
                inner += '<strong>⚠️ Missing price data for:</strong> ' + missingPrices.join(', ') + '<br>';
                inner += '<small>Click the edit button to add prices.</small></div>';
            }
            
            // Cost summary section
            var savings = totalBuyCost - totalMakeCost;
            inner += '<div style="background:rgba(201,125,62,0.08);padding:0.75rem;margin-bottom:1rem;border-radius:6px;">';
            inner += '<div style="display:flex;justify-content:space-between;margin-bottom:0.5rem;">';
            inner += '<span style="font-weight:600;">Cost to MAKE this recipe:</span>';
            inner += '<span style="color:var(--copper);font-weight:700;">$' + totalMakeCost.toFixed(2) + '</span></div>';
            inner += '<div style="display:flex;justify-content:space-between;margin-bottom:0.5rem;">';
            inner += '<span style="font-weight:600;">Cost to BUY everything:</span>';
            inner += '<span style="color:var(--copper);font-weight:700;">$' + totalBuyCost.toFixed(2) + '</span></div>';
            if (savings > 0) {
                inner += '<div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--cream-muted);">';
                inner += '<span>💡 Leftover value for other recipes:</span>';
                inner += '<span>$' + savings.toFixed(2) + '</span></div>';
            }
            
            // Calculate price per serving if servings exists
            if (recipe.servings) {
                var servingsNum = parseInt(recipe.servings);
                if (!isNaN(servingsNum) && servingsNum > 0) {
                    var pricePerServing = totalMakeCost / servingsNum;
                    inner += '<div style="display:flex;justify-content:space-between;font-size:0.85rem;color:var(--cream);margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid var(--border-dim);">';
                    inner += '<span>🍽️ Cost per serving (' + servingsNum + ' servings):</span>';
                    inner += '<span><strong>$' + pricePerServing.toFixed(2) + '</strong></span>';
                    inner += '</div>';
                }
            }
            
            inner += '</div>';
            
            inner += '<ul style="list-style:none;padding:0;margin:0;max-height:50vh;overflow-y:auto;">';
            
            
            shoppingItems.forEach(function(item, idx) {
                inner += '<li style="border-bottom:1px solid var(--border-dim);padding:0.75rem 0;position:relative;">';
                inner += '<div style="display:flex;align-items:flex-start;gap:0.75rem;">';
                inner += '<input type="checkbox" id="shop-' + idx + '" class="shop-checkbox" style="margin-top:0.2rem;accent-color:var(--copper);">';
                inner += '<div style="flex:1;">';
                inner += '<div class="shopping-item-name" style="font-weight:600;font-size:0.9rem;">' + escHtml(item.displayName || item.name) + '</div>';
                
                // Everything inside this span hides when printing
                inner += '<span class="shopping-price-details">';
                if (item.hasPrice && item.brand) {
                    inner += '<div style="font-size:0.7rem;color:var(--cream-muted);">' + escHtml(item.brand) + '</div>';
                }
                inner += '<div style="font-size:0.7rem;color:var(--cream-muted);">Needs: ' + item.needed + '</div>';
                if (item.hasPrice) {
                    inner += '<div style="font-size:0.7rem;color:var(--cream-muted);">Buy: ' + item.packagesNeeded + ' × ' + item.packageSize + ' @ $' + item.packagePrice;
                    if (item.leftover) inner += ' → <span style="color:#81a1c1;">' + item.leftover + '</span>';
                    inner += '</div>';
                    inner += '<div style="font-size:0.8rem;margin-top:0.25rem;"><strong>$' + item.buyCost + '</strong></div>';
                } else {
                    inner += '<div style="font-size:0.7rem;color:#c0392b;">No price set</div>';
                }
                inner += '</span>';
                
                inner += '<button class="edit-price-btn" data-item="' + escHtml(item.name).replace(/"/g, '&quot;') + '" style="background:none;border:1px solid var(--border-dim);border-radius:4px;padding:0.2rem 0.5rem;font-size:0.65rem;cursor:pointer;color:var(--cream-muted);">✏️ Edit</button>';
                inner += '</div></li>';
            });
            
            inner += '</ul>';
            inner += '<div style="margin-top:1rem;display:flex;gap:0.5rem;">';
            inner += '<button id="shoppingSelectAll" style="flex:1;padding:0.4rem;background:rgba(201,125,62,0.1);border:1px solid var(--border-copper);border-radius:4px;color:var(--copper-warm);font-size:0.7rem;cursor:pointer;">Select All</button>';
            inner += '<button id="shoppingPrintBtn" style="flex:1;padding:0.4rem;background:rgba(201,125,62,0.12);border:1px solid var(--border-copper);border-radius:4px;color:var(--copper-warm);font-size:0.7rem;cursor:pointer;">🖨️ Print</button>';
            inner += '</div>';
        }
        
        panel.innerHTML = inner;
        Object.assign(panel.style, {
            position: 'fixed', top: '0', right: '0',
            width: '380px', height: '100vh',
            background: 'var(--surface-card)',
            borderLeft: '1px solid var(--border-mid)',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
            zIndex: '2000', overflowY: 'auto',
            padding: '1.5rem', boxSizing: 'border-box'
        });
        
        document.body.appendChild(panel);
        
        // Select All button
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
        
        // Print button
        var printBtn = document.getElementById('shoppingPrintBtn');
        if (printBtn) {
            printBtn.addEventListener('click', function() {
                var checkedItems = [];
                panel.querySelectorAll('.shop-checkbox').forEach(function(cb) {
                    if (cb.checked) {
                        var itemDiv = cb.closest('li');
                        var nameEl = itemDiv.querySelector('.shopping-item-name');
                        if (nameEl) checkedItems.push(nameEl.textContent);
                    }
                });
                
                var itemsToPrint = [];
                if (checkedItems.length === 0) {
                    var printAll = confirm('No items checked. Print all items?');
                    if (printAll) {
                        panel.querySelectorAll('.shopping-item-name').forEach(function(nameEl) {
                            itemsToPrint.push(nameEl.textContent);
                        });
                    } else {
                        return;
                    }
                } else {
                    itemsToPrint = checkedItems;
                }
                
                if (itemsToPrint.length === 0) {
                    alert('Nothing to print.');
                    return;
                }
                
                var win = window.open('', '_blank', 'width=500,height=600');
                var html = '<!DOCTYPE html><html><head><title>Shopping List - ' + escHtml(recipe.title || '') + '</title><style>' +
                    'body{font-family:"DM Sans",Arial,sans-serif;padding:20px;max-width:500px;margin:0 auto;color:#1a1814}' +
                    'h1{font-size:18px;font-family:"DM Serif Display",Georgia,serif;margin-bottom:4px;color:#1a1814}' +
                    '.recipe-title{font-size:14px;color:#666;margin-bottom:20px;border-bottom:1px solid #ccc;padding-bottom:8px}' +
                    '.shopping-list{list-style:none;padding:0}' +
                    '.shopping-list li{padding:8px 0;border-bottom:1px solid #eee;display:flex;align-items:center;gap:12px}' +
                    '.shopping-list input{width:16px;height:16px;margin:0}' +
                    '.shopping-list label{font-size:12px;color:#333}' +
                    '.disclaimer{font-size:8px;color:#999;margin-top:30px;padding-top:10px;border-top:1px solid #eee}' +
                    '@media print{body{padding:10px}}' +
                    '</style></head><body>' +
                    '<h1>🛒 Shopping List</h1>' +
                    '<div class="recipe-title">' + escHtml(recipe.title || '') + '</div>' +
                    '<ul class="shopping-list">';
                for (var i = 0; i < itemsToPrint.length; i++) {
                    html += '<li><input type="checkbox"> <label>' + escHtml(itemsToPrint[i]) + '</label></li>';
                }
                html += '</ul><div class="disclaimer">⚠️ Prices are estimates — actual prices vary by store and season.</div></body></html>';
                win.document.write(html);
                win.document.close();
                win.focus();
                win.print();
            });
        }
        
        // Edit Price buttons
        panel.querySelectorAll('.edit-price-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var itemName = this.getAttribute('data-item');
                var db = getPriceDB();
                var existing = db[itemName] || { size: '', unit: 'g', price: '' };
                
                var li = this.closest('li');
                var originalContent = li.innerHTML;
                
                li.innerHTML = '<div style="display:flex;flex-direction:column;gap:0.5rem;">' +
                    '<div><label style="font-size:0.65rem;color:var(--cream-muted);">Package Size</label>' +
                    '<input type="number" id="edit-size-' + itemName.replace(/[^a-z0-9]/gi, '') + '" value="' + (existing.size || '') + '" step="any" style="width:100%;background:var(--surface);border:1px solid var(--border-dim);padding:0.3rem;border-radius:4px;color:var(--cream-dim);"></div>' +
                    '<div><label style="font-size:0.65rem;color:var(--cream-muted);">Unit</label>' +
                    '<select id="edit-unit-' + itemName.replace(/[^a-z0-9]/gi, '') + '" style="width:100%;background:var(--surface);border:1px solid var(--border-dim);padding:0.3rem;border-radius:4px;color:var(--cream-dim);">' +
                    '<option value="g"' + (existing.unit === 'g' ? ' selected' : '') + '>grams (g)</option>' +
                    '<option value="kg"' + (existing.unit === 'kg' ? ' selected' : '') + '>kilograms (kg)</option>' +
                    '<option value="ml"' + (existing.unit === 'ml' ? ' selected' : '') + '>milliliters (ml)</option>' +
                    '<option value="l"' + (existing.unit === 'l' ? ' selected' : '') + '>liters (L)</option>' +
                    '<option value="each"' + (existing.unit === 'each' ? ' selected' : '') + '>each</option>' +
                    '</select></div>' +
                    '<div><label style="font-size:0.65rem;color:var(--cream-muted);">Price ($AUD)</label>' +
                    '<input type="number" id="edit-price-' + itemName.replace(/[^a-z0-9]/gi, '') + '" value="' + (existing.price || '') + '" step="0.01" style="width:100%;background:var(--surface);border:1px solid var(--border-dim);padding:0.3rem;border-radius:4px;color:var(--cream-dim);"></div>' +
                    '<div style="display:flex;gap:0.5rem;">' +
                    '<button class="save-price-btn" data-item="' + itemName + '">Save</button>' +
                    '<button class="cancel-edit-btn">Cancel</button>' +
                    '</div></div>';
                
                var saveBtn = li.querySelector('.save-price-btn');
                var cancelBtn = li.querySelector('.cancel-edit-btn');
                
                saveBtn.onclick = function() {
                    var uniqueId = itemName.replace(/[^a-z0-9]/gi, '');
                    var size = document.getElementById('edit-size-' + uniqueId).value;
                    var unit = document.getElementById('edit-unit-' + uniqueId).value;
                    var price = document.getElementById('edit-price-' + uniqueId).value;
                    if (size && price) {
                        var db = getPriceDB();
                        db[itemName] = { size: parseFloat(size), unit: unit, price: parseFloat(price) };
                        localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify(db));
                        localStorage.setItem(PRICE_DISCLAIMER_KEY, new Date().toISOString());
                        var panel = document.getElementById('shoppingPanel');
                        if (panel) {
                            panel.remove();
                        }
                        buildShoppingList(window.currentRecipeData, window.currentMultiplier);
                    }
                };
                
                cancelBtn.onclick = function() {
                    li.innerHTML = originalContent;
                    var newBtn = li.querySelector('.edit-price-btn');
                    if (newBtn) {
                        newBtn.addEventListener('click', arguments.callee);
                    }
                };
            });
        });
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
        var text = document.getElementById('cmText');
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

    window.recipeRenderer = { fetchRecipe: fetchRecipe };

})();