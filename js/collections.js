/* =========================================================
   COLLECTIONS — AJPC Kitchen Notebook
   Renders user collections, allows create/delete/rename,
   view recipes in each, and generates combined shopping list.
   Depends on: user-prefs.js
========================================================= */

(function () {
    'use strict';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    var priceDB = null;

    function init() {
        renderCollections();

        var createBtn = document.getElementById('createCollectionBtn');
        var nameInput = document.getElementById('newCollectionInput');
        if (createBtn && nameInput) {
            createBtn.addEventListener('click', function () {
                var name = nameInput.value.trim();
                if (!name) return;
                if (window.AJPC) window.AJPC.Collections.create(name);
                nameInput.value = '';
                renderCollections();
            });
            nameInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') createBtn.click();
            });
        }
    }

    function renderCollections() {
        var container = document.getElementById('collectionsContainer');
        if (!container || !window.AJPC) return;

        var cols = window.AJPC.Collections.getAll();

        if (!cols.length) {
            container.innerHTML =
                '<div class="collections-empty">' +
                    '<p>No collections yet. Create one above, then add recipes from any recipe page using the <strong>Add to Collection</strong> button.</p>' +
                '</div>';
            return;
        }

        var html = '';
        cols.forEach(function (col) {
            html += '<div class="collection-card" id="col-' + col.id + '">' +
                '<div class="collection-card-header">' +
                    '<h2 class="collection-card-title">' + escHtml(col.name) +
                        ' <span class="collection-count">(' + col.recipes.length + ')</span>' +
                    '</h2>' +
                    '<div class="collection-card-actions">' +
                        '<button class="enh-btn" onclick="renameCollection(\'' + col.id + '\')">Rename</button>' +
                        '<button class="enh-btn enh-btn-remove" onclick="deleteCollection(\'' + col.id + '\')">Delete</button>' +
                    '</div>' +
                '</div>';

            if (col.recipes.length) {
                html += '<ul class="collection-recipe-list">';
                col.recipes.forEach(function (r) {
                    html += '<li class="collection-recipe-item">' +
                        '<a href="recipe.html?id=' + encodeURIComponent(r.id) + '" class="collection-recipe-link">' +
                            escHtml(r.name || r.id) +
                        '</a>' +
                        '<button class="collection-remove-recipe" ' +
                            'onclick="removeFromCollection(\'' + col.id + '\',\'' + escAttr(r.id) + '\')" ' +
                            'aria-label="Remove from collection">×</button>' +
                    '</li>';
                });
                html += '</ul>';
                html += '<button class="enh-btn collection-shopping-btn" ' +
                    'onclick="openCombinedShopping(\'' + col.id + '\')">Combined Shopping List</button>';
            } else {
                html += '<p class="collection-empty-note">No recipes yet — add them from a recipe page.</p>';
            }

            html += '</div>';
        });

        container.innerHTML = html;
    }

    // ── Actions ───────────────────────────────────────────
    window.deleteCollection = function (colId) {
        if (!confirm('Delete this collection?')) return;
        if (window.AJPC) window.AJPC.Collections.delete(colId);
        renderCollections();
    };

    window.renameCollection = function (colId) {
        var col = window.AJPC && window.AJPC.Collections.get(colId);
        if (!col) return;
        var name = prompt('Rename collection:', col.name);
        if (!name || !name.trim()) return;
        window.AJPC.Collections.rename(colId, name.trim());
        renderCollections();
    };

    window.removeFromCollection = function (colId, recipeId) {
        if (!window.AJPC) return;
        window.AJPC.Collections.removeRecipe(colId, recipeId);
        renderCollections();
    };

    // ── Combined Shopping List ────────────────────────────
    window.openCombinedShopping = async function (colId) {
        var col = window.AJPC && window.AJPC.Collections.get(colId);
        if (!col || !col.recipes.length) return;

        var modal = getOrCreateModal('combined-shopping-modal');
        modal.innerHTML =
            '<div class="enh-modal-box enh-modal-wide">' +
                '<div class="enh-modal-header">' +
                    '<h3>Combined Shopping — ' + escHtml(col.name) + '</h3>' +
                    '<button class="enh-modal-close" onclick="document.getElementById(\'combined-shopping-modal\').style.display=\'none\'">×</button>' +
                '</div>' +
                '<div class="enh-modal-body" id="combinedShoppingBody">' +
                    '<div class="loading-state"><p>Loading recipes…</p></div>' +
                '</div>' +
            '</div>';
        modal.style.display = 'flex';

        // Load all recipes in collection
        var recipes = [];
        for (var i = 0; i < col.recipes.length; i++) {
            try {
                var res = await fetch('data/recipes/' + col.recipes[i].id + '.json');
                if (res.ok) recipes.push(await res.json());
            } catch(e) {}
        }

        // Load price DB
        if (!priceDB) {
            try {
                var pr = await fetch('json/recipe-prices.json');
                if (pr.ok) {
                    var raw = await pr.json();
                    priceDB = {};
                    Object.keys(raw).forEach(function (s) {
                        if (s !== '_meta') Object.assign(priceDB, raw[s]);
                    });
                }
            } catch(e) {}
        }

        renderCombinedList(recipes, col.name);
    };

    function renderCombinedList(recipes, colName) {
        var body = document.getElementById('combinedShoppingBody');
        if (!body) return;

        // Merge all ingredients
        var merged = {};  // key: item name → { qty, unit, fromRecipes[] }
        recipes.forEach(function (recipe) {
            (recipe.ingredients || []).forEach(function (ing) {
                if (ing.heading || ing.toTaste) return;
                var key = (ing.item || '').toLowerCase().trim();
                if (!key) return;
                if (!merged[key]) {
                    merged[key] = { item: ing.item, qty: 0, unit: ing.unit || '', fromRecipes: [] };
                }
                merged[key].qty += parseFloat(ing.quantity) || 0;
                var name = recipe.title || recipe.name || recipe.id;
                if (!merged[key].fromRecipes.includes(name)) merged[key].fromRecipes.push(name);
            });
        });

        var items = Object.values(merged).sort(function (a, b) { return a.item.localeCompare(b.item); });
        var totalCost = 0;
        var html = '<p class="combined-recipe-list">Recipes: ' + recipes.map(function(r){return escHtml(r.title||r.name);}).join(', ') + '</p>';
        html += '<ul class="combined-shopping-list">';

        items.forEach(function (item) {
            var info  = lookupPrice(item.item);
            var costStr = '';

            if (info && item.qty) {
                var needed  = convertToPackageUnit(item.qty, item.unit, info.unit);
                var pkgs    = Math.ceil(needed / info.size);
                var cost    = pkgs * info.price;
                totalCost  += cost;
                costStr = ' — ' + pkgs + ' × ' + info.size + info.unit +
                    ' @ $' + info.price.toFixed(2) + ' = <strong>$' + cost.toFixed(2) + '</strong>';
            }

            html += '<li class="combined-shopping-item">' +
                '<span class="combined-item-name">' + escHtml(item.item) + '</span>' +
                '<span class="combined-item-qty">' + (item.qty || '') + (item.unit ? ' ' + item.unit : '') + '</span>' +
                costStr +
                '<span class="combined-item-from">(' + item.fromRecipes.join(', ') + ')</span>' +
            '</li>';
        });

        html += '</ul>';
        html += '<div class="combined-total">Estimated Total: <strong>$' + totalCost.toFixed(2) + '</strong></div>';
        body.innerHTML = html;
    }

    // ── Unit conversion (same as recipe-enhancements.js) ─
    var UNIT_TO_BASE = {
        'g': 1, 'kg': 1000, 'ml': 1, 'l': 1000,
        'tsp': 5, 'tbsp': 15, 'cup': 240, 'cups': 240,
        'oz': 28, 'lb': 454
    };

    function convertToPackageUnit(qty, recipeUnit, pkgUnit) {
        var ru = (recipeUnit || '').toLowerCase().trim();
        var pu = (pkgUnit || '').toLowerCase().trim();
        if (ru === pu) return qty;
        var rb = UNIT_TO_BASE[ru], pb = UNIT_TO_BASE[pu];
        if (rb && pb) return (qty * rb) / pb;
        if ((!ru || ru === 'each') && pu === 'each') return qty;
        return qty;
    }

    function lookupPrice(itemName) {
        if (!priceDB) return null;
        var key = (itemName || '').toLowerCase().trim();
        if (priceDB[key]) return priceDB[key];
        for (var k in priceDB) {
            if (key.includes(k) || k.includes(key)) return priceDB[k];
        }
        return null;
    }

    // ── Helpers ───────────────────────────────────────────
    function getOrCreateModal(id) {
        var el = document.getElementById(id);
        if (el) return el;
        var modal = document.createElement('div');
        modal.id = id;
        modal.className = 'enh-modal-overlay';
        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.style.display = 'none';
        });
        document.body.appendChild(modal);
        return modal;
    }

    function escHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function escAttr(str) {
        return String(str || '').replace(/'/g,'&#39;').replace(/"/g,'&quot;');
    }

})();
