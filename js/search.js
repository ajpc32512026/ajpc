/* =========================================================
   SEARCH ENGINE LOGIC — The Kitchen Notebook
   Searches:
   1. Recipes (Titles, Description, Ingredients, Tags)
   2. Food Additives (Names, E-numbers, Codes, Functions)
   3. Australian Products (Names, Brands, Barcodes, Additives)
========================================================= */

(sidebar => {
    'use strict';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    var recipeIndex = [];
    var additiveIndex = [];      // detailed definitions from food-function.json
    var rawAdditiveIndex = [];   // raw alphabetical list from foodadditive-index.json
    var productIndex = [];
    var HISTORY_KEY = 'ajpc_search_history';
    var HISTORY_MAX = 10;

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

        var cats = [...new Set(recipeIndex.map(function(r) { return r.category; }).filter(Boolean))].sort();
        cats.forEach(function(c) {
            var opt = document.createElement('option');
            opt.value = c; opt.textContent = c;
            catSel.appendChild(opt);
        });

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
            if (activeFilters.difficulty && recipe.difficulty !== activeFilters.difficulty) return false;
            return true;
        });
    }

    /* ── Recipes Search Engine ───────────────────────────── */

    function recipeSearch(query, terms) {
        var cleanQuery = query.toLowerCase().trim();
        if (!cleanQuery) return [];

        var scored = recipeIndex.map(function(recipe) {
            var title = (recipe.title || recipe.name || '').toLowerCase();
            var desc = (recipe.description || '').toLowerCase();
            var tags = (recipe.tags || []).map(t => String(t).toLowerCase());
            
            var ings = (recipe.ingredients || []).map(function(ing) {
                return (ing.item || ing.name || '').toLowerCase();
            }).join(' ');

            var score = 0;

            if (title.indexOf(cleanQuery) !== -1) {
                score += 100;
                if (title === cleanQuery) score += 50;
            }

            tags.forEach(function(t) {
                if (t === cleanQuery) score += 40;
                else if (t.indexOf(cleanQuery) !== -1) score += 15;
            });

            if (ings.indexOf(cleanQuery) !== -1) {
                score += 30;
            }

            if (desc.indexOf(cleanQuery) !== -1) {
                score += 10;
            }

            var matchesAllTerms = terms.every(function(term) {
                return (
                    title.indexOf(term) !== -1 ||
                    desc.indexOf(term) !== -1 ||
                    ings.indexOf(term) !== -1 ||
                    tags.some(t => t.indexOf(term) !== -1)
                );
            });

            if (matchesAllTerms) {
                score += 25;
            } else {
                if (terms.length > 1) {
                    score = 0;
                }
            }

            return { recipe: recipe, score: score };
        }).filter(function(s) { return s.score > 0; })
          .sort(function(a, b) {
              if (b.score !== a.score) return b.score - a.score;
              return (a.recipe.title || '').localeCompare(b.recipe.title || '');
          });

        return applyFilters(scored);
    }

    /* ── Food Additives Search Engine ────────────────────── */

    function additiveSearch(query, terms) {
        var cleanQuery = query.toLowerCase().trim();
        if (!cleanQuery) return [];

        var matches = [];

        // 1. Search in our detailed database first
        additiveIndex.forEach(function(add) {
            var code = String(add.code || '').toLowerCase();
            var eNum = String(add.eNumber || '').toLowerCase();
            var name = String(add.name || '').toLowerCase();
            var cls  = String(add.functionalClass || '').toLowerCase();
            var purp = String(add.primaryPurpose || '').toLowerCase();

            var isMatch = terms.every(function(term) {
                return (
                    code === term ||
                    eNum === term ||
                    code.replace(/\(\w+\)/g, '') === term ||
                    name.indexOf(term) !== -1 ||
                    cls.indexOf(term) !== -1 ||
                    purp.indexOf(term) !== -1
                );
            });

            if (isMatch) {
                matches.push(add);
            }
        });

        // 2. Fallback: Search the raw index for things like "511" or "516" (not fully detailed but named)
        rawAdditiveIndex.forEach(function(rawAdd) {
            var code = String(rawAdd.code || '').toLowerCase();
            var name = String(rawAdd.name || '').toLowerCase();

            // Skip if we already matched this exact code in detailed database
            var alreadyMatched = matches.some(function(m) {
                return String(m.code).toLowerCase() === code;
            });
            if (alreadyMatched) return;

            var isMatch = terms.every(function(term) {
                return (
                    code === term ||
                    code.replace(/\(\w+\)/g, '') === term ||
                    name.indexOf(term) !== -1
                );
            });

            if (isMatch) {
                matches.push({
                    code: rawAdd.code,
                    eNumber: "E" + rawAdd.code,
                    name: rawAdd.name,
                    functionalClass: "Additive Formulation",
                    primaryPurpose: "Approved food additive.",
                    commonFoodUsage: "Industrial food manufacturing."
                });
            }
        });

        return matches.slice(0, 5);
    }

    /* ── Australian Products Search Engine ───────────────── */

    function productSearch(query, terms) {
        var cleanQuery = query.toLowerCase().trim();
        if (!cleanQuery) return [];

        return productIndex.filter(function(prod) {
            var barcode = String(prod.code || '').toLowerCase();
            var name = String(prod.name || '').toLowerCase();
            var brand = String(prod.brand || '').toLowerCase();
            var additives = (prod.additives || []).map(a => String(a).toLowerCase());

            return terms.every(function(term) {
                return (
                    barcode === term ||
                    name.indexOf(term) !== -1 ||
                    brand.indexOf(term) !== -1 ||
                    additives.some(function(addCode) {
                        return addCode === term || addCode.replace(/\(\w+\)/g, '') === term;
                    })
                );
            });
        }).slice(0, 10);
    }

    // Resolves functional details of a product additive code using food-function.json & raw index
    function getAdditiveDetails(code) {
        var cleanCode = String(code).toLowerCase().trim();
        
        // Check detailed database first
        var match = additiveIndex.find(function(add) {
            return String(add.code).toLowerCase().trim() === cleanCode || 
                   String(add.eNumber).toLowerCase().trim() === cleanCode;
        });

        if (match) {
            return {
                known: true,
                name: match.name,
                class: match.functionalClass,
                purpose: match.primaryPurpose,
                notes: match.notes || "",
                commonFoodUsage: match.commonFoodUsage || "",
                eNumber: match.eNumber || ""
            };
        }

        // Fallback: Check raw index
        var rawMatch = rawAdditiveIndex.find(function(rawAdd) {
            return String(rawAdd.code).toLowerCase().trim() === cleanCode;
        });

        if (rawMatch) {
            return {
                known: true,
                name: rawMatch.name,
                class: "Additive Formulation",
                purpose: "Approved food standard additive.",
                notes: "Consult the food standard guidelines for details.",
                commonFoodUsage: "Processed foods.",
                eNumber: "E" + rawMatch.code
            };
        }

        return {
            known: false,
            name: "Additive (" + code + ")",
            class: "Unspecified Class",
            purpose: "Preservative, stabilizer, or processing aid.",
            notes: "",
            commonFoodUsage: "",
            eNumber: ""
        };
    }

    /* ── Output Rendering Engines ────────────────────────── */

    function renderResults(recipeResults, additiveResults, productResults, query, countEl) {
        var resultsEl = document.getElementById('searchResults');
        if (!resultsEl) return;

        var html = '';

        // 1. Render Matching Food Additives
        if (additiveResults.length > 0) {
            html += '<div class="additive-search-results">';
            html += '<h2 class="section-title" style="color: var(--copper); margin-bottom:16px;">Matching Food Additives</h2>';
            html += '<div class="additive-results-grid" style="display: grid; gap: 16px; margin-bottom: 30px;">';
            
            additiveResults.forEach(function(add) {
                var displayCode = add.eNumber ? `${add.name} (${add.code} / ${add.eNumber})` : `${add.name} (${add.code})`;
                html += '<div class="additive-result-card" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); padding: 16px; border-radius: 8px;">';
                html += '<h3 style="color: var(--copper); margin: 0 0 6px 0; font-size: 1.15rem;">' + escHtml(displayCode) + '</h3>';
                html += '<p style="margin: 0 0 8px 0; font-size: 0.85rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8;">Class: ' + escHtml(add.functionalClass) + '</p>';
                html += '<p style="margin: 0 0 8px 0; font-size: 0.95rem; line-height: 1.4;">' + escHtml(add.primaryPurpose) + '</p>';
                if (add.commonFoodUsage) {
                    html += '<p style="margin: 0; font-size: 0.85rem; opacity: 0.7;">Commonly found in: <em>' + escHtml(add.commonFoodUsage) + '</em></p>';
                }
                html += '</div>';
            });
            
            html += '</div></div>';
        }

        // 2. Render Matching Australian Products & Additive Mappings
        if (productResults.length > 0) {
            if (html) html += '<hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 24px 0;" />';
            
            html += '<div class="product-search-results">';
            html += '<h2 class="section-title" style="color: var(--copper); margin-bottom:16px;">Australian Products & Additive Analysis</h2>';
            html += '<div class="product-results-grid" style="display: grid; gap: 16px; margin-bottom: 30px;">';

            productResults.forEach(function(prod, pIdx) {
                html += '<div class="product-result-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); padding: 20px; border-radius: 8px;">';
                html += '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">';
                html += '  <div>';
                html += '    <h3 style="color: var(--foreground); margin: 0; font-size: 1.2rem;">' + escHtml(prod.name) + '</h3>';
                html += '    <span style="font-size: 0.85rem; opacity: 0.6; font-weight: 500;">Brand: ' + escHtml(prod.brand) + '</span>';
                html += '  </div>';
                html += '  <span style="font-family: monospace; background: rgba(255,255,255,0.08); padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; color: var(--copper);">Barcode: ' + escHtml(prod.code) + '</span>';
                html += '</div>';

                if (prod.additives && prod.additives.length > 0) {
                    html += '<div style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px;">';
                    html += '  <p style="font-size: 0.85rem; font-weight: 500; margin: 0 0 10px 0; color: var(--copper); text-transform: uppercase;">Detected Additives <span style="font-size: 0.75rem; text-transform: initial; opacity: 0.6; font-weight: normal; margin-left: 4px;">(click to inspect)</span>:</p>';
                    html += '  <div style="display: flex; flex-direction: column; gap: 8px;">';
                    
                    prod.additives.forEach(function(addCode, aIdx) {
                        var details = getAdditiveDetails(addCode);
                        var badgeBg = details.known ? 'rgba(201, 125, 62, 0.12)' : 'rgba(255, 255, 255, 0.04)';
                        var badgeBorder = details.known ? 'rgba(201, 125, 62, 0.25)' : 'rgba(255, 255, 255, 0.08)';
                        
                        var uniqueId = 'add-' + prod.code + '-' + aIdx;

                        html += `  <div onclick="window.toggleAdditiveDetails('${uniqueId}', event)" class="additive-item-clickable" style="display: flex; flex-direction: column; background: ${badgeBg}; border: 1px solid ${badgeBorder}; padding: 12px; border-radius: 6px; cursor: pointer; transition: all 0.2s ease;">`;
                        html += '    <div style="display: flex; align-items: flex-start; gap: 10px; width: 100%;">';
                        html += `      <span style="font-family: monospace; font-weight: bold; font-size: 0.95rem; color: var(--copper); min-width: 45px; display: inline-block;">${escHtml(addCode)}</span>`;
                        html += '      <div style="font-size: 0.9rem; flex-grow: 1;">';
                        html += `        <strong>${escHtml(details.name)}</strong> <span style="font-size: 0.75rem; text-transform: uppercase; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 3px; margin-left:6px; opacity:0.8;">${escHtml(details.class)}</span>`;
                        html += `        <p style="margin: 4px 0 0 0; font-size: 0.85rem; opacity: 0.8; line-height: 1.35;">${escHtml(details.purpose)}</p>`;
                        html += '      </div>';
                        html += '      <span class="chevron-arrow" style="font-size: 0.75rem; opacity: 0.5; transition: transform 0.2s ease;">▼</span>';
                        html += '    </div>';

                        // Collapsible detailed drawer
                        html += `    <div id="${uniqueId}" style="display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.85rem; line-height: 1.4; opacity: 0.9;">`;
                        if (details.eNumber) {
                            html += `      <p style="margin: 0 0 4px 0;"><strong>International Code:</strong> ${escHtml(details.eNumber)}</p>`;
                        }
                        if (details.commonFoodUsage) {
                            html += `      <p style="margin: 0 0 6px 0;"><strong>Typical Food Groups:</strong> ${escHtml(details.commonFoodUsage)}</p>`;
                        }
                        if (details.notes) {
                            html += `      <p style="margin: 0;"><strong>Background & Safety:</strong> ${escHtml(details.notes)}</p>`;
                        }
                        html += '    </div>';
                        
                        html += '  </div>';
                    });

                    html += '  </div>';
                    html += '</div>';
                }

                html += '</div>';
            });

            html += '</div></div>';
        }

        // 3. Update Result Count Text
        if (countEl) {
            var filterNote = (activeFilters.category || activeFilters.tag || activeFilters.difficulty) ? ' (filtered)' : '';
            var countParts = [];
            if (recipeResults.length > 0) countParts.push(recipeResults.length + ' recipe' + (recipeResults.length !== 1 ? 's' : ''));
            if (additiveResults.length > 0) countParts.push(additiveResults.length + ' additive' + (additiveResults.length !== 1 ? 's' : ''));
            if (productResults.length > 0) countParts.push(productResults.length + ' grocery item' + (productResults.length !== 1 ? 's' : ''));
            
            var countText = countParts.length > 0 ? countParts.join(', ') + ' found' : '0 results';
            countEl.textContent = countText + ' for "' + escHtml(query) + '"' + filterNote;
        }

        // 4. Render Matching Recipes
        if (recipeResults.length > 0) {
            if (html) html += '<hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 24px 0;" />';
            
            html += '<h2 class="section-title" style="color: var(--copper); margin-bottom:16px;">Matching Recipes</h2>';
            html += '<ul class="search-result-list">';
            recipeResults.forEach(function(item) {
                var recipe = item.recipe;
                html += '<li class="search-result-entry">';
                html += '<h3><a href="recipe.html?id=' + encodeURIComponent(recipe.id) + '">' +
                    escHtml(recipe.title || recipe.name || recipe.id) + '</a></h3>';
                if (recipe.description) {
                    html += '<p>' + escHtml(recipe.description.slice(0, 140)) + (recipe.description.length > 140 ? '…' : '') + '</p>';
                }
                if (recipe.tags && recipe.tags.length) {
                    html += '<div class="search-result-tags">';
                    recipe.tags.forEach(function(t) {
                        html += '<a href="search.html?q=' + encodeURIComponent(t) + '" class="recipe-tag">#' + escHtml(t) + '</a>';
                    });
                    html += '</div>';
                }
                html += '</li>';
            });
            html += '</ul>';
        }

        if (!recipeResults.length && !additiveResults.length && !productResults.length) {
            html = '<p class="search-empty">No records found matching "<strong>' + escHtml(query) + '</strong>". Try checking spelling or clear active filters.</p>';
        }

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
        
        if (!cleanQuery && (activeFilters.category || activeFilters.tag || activeFilters.difficulty)) {
            var filtered = applyFilters(recipeIndex.map(function(r) { return { recipe: r, score: 1 }; }));
            renderResults(filtered, [], [], '', countEl);
            return;
        }

        if (!cleanQuery) {
            if (countEl) countEl.textContent = '';
            renderEmpty();
            renderHistory();
            return;
        }

        var terms = cleanQuery.split(/[\s,]+/).filter(Boolean);
        var recipeResults = recipeSearch(cleanQuery, terms);
        var additiveResults = additiveSearch(cleanQuery, terms);
        var productResults = productSearch(cleanQuery, terms);

        renderResults(recipeResults, additiveResults, productResults, cleanQuery, countEl);

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

    /* ── Click-To-Search Helper ──────────────────────────── */

    window.toggleAdditiveDetails = function(id, event) {
        event.stopPropagation();
        
        var detailsEl = document.getElementById(id);
        if (!detailsEl) return;
        
        var cardEl = detailsEl.closest('.additive-item-clickable');
        var arrowEl = cardEl ? cardEl.querySelector('.chevron-arrow') : null;

        if (detailsEl.style.display === 'none' || !detailsEl.style.display) {
            detailsEl.style.display = 'block';
            if (arrowEl) arrowEl.style.transform = 'rotate(180deg)';
        } else {
            detailsEl.style.display = 'none';
            if (arrowEl) arrowEl.style.transform = 'rotate(0deg)';
        }
    };

    /* ── Initialization ──────────────────────────────────── */

    async function init() {
        var searchInput = document.getElementById('searchInput');
        var resultsEl = document.getElementById('searchResults');
        var countEl = document.getElementById('resultsCount');
        if (!searchInput || !resultsEl) return;

        // Dynamic Interactive Styling Injection for hover transitions
        var style = document.createElement('style');
        style.textContent = '.additive-item-clickable:hover { background: rgba(201, 125, 62, 0.22) !important; border-color: rgba(201, 125, 62, 0.4) !important; transform: translateY(-1px); }';
        document.head.appendChild(style);

        // 1. Load Recipe Index
        try {
            var res = await fetch('json/recipe-index.json?t=' + Date.now());
            if (res.ok) recipeIndex = await res.json();
        } catch {
            recipeIndex = [];
        }

        // 2. Load Food Additives Functions Database (detailed)
        try {
            var addRes = await fetch('json/food-function.json?t=' + Date.now());
            if (addRes.ok) {
                var addData = await addRes.json();
                additiveIndex = addData.additives || [];
            }
        } catch(e) {
            console.warn('Could not load food-function.json');
            additiveIndex = [];
        }

        // 3. Load Food Additive Raw Index (full 250+ fallback list)
        try {
            var rawAddRes = await fetch('json/foodadditive-index.json?t=' + Date.now());
            if (rawAddRes.ok) {
                rawAdditiveIndex = await rawAddRes.json();
            }
        } catch(e) {
            console.warn('Could not load foodadditive-index.json');
            rawAdditiveIndex = [];
        }

        // 4. Load Australian Products Additives Database
        try {
            var prodRes = await fetch('json/australian-products-additives.json?t=' + Date.now());
            if (prodRes.ok) {
                productIndex = await prodRes.json();
            }
        } catch(e) {
            console.warn('Could not load australian-products-additives.json');
            productIndex = [];
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
            }, 200);
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