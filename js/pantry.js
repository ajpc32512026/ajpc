/* =========================================================
   PANTRY — AJPC Kitchen Notebook
   Tracks pantry stock at two levels:
     Level 1: Have it / Don't have it (all ingredients)
     Level 2: Stock level for key ingredients
              Full | Half | Low | Empty
   
   Integrates with recipe-shopping.js to show:
     - What you need to buy vs already have
     - Substitution suggestions
     - Running low warnings

   Storage: localStorage via window.AJPC.Pantry API
   Depends on: user-prefs.js
========================================================= */

(function () {
    'use strict';

    var PANTRY_KEY = 'ajpc_pantry';

    // ── Stock levels for quantity-sensitive ingredients ───
    var STOCK_LEVELS = {
        FULL:  { label: 'Full',  desc: '1kg+ / unopened', icon: 'F' },
        HALF:  { label: 'Half',  desc: 'Roughly half left', icon: 'H' },
        LOW:   { label: 'Low',   desc: 'Less than 250g/ml', icon: 'L' },
        EMPTY: { label: 'Empty', desc: 'Out of stock', icon: '0' }
    };

    // ── Ingredients that benefit from level tracking ──────
    var LEVEL_TRACK = new Set([
        'plain flour','self-raising flour','bread flour','bakers flour',
        'wholemeal flour','almond meal','cornflour','rice flour',
        'caster sugar','white sugar','brown sugar','icing sugar',
        'raw sugar','coconut sugar',
        'unsalted butter','salted butter','butter',
        'milk','full cream milk','skim milk','buttermilk',
        'thickened cream','heavy cream','sour cream','cream',
        'olive oil','vegetable oil','canola oil','coconut oil',
        'baking powder','bicarbonate of soda','bi-carb soda','yeast',
        'cocoa powder','dark chocolate','milk chocolate',
        'rolled oats','breadcrumbs',
        'honey','maple syrup','golden syrup',
        'vanilla extract','vanilla bean paste',
        'eggs','egg'
    ]);

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

        // Set ingredient — have=true, level optional
        set: function(name, have, level) {
            var key = (name || '').toLowerCase().trim();
            if (!key) return;
            var p = load();
            if (!have) {
                delete p[key];
            } else {
                p[key] = {
                    have: true,
                    level: level || (LEVEL_TRACK.has(key) ? 'FULL' : null),
                    updated: new Date().toISOString().split('T')[0]
                };
            }
            save(p);
        },

        // Toggle have/don't have
        toggle: function(name) {
            var key = (name || '').toLowerCase().trim();
            var has = this.has(key);
            this.set(key, !has, has ? null : (LEVEL_TRACK.has(key) ? 'FULL' : null));
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
            if ((unit === 'g' || unit === 'ml') && qty > 200) return true;
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

        // Analyse a full recipe ingredient list against pantry
        // Returns { buy: [], have: [], low: [], subs: [] }
        analyseRecipe: function(ingredients) {
            var result = { buy: [], have: [], low: [], subs: [] };
            var self = this;

            (ingredients || []).forEach(function(ing) {
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

        // Bulk add ingredients from a recipe (all as "have")
        loadFromRecipe: function(ingredients) {
            var p = load();
            (ingredients || []).forEach(function(ing) {
                if (ing.heading || ing.toTaste) return;
                var key = (ing.item || ing.name || '').toLowerCase().trim();
                if (!key) return;
                if (!p[key]) {
                    p[key] = {
                        have: true,
                        level: LEVEL_TRACK.has(key) ? 'FULL' : null,
                        updated: new Date().toISOString().split('T')[0]
                    };
                }
            });
            save(p);
        },

        // Get all unique ingredient names from pantry sorted A-Z
        list: function() {
            return Object.keys(load()).sort();
        },

        // Clear entire pantry
        clear: function() { save({}); },

        // Expose constants for UI use
        STOCK_LEVELS: STOCK_LEVELS,
        LEVEL_TRACK: LEVEL_TRACK
    };

    // ── Attach to AJPC namespace ──────────────────────────
    window.AJPC = window.AJPC || {};
    window.AJPC.Pantry = Pantry;

})();
