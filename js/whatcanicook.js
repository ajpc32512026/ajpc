/* =========================================================
   WHAT CAN I COOK — The Kitchen Notebook
   Scans every recipe in json/recipe-index.json, fetches each
   recipe's full ingredient list from data/recipes/<id>.json,
   and runs it through Pantry.analyseRecipe() (already built
   and used by the shopping list) to see what's actually
   cookable right now with what's in the pantry.

   Depends on: pantry.js (window.KitchenNotebook.Pantry)
========================================================= */

(function () {
    'use strict';

    var RECIPE_PATH = 'data/recipes/';
    var allResults = [];
    var currentFilter = 'all';

    // Kept in sync automatically now — reads from pantry.js's
    // Pantry.EXCLUDE_ITEMS (the one real source of truth) instead of
    // keeping its own separate copy, which is what caused this page to
    // disagree with the recipe page about water in the first place.
    var EXCLUDE_ITEMS_FALLBACK = ['water', 'hot water', 'cold water', 'warm water', 'boiling water', 'tap water', 'ice-cold water', 'salt', 'pepper', 'black pepper', 'white pepper', 'to taste'];

    function pantryApi() {
        return window.KitchenNotebook && window.KitchenNotebook.Pantry;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    async function init() {
        var container = document.getElementById('cookResults');
        var statusEl = document.getElementById('cookStatus');
        var Pantry = pantryApi();

        if (!Pantry) {
            if (container) container.innerHTML = '<p class="cook-empty">Pantry data isn\'t available on this page.</p>';
            return;
        }
        if (!Pantry.list().length) {
            if (container) container.innerHTML = '<p class="cook-empty">Your pantry is empty — add what you have on the <a href="pantry.html">Pantry page</a> first, then come back here.</p>';
            if (statusEl) statusEl.textContent = '';
            return;
        }

        var index = [];
        try {
            var res = await fetch('json/recipe-index.json?t=' + Date.now());
            if (res.ok) index = await res.json();
        } catch (e) {
            if (container) container.innerHTML = '<p class="cook-empty">Could not load the recipe index.</p>';
            return;
        }

        var excludeItems = Pantry.EXCLUDE_ITEMS || EXCLUDE_ITEMS_FALLBACK;

        if (statusEl) statusEl.textContent = 'Checking ' + index.length + ' recipes against your pantry…';

        // Fetch every recipe's full ingredient list in parallel. Uses
        // allSettled rather than all() so one missing/broken recipe file
        // doesn't take down the whole scan — it's just skipped.
        var settled = await Promise.allSettled(index.map(function (r) {
            return fetch(RECIPE_PATH + r.id + '.json?t=' + Date.now()).then(function (res) {
                if (!res.ok) throw new Error('fetch failed for ' + r.id);
                return res.json();
            });
        }));

        allResults = [];
        settled.forEach(function (outcome, i) {
            if (outcome.status !== 'fulfilled') return;
            var full = outcome.value;
            var ingredients = (full.ingredients || []).filter(function (ing) {
                if (ing.heading || ing.toTaste) return true; // let analyseRecipe handle these as it already does
                var name = (ing.item || ing.name || '').toLowerCase().trim();
                return !excludeItems.includes(name);
            });
            var analysis = Pantry.analyseRecipe(ingredients);
            allResults.push({
                id: index[i].id,
                title: index[i].title || full.title || index[i].id,
                category: index[i].category || full.category || '',
                buy: analysis.buy,
                low: analysis.low,
                subs: analysis.subs
            });
        });

        renderFilters();
        render();
    }

    // Buckets a recipe by how close it is to cookable:
    //   ready  — have everything, nothing running low
    //   close  — have everything, but something's low (may still be plenty)
    //   almost — missing 1–3 ingredients
    //   far    — missing 4+
    function bucketOf(r) {
        if (r.buy.length === 0 && r.low.length === 0) return 'ready';
        if (r.buy.length === 0) return 'close';
        if (r.buy.length <= 3) return 'almost';
        return 'far';
    }

    function countBuckets() {
        var counts = { ready: 0, close: 0, almost: 0, far: 0 };
        allResults.forEach(function (r) { counts[bucketOf(r)]++; });
        return counts;
    }

    function renderFilters() {
        var bar = document.getElementById('cookFilters');
        if (!bar) return;
        var counts = countBuckets();
        var defs = [
            { key: 'all',    label: 'All (' + allResults.length + ')' },
            { key: 'ready',  label: 'Ready Now (' + counts.ready + ')' },
            { key: 'close',  label: 'Running Low (' + counts.close + ')' },
            { key: 'almost', label: 'Almost There (' + counts.almost + ')' },
            { key: 'far',    label: 'Need Shopping (' + counts.far + ')' }
        ];
        bar.innerHTML = defs.map(function (d) {
            return '<button class="cook-filter-btn' + (d.key === 'all' ? ' active' : '') + '" data-filter="' + d.key + '">' + d.label + '</button>';
        }).join('');

        bar.addEventListener('click', function (e) {
            var btn = e.target.closest('.cook-filter-btn');
            if (!btn) return;
            currentFilter = btn.dataset.filter;
            bar.querySelectorAll('.cook-filter-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
            render();
        });
    }

    function render() {
        var container = document.getElementById('cookResults');
        var statusEl = document.getElementById('cookStatus');
        if (!container) return;

        var filtered = allResults.filter(function (r) {
            return currentFilter === 'all' || bucketOf(r) === currentFilter;
        });
        filtered.sort(function (a, b) {
            return (a.buy.length + a.low.length) - (b.buy.length + b.low.length) || a.title.localeCompare(b.title);
        });

        var counts = countBuckets();
        if (statusEl) {
            statusEl.textContent = counts.ready + ' of ' + allResults.length + ' recipes are ready to cook right now with nothing to buy.';
        }

        if (!filtered.length) {
            container.innerHTML = '<p class="cook-empty">No recipes in this group.</p>';
            return;
        }

        container.innerHTML = filtered.map(function (r) {
            var b = r.buy.length === 0 && r.low.length === 0 ? 'ready'
                  : r.buy.length === 0 ? 'close'
                  : r.buy.length <= 3 ? 'almost' : 'far';
            var badge = b === 'ready' ? 'Ready to cook'
                      : b === 'close' ? 'Have it — some running low'
                      : 'Missing ' + r.buy.length + ' item' + (r.buy.length !== 1 ? 's' : '');

            var missingList = r.buy.length
                ? '<div class="cook-card-missing">Missing: ' + r.buy.map(function (ing) { return escHtml(ing.item || ing.name || ''); }).join(', ') + '</div>'
                : '';
            var subsList = r.subs.length
                ? '<div class="cook-card-subs">Substitute available: ' + r.subs.map(function (s) { return escHtml(s.ingredient) + ' → ' + escHtml(s.useInstead); }).join(', ') + '</div>'
                : '';

            return '<a class="cook-card cook-card-' + b + '" href="recipe.html?id=' + encodeURIComponent(r.id) + '">'
                + '<div class="cook-card-header">'
                + '<span class="cook-card-title">' + escHtml(r.title) + '</span>'
                + '<span class="cook-card-badge cook-card-badge-' + b + '">' + escHtml(badge) + '</span>'
                + '</div>'
                + (r.category ? '<div class="cook-card-category">' + escHtml(r.category) + '</div>' : '')
                + missingList + subsList
                + '</a>';
        }).join('');
    }

    function escHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

})();
