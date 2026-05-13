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
            const res = await fetch('json/recipe-index.json?t=' + Date.now());
            if (!res.ok) throw new Error('Could not load recipe index');
            const all = await res.json();

            // Prioritize categories for balanced display
            const priorityCategories = ['Dinner', 'Desserts', 'Breads', 'Sauces'];
            const categorized = {};

            // Group by category
            all.forEach(recipe => {
                const cat = recipe.category || 'Other';
                if (!categorized[cat]) categorized[cat] = [];
                categorized[cat].push(recipe);
            });

            // Pick recipes from priority categories first
            const featured = [];
            const targets = [
                { category: 'Dinner', count: 2 },
                { category: 'Desserts', count: 2 },
                { category: 'Breads', count: 1 },
                { category: 'Sauces', count: 1 }
            ];

            // Use weekly seed for consistent rotation within each category
            const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));

            targets.forEach(target => {
                const categoryRecipes = categorized[target.category] || [];
                if (categoryRecipes.length > 0) {
                    // Seed shuffle within category
                    const shuffled = [...categoryRecipes];
                    for (let i = shuffled.length - 1; i > 0; i--) {
                        const j = (week + i) % (i + 1);
                        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                    }
                    const selected = shuffled.slice(0, target.count);
                    featured.push(...selected);
                }
            });

            // If we don't have enough, fill with random from all recipes
            if (featured.length < 6) {
                const remaining = all.filter(r => !featured.includes(r));
                const seed = week;
                for (let i = remaining.length - 1; i > 0; i--) {
                    const j = (seed + i) % (i + 1);
                    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
                }
                featured.push(...remaining.slice(0, 6 - featured.length));
            }

            grid.innerHTML = featured.map(r => renderCard(r)).join('');
        } catch (err) {
            console.warn('[featured-rotator]', err);
            grid.innerHTML = '<p style="color:var(--cream-muted);text-align:center;grid-column:1/-1;">Featured recipes unavailable.</p>';
        }
    }

    function renderCard(recipe) {
        return `
            <a href="recipe.html?id=${recipe.id}" class="recipe-card">
                <div class="recipe-card-tag">${recipe.category || 'Recipe'}</div>
                <h3>${recipe.emoji ? recipe.emoji + ' ' : ''}${escapeHtml(recipe.title)}</h3>
                <p>${recipe.description ? escapeHtml(recipe.description.substring(0, 100)) + '...' : ''}</p>
                <span class="recipe-card-arrow">Read more →</span>
            </a>
        `;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
})();
