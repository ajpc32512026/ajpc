/* =========================================================
   PANTRY — KitchenNotebook Kitchen Notebook
   Tracks pantry stock at two levels:
     Level 1: Have it / Don't have it (all ingredients)
     Level 2: Stock level — Full | Half | Low | Empty
              (every ingredient supports this, not just a
              fixed shortlist)
   
   Integrates with recipe-shopping.js to show:
     - What you need to buy vs already have
     - Substitution suggestions
     - Running low warnings

   Storage: localStorage via window.KitchenNotebook.Pantry API
   Depends on: user-prefs.js
========================================================= */

(function () {
    'use strict';

    var PANTRY_KEY = 'ajpc_pantry';
    var CUSTOM_CATEGORY_KEY = 'ajpc_pantry_custom_categories';

    // ── Stock levels for quantity-sensitive ingredients ───
    // NEEDS_BUY_THRESHOLD_G is the single source of truth for the "LOW but
    // still enough" cutoff — the label below and needsToBuy() both read
    // from it, so they can't drift out of sync again.
    var NEEDS_BUY_THRESHOLD_G = 200;
    var STOCK_LEVELS = {
        FULL:  { label: 'Full',  desc: '1kg+ / unopened', icon: 'F' },
        HALF:  { label: 'Half',  desc: 'Roughly half left', icon: 'H' },
        LOW:   { label: 'Low',   desc: 'Less than ' + NEEDS_BUY_THRESHOLD_G + 'g/ml', icon: 'L' },
        EMPTY: { label: 'Empty', desc: 'Out of stock', icon: '0' }
    };

    // ── Common substitutions ──────────────────────────────
    var SUBSTITUTIONS = {
        'self-raising flour': {
            subs: ['plain flour'],
            note: 'Add 2 tsp baking powder per 150g plain flour'
        },
        'plain flour': {
            subs: ['self-raising flour'],
            note: 'Omit any baking powder in the recipe'
        },
        'buttermilk': {
            subs: ['milk'],
            note: 'Add 1 tbsp lemon juice or vinegar per 250ml milk, let stand 5 min'
        },
        'caster sugar': {
            subs: ['white sugar'],
            note: 'White sugar works but dissolves slightly slower'
        },
        'white sugar': {
            subs: ['caster sugar'],
            note: 'Direct swap'
        },
        'brown sugar': {
            subs: ['white sugar', 'caster sugar'],
            note: 'Add 1 tsp molasses per 100g white sugar for closest result'
        },
        'thickened cream': {
            subs: ['heavy cream', 'cream'],
            note: 'Direct swap — same fat content'
        },
        'bicarbonate of soda': {
            subs: ['baking powder'],
            note: 'Use 3x the amount of baking powder (not ideal for all recipes)'
        },
        'bi-carb soda': {
            subs: ['baking powder'],
            note: 'Use 3x the amount of baking powder'
        },
        'unsalted butter': {
            subs: ['salted butter', 'butter'],
            note: 'Reduce added salt in recipe by 1/4 tsp per 125g butter'
        },
        'salted butter': {
            subs: ['unsalted butter', 'butter'],
            note: 'Add 1/4 tsp salt per 125g unsalted butter'
        },
        'vegetable oil': {
            subs: ['canola oil', 'olive oil', 'coconut oil'],
            note: 'Direct swap by volume'
        },
        'milk': {
            subs: ['full cream milk'],
            note: 'Direct swap'
        },
        'full cream milk': {
            subs: ['milk'],
            note: 'Direct swap'
        },
        'vanilla extract': {
            subs: ['vanilla bean paste'],
            note: '1 tsp extract = 1 tsp paste'
        },
        'vanilla bean paste': {
            subs: ['vanilla extract'],
            note: 'Direct swap'
        },
        'dark chocolate': {
            subs: ['cocoa powder'],
            note: '30g dark chocolate = 3 tbsp cocoa powder + 1 tbsp butter'
        },
        'lemon juice': {
            subs: ['lime juice'],
            note: 'Direct swap, slightly different flavour'
        },
        'honey': {
            subs: ['maple syrup', 'golden syrup'],
            note: 'Direct swap by volume'
        }
    };

    // ── Storage helpers ───────────────────────────────────
    function load() {
        try {
            return JSON.parse(localStorage.getItem(PANTRY_KEY) || '{}');
        } catch(e) { return {}; }
    }

    function save(data) {
        try { localStorage.setItem(PANTRY_KEY, JSON.stringify(data)); }
        catch(e) { console.warn('Pantry save failed:', e); }
    }

    function loadCustomCategories() {
        try {
            return JSON.parse(localStorage.getItem(CUSTOM_CATEGORY_KEY) || '[]');
        } catch(e) { return []; }
    }

    function saveCustomCategories(cats) {
        try { localStorage.setItem(CUSTOM_CATEGORY_KEY, JSON.stringify(cats)); }
        catch(e) { console.warn('Custom category save failed:', e); }
    }

    // ── Category merge (single source of truth) ────────────
    // Every place that touches an entry's category goes through here,
    // with an explicit mode instead of its own inline rule:
    //   'always'   — replace it outright, even with null (setCategory)
    //   'fill'     — only set it if the entry doesn't have one yet (addItems)
    //   'preserve' — replace only if a real value was given, else keep
    //                what's already there (set)
    function mergeCategory(current, incoming, mode) {
        if (mode === 'always') return incoming || null;
        if (mode === 'fill')   return current || incoming || null;
        return incoming || current || null; // 'preserve'
    }

    // ── Public API ────────────────────────────────────────
    var Pantry = {

        // Get full pantry object
        getAll: function() { return load(); },

        // Check if ingredient is in pantry
        has: function(name) {
            var key = (name || '').toLowerCase().trim();
            var p = load();
            return !!p[key];
        },

        // Get stock level (FULL/HALF/LOW/EMPTY or null if not tracked)
        getLevel: function(name) {
            var key = (name || '').toLowerCase().trim();
            var p = load();
            return p[key] ? (p[key].level || 'FULL') : null;
        },

        // Get the category stored against this item, if any (null if the
        // item isn't in the pantry, or was never assigned one - callers
        // should fall back to the static pantry-staples.json lookup or
        // 'Other' in that case).
        getCategory: function(name) {
            var key = (name || '').toLowerCase().trim();
            var p = load();
            return p[key] ? (p[key].category || null) : null;
        },

        // Set/change the category on an existing (or new) entry without
        // touching its have/level state.
        setCategory: function(name, category) {
            var key = (name || '').toLowerCase().trim();
            if (!key) return;
            var p = load();
            if (!p[key]) p[key] = { have: true, level: 'FULL' };
            p[key].category = mergeCategory(p[key].category, category, 'always');
            p[key].updated = new Date().toISOString().split('T')[0];
            save(p);
        },

        // Set ingredient — have=true, level optional, category optional.
        // Every item gets a stock level by default (FULL) so any ingredient
        // can be tracked Full/Half/Low/Empty, not just a fixed shortlist.
        set: function(name, have, level, category) {
            var key = (name || '').toLowerCase().trim();
            if (!key) return;
            var p = load();
            if (!have) {
                delete p[key];
            } else {
                var existing = p[key] || {};
                p[key] = {
                    have: true,
                    level: level || existing.level || 'FULL',
                    category: mergeCategory(existing.category, category, 'preserve'),
                    updated: new Date().toISOString().split('T')[0]
                };
            }
            save(p);
        },

        // Toggle have/don't have
        toggle: function(name) {
            var key = (name || '').toLowerCase().trim();
            var has = this.has(key);
            this.set(key, !has, has ? null : 'FULL');
            return !has;
        },

        // Update stock level only
        setLevel: function(name, level) {
            var key = (name || '').toLowerCase().trim();
            var p = load();
            if (!p[key]) p[key] = { have: true };
            p[key].level = level;
            p[key].updated = new Date().toISOString().split('T')[0];
            save(p);
        },

        // Check if a level means we need to buy more
        needsToBuy: function(name, neededQty, neededUnit) {
            var key = (name || '').toLowerCase().trim();
            if (!this.has(key)) return true;
            var level = this.getLevel(key);
            if (!level || level === 'FULL' || level === 'HALF') return false;
            if (level === 'EMPTY') return true;
            // LOW — need to buy if recipe needs more than ~200g/ml
            var qty = parseFloat(neededQty) || 0;
            var unit = (neededUnit || '').toLowerCase();
            if ((unit === 'g' || unit === 'ml') && qty > NEEDS_BUY_THRESHOLD_G) return true;
            if (unit === 'kg' || unit === 'l') return true;
            return false; // LOW but small amount — probably fine
        },

        // Get substitution suggestion for an ingredient
        getSubstitution: function(name) {
            var key = (name || '').toLowerCase().trim();
            var sub = SUBSTITUTIONS[key];
            if (!sub) return null;
            // Check if user has any of the substitutes
            for (var i = 0; i < sub.subs.length; i++) {
                if (this.has(sub.subs[i])) {
                    return {
                        ingredient: name,
                        useInstead: sub.subs[i],
                        note: sub.note
                    };
                }
            }
            return null;
        },

        // Combines ingredient lines that share the same name (e.g. "Bakers
        // Flour" appearing once in a Poolish section and again in a Bread
        // Dough section) into one line with the summed quantity, so a
        // recipe with multiple sections doesn't get evaluated as if the
        // same ingredient were two separate ingredients. Quantities are
        // only summed when both lines use the same unit — mismatched units
        // (e.g. "1 cup" + "200 ml") are left as separate lines rather than
        // guessing a conversion.
        _mergeIngredientLines: function(ingredients) {
            var order = [];
            var indexByKey = {};
            (ingredients || []).forEach(function(ing) {
                if (ing.heading || ing.toTaste) { order.push(ing); return; }
                var name = (ing.item || ing.name || '').toLowerCase().trim();
                var unit = (ing.unit || '').toLowerCase().trim();
                if (!name) { order.push(ing); return; }
                var key = name + '|' + unit;
                if (indexByKey.hasOwnProperty(key)) {
                    var i = indexByKey[key];
                    var prevQty = parseFloat(order[i].quantity) || 0;
                    var thisQty = parseFloat(ing.quantity) || 0;
                    order[i] = Object.assign({}, order[i], { quantity: prevQty + thisQty });
                } else {
                    indexByKey[key] = order.length;
                    order.push(ing);
                }
            });
            return order;
        },

        // Analyse a full recipe ingredient list against pantry
        // Returns { buy: [], have: [], low: [], subs: [] }
        analyseRecipe: function(ingredients) {
            var result = { buy: [], have: [], low: [], subs: [] };
            var self = this;
            var merged = self._mergeIngredientLines(ingredients);

            merged.forEach(function(ing) {
                if (ing.heading || ing.toTaste) return;
                var name = (ing.item || ing.name || '').toLowerCase().trim();
                if (!name) return;

                var has = self.has(name);
                var level = self.getLevel(name);
                var needsBuy = self.needsToBuy(name, ing.quantity, ing.unit);

                if (!has) {
                    // Don't have it — check for substitution
                    var sub = self.getSubstitution(name);
                    if (sub) {
                        result.subs.push(sub);
                    } else {
                        result.buy.push(ing);
                    }
                } else if (needsBuy) {
                    result.low.push({ ing: ing, level: level });
                } else {
                    result.have.push(ing);
                }
            });

            return result;
        },

        // Add a hand-picked set of items, each with its own category.
        // items: [{ name, category }]. Existing entries are not
        // overwritten, except that a missing category on an existing
        // entry will be filled in if one is supplied here.
        addItems: function(items) {
            var p = load();
            (items || []).forEach(function(it) {
                var key = (it.name || '').toLowerCase().trim();
                if (!key) return;
                if (!p[key]) {
                    p[key] = {
                        have: true,
                        level: 'FULL',
                        category: it.category || null,
                        updated: new Date().toISOString().split('T')[0]
                    };
                } else {
                    var newCategory = mergeCategory(p[key].category, it.category, 'fill');
                    if (newCategory !== p[key].category) {
                        p[key].category = newCategory;
                        p[key].updated = new Date().toISOString().split('T')[0];
                    }
                }
            });
            save(p);
        },

        // Serialise the whole pantry for export/download.
        exportJSON: function() {
            return JSON.stringify(load(), null, 2);
        },

        // User-created categories, persisted separately from the static
        // pantry-staples.json catalog so they survive even though that
        // file itself isn't being rewritten by the browser.
        getCustomCategories: function() {
            return loadCustomCategories();
        },

        // Add a new category name if it doesn't already exist (case-
        // insensitive check, original casing preserved). Returns the
        // updated list.
        addCustomCategory: function(name) {
            name = (name || '').trim();
            if (!name) return loadCustomCategories();
            var cats = loadCustomCategories();
            var exists = cats.some(function(c) { return c.toLowerCase() === name.toLowerCase(); });
            if (!exists) {
                cats.push(name);
                saveCustomCategories(cats);
            }
            return cats;
        },

        // Get all unique ingredient names from pantry sorted A-Z
        list: function() {
            return Object.keys(load()).sort();
        },

        // Clear entire pantry
        clear: function() { save({}); },

        // Expose constants for UI use
        STOCK_LEVELS: STOCK_LEVELS
    };

    // ── Attach to KitchenNotebook namespace ──────────────────────────
    window.KitchenNotebook = window.KitchenNotebook || {};
    window.KitchenNotebook.Pantry = Pantry;

})();
