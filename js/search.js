/* =========================================================
   SEARCH — AJPC Kitchen Notebook
   Full text search against recipe-index.json
   with ingredient lookup from individual recipe files.
   Fixed: ingredient search, multi-term highlighting,
   zero-result count, tag link paths.
========================================================= */

(function () {
    'use strict';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Cache for recipe ingredients — populated on demand
    var ingredientCache = {};

    async function init() {
        var searchInput = document.getElementById('searchInput');
        var resultsEl   = document.getElementById('searchResults');
        var countEl     = document.getElementById('resultsCount');
        if (!searchInput || !resultsEl) return;

        var index = [];

        try {
            var res = await fetch('json/recipe-index.json');
            if (res.ok) index = await res.json();
        } catch(e) { index = []; }

        // Pre-fill from URL query param
        var params = new URLSearchParams(window.location.search);
        var q = params.get('q') || '';
        if (q) {
            searchInput.value = q;
            await runSearch(q, index, resultsEl, countEl);
        }

        var timer = null;
        searchInput.addEventListener('input', function() {
            clearTimeout(timer);
            timer = setTimeout(async function() {
                var val = searchInput.value.trim();
                history.replaceState(null, '', val ? '?q=' + encodeURIComponent(val) : window.location.pathname);
                await runSearch(val, index, resultsEl, countEl);
            }, 200);
        });

        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') searchInput.value = '';
        });
    }

    async function getRecipeIngredients(id) {
        if (ingredientCache[id]) return ingredientCache[id];
        try {
            var res = await fetch('data/recipes/' + id + '.json');
            if (!res.ok) return '';
            var recipe = await res.json();
            var ingredients = (recipe.ingredients || [])
                .filter(function(i) { return !i.heading; })
                .map(function(i) { return i.item || i.name || ''; })
                .join(' ');
            ingredientCache[id] = ingredients;
            return ingredients;
        } catch(e) {
            return '';
        }
    }

    async function runSearch(query, index, resultsEl, countEl) {
        if (!query) {
            resultsEl.innerHTML = '<p style="color:var(--cream-muted);">Enter a recipe name, ingredient or tag to search.</p>';
            if (countEl) countEl.textContent = '';
            return;
        }

        var terms = query.toLowerCase().split(/\s+/).filter(Boolean);

        // Fetch ingredients for all recipes in parallel
        await Promise.all(index.map(function(recipe) {
            return getRecipeIngredients(recipe.id);
        }));

        var scored = index.map(function(recipe) {
            var ingredients = ingredientCache[recipe.id] || '';

            var text = [
                recipe.title || '',
                recipe.category || '',
                (recipe.tags || []).join(' '),
                recipe.description || '',
                ingredients
            ].join(' ').toLowerCase();

            var score = terms.reduce(function(acc, term) {
                if ((recipe.title || '').toLowerCase().indexOf(term) !== -1) return acc + 10;
                if ((recipe.category || '').toLowerCase().indexOf(term) !== -1) return acc + 5;
                if ((recipe.tags || []).some(function(t) { return t.toLowerCase().indexOf(term) !== -1; })) return acc + 4;
                if (text.indexOf(term) !== -1) return acc + 2;
                return acc;
            }, 0);

            return { recipe: recipe, score: score };
        }).filter(function(s) { return s.score > 0; }).sort(function(a, b) { return b.score - a.score; });

        if (countEl) {
            var count = scored.length;
            countEl.textContent = count + ' result' + (count !== 1 ? 's' : '') + ' for "' + escHtml(query) + '"';
        }

        if (!scored.length) {
            resultsEl.innerHTML = '<p style="color:var(--cream-muted);">No recipes found for "<strong style="color:var(--cream);">' + escHtml(query) + '</strong>". Try a different term.</p>';
            return;
        }

        resultsEl.innerHTML = '<ul class="search-result-list">' +
            scored.map(function(s) {
                var r = s.recipe;
                return '<li class="search-result-entry">' +
                    '<h3><a href="recipe.html?id=' + encodeURIComponent(r.id) + '">' + highlightMatch(r.title || r.id, query) + '</a></h3>' +
                    (r.description ? '<p>' + escHtml(r.description.slice(0, 140)) + (r.description.length > 140 ? '...' : '') + '</p>' : '') +
                    (r.tags && r.tags.length ?
                        '<div class="search-result-tags">' +
                            r.tags.slice(0, 5).map(function(t) {
                                return '<a href="search.html?q=' + encodeURIComponent(t) + '" class="recipe-tag">#' + escHtml(t) + '</a>';
                            }).join('') +
                        '</div>' : '') +
                '</li>';
            }).join('') +
        '</ul>';
    }

    function highlightMatch(text, query) {
        var safe = escHtml(text);
        var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (!terms.length) return safe;

        var result = safe;
        for (var i = 0; i < terms.length; i++) {
            var term = escHtml(terms[i]);
            var lower = result.toLowerCase();
            var idx = lower.indexOf(term.toLowerCase());
            if (idx === -1) continue;
            result = result.slice(0, idx) +
                '<mark style="background:rgba(201,125,62,0.25);color:var(--cream);border-radius:2px;">' + result.slice(idx, idx + term.length) + '</mark>' +
                result.slice(idx + term.length);
        }
        return result;
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

})();