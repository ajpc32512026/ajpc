/* =========================================================
   SEARCH ENGINE LOGIC — KitchenNotebook Kitchen Notebook
   Word-Boundary Tag Matcher (Headings and descriptions excluded).
   Matches typed terms against recipe tags. Standalone words
   match, but partial character matches inside larger words are ignored.
========================================================= */

(function () {
    'use strict';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Dynamic cache for recipe index
    var recipeIndex = [];
    var HISTORY_KEY = 'ajpc_search_history';
    var HISTORY_MAX = 10;

    // Helper to escape characters for Regular Expressions
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ── Search History Managers ───────────────────────────
    function getHistory() {
        try {
            return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        } catch {
            return [];
        }
    }

    function addToHistory(query) {
        if (!query || query.length < 2) return;
        var history = getHistory().filter(function(h) { return h !== query; });
        history.unshift(query);
        if (history.length > HISTORY_MAX) {
            history = history.slice(0, HISTORY_MAX);
        }
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch(e) {
            console.warn('search: failed to write history cache', e);
        }
    }

    function clearHistory() {
        try {
            localStorage.removeItem(HISTORY_KEY);
        } catch {}
        renderHistory();
    }

    function renderHistory() {
        var container = document.getElementById('searchHistory');
        if (!container) return;
        var history = getHistory();
        if (!history.length) {
            container.innerHTML = '';
            return;
        }

        var html = '<div class="search-history-bar">';
        html += '<span class="search-history-label">Recent:</span>';
        history.forEach(function(q) {
            html += '<button class="search-history-chip" onclick="document.getElementById(\'searchInput\').value=' +
                JSON.stringify(q) + ';document.getElementById(\'searchInput\').dispatchEvent(new Event(\'input\'))">' +
                escHtml(q) + '</button>';
        });
        html += '<button class="search-history-clear" onclick="window.clearHistory()">Clear</button>';
        html += '</div>';
        container.innerHTML = html;
    }

    /* ── Active Filters State ────────────────────────────── */
    var activeFilters = { category: '', tag: '', difficulty: '' };

    function initFilters() {
        var catSel = document.getElementById('filterCategory');
        var tagSel = document.getElementById('filterTag');
        var diffSel = document.getElementById('filterDifficulty');
        var clearBtn = document.getElementById('filterClear');

        if (!catSel) return;

        // Populate Category Filter dropdown
        var cats = [...new Set(recipeIndex.map(function(r) { return r.category; }).filter(Boolean))].sort();
        cats.forEach(function(c) {
            var opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            catSel.appendChild(opt);
        });

        // Populate Tag Filter dropdown (top 30 tags by usage count)
        var tagCounts = {};
        recipeIndex.forEach(function(r) {
            (r.tags || []).forEach(function(t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
        });
        var topTags = Object.entries(tagCounts)
            .sort(function(a, b) { return b[1] - a[1]; })
            .slice(0, 30)
            .map(function(e) { return e[0]; });
            
        topTags.forEach(function(t) {
            var opt = document.createElement('option');
            opt.value = t; opt.textContent = '#' + t;
            tagSel.appendChild(opt);
        });

        function onFilterChange() {
            activeFilters.category = catSel.value;
            activeFilters.tag = tagSel ? tagSel.value : '';
            activeFilters.difficulty = diffSel ? diffSel.value : '';
            
            var searchInput = document.getElementById('searchInput');
            var val = searchInput ? searchInput.value.trim() : '';
            var resultsEl = document.getElementById('searchResults');
            var countEl = document.getElementById('resultsCount');
            runSearch(val, resultsEl, countEl);
        }

        catSel.addEventListener('change', onFilterChange);
        if (tagSel) tagSel.addEventListener('change', onFilterChange);
        if (diffSel) diffSel.addEventListener('change', onFilterChange);

        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                catSel.value = '';
                if (tagSel) tagSel.value = '';
                if (diffSel) diffSel.value = '';
                activeFilters = { category: '', tag: '', difficulty: '' };
                onFilterChange();
            });
        }
    }

    function applyFilters(recipes) {
        return recipes.filter(function(r) {
            var recipe = r.recipe || r;
            if (activeFilters.category && recipe.category !== activeFilters.category) return false;
            if (activeFilters.tag && !(recipe.tags || []).includes(activeFilters.tag)) return false;
            return true;
        });
    }

    /* ── Pure Word-Boundary Tag Search Engine ────────────── */

    /**
     * Strictly matches terms against the recipe's tags array using word boundaries.
     */
    async function traditionalSearch(query, terms) {
        var fullQuery = query.toLowerCase().trim();
        
        var scored = recipeIndex.map(function(recipe) {
            // Read tags array exclusively and standardise to lowercase
            var recipeTags = (recipe.tags || []).map(function(t) { 
                return String(t).toLowerCase().trim(); 
            });
            
            var score = 0;
            var matchedTags = [];
            
            // 1. Check if the full search query exactly matches any tag
            var hasExactTag = recipeTags.some(function(tag) {
                return tag === fullQuery;
            });

            if (hasExactTag) {
                score = 100;
                matchedTags.push(fullQuery);
            } else if (terms.length > 0) {
                // 2. Otherwise, check if all typed words match as full words inside tags
                var allTermsMatch = terms.every(function(term) {
                    return recipeTags.some(function(tag) {
                        var boundaryRegex = new RegExp('\\b' + escapeRegExp(term) + '\\b', 'i');
                        var isMatch = tag === term || boundaryRegex.test(tag);
                        if (isMatch && !matchedTags.includes(tag)) matchedTags.push(tag);
                        return isMatch;
                    });
                });

                if (allTermsMatch) {
                    score = 50;
                }
            }

            return { recipe: recipe, score: score, matchedTags: matchedTags };
        }).filter(function(s) { return s.score > 0; })
          .sort(function(a, b) { 
              // Sort alphabetically by title
              return (a.recipe.title || '').localeCompare(b.recipe.title || '');
          });

        return applyFilters(scored);
    }

    /* ── Output Rendering Engines ────────────────────────── */

    function renderTraditionalResults(scored, query, countEl) {
        var resultsEl = document.getElementById('searchResults');
        if (countEl) {
            var filterNote = (activeFilters.category || activeFilters.tag) ? ' (filtered)' : '';
            countEl.textContent = scored.length + ' result' + (scored.length !== 1 ? 's' : '') + ' for "' + escHtml(query) + '"' + filterNote;
        }
        if (!scored.length) {
            resultsEl.innerHTML = '<p class="search-empty">No recipes found with tags matching "<strong>' + escHtml(query) + '</strong>". Try another tag or clear your filters.</p>';
            return;
        }

        var html = '<ul class="search-result-list">';
        scored.forEach(function(item) {
            var recipe = item.recipe;
            html += '<li class="search-result-entry">';
            html += '<h3><a href="recipe.html?id=' + encodeURIComponent(recipe.id) + '">' +
                escHtml(recipe.title || recipe.name || recipe.id) + '</a></h3>';
            if (recipe.description) {
                html += '<p>' + escHtml(recipe.description.slice(0, 140)) + (recipe.description.length > 140 ? '…' : '') + '</p>';
            }
            if (recipe.tags && recipe.tags.length) {
                html += '<div class="search-result-tags">';
                // Display ALL tags so matched tags are never hidden from view
                recipe.tags.forEach(function(t) {
                    html += '<a href="search.html?q=' + encodeURIComponent(t) + '" class="recipe-tag">#' + escHtml(t) + '</a>';
                });
                html += '</div>';
            }
            html += '</li>';
        });
        html += '</ul>';
        resultsEl.innerHTML = html;
    }

    function renderEmpty() {
        var resultsEl = document.getElementById('searchResults');
        if (!resultsEl) return;
        
        var favs = [];
        try {
            favs = JSON.parse(localStorage.getItem('ajpc_favourites') || '[]');
        } catch {}
        
        if (favs.length) {
            var favRecipes = recipeIndex.filter(function(r) { return favs.includes(r.id); });
            if (favRecipes.length) {
                var html = '<div class="search-favourites-header">Your Favourites</div>';
                html += '<ul class="search-result-list">';
                favRecipes.forEach(function(recipe) {
                    html += '<li class="search-result-entry">';
                    html += '<span class="fav-star" aria-label="Favourited"></span>';
                    html += '<h3><a href="recipe.html?id=' + encodeURIComponent(recipe.id) + '">' + escHtml(recipe.title || recipe.name) + '</a></h3>';
                    if (recipe.description) html += '<p>' + escHtml(recipe.description.slice(0, 100)) + '…</p>';
                    html += '</li>';
                });
                html += '</ul>';
                resultsEl.innerHTML = html;
                return;
            }
        }
        resultsEl.innerHTML = '<p class="section-note">Enter your search terms above to begin.</p>';
    }

    /* ── Search Loop Controller ──────────────────────────── */

    async function runSearch(query, resultsEl, countEl) {
        var cleanQuery = query.toLowerCase().trim();
        if (!cleanQuery && !activeFilters.category && !activeFilters.tag) {
            if (countEl) countEl.textContent = '';
            renderEmpty();
            renderHistory();
            return;
        }

        if (!cleanQuery && (activeFilters.category || activeFilters.tag)) {
            var filtered = applyFilters(recipeIndex.map(function(r) { return { recipe: r, score: 1 }; }));
            renderTraditionalResults(filtered, '', countEl);
            return;
        }

        var terms = cleanQuery.split(/\s+/).filter(Boolean);
        var tradResults = await traditionalSearch(cleanQuery, terms);
        renderTraditionalResults(tradResults, cleanQuery, countEl);

        addToHistory(cleanQuery);
        renderHistory();
    }

    async function loadPopularTags() {
        var container = document.getElementById('popularTagsList');
        if (!container) return;
        try {
            var tagCounts = {};
            recipeIndex.forEach(function(r) {
                (r.tags || []).forEach(function(t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
            });
            var topTags = Object.entries(tagCounts).sort(function(a,b) { return b[1]-a[1]; }).slice(0, 15).map(function(e) { return e[0]; });
            container.innerHTML = topTags.map(function(tag) {
                return '<a href="search.html?q=' + encodeURIComponent(tag) + '" class="popular-tag">#' + escHtml(tag) + '</a>';
            }).join('');
        } catch {
            container.innerHTML = '';
        }
    }

    function escHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    /* ── Initialization ──────────────────────────────────── */

    async function init() {
        var searchInput = document.getElementById('searchInput');
        var resultsEl = document.getElementById('searchResults');
        var countEl = document.getElementById('resultsCount');
        if (!searchInput || !resultsEl) return;

        try {
            var res = await fetch('json/recipe-index.json?t=' + Date.now());
            if (res.ok) recipeIndex = await res.json();
        } catch {
            recipeIndex = [];
        }

        initFilters();
        loadPopularTags();
        renderHistory();

        const params = new URLSearchParams(window.location.search);
        const urlQuery = params.get('q') || '';
        if (urlQuery) {
            searchInput.value = urlQuery;
            runSearch(urlQuery, resultsEl, countEl);
        } else {
            renderEmpty();
        }

        var debounceTimer = null;
        searchInput.addEventListener('input', function() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function() {
                var val = searchInput.value.trim();
                history.replaceState(null, '', val ? '?q=' + encodeURIComponent(val) : window.location.pathname);
                runSearch(val, resultsEl, countEl);
            }, 250);
        });

        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                searchInput.value = '';
                runSearch('', resultsEl, countEl);
            }
        });
    }

    window.clearHistory = clearHistory;

})();