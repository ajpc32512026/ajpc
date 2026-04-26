/* =========================================================
   FEATURED RECIPES ROTATOR — AJPC Kitchen Notebook
   Loads from recipe-index.json, rotates weekly.
   Fixed: no hardcoded list, reads live index.
========================================================= */

(function () {
    'use strict';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    async function init() {
        const grid = document.querySelector('.recipe-grid');
        if (!grid) return;

        grid.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Loading featured recipes...</p></div>';

        try {
            const res = await fetch('json/recipe-index.json');
            if (!res.ok) throw new Error('Could not load recipe index');
            const all = await res.json();

            // Weekly seed so the set changes each week but is consistent within the week
            const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
            const featured = seededShuffle(all, week).slice(0, 3);

            grid.innerHTML = featured.map(r => renderCard(r)).join('');
        } catch (err) {
            console.warn('[featured-rotator]', err);
            grid.innerHTML = '<p style="color:var(--cream-muted);text-align:center;grid-column:1/-1;">Featured recipes unavailable.</p>';
        }
    }

    function renderCard(r) {
        const cat = r.category || 'Recipe';
        const desc = r.description || 'A favourite from the kitchen notebook.';
        const title = r.title || r.id || 'Recipe';
        return `<a href="recipe.html?id=${encodeURIComponent(r.id)}" class="recipe-card">
            <div class="recipe-card-tag">${escHtml(cat)}</div>
            <h3>${escHtml(title)}</h3>
            <p>${escHtml(desc.slice(0, 110))}${desc.length > 110 ? '...' : ''}</p>
            <span class="recipe-card-arrow">View recipe &rarr;</span>
        </a>`;
    }

    // Simple deterministic shuffle using a numeric seed
    function seededShuffle(arr, seed) {
        const copy = [...arr];
        let s = seed;
        for (let i = copy.length - 1; i > 0; i--) {
            s = (s * 1664525 + 1013904223) & 0xffffffff;
            const j = Math.abs(s) % (i + 1);
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

})();
