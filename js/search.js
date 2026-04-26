/* =========================================================
   SEARCH — AJPC Kitchen Notebook
   Full text search against recipe-index.json.
   Fixed: single consolidated file, no phantom deps.
========================================================= */

(function () {
    'use strict';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    async function init() {
        const searchInput  = document.getElementById('searchInput');
        const resultsEl    = document.getElementById('searchResults');
        const countEl      = document.getElementById('resultsCount');
        if (!searchInput || !resultsEl) return;

        let index = [];

        try {
            const res = await fetch('json/recipe-index.json');
            if (res.ok) index = await res.json();
        } catch { index = []; }

        // Pre-fill from URL query param
        const params = new URLSearchParams(window.location.search);
        const q = params.get('q') || '';
        if (q) {
            searchInput.value = q;
            runSearch(q, index, resultsEl, countEl);
        }

        let timer = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const val = searchInput.value.trim();
                history.replaceState(null, '', val ? `?q=${encodeURIComponent(val)}` : window.location.pathname);
                runSearch(val, index, resultsEl, countEl);
            }, 200);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') searchInput.value = '';
        });
    }

    function runSearch(query, index, resultsEl, countEl) {
        if (!query) {
            resultsEl.innerHTML = '<p style="color:var(--cream-muted);">Enter a recipe name, ingredient or tag to search.</p>';
            if (countEl) countEl.textContent = '';
            return;
        }

        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

        const scored = index.map(recipe => {
            const text = [
                recipe.title || '',
                recipe.category || '',
                (recipe.tags || []).join(' '),
                recipe.description || '',
                (recipe.ingredients || []).map(i => i.item || i.name || i).join(' '),
            ].join(' ').toLowerCase();

            const score = terms.reduce((acc, term) => {
                if ((recipe.title || '').toLowerCase().includes(term)) return acc + 10;
                if ((recipe.category || '').toLowerCase().includes(term)) return acc + 5;
                if ((recipe.tags || []).some(t => t.toLowerCase().includes(term))) return acc + 4;
                if (text.includes(term)) return acc + 1;
                return acc;
            }, 0);

            return { recipe, score };
        }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

        if (countEl) {
            countEl.textContent = scored.length
                ? `${scored.length} result${scored.length !== 1 ? 's' : ''} for "${escHtml(query)}"`
                : '';
        }

        if (!scored.length) {
            resultsEl.innerHTML = `<p style="color:var(--cream-muted);">No recipes found for "<strong style="color:var(--cream);">${escHtml(query)}</strong>". Try a different term.</p>`;
            return;
        }

        resultsEl.innerHTML = `<ul class="search-result-list">
            ${scored.map(({ recipe: r }) => `
                <li class="search-result-entry">
                    <h3><a href="recipe.html?id=${encodeURIComponent(r.id)}">${highlightMatch(r.title || r.id, query)}</a></h3>
                    ${r.description ? `<p>${escHtml(r.description.slice(0, 140))}${r.description.length > 140 ? '...' : ''}</p>` : ''}
                    ${r.tags && r.tags.length ? `
                        <div class="search-result-tags">
                            ${r.tags.slice(0, 5).map(t =>
                                `<a href="?q=${encodeURIComponent(t)}" class="recipe-tag">#${escHtml(t)}</a>`
                            ).join('')}
                        </div>` : ''}
                </li>`
            ).join('')}
        </ul>`;
    }

    function highlightMatch(text, query) {
        const safe = escHtml(text);
        const term = escHtml(query.split(' ')[0]);
        const idx = safe.toLowerCase().indexOf(term.toLowerCase());
        if (idx === -1) return safe;
        return safe.slice(0, idx)
            + `<mark style="background:rgba(201,125,62,0.25);color:var(--cream);border-radius:2px;">${safe.slice(idx, idx + term.length)}</mark>`
            + safe.slice(idx + term.length);
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

})();
