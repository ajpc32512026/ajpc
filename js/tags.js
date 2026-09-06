/* =========================================================
   TAGS — The Kitchen Notebook
   Renders a grouped tag cloud: tags are classified into types
   (meal, diet, cuisine, method, time, ingredient, style) so
   related tags sit together instead of one flat frequency list.
   All tags link to search.html?q=tag

   The tag -> group classification used to be a hardcoded TAXONOMY
   object here, maintained independently of official-tag-vocabulary.json
   and the Master Maintenance Suite's own category list. Three
   separate copies of "what group does this tag belong to" meant
   they could silently drift apart. This now builds its classification
   map at runtime from official-tag-vocabulary.json's own tagVocabulary
   object, so there is exactly one place that decides tag groupings.
========================================================= */

(function () {
    'use strict';

    // official-tag-vocabulary.json has 13 finer-grained groups
    // (tagVocabulary keys); this page only has room for 8 broad visual
    // buckets. GROUP_KEY_MAP folds the former into the latter. This is
    // the one piece of grouping logic that still lives here rather than
    // in the vocabulary file itself — it's about this page's layout, not
    // about what a tag "is", so it stays close to the code that uses it.
    var GROUP_KEY_MAP = {
        mealType: 'meal',
        style: 'meal',            // official "style" = dish/format words (Bread, Cake, Sauce, Pastry) — same bucket as mealType here
        dietary: 'diet',
        cuisine: 'cuisine',
        cookingMethod: 'method',
        technique: 'style',       // Lamination, Multigrain, Puff Pastry, Seeded
        time: 'time',
        keyIngredients: 'ingredient',
        protein: 'ingredient',
        specificCheeses: 'ingredient',
        specificLiqueurs: 'ingredient',
        characteristics: 'style',
        occasion: 'style'
    };

    // Built by buildTaxonomy() once official-tag-vocabulary.json loads.
    // A tag not found here (used on a recipe but never added to the
    // official vocabulary) falls into "other" — that's not a bug to
    // patch around, it's the page surfacing real drift, the same drift
    // the Master Maintenance Suite's orphan-tag check flags for fixing
    // at the source.
    var TAXONOMY = {};

    function buildTaxonomy(vocabData) {
        var map = {};
        var groups = (vocabData && vocabData.tagVocabulary) || {};
        Object.keys(groups).forEach(function (vocabKey) {
            var bucket = GROUP_KEY_MAP[vocabKey];
            if (!bucket) return; // an official group with nowhere mapped yet — falls to "other" rather than being silently dropped
            (groups[vocabKey] || []).forEach(function (tag) {
                map[String(tag).toLowerCase()] = bucket;
            });
        });
        return map;
    }

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

        // The vocabulary drives the grouping, so a failure here shouldn't
        // block the page — it just means every tag falls into "Other"
        // instead of nothing rendering at all.
        try {
            var vocabRes = await fetch('json/official-tag-vocabulary.json?t=' + Date.now());
            if (vocabRes.ok) TAXONOMY = buildTaxonomy(await vocabRes.json());
        } catch (e) {
            console.error('Could not load official-tag-vocabulary.json — tags will be ungrouped:', e);
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
