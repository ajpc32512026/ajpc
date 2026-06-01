/* =========================================================
   SEARCH — AJPC Kitchen Notebook
   Full-text search + ingredient search + fuzzy matching
   + search history + multi-filter (category/tag/difficulty)
   + favourites display on empty search
========================================================= */

(function () {
    'use strict';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ── Caches ────────────────────────────────────────────
    var fullRecipeCache     = {};
    var ingredientTextCache = {};
    var recipeIndex         = [];

    // ── Constants ─────────────────────────────────────────
    var HISTORY_KEY  = 'ajpc_search_history';
    var HISTORY_MAX  = 10;

    var PANTRY_STAPLES = [
        'water','salt','pepper','black pepper','white pepper',
        'butter','unsalted butter','oil','olive oil','vegetable oil','canola oil',
        'flour','plain flour','all-purpose flour','bread flour','self-raising flour',
        'sugar','white sugar','caster sugar','brown sugar','icing sugar',
        'eggs','egg','milk',
        'baking powder','baking soda','bi-carb soda','bicarbonate of soda',
        'vanilla','vanilla extract','yeast',
        'stock','chicken stock','beef stock','vegetable stock',
        'garlic','onion','brown onion','red onion','spring onion','to taste'
    ];

    var PRIMARY_INGREDIENTS = {
        'steak':   ['steak','beef','scotch fillet','filet mignon','scotch filet'],
        'beef':    ['beef','steak','scotch fillet','filet mignon','scotch filet'],
        'chicken': ['chicken','chicken breast','chicken thigh','chicken mince'],
        'pork':    ['pork','pork chop','bacon','ham','chorizo'],
        'lamb':    ['lamb','lamb cutlet','rack of lamb'],
        'fish':    ['fish','salmon','tuna','seafood'],
        'prawns':  ['prawns','shrimp','prawn'],
        'oysters': ['oysters','oyster'],
        'veal':    ['veal'],
    };

    // ── Fuzzy matching (Levenshtein distance) ─────────────
    function levenshtein(a, b) {
        var m = a.length, n = b.length;
        var dp = [];
        for (var i = 0; i <= m; i++) {
            dp[i] = [i];
            for (var j = 1; j <= n; j++) {
                dp[i][j] = i === 0 ? j :
                    a[i-1] === b[j-1] ? dp[i-1][j-1] :
                    1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
            }
        }
        return dp[m][n];
    }

    // Returns true if query is within edit-distance threshold of any word in text
    function fuzzyMatch(query, text) {
        if (!query || query.length < 3) return false;
        var words = text.toLowerCase().split(/\s+/);
        var threshold = query.length <= 4 ? 1 : 2;
        return words.some(function(w) {
            return w.length >= query.length - 1 && levenshtein(query, w) <= threshold;
        });
    }

    // ── Search History ────────────────────────────────────
    function getHistory() {
        try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
        catch(e) { return []; }
    }

    function addToHistory(query) {
        if (!query || query.length < 2) return;
        var history = getHistory().filter(function(h) { return h !== query; });
        history.unshift(query);
        if (history.length > HISTORY_MAX) history = history.slice(0, HISTORY_MAX);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch(e) {}
    }

    function clearHistory() {
        try { localStorage.removeItem(HISTORY_KEY); } catch(e) {}
        renderHistory();
    }

    function renderHistory() {
        var container = document.getElementById('searchHistory');
        if (!container) return;
        var history = getHistory();
        if (!history.length) { container.innerHTML = ''; return; }
        var html = '<div class="search-history-bar">';
        html += '<span class="search-history-label">Recent:</span>';
        history.forEach(function(q) {
            html += '<button class="search-history-chip" onclick="document.getElementById(\'searchInput\').value=' +
                JSON.stringify(q) + ';document.getElementById(\'searchInput\').dispatchEvent(new Event(\'input\'))">' +
                escHtml(q) + '</button>';
        });
        html += '<button class="search-history-clear" onclick="clearHistory()">Clear</button>';
        html += '</div>';
        container.innerHTML = html;
    }

    // ── Active filters state ──────────────────────────────
    var activeFilters = { category: '', tag: '', difficulty: '' };

    function initFilters() {
        var catSel  = document.getElementById('filterCategory');
        var tagSel  = document.getElementById('filterTag');
        var diffSel = document.getElementById('filterDifficulty');
        var clearBtn = document.getElementById('filterClear');

        if (!catSel) return;

        // Populate category filter
        var cats = [...new Set(recipeIndex.map(function(r) { return r.category; }).filter(Boolean))].sort();
        cats.forEach(function(c) {
            var opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            catSel.appendChild(opt);
        });

        // Populate tag filter — top 30 tags
        var tagCounts = {};
        recipeIndex.forEach(function(r) {
            (r.tags || []).forEach(function(t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
        });
        var topTags = Object.entries(tagCounts).sort(function(a,b) { return b[1]-a[1]; }).slice(0,30).map(function(e) { return e[0]; });
        topTags.forEach(function(t) {
            var opt = document.createElement('option');
            opt.value = t; opt.textContent = '#' + t;
            tagSel.appendChild(opt);
        });

        function onFilterChange() {
            activeFilters.category  = catSel.value;
            activeFilters.tag       = tagSel ? tagSel.value : '';
            activeFilters.difficulty = diffSel ? diffSel.value : '';
            var searchInput = document.getElementById('searchInput');
            var val = searchInput ? searchInput.value.trim() : '';
            var resultsEl = document.getElementById('searchResults');
            var countEl   = document.getElementById('resultsCount');
            runSearch(val, resultsEl, countEl);
        }

        catSel.addEventListener('change', onFilterChange);
        if (tagSel)  tagSel.addEventListener('change', onFilterChange);
        if (diffSel) diffSel.addEventListener('change', onFilterChange);

        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                catSel.value  = '';
                if (tagSel)  tagSel.value  = '';
                if (diffSel) diffSel.value = '';
                activeFilters = { category: '', tag: '', difficulty: '' };
                onFilterChange();
            });
        }
    }

    function applyFilters(recipes) {
        return recipes.filter(function(r) {
            var recipe = r.recipe || r;
            if (activeFilters.category && recipe.category !== activeFilters.category) return false;
            if (activeFilters.tag && !(recipe.tags || []).includes(activeFilters.tag)) return false;
            // difficulty only in full recipe — skip if not loaded
            return true;
        });
    }

    // ── Recipe fetching ───────────────────────────────────
    async function getFullRecipe(id) {
        if (fullRecipeCache[id]) return fullRecipeCache[id];
        try {
            var res = await fetch('data/recipes/' + id + '.json');
            if (!res.ok) return null;
            var recipe = await res.json();
            fullRecipeCache[id] = recipe;
            return recipe;
        } catch(e) { return null; }
    }

    async function getRecipeIngredientsText(id) {
        if (ingredientTextCache[id]) return ingredientTextCache[id];
        try {
            var res = await fetch('data/recipes/' + id + '.json');
            if (!res.ok) return '';
            var recipe = await res.json();
            var text = (recipe.ingredients || [])
                .filter(function(i) { return !i.heading; })
                .map(function(i) { return i.item || i.name || ''; })
                .join(' ');
            ingredientTextCache[id] = text;
            return text;
        } catch(e) { return ''; }
    }

    // ── Ingredient helpers ────────────────────────────────
    function getSignificantIngredients(recipe) {
        if (!recipe || !recipe.ingredients) return [];
        var result = [];
        recipe.ingredients.forEach(function(ing) {
            if (ing.heading) return;
            var item = (ing.item || ing.name || '').toLowerCase().trim();
            if (!item) return;
            var isStaple = PANTRY_STAPLES.some(function(s) {
                return s === item || item === s + 's' || item.includes(s);
            });
            if (!isStaple && result.indexOf(item) === -1) result.push(item);
        });
        return result;
    }

    function ingredientMatches(userIng, recipeIng) {
        if (recipeIng === userIng || recipeIng.includes(userIng) || userIng.includes(recipeIng)) return true;
        for (var primary in PRIMARY_INGREDIENTS) {
            var syns = PRIMARY_INGREDIENTS[primary];
            var userMatch = syns.some(function(s) { return userIng.includes(s) || s.includes(userIng); });
            var recipeMatch = syns.some(function(s) { return recipeIng.includes(s) || s.includes(recipeIng); });
            if (userMatch && recipeMatch) return true;
        }
        return false;
    }

    function hasMatchingPrimaryIngredient(userIngredient, recipeIngredients) {
        var userGroup = null;
        for (var primary in PRIMARY_INGREDIENTS) {
            if (PRIMARY_INGREDIENTS[primary].some(function(s) {
                return userIngredient.includes(s) || s.includes(userIngredient);
            })) { userGroup = primary; break; }
        }
        if (!userGroup) return true;
        var syns = PRIMARY_INGREDIENTS[userGroup];
        return recipeIngredients.some(function(ri) {
            return syns.some(function(s) { return ri.includes(s) || s.includes(ri); });
        });
    }

    function parseUserIngredients(input) {
        var lower = input.toLowerCase();
        var parts = lower.split(/[,&+]|\sand\s/).map(function(i) { return i.trim(); }).filter(function(i) { return i.length > 1; });
        if (parts.length === 1 && !input.includes(',') && !input.includes('and')) {
            parts = lower.split(/\s+/).slice(0, 5);
        }
        return parts.filter(function(ing) {
            return !PANTRY_STAPLES.some(function(s) { return s === ing || ing.includes(s); }) && ing.length > 1;
        }).filter(function(ing, idx, arr) { return arr.indexOf(ing) === idx; });
    }

    function calculateMatchForRecipe(userIngredients, recipeIngredients) {
        var matches = [], missing = [];
        userIngredients.forEach(function(u) {
            var found = recipeIngredients.some(function(r) { return ingredientMatches(u, r); });
            (found ? matches : missing).push(u);
        });
        return { score: Math.round((matches.length / userIngredients.length) * 100), matches: matches, missing: missing };
    }

    // ── Traditional search ────────────────────────────────
    async function traditionalSearch(query, terms) {
        await Promise.all(recipeIndex.map(function(r) { return getRecipeIngredientsText(r.id); }));

        var scored = recipeIndex.map(function(recipe) {
            var ingredients = ingredientTextCache[recipe.id] || '';
            var title       = (recipe.title || recipe.name || '').toLowerCase();
            var category    = (recipe.category || '').toLowerCase();
            var tags        = (recipe.tags || []).join(' ').toLowerCase();
            var description = (recipe.description || '').toLowerCase();
            var fullText    = [title, category, tags, description, ingredients].join(' ');

            var score = terms.reduce(function(acc, term) {
                // Exact matches
                if (title.includes(term))    return acc + 10;
                if (category.includes(term)) return acc + 5;
                if (tags.includes(term))     return acc + 4;
                if (fullText.includes(term)) return acc + 2;
                // Fuzzy matches (lower weight)
                if (fuzzyMatch(term, title))    return acc + 7;
                if (fuzzyMatch(term, fullText)) return acc + 1;
                return acc;
            }, 0);

            return { recipe: recipe, score: score };
        }).filter(function(s) { return s.score > 0; })
          .sort(function(a, b) { return b.score - a.score; });

        return applyFilters(scored);
    }

    // ── Ingredient search ─────────────────────────────────
    async function ingredientSearch(query, userIngredients) {
        var results = [];
        for (var i = 0; i < recipeIndex.length; i++) {
            var meta = recipeIndex[i];
            var full = await getFullRecipe(meta.id);
            if (!full) continue;
            var recipeIngs = getSignificantIngredients(full);
            var match = calculateMatchForRecipe(userIngredients, recipeIngs);
            if (match.score === 0) continue;
            if (userIngredients.length > 0 && !hasMatchingPrimaryIngredient(userIngredients[0], recipeIngs)) continue;
            results.push({ recipe: meta, fullRecipe: full, score: match.score, matches: match.matches.slice(), missing: match.missing.slice() });
        }
        results.sort(function(a, b) { return b.score - a.score; });
        return applyFilters(results);
    }

    // ── Render helpers ────────────────────────────────────
    function renderTraditionalResults(scored, query, countEl) {
        var resultsEl = document.getElementById('searchResults');
        if (countEl) {
            var filterNote = (activeFilters.category || activeFilters.tag) ? ' (filtered)' : '';
            countEl.textContent = scored.length + ' result' + (scored.length !== 1 ? 's' : '') + ' for "' + escHtml(query) + '"' + filterNote;
        }
        if (!scored.length) {
            resultsEl.innerHTML = '<p class="search-empty">No recipes found for "<strong>' + escHtml(query) + '</strong>". Try a different term or clear your filters.</p>';
            return;
        }
        var html = '<ul class="search-result-list">';
        scored.forEach(function(item) {
            var recipe = item.recipe;
            html += '<li class="search-result-entry">';
            html += '<h3><a href="recipe.html?id=' + encodeURIComponent(recipe.id) + '">' +
                highlightMatch(recipe.title || recipe.name || recipe.id, query) + '</a></h3>';
            if (recipe.description) {
                html += '<p>' + escHtml(recipe.description.slice(0, 140)) + (recipe.description.length > 140 ? '…' : '') + '</p>';
            }
            if (recipe.tags && recipe.tags.length) {
                html += '<div class="search-result-tags">';
                recipe.tags.slice(0, 5).forEach(function(t) {
                    html += '<a href="search.html?q=' + encodeURIComponent(t) + '" class="recipe-tag">#' + escHtml(t) + '</a>';
                });
                html += '</div>';
            }
            html += '</li>';
        });
        html += '</ul>';
        resultsEl.innerHTML = html;
    }

    function renderIngredientResults(results, query, countEl) {
        var resultsEl = document.getElementById('searchResults');
        if (countEl) countEl.textContent = results.length + ' result' + (results.length !== 1 ? 's' : '') + ' for "' + escHtml(query) + '"';
        if (!results.length) {
            resultsEl.innerHTML = '<p class="search-empty">No recipes found matching your ingredients. Include a main ingredient like <strong>chicken</strong>, <strong>beef</strong>, or <strong>prawns</strong>.</p>';
            return;
        }
        var html = '<ul class="search-result-list">';
        results.forEach(function(res) {
            var recipe = res.recipe;
            var full   = res.fullRecipe;
            html += '<li class="search-result-entry">';
            html += '<div class="ingredient-match-badge">' + res.score + '% ingredient match</div>';
            html += '<h3><a href="recipe.html?id=' + encodeURIComponent(recipe.id) + '">' + escHtml(recipe.title || recipe.name || recipe.id) + '</a></h3>';
            if (full.description) {
                html += '<p>' + escHtml(full.description.slice(0, 140)) + (full.description.length > 140 ? '…' : '') + '</p>';
            }
            html += '<div class="ingredient-match-details">';
            if (res.matches.length) {
                html += '<span class="match-have">You have:</span> ';
                res.matches.forEach(function(m) { html += '<span class="match-tag">' + escHtml(m) + '</span>'; });
            }
            if (res.missing.length) {
                html += '<span class="match-need">Need:</span> ';
                res.missing.forEach(function(m) { html += '<span class="missing-tag">' + escHtml(m) + '</span>'; });
            }
            html += '</div>';
            if (full.tags && full.tags.length) {
                html += '<div class="search-result-tags">';
                full.tags.slice(0, 5).forEach(function(t) {
                    html += '<a href="search.html?q=' + encodeURIComponent(t) + '" class="recipe-tag">#' + escHtml(t) + '</a>';
                });
                html += '</div>';
            }
            html += '</li>';
        });
        html += '</ul>';
        resultsEl.innerHTML = html;
    }

    function renderEmpty() {
        var resultsEl = document.getElementById('searchResults');
        if (!resultsEl) return;
        // Show favourites if any
        var favs = [];
        try { favs = JSON.parse(localStorage.getItem('ajpc_favourites') || '[]'); } catch(e) {}
        if (favs.length) {
            var favRecipes = recipeIndex.filter(function(r) { return favs.includes(r.id); });
            if (favRecipes.length) {
                var html = '<div class="search-favourites-header">Your Favourites</div>';
                html += '<ul class="search-result-list">';
                favRecipes.forEach(function(recipe) {
                    html += '<li class="search-result-entry">';
                    html += '<span class="fav-star">★</span>';
                    html += '<h3><a href="recipe.html?id=' + encodeURIComponent(recipe.id) + '">' + escHtml(recipe.title || recipe.name) + '</a></h3>';
                    if (recipe.description) html += '<p>' + escHtml(recipe.description.slice(0, 100)) + '…</p>';
                    html += '</li>';
                });
                html += '</ul>';
                resultsEl.innerHTML = html;
                return;
            }
        }
        resultsEl.innerHTML = '<p class="section-note">Enter your search terms above to begin.</p>';
    }

    // ── Main search runner ────────────────────────────────
    async function runSearch(query, resultsEl, countEl) {
        if (!query && !activeFilters.category && !activeFilters.tag) {
            if (countEl) countEl.textContent = '';
            renderEmpty();
            renderHistory();
            return;
        }

        // Filter-only (no query) — show all matching
        if (!query && (activeFilters.category || activeFilters.tag)) {
            var filtered = applyFilters(recipeIndex.map(function(r) { return { recipe: r, score: 1 }; }));
            renderTraditionalResults(filtered, '', countEl);
            return;
        }

        var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        var isIngredientSearch = query.includes(',') || query.includes(' and ') || terms.length > 3;

        if (isIngredientSearch) {
            var userIngredients = parseUserIngredients(query);
            if (!userIngredients.length) {
                if (countEl) countEl.textContent = '0 results';
                resultsEl.innerHTML = '<p class="search-empty">No significant ingredients found. Try "chicken, cream" or "beef, mushrooms".</p>';
                return;
            }
            var ingResults = await ingredientSearch(query, userIngredients);
            renderIngredientResults(ingResults, query, countEl);
        } else {
            var tradResults = await traditionalSearch(query, terms);
            renderTraditionalResults(tradResults, query, countEl);
        }

        addToHistory(query);
        renderHistory();
    }

    // ── Popular tags ──────────────────────────────────────
    async function loadPopularTags() {
        var container = document.getElementById('popularTagsList');
        if (!container) return;
        try {
            var tagCounts = {};
            recipeIndex.forEach(function(r) {
                (r.tags || []).forEach(function(t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
            });
            var topTags = Object.entries(tagCounts).sort(function(a,b) { return b[1]-a[1]; }).slice(0,15).map(function(e) { return e[0]; });
            container.innerHTML = topTags.map(function(tag) {
                return '<a href="search.html?q=' + encodeURIComponent(tag) + '" class="popular-tag">#' + escHtml(tag) + '</a>';
            }).join('');
        } catch(e) {
            container.innerHTML = '';
        }
    }

    // ── Highlight ─────────────────────────────────────────
    function highlightMatch(text, query) {
        var safe  = escHtml(text);
        var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        terms.forEach(function(term) {
            var idx = safe.toLowerCase().indexOf(term);
            if (idx === -1) return;
            safe = safe.slice(0, idx) +
                '<mark class="search-highlight">' + safe.slice(idx, idx + term.length) + '</mark>' +
                safe.slice(idx + term.length);
        });
        return safe;
    }

    function escHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── Init ──────────────────────────────────────────────
    async function init() {
        var searchInput = document.getElementById('searchInput');
        var resultsEl   = document.getElementById('searchResults');
        var countEl     = document.getElementById('resultsCount');
        if (!searchInput || !resultsEl) return;

        try {
            var res = await fetch('json/recipe-index.json?t=' + Date.now());
            if (res.ok) recipeIndex = await res.json();
        } catch(e) { recipeIndex = []; }

        initFilters();
        loadPopularTags();
        renderHistory();

        // URL param pre-fill
        var params = new URLSearchParams(window.location.search);
        var q = params.get('q') || '';
        if (q) {
            searchInput.value = q;
            await runSearch(q, resultsEl, countEl);
        } else {
            renderEmpty();
        }

        var timer = null;
        searchInput.addEventListener('input', function() {
            clearTimeout(timer);
            timer = setTimeout(async function() {
                var val = searchInput.value.trim();
                history.replaceState(null, '', val ? '?q=' + encodeURIComponent(val) : window.location.pathname);
                await runSearch(val, resultsEl, countEl);
            }, 250);
        });

        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') { searchInput.value = ''; runSearch('', resultsEl, countEl); }
        });
    }

    // Expose clearHistory globally for the inline onclick
    window.clearHistory = clearHistory;

})();
