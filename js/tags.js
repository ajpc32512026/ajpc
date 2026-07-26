/* =========================================================
   TAGS — KitchenNotebook Kitchen Notebook
   Renders a tag cloud sized by frequency.
   All tags link to search.html?q=tag
========================================================= */

(function () {
    'use strict';

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
        } catch(e) {
            container.innerHTML = '<p class="tracker-empty">Could not load recipe index.</p>';
            return;
        }

        // Count tags
        var counts = {};
        index.forEach(function (r) {
            (r.tags || []).forEach(function (t) {
                counts[t] = (counts[t] || 0) + 1;
            });
        });

        var tags   = Object.entries(counts).sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
        var maxCnt = tags[0] ? tags[0][1] : 1;
        var minCnt = tags[tags.length - 1] ? tags[tags.length - 1][1] : 1;

        if (countEl) countEl.textContent = tags.length + ' tags across ' + index.length + ' recipes';

        // Size scale: font-size 0.8rem (count=1) → 1.8rem (count=max)
        var minSize = 0.8, maxSize = 1.8;

        var html = tags.map(function (entry) {
            var tag   = entry[0];
            var count = entry[1];
            var size  = minSize + ((count - minCnt) / (Math.max(maxCnt - minCnt, 1))) * (maxSize - minSize);
            var weight = count >= maxCnt * 0.7 ? '600' : '400';
            return '<a href="search.html?q=' + encodeURIComponent(tag) + '" ' +
                'class="tag-cloud-item" ' +
                'style="--tag-size:' + size.toFixed(2) + 'rem" data-weight="' + weight + '"' +
                'title="' + count + ' recipe' + (count !== 1 ? 's' : '') + '" ' +
                'data-count="' + count + '">' +
                escHtml(tag) +
                '<span class="tag-cloud-count">' + count + '</span>' +
            '</a>';
        }).join('');

        container.innerHTML = html;

        // Category filter buttons
        var catContainer = document.getElementById('tagCategories');
        if (catContainer) {
            var cats = [...new Set(index.map(function(r) { return r.category; }).filter(Boolean))].sort();
            var catHtml = '<button class="tag-cat-btn active" onclick="filterTagsByCategory(null, this)">All</button>';
            cats.forEach(function (c) {
                catHtml += '<button class="tag-cat-btn" onclick="filterTagsByCategory(\'' + escAttr(c) + '\', this)">' + escHtml(c) + '</button>';
            });
            catContainer.innerHTML = catHtml;
        }

        // Store index for filtering
        window._tagIndex = index;
        window._tagCounts = counts;
    }

    // Filter cloud to only show tags used in a specific category
    window.filterTagsByCategory = function (category, btn) {
        var index  = window._tagIndex || [];
        var countEl = document.getElementById('tagCount');

        // Update active button
        document.querySelectorAll('.tag-cat-btn').forEach(function (b) { b.classList.remove('active'); });
        if (btn) btn.classList.add('active');

        var filtered = category ? index.filter(function (r) { return r.category === category; }) : index;
        var counts   = {};
        filtered.forEach(function (r) {
            (r.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
        });

        var tags   = Object.entries(counts).sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
        var maxCnt = tags[0] ? tags[0][1] : 1;
        var minCnt = tags[tags.length - 1] ? tags[tags.length - 1][1] : 1;
        var minSize = 0.8, maxSize = 1.8;

        if (countEl) countEl.textContent = tags.length + ' tags in ' + (category || 'all categories');

        var container = document.getElementById('tagCloud');
        if (!container) return;
        container.innerHTML = tags.map(function (entry) {
            var tag   = entry[0];
            var count = entry[1];
            var size  = minSize + ((count - minCnt) / (Math.max(maxCnt - minCnt, 1))) * (maxSize - minSize);
            return '<a href="search.html?q=' + encodeURIComponent(tag) + '" ' +
                'class="tag-cloud-item" ' +
                'style="--tag-size:' + size.toFixed(2) + 'rem"' +
                'title="' + count + ' recipe' + (count !== 1 ? 's' : '') + '">' +
                escHtml(tag) +
                '<span class="tag-cloud-count">' + count + '</span>' +
            '</a>';
        }).join('');
    };

    function escHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function escAttr(str) {
        return String(str || '').replace(/'/g,'&#39;').replace(/"/g,'&quot;');
    }

})();
