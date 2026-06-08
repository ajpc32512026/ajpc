/* =========================================================
   FEATURED RECIPES ROTATOR — AJPC Kitchen Notebook
   Loads from recipe-index.json, rotates weekly.
   Display order:
     Row 1: Dinner | Dessert | Baking
     Row 2: Dinner | Dessert | Sauce
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

            const categorized = {};
            all.forEach(recipe => {
                const cat = recipe.category || 'Other';
                if (!categorized[cat]) categorized[cat] = [];
                categorized[cat].push(recipe);
            });

            const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));

            function getRecipes(category, count) {
                const recipes = categorized[category] || [];
                if (recipes.length === 0) return [];
                const shuffled = [...recipes];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = (week + i) % (i + 1);
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                return shuffled.slice(0, count);
            }

            const featured = [
                ...getRecipes('Dinner', 1),
                ...getRecipes('Desserts', 1),
                ...getRecipes('Baking', 1),
                ...getRecipes('Dinner', 1),
                ...getRecipes('Desserts', 1),
                ...getRecipes('Sauces', 1)
            ];

            const validFeatured = featured.filter(r => r && r.id);

            if (validFeatured.length < 6) {
                const allRecipes = [...all];
                for (let i = allRecipes.length - 1; i > 0; i--) {
                    const j = (week + i) % (i + 1);
                    [allRecipes[i], allRecipes[j]] = [allRecipes[j], allRecipes[i]];
                }
                while (validFeatured.length < 6) {
                    validFeatured.push(allRecipes[validFeatured.length % allRecipes.length]);
                }
            }

            grid.innerHTML = validFeatured.map(r => renderCard(r)).join('');
            
        } catch (err) {
            console.warn('[featured-rotator]', err);
            grid.innerHTML = '<p class="featured-unavailable">Featured recipes unavailable.</p>';
        }
    }

    function renderCard(recipe) {
        const recipeTitle = recipe.name || recipe.title || 'Untitled';
        
        return `
            <a href="recipe.html?id=${recipe.id}" class="recipe-card">
                <div class="recipe-card-tag">${recipe.category || 'Recipe'}</div>
                <h3>${escapeHtml(recipeTitle)}</h3>
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