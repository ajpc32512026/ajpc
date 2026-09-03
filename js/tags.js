/* =========================================================
   TAGS — The Kitchen Notebook
   Renders a grouped tag cloud: tags are classified into types
   (meal, diet, cuisine, method, time, ingredient, style) so
   related tags sit together instead of one flat frequency list.
   All tags link to search.html?q=tag
========================================================= */

(function () {
    'use strict';

    // ---- Taxonomy: tag (lowercase) -> group key --------------------
    // Anything not listed here falls into the "other" group, so new
    // tags never disappear — they just show up unsorted until added.
    var TAXONOMY = {
        // Diet
        'vegetarian': 'diet', 'vegan': 'diet', 'gluten-free': 'diet', 'dairy-free': 'diet',

        // Meal & dish type
        'dinner': 'meal', 'lunch': 'meal', 'breakfast': 'meal', 'dessert': 'meal', 'snack': 'meal',
        'main course': 'meal', 'entree': 'meal', 'soup': 'meal', 'condiment': 'meal', 'sauce': 'meal',
        'bread': 'meal', 'cake': 'meal', 'pastry': 'meal', 'cookies': 'meal', 'curry': 'meal',
        'noodles': 'meal', 'pasta': 'meal', 'muffins': 'meal', 'biscuits': 'meal',

        // Cuisine
        'australian': 'cuisine', 'french': 'cuisine', 'american': 'cuisine', 'italian': 'cuisine',
        'asian': 'cuisine', 'chinese': 'cuisine', 'filipino': 'cuisine', 'indian': 'cuisine',
        'japanese': 'cuisine', 'thai': 'cuisine', 'british': 'cuisine', 'european': 'cuisine',
        'mexican': 'cuisine', 'middle eastern': 'cuisine', 'german': 'cuisine', 'jamaican': 'cuisine',
        'russian': 'cuisine', 'swedish': 'cuisine', 'turkish': 'cuisine', 'ukrainian': 'cuisine',
        'austrian': 'cuisine', 'bistro': 'cuisine',

        // Cooking method
        'baked': 'method', 'baking': 'method', 'slow-cooked': 'method', 'stir-fried': 'method',
        'deep-fried': 'method', 'air-fried': 'method', 'air fryer': 'method', 'overnight': 'method',
        'microwave': 'method', 'no-bake': 'method', 'make ahead': 'method', 'freezer friendly': 'method',
        'no oil': 'method',
        // 'Make Ahead' and 'Make-Ahead' both exist as separate tag strings in
        // recipe-index.json (a data hygiene issue, not a code one — worth a
        // find/replace across recipe JSON files to pick one spelling).
        // Mapped here too so they at least group together meanwhile.
        'make-ahead': 'method',

        // Time — sorted by minutes below, not alphabetically
        'under 10 minutes': 'time', 'under 15 minutes': 'time',
        'under 30 minutes': 'time', 'under 1 hour': 'time',

        // Main ingredient
        'chicken': 'ingredient', 'beef': 'ingredient', 'pork': 'ingredient', 'seafood': 'ingredient',
        'lamb': 'ingredient', 'veal': 'ingredient', 'fish': 'ingredient', 'coconut': 'ingredient',
        'lemon': 'ingredient', 'orange': 'ingredient', 'citrus': 'ingredient', 'tomato': 'ingredient',
        'garlic': 'ingredient', 'fruit': 'ingredient', 'chocolate': 'ingredient', 'banana': 'ingredient',
        'pineapple': 'ingredient', 'cherry': 'ingredient', 'carrot': 'ingredient', 'cheese': 'ingredient',
        'apricot': 'ingredient', 'rice': 'ingredient', 'multigrain': 'ingredient', 'cinnamon': 'ingredient',
        'butter': 'ingredient', 'caramel': 'ingredient', 'coffee': 'ingredient',
        'alcohol': 'ingredient', 'brandy': 'ingredient',

        // Style, texture & occasion
        'savoury': 'style', 'classic': 'style', 'sweet': 'style', 'rich': 'style', 'creamy': 'style',
        'spicy': 'style', 'easy': 'style', 'party': 'style', 'crispy': 'style', 'crusty': 'style',
        'comfort food': 'style', 'hearty': 'style', 'healthy': 'style', 'retro': 'style',
        'seeded': 'style', 'single serve': 'style', 'sourdough style': 'style',
        'bakery-style': 'style', 'artisan': 'style', 'quick': 'style', 'saucy': 'style'
    };

    TAXONOMY['southern'] = 'cuisine';
    TAXONOMY['stew'] = 'meal';

    var GROUPS = [
        { key: 'meal',       label: 'Meal & Dish Type' },
        { key: 'diet',       label: 'Diet' },
        { key: 'cuisine',    label: 'Cuisine' },
        { key: 'method',     label: 'Cooking Method' },
        { key: 'time',       label: 'Time' },
        { key: 'ingredient', label: 'Main Ingredient' },
        { key: 'style',      label: 'Style & Occasion' },
        { key: 'other',      label: 'Other' }
    ];

    var TIME_MINUTES = {
        'under 10 minutes': 10,
        'under 15 minutes': 15,
        'under 30 minutes': 30,
        'under 1 hour': 60
    };

    function classify(tag) {
        return TAXONOMY[String(tag).toLowerCase()] || 'other';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    async function init() {
        var container = document.getElementById('tagCloud');
        var countEl   = document.getElementById('tagCount');
        if (!container) return;

        var index = [];
        try {
            var res = await fetch('json/recipe-index.json?t=' + Date.now());
            if (res.ok) index = await res.json();
        } catch (e) {
            container.innerHTML = '<p class="tracker-empty">Could not load recipe index.</p>';
            return;
        }

        window._tagIndex = index;
        renderGroupedCloud(index);

        // Category filter buttons (recipe category, e.g. Dinner / Dessert)
        var catContainer = document.getElementById('tagCategories');
        if (catContainer) {
            var cats = [...new Set(index.map(function (r) { return r.category; }).filter(Boolean))].sort();
            var catHtml = '<button class="tag-cat-btn active" onclick="filterTagsByCategory(null, this)">All</button>';
            cats.forEach(function (c) {
                catHtml += '<button class="tag-cat-btn" onclick="filterTagsByCategory(\'' + escAttr(c) + '\', this)">' + escHtml(c) + '</button>';
            });
            catContainer.innerHTML = catHtml;
        }
    }

    // Build counts from a recipe list, then render as grouped sections
    function renderGroupedCloud(recipes) {
        var container = document.getElementById('tagCloud');
        var countEl   = document.getElementById('tagCount');
        if (!container) return;

        var counts = {};
        recipes.forEach(function (r) {
            (r.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
        });

        var allTags = Object.keys(counts);
        if (countEl) countEl.textContent = allTags.length + ' tags across ' + recipes.length + ' recipes';

        // Bucket tags by group
        var buckets = {};
        GROUPS.forEach(function (g) { buckets[g.key] = []; });
        allTags.forEach(function (tag) {
            buckets[classify(tag)].push([tag, counts[tag]]);
        });

        var minSize = 0.85, maxSize = 1.55;
        var html = '';

        GROUPS.forEach(function (g) {
            var entries = buckets[g.key];
            if (!entries.length) return;

            // Time group: order by actual minutes, not frequency
            if (g.key === 'time') {
                entries.sort(function (a, b) {
                    return (TIME_MINUTES[a[0].toLowerCase()] || 999) - (TIME_MINUTES[b[0].toLowerCase()] || 999);
                });
            } else {
                entries.sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
            }

            var maxCnt = entries.reduce(function (m, e) { return Math.max(m, e[1]); }, 1);
            var minCnt = entries.reduce(function (m, e) { return Math.min(m, e[1]); }, maxCnt);

            html += '<div class="tag-group" data-group="' + g.key + '">' +
                '<h2 class="tag-group-label">' + escHtml(g.label) + '<span class="tag-group-count">' + entries.length + '</span></h2>' +
                '<div class="tag-group-items">' +
                entries.map(function (entry) {
                    var tag = entry[0], count = entry[1];
                    var size = g.key === 'time'
                        ? 1.1
                        : minSize + ((count - minCnt) / Math.max(maxCnt - minCnt, 1)) * (maxSize - minSize);
                    return '<a href="search.html?q=' + encodeURIComponent(tag) + '" ' +
                        'class="tag-cloud-item" ' +
                        'style="--tag-size:' + size.toFixed(2) + 'rem" ' +
                        'title="' + count + ' recipe' + (count !== 1 ? 's' : '') + '">' +
                        escHtml(tag) +
                        '<span class="tag-cloud-count">' + count + '</span>' +
                        '</a>';
                }).join('') +
                '</div></div>';
        });

        container.innerHTML = html;
    }

    // Filter to a specific recipe category, keeping the grouped layout
    window.filterTagsByCategory = function (category, btn) {
        var index = window._tagIndex || [];
        var countEl = document.getElementById('tagCount');

        document.querySelectorAll('.tag-cat-btn').forEach(function (b) { b.classList.remove('active'); });
        if (btn) btn.classList.add('active');

        var filtered = category ? index.filter(function (r) { return r.category === category; }) : index;
        renderGroupedCloud(filtered);

        if (countEl && category) {
            var current = countEl.textContent.replace(/across.*/, 'in ' + category);
            countEl.textContent = current;
        }
    };

    function escHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function escAttr(str) {
        return String(str || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    }

})();
