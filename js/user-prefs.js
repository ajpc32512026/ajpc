/* =========================================================
   USER PREFS — AJPC Kitchen Notebook
   Single source of truth for all user localStorage data:
   - Favourites
   - Recently Viewed
   - Collections / Meal Plans
   - Daily Intake Tracker
========================================================= */

(function() {
    'use strict';

    // ── Storage Keys ──────────────────────────────────────
    var KEYS = {
        FAVOURITES:   'ajpc_favourites',
        RECENT:       'ajpc_recently_viewed',
        COLLECTIONS:  'ajpc_collections',
        DAILY:        'ajpc_daily_tracker',
    };

    var RECENT_MAX = 20;

    // ── Safe storage helpers ──────────────────────────────
    function load(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
        catch(e) { return fallback; }
    }

    function save(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; }
        catch(e) { console.warn('AJPC storage write failed:', key, e); return false; }
    }

    // ══════════════════════════════════════════════════════
    // FAVOURITES
    // ══════════════════════════════════════════════════════
    var Favourites = {
        getAll: function() { return load(KEYS.FAVOURITES, []); },

        toggle: function(id) {
            var favs = this.getAll();
            var idx  = favs.indexOf(id);
            if (idx === -1) favs.push(id);
            else            favs.splice(idx, 1);
            save(KEYS.FAVOURITES, favs);
            document.dispatchEvent(new CustomEvent('ajpc:favourites-changed', { detail: { id: id, isFav: idx === -1 } }));
            return idx === -1; // true = added
        },

        isFav: function(id) { return this.getAll().includes(id); },

        remove: function(id) {
            var favs = this.getAll().filter(function(f) { return f !== id; });
            save(KEYS.FAVOURITES, favs);
        }
    };

    // ══════════════════════════════════════════════════════
    // RECENTLY VIEWED
    // ══════════════════════════════════════════════════════
    var RecentlyViewed = {
        getAll: function() { return load(KEYS.RECENT, []); },

        add: function(id, name, category) {
            var recent = this.getAll().filter(function(r) { return r.id !== id; });
            recent.unshift({ id: id, name: name, category: category || '', ts: Date.now() });
            if (recent.length > RECENT_MAX) recent = recent.slice(0, RECENT_MAX);
            save(KEYS.RECENT, recent);
        },

        clear: function() { save(KEYS.RECENT, []); }
    };

    // ══════════════════════════════════════════════════════
    // COLLECTIONS / MEAL PLANS
    // ══════════════════════════════════════════════════════
    var Collections = {
        getAll: function() { return load(KEYS.COLLECTIONS, []); },

        create: function(name) {
            if (!name || !name.trim()) return null;
            var cols = this.getAll();
            var col  = { id: 'col_' + Date.now(), name: name.trim(), recipes: [], created: Date.now() };
            cols.push(col);
            save(KEYS.COLLECTIONS, cols);
            return col;
        },

        delete: function(colId) {
            save(KEYS.COLLECTIONS, this.getAll().filter(function(c) { return c.id !== colId; }));
        },

        rename: function(colId, newName) {
            var cols = this.getAll().map(function(c) {
                return c.id === colId ? Object.assign({}, c, { name: newName.trim() }) : c;
            });
            save(KEYS.COLLECTIONS, cols);
        },

        addRecipe: function(colId, recipeId, recipeName) {
            var cols = this.getAll().map(function(c) {
                if (c.id !== colId) return c;
                var exists = c.recipes.some(function(r) { return r.id === recipeId; });
                if (exists) return c;
                return Object.assign({}, c, { recipes: c.recipes.concat([{ id: recipeId, name: recipeName }]) });
            });
            save(KEYS.COLLECTIONS, cols);
        },

        removeRecipe: function(colId, recipeId) {
            var cols = this.getAll().map(function(c) {
                if (c.id !== colId) return c;
                return Object.assign({}, c, { recipes: c.recipes.filter(function(r) { return r.id !== recipeId; }) });
            });
            save(KEYS.COLLECTIONS, cols);
        },

        get: function(colId) {
            return this.getAll().find(function(c) { return c.id === colId; }) || null;
        }
    };

    // ══════════════════════════════════════════════════════
    // DAILY INTAKE TRACKER
    // ══════════════════════════════════════════════════════
    var DailyTracker = {
        _todayKey: function() {
            return 'day_' + new Date().toISOString().split('T')[0];
        },

        getToday: function() {
            var all = load(KEYS.DAILY, {});
            return all[this._todayKey()] || { entries: [], totals: { cal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 } };
        },

        addEntry: function(recipe, servings) {
            if (!recipe.nutrition) return false;
            var n    = recipe.nutrition;
            var servingsNum = parseInt(recipe.servings) || 1;
            var portions = servings || 1;
            var factor   = portions / servingsNum;

            var entry = {
                id:      recipe.id,
                name:    recipe.title || recipe.name,
                servings: portions,
                ts:      Date.now(),
                cal:     Math.round((n.cal || 0) * factor),
                protein: Math.round((n.protein || 0) * factor),
                carbs:   Math.round((n.carbs || 0) * factor),
                fat:     Math.round((n.fat || 0) * factor),
                sodium:  Math.round((n.sodium || 0) * factor),
            };

            var all  = load(KEYS.DAILY, {});
            var key  = this._todayKey();
            var day  = all[key] || { entries: [], totals: { cal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 } };

            day.entries.push(entry);
            day.totals.cal     += entry.cal;
            day.totals.protein += entry.protein;
            day.totals.carbs   += entry.carbs;
            day.totals.fat     += entry.fat;
            day.totals.sodium  += entry.sodium;

            all[key] = day;
            // Keep only last 7 days
            var keys = Object.keys(all).sort().reverse();
            if (keys.length > 7) keys.slice(7).forEach(function(k) { delete all[k]; });
            save(KEYS.DAILY, all);
            return true;
        },

        removeEntry: function(ts) {
            var all = load(KEYS.DAILY, {});
            var key = this._todayKey();
            var day = all[key];
            if (!day) return;
            var entry = day.entries.find(function(e) { return e.ts === ts; });
            if (!entry) return;
            day.entries = day.entries.filter(function(e) { return e.ts !== ts; });
            ['cal','protein','carbs','fat','sodium'].forEach(function(k) { day.totals[k] -= (entry[k] || 0); });
            all[key] = day;
            save(KEYS.DAILY, all);
        },

        getWeek: function() {
            var all = load(KEYS.DAILY, {});
            var result = [];
            for (var i = 6; i >= 0; i--) {
                var d   = new Date(); d.setDate(d.getDate() - i);
                var key = 'day_' + d.toISOString().split('T')[0];
                result.push({ date: d.toISOString().split('T')[0], data: all[key] || null });
            }
            return result;
        },

        clearToday: function() {
            var all = load(KEYS.DAILY, {});
            delete all[this._todayKey()];
            save(KEYS.DAILY, all);
        }
    };

    // ══════════════════════════════════════════════════════
    // PUBLIC API
    // ══════════════════════════════════════════════════════
    window.AJPC = window.AJPC || {};
    window.AJPC.Favourites    = Favourites;
    window.AJPC.RecentlyViewed = RecentlyViewed;
    window.AJPC.Collections   = Collections;
    window.AJPC.DailyTracker  = DailyTracker;

})();
