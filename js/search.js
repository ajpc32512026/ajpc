/* =========================================================
   SEARCH — AJPC Kitchen Notebook
   Full text search + Smart ingredient search (cook with what you have)
   FIXED: Synonym matching for primary ingredients
   ADDED: Popular tags loading
========================================================= */

(function () {
    'use strict';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Caches
    var fullRecipeCache = {};
    var ingredientTextCache = {};
    var recipeIndex = [];

    // Pantry staples to ignore in ingredient suggestions
    var PANTRY_STAPLES = [
        'water', 'salt', 'pepper', 'black pepper', 'white pepper',
        'butter', 'unsalted butter', 'oil', 'olive oil', 'vegetable oil', 'canola oil',
        'flour', 'plain flour', 'all-purpose flour', 'bread flour', 'self-raising flour',
        'sugar', 'white sugar', 'caster sugar', 'brown sugar', 'icing sugar',
        'eggs', 'egg', 'milk',
        'baking powder', 'baking soda', 'bi-carb soda', 'bicarbonate of soda',
        'vanilla', 'vanilla extract', 'yeast',
        'stock', 'chicken stock', 'beef stock', 'vegetable stock',
        'garlic', 'onion', 'brown onion', 'red onion', 'spring onion',
        'to taste'
    ];

    // Primary protein/key ingredients with synonyms
    var PRIMARY_INGREDIENTS = {
        'steak': ['steak', 'beef', 'scotch fillet', 'filet mignon', 'scotch filet'],
        'beef': ['beef', 'steak', 'scotch fillet', 'filet mignon', 'scotch filet'],
        'chicken': ['chicken', 'chicken breast'],
        'pork': ['pork', 'pork chop', 'bacon', 'ham'],
        'lamb': ['lamb', 'lamb cutlet'],
        'fish': ['fish', 'salmon', 'seafood'],
        'prawns': ['prawns', 'shrimp', 'prawn', 'shrimp'],
        'oysters': ['oysters', 'oyster']
    };

    async function init() {
        var searchInput = document.getElementById('searchInput');
        var resultsEl = document.getElementById('searchResults');
        var countEl = document.getElementById('resultsCount');
        if (!searchInput || !resultsEl) return;

        try {
            var res = await fetch('json/recipe-index.json?t=' + Date.now());
            if (res.ok) recipeIndex = await res.json();
        } catch(e) {
            console.error('Failed to load recipe index:', e);
            recipeIndex = [];
        }

        var params = new URLSearchParams(window.location.search);
        var q = params.get('q') || '';
        if (q) {
            searchInput.value = q;
            await runSearch(q, resultsEl, countEl);
        }

        var timer = null;
        searchInput.addEventListener('input', function() {
            clearTimeout(timer);
            timer = setTimeout(async function() {
                var val = searchInput.value.trim();
                history.replaceState(null, '', val ? '?q=' + encodeURIComponent(val) : window.location.pathname);
                await runSearch(val, resultsEl, countEl);
            }, 200);
        });

        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') searchInput.value = '';
        });
        
        // Load popular tags
        loadPopularTags();
    }

async function getFullRecipe(id) {
    if (fullRecipeCache[id]) return fullRecipeCache[id];
    try {
        var res = await fetch('data/recipes/' + id + '.json');
        if (!res.ok) {
            // Silently skip missing files — don't throw or log error
            return null;
        }
        var recipe = await res.json();
        fullRecipeCache[id] = recipe;
        return recipe;
    } catch(e) {
        // Silently skip network errors
        return null;
    }
}

   async function getRecipeIngredientsText(id) {
    if (ingredientTextCache[id]) return ingredientTextCache[id];
    try {
        var res = await fetch('data/recipes/' + id + '.json');
        if (!res.ok) {
            // Silently skip — don't log error
            return '';
        }
        var recipe = await res.json();
        var ingredients = (recipe.ingredients || [])
            .filter(function(i) { return !i.heading; })
            .map(function(i) { return i.item || i.name || ''; })
            .join(' ');
        ingredientTextCache[id] = ingredients;
        return ingredients;
    } catch(e) {
        // Silently skip network errors
        return '';
    }
}

    function getSignificantIngredients(recipe) {
        if (!recipe || !recipe.ingredients) return [];
        
        var ingredients = [];
        for (var i = 0; i < recipe.ingredients.length; i++) {
            var ing = recipe.ingredients[i];
            if (ing.heading) continue;
            
            var item = (ing.item || ing.name || '').toLowerCase().trim();
            if (!item) continue;
            
            var isStaple = false;
            for (var s = 0; s < PANTRY_STAPLES.length; s++) {
                var staple = PANTRY_STAPLES[s];
                if (staple === item || item === staple + 's' || item.includes(staple)) {
                    isStaple = true;
                    break;
                }
            }
            
            if (!isStaple && ingredients.indexOf(item) === -1) {
                ingredients.push(item);
            }
        }
        return ingredients;
    }

    // Check if a user ingredient matches a recipe ingredient (with synonym support)
    function ingredientMatches(userIng, recipeIng) {
        // Direct match
        if (recipeIng === userIng || recipeIng.indexOf(userIng) !== -1 || userIng.indexOf(recipeIng) !== -1) {
            return true;
        }
        
        // Check synonyms
        for (var primary in PRIMARY_INGREDIENTS) {
            var synonyms = PRIMARY_INGREDIENTS[primary];
            var userIsMatch = false;
            var recipeIsMatch = false;
            
            for (var s = 0; s < synonyms.length; s++) {
                if (userIng.indexOf(synonyms[s]) !== -1 || synonyms[s].indexOf(userIng) !== -1) {
                    userIsMatch = true;
                }
                if (recipeIng.indexOf(synonyms[s]) !== -1 || synonyms[s].indexOf(recipeIng) !== -1) {
                    recipeIsMatch = true;
                }
            }
            
            if (userIsMatch && recipeIsMatch) {
                return true;
            }
        }
        
        return false;
    }

    // Check if recipe contains a primary ingredient that matches user's primary request
    function hasMatchingPrimaryIngredient(userIngredient, recipeIngredients) {
        // Find which primary group this user ingredient belongs to
        var userPrimaryGroup = null;
        for (var primary in PRIMARY_INGREDIENTS) {
            var synonyms = PRIMARY_INGREDIENTS[primary];
            for (var s = 0; s < synonyms.length; s++) {
                if (userIngredient.indexOf(synonyms[s]) !== -1 || synonyms[s].indexOf(userIngredient) !== -1) {
                    userPrimaryGroup = primary;
                    break;
                }
            }
            if (userPrimaryGroup) break;
        }
        
        if (!userPrimaryGroup) return true; // Not a primary ingredient, don't filter
        
        // Check if recipe has any synonym from this primary group
        var targetSynonyms = PRIMARY_INGREDIENTS[userPrimaryGroup];
        for (var r = 0; r < recipeIngredients.length; r++) {
            for (var t = 0; t < targetSynonyms.length; t++) {
                if (recipeIngredients[r].indexOf(targetSynonyms[t]) !== -1 || targetSynonyms[t].indexOf(recipeIngredients[r]) !== -1) {
                    return true;
                }
            }
        }
        
        return false;
    }

    function parseUserIngredients(input) {
        var lower = input.toLowerCase();
        var ingredients = lower.split(/[,&+]|\sand\s/).map(function(i) { return i.trim(); }).filter(function(i) { return i.length > 1; });
        
        if (ingredients.length === 1 && !input.includes(',') && !input.includes('and')) {
            var words = lower.split(/\s+/);
            ingredients = words.slice(0, 5);
        }
        
        var result = [];
        for (var i = 0; i < ingredients.length; i++) {
            var ing = ingredients[i];
            var isStaple = false;
            for (var s = 0; s < PANTRY_STAPLES.length; s++) {
                var staple = PANTRY_STAPLES[s];
                if (staple === ing || ing.includes(staple)) {
                    isStaple = true;
                    break;
                }
            }
            if (!isStaple && ing.length > 1 && result.indexOf(ing) === -1) {
                result.push(ing);
            }
        }
        return result;
    }

    function calculateMatchForRecipe(userIngredients, recipeIngredients) {
        var matches = [];
        var missing = [];
        
        for (var u = 0; u < userIngredients.length; u++) {
            var userIng = userIngredients[u];
            var found = false;
            
            for (var r = 0; r < recipeIngredients.length; r++) {
                var recipeIng = recipeIngredients[r];
                if (ingredientMatches(userIng, recipeIng)) {
                    found = true;
                    break;
                }
            }
            
            if (found) {
                matches.push(userIng);
            } else {
                missing.push(userIng);
            }
        }
        
        var score = Math.round((matches.length / userIngredients.length) * 100);
        return { score: score, matches: matches, missing: missing };
    }

    async function traditionalSearch(query, terms) {
        await Promise.all(recipeIndex.map(function(recipe) {
            return getRecipeIngredientsText(recipe.id);
        }));

        var scored = recipeIndex.map(function(recipe) {
            var ingredients = ingredientTextCache[recipe.id] || '';

            var text = [
                (recipe.title || recipe.name || ''),
                recipe.category || '',
                (recipe.tags || []).join(' '),
                recipe.description || '',
                ingredients
            ].join(' ').toLowerCase();

            var score = terms.reduce(function(acc, term) {
                if ((recipe.title || recipe.name || '').toLowerCase().indexOf(term) !== -1) return acc + 10;
                if ((recipe.category || '').toLowerCase().indexOf(term) !== -1) return acc + 5;
                if ((recipe.tags || []).some(function(t) { return t.toLowerCase().indexOf(term) !== -1; })) return acc + 4;
                if (text.indexOf(term) !== -1) return acc + 2;
                return acc;
            }, 0);

            return { recipe: recipe, score: score };
        }).filter(function(s) { return s.score > 0; }).sort(function(a, b) { return b.score - a.score; });

        return scored;
    }

async function ingredientSearch(query, userIngredients) {
    var results = [];
    
    for (var i = 0; i < recipeIndex.length; i++) {
        var recipeMeta = recipeIndex[i];
        var fullRecipe = await getFullRecipe(recipeMeta.id);
        
        // Skip if recipe file not found (404) - just continue silently
        if (!fullRecipe) {
            continue;
        }
        
        var recipeIngredients = getSignificantIngredients(fullRecipe);
        var match = calculateMatchForRecipe(userIngredients, recipeIngredients);
        
        // Must have at least 1 match
        if (match.score === 0) {
            continue;
        }
        
        // Check if first user ingredient (primary protein) matches recipe
        if (userIngredients.length > 0) {
            var hasPrimary = hasMatchingPrimaryIngredient(userIngredients[0], recipeIngredients);
            if (!hasPrimary) {
                continue;
            }
        }
        
        results.push({
            recipe: recipeMeta,
            fullRecipe: fullRecipe,
            score: match.score,
            matches: match.matches.slice(),
            missing: match.missing.slice()
        });
    }
    
    results.sort(function(a, b) { return b.score - a.score; });
    return results;
}

    function renderTraditionalResults(scored, query, countEl) {
        if (countEl) {
            countEl.textContent = scored.length + ' result' + (scored.length !== 1 ? 's' : '') + ' for "' + escHtml(query) + '"';
        }

        if (!scored.length) {
            document.getElementById('searchResults').innerHTML = '<p style="color:var(--cream-muted);">No recipes found for "<strong style="color:var(--cream);">' + escHtml(query) + '</strong>". Try a different term.</p>';
            return;
        }

        var html = '<ul class="search-result-list">';
        for (var s = 0; s < scored.length; s++) {
            var item = scored[s];
            var recipe = item.recipe;
            
            html += '<li class="search-result-entry">';
            html += '<h3><a href="recipe.html?id=' + encodeURIComponent(recipe.id) + '">' + highlightMatch(recipe.title || recipe.name || recipe.id, query) + '</a></h3>';
            
            if (recipe.description) {
                html += '<p>' + escHtml(recipe.description.slice(0, 140)) + (recipe.description.length > 140 ? '...' : '') + '</p>';
            }
            
            if (recipe.tags && recipe.tags.length) {
                html += '<div class="search-result-tags">';
                for (var t = 0; t < Math.min(recipe.tags.length, 5); t++) {
                    html += '<a href="search.html?q=' + encodeURIComponent(recipe.tags[t]) + '" class="recipe-tag">#' + escHtml(recipe.tags[t]) + '</a>';
                }
                html += '</div>';
            }
            
            html += '</li>';
        }
        html += '</ul>';
        document.getElementById('searchResults').innerHTML = html;
    }

    function renderIngredientResults(results, query, countEl) {
        if (countEl) {
            countEl.textContent = results.length + ' result' + (results.length !== 1 ? 's' : '') + ' for "' + escHtml(query) + '"';
        }

        if (!results.length) {
            var html = '<p style="color:var(--cream-muted);">No recipes found matching your ingredients.</p>';
            html += '<p style="color:var(--cream-muted); margin-top:0.5rem;">💡 Make sure you include a main ingredient like <strong>chicken</strong>, <strong>steak</strong>, or <strong>prawns</strong> in your search.</p>';
            document.getElementById('searchResults').innerHTML = html;
            return;
        }

        var html = '<ul class="search-result-list">';
        for (var r = 0; r < results.length; r++) {
            var res = results[r];
            var recipe = res.recipe;
            var full = res.fullRecipe;
            
            html += '<li class="search-result-entry">';
            html += '<div class="ingredient-match-badge">🎯 ' + res.score + '% ingredient match</div>';
            html += '<h3><a href="recipe.html?id=' + encodeURIComponent(recipe.id) + '">' + escHtml(recipe.title || recipe.name || recipe.id) + '</a></h3>';
            
            if (full.description) {
                html += '<p>' + escHtml(full.description.slice(0, 140)) + (full.description.length > 140 ? '...' : '') + '</p>';
            }
            
            html += '<div class="ingredient-match-details">';
            if (res.matches.length) {
                html += '<span style="color:var(--copper);">✓ You have:</span> ';
                for (var m = 0; m < res.matches.length; m++) {
                    html += '<span class="match-tag">' + escHtml(res.matches[m]) + '</span>';
                }
            }
            if (res.missing.length) {
                html += '<br><span style="color:var(--cream-muted);">✗ Need:</span> ';
                for (var n = 0; n < res.missing.length; n++) {
                    html += '<span class="missing-tag">' + escHtml(res.missing[n]) + '</span>';
                }
            }
            html += '</div>';
            
            if (full.tags && full.tags.length) {
                html += '<div class="search-result-tags">';
                for (var t = 0; t < Math.min(full.tags.length, 5); t++) {
                    html += '<a href="search.html?q=' + encodeURIComponent(full.tags[t]) + '" class="recipe-tag">#' + escHtml(full.tags[t]) + '</a>';
                }
                html += '</div>';
            }
            
            html += '</li>';
        }
        html += '</ul>';
        document.getElementById('searchResults').innerHTML = html;
    }

    async function runSearch(query, resultsEl, countEl) {
        if (!query) {
            resultsEl.innerHTML = '<p style="color:var(--cream-muted);">Enter a recipe name, ingredient or tag to search. Try ingredient search like <strong>"chicken, cream, mushrooms"</strong> or <strong>"steak, prawns"</strong> to find recipes you can cook with what you have.</p>';
            if (countEl) countEl.textContent = '';
            return;
        }

        var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        var hasCommas = query.includes(',');
        var hasAnd = query.includes(' and ');
        var isIngredientSearch = hasCommas || hasAnd || terms.length > 3;

        if (isIngredientSearch) {
            var userIngredients = parseUserIngredients(query);
            
            if (userIngredients.length === 0) {
                if (countEl) countEl.textContent = '0 results';
                resultsEl.innerHTML = '<p style="color:var(--cream-muted);">No significant ingredients found. Try "chicken, cream" or "steak, prawns". Make sure to include a main protein like chicken, steak, or prawns.</p>';
                return;
            }
            
            var ingredientResults = await ingredientSearch(query, userIngredients);
            renderIngredientResults(ingredientResults, query, countEl);
            
        } else {
            var traditionalResults = await traditionalSearch(query, terms);
            renderTraditionalResults(traditionalResults, query, countEl);
        }
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
    
    async function loadPopularTags() {
        try {
            const res = await fetch('json/recipe-index.json?t=' + Date.now());
            const recipes = await res.json();
            
            // Count tag frequencies
            const tagCounts = {};
            recipes.forEach(recipe => {
                (recipe.tags || []).forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                });
            });
            
            // Get top 12 tags
            const topTags = Object.entries(tagCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 12)
                .map(([tag]) => tag);
            
            const container = document.getElementById('popularTagsList');
            if (container) {
                container.innerHTML = topTags.map(tag => 
                    `<a href="search.html?q=${encodeURIComponent(tag)}" class="popular-tag">#${escHtml(tag)}</a>`
                ).join('');
            }
        } catch(e) {
            console.warn('Could not load popular tags');
            const container = document.getElementById('popularTagsList');
            if (container) {
                container.innerHTML = '<span class="tag-skeleton">No tags found</span>';
            }
        }
    }

})();