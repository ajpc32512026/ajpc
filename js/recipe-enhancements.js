/* =========================================================
   RECIPE ENHANCEMENTS — AJPC Kitchen Notebook
   Listens for 'recipeRendered' from recipe-renderer.js
   Adds: favourites, recently viewed, collections,
         daily tracker, cost per serving, voice read cook mode
   Depends on: user-prefs.js (window.AJPC)
========================================================= */

(function () {
    'use strict';

    var recipe      = null;  // full recipe object, set on recipeRendered
    var priceDB     = null;  // loaded once from recipe-prices.json
    var multiplier  = 1;     // tracks scaler state

    // ── Bootstrap ─────────────────────────────────────────
    document.addEventListener('recipeRendered', function (e) {
        recipe = e.detail;
        if (!recipe) return;

        // Track recently viewed
        if (window.AJPC && window.AJPC.RecentlyViewed) {
            window.AJPC.RecentlyViewed.add(recipe.id, recipe.title || recipe.name, recipe.category);
        }

        injectToolbarButtons();
        loadCostPerServing();
        syncScalerMultiplier();
    });

    // ── Toolbar injection ─────────────────────────────────
    // Adds buttons after the existing toolbar buttons
    function injectToolbarButtons() {
        var toolbar = document.querySelector('.recipe-toolbar');
        if (!toolbar) return;

        // Favourite button
        var favBtn = document.createElement('button');
        favBtn.className = 'toolbar-btn';
        favBtn.id = 'favouriteBtn';
        updateFavBtn(favBtn);
        favBtn.addEventListener('click', function () {
            if (!window.AJPC) return;
            var added = window.AJPC.Favourites.toggle(recipe.id);
            updateFavBtn(favBtn);
            toast(added ? 'Added to favourites' : 'Removed from favourites');
        });
        toolbar.appendChild(favBtn);

        // Add to Collection button
        var colBtn = document.createElement('button');
        colBtn.className = 'toolbar-btn';
        colBtn.id = 'addToCollectionBtn';
        colBtn.textContent = 'Add to Collection';
        colBtn.addEventListener('click', openCollectionModal);
        toolbar.appendChild(colBtn);

        // Add to Daily Tracker button
        var trackBtn = document.createElement('button');
        trackBtn.className = 'toolbar-btn';
        trackBtn.id = 'addToTrackerBtn';
        trackBtn.textContent = 'Track Intake';
        if (!recipe.nutrition) {
            trackBtn.disabled = true;
            trackBtn.title = 'No nutrition data for this recipe';
        }
        trackBtn.addEventListener('click', openTrackerModal);
        toolbar.appendChild(trackBtn);

        // Voice Read button (only if speech synthesis available)
        if (window.speechSynthesis) {
            var voiceBtn = document.createElement('button');
            voiceBtn.className = 'toolbar-btn';
            voiceBtn.id = 'voiceReadBtn';
            voiceBtn.textContent = 'Voice Read';
            voiceBtn.addEventListener('click', toggleVoiceRead);
            toolbar.appendChild(voiceBtn);
        }
    }

    function updateFavBtn(btn) {
        if (!window.AJPC) return;
        var isFav = window.AJPC.Favourites.isFav(recipe.id);
        btn.textContent = isFav ? 'Favourited' : 'Favourite';
        btn.classList.toggle('active', isFav);
    }

    // ── Sync with scaler ──────────────────────────────────
    // recipe-renderer.js manages the scaler internally —
    // we observe the display span to keep our multiplier in sync
    function syncScalerMultiplier() {
        var display = document.getElementById('scalerDisplay');
        if (!display) return;
        var observer = new MutationObserver(function () {
            var text = display.textContent || '1x';
            multiplier = parseFloat(text) || 1;
            updateCostDisplay();
        });
        observer.observe(display, { childList: true, characterData: true, subtree: true });
    }

    // ── Cost per Serving ──────────────────────────────────
    async function loadCostPerServing() {
        if (!recipe || !recipe.ingredients) return;
        if (!priceDB) {
            try {
                var res = await fetch('json/recipe-prices.json');
                if (!res.ok) return;
                var raw = await res.json();
                
                // Flatten and standardise all sections into lowercase, trimmed keys
                priceDB = {};
                Object.keys(raw).forEach(function (section) {
                    if (section === '_meta') return;
                    Object.keys(raw[section]).forEach(function (key) {
                        var itemData = raw[section][key];
                        priceDB[key.toLowerCase().trim()] = {
                            size: parseFloat(itemData.size),
                            unit: (itemData.unit || '').toLowerCase().trim(),
                            price: parseFloat(itemData.price),
                            brand: itemData.brand || '',
                            section: section,
                            originalKey: key
                        };
                    });
                });
            } catch (e) { return; }
        }
        renderCostBox();
    }

    var UNIT_TO_BASE = {
        'g': 1, 'gram': 1, 'grams': 1, 'kg': 1000,
        'ml': 1, 'l': 1000,
        'tsp': 5, 'tbsp': 15, 'cup': 240, 'cups': 240,
        'oz': 28, 'lb': 454
    };

    function lookupPrice(itemName) {
        if (!priceDB) return null;
        var key = (itemName || '').toLowerCase().trim();
        
        // Exact lowercase match
        if (priceDB[key]) return priceDB[key];
        
        // Substring matching (both keys are standardized lowercase)
        for (var k in priceDB) {
            if (key.includes(k) || k.includes(key)) return priceDB[k];
        }
        return null;
    }

    function splitIngredientAndNotes(raw) {
        const text = raw.trim();
        let ingredient = text;
        const parenIndex = text.indexOf('(');
        if (parenIndex !== -1) {
            ingredient = text.substring(0, parenIndex).trim();
        }
        return ingredient;
    }

    function calcRecipeCost() {
        if (!priceDB || !recipe || !recipe.ingredients) return null;
        
        // Pantry staples to exclude (perfectly aligned with recipe-shopping.js)
        var excludeItems = ['water', 'hot water', 'cold water', 'warm water', 'boiling water', 'tap water', 'salt', 'pepper', 'black pepper', 'white pepper', 'to taste'];
        
        var totalBuyCost   = 0;
        var totalMakeCost  = 0;
        var matched = 0, total = 0;

        recipe.ingredients.forEach(function (ing) {
            if (ing.heading || ing.toTaste) return;
            
            var rawItem = (ing.item || ing.name || '').trim();
            var itemNameClean = splitIngredientAndNotes(rawItem).toLowerCase().trim();
            
            // Skip pantry staples entirely
            if (excludeItems.includes(itemNameClean)) return;
            
            total++;
            var info = lookupPrice(itemNameClean);
            if (!info) return;

            var qty  = (parseFloat(ing.quantity) || 0) * multiplier;
            var unit = (ing.unit || '').toLowerCase().trim();
            var pkgUnit = (info.unit || '').toLowerCase().trim();

            // Convert recipe qty to package unit (utilising shopping list scale math)
            var neededInPkgUnits = qty;
            if (unit === 'g' && pkgUnit === 'kg') neededInPkgUnits = qty / 1000;
            if (unit === 'ml' && pkgUnit === 'l') neededInPkgUnits = qty / 1000;
            
            // Fallback to UNIT_TO_BASE conversion table if units are completely different
            if (unit !== pkgUnit && !(unit === 'g' && pkgUnit === 'kg') && !(unit === 'ml' && pkgUnit === 'l')) {
                var recipeBase = UNIT_TO_BASE[unit];
                var pkgBase    = UNIT_TO_BASE[pkgUnit];
                if (recipeBase && pkgBase) {
                    neededInPkgUnits = (qty * recipeBase) / pkgBase;
                }
            }

            var pkgsNeeded  = Math.ceil(neededInPkgUnits / info.size);
            var buyCost     = pkgsNeeded * info.price;
            var makeCost    = (neededInPkgUnits / info.size) * info.price;

            totalBuyCost  += buyCost;
            totalMakeCost += makeCost;
            matched++;
        });

        if (!matched) return null;
        var servingsNum = (parseInt(recipe.servings) || 1) * multiplier;
        var coverage    = Math.round((matched / total) * 100);
        return {
            totalBuy:       totalBuyCost.toFixed(2),
            totalMake:      totalMakeCost.toFixed(2),
            buyPerServing:  (totalBuyCost / servingsNum).toFixed(2),
            makePerServing: (totalMakeCost / servingsNum).toFixed(2),
            coverage,
            servings:       servingsNum
        };
    }

    function renderCostBox() {
        // Insert below nutrition or below ingredients section
        var anchor = document.querySelector('.nutrition-section') ||
                     document.querySelector('.ingredients');
        if (!anchor) return;

        var existing = document.getElementById('cost-per-serving-box');
        if (!existing) {
            var box = document.createElement('div');
            box.id = 'cost-per-serving-box';
            box.className = 'cost-per-serving-box';
            anchor.after(box);
        }
        updateCostDisplay();
    }

    function updateCostDisplay() {
        var box = document.getElementById('cost-per-serving-box');
        if (!box) return;
        var c = calcRecipeCost();
        if (!c) { box.style.display = 'none'; return; }

        var scalerNote = multiplier !== 1
            ? '<span class="cost-scaler-note"> (scaled ' + multiplier + 'x)</span>'
            : '';

        box.innerHTML =
            '<div class="cost-box-header">Estimated Cost' + scalerNote + '</div>' +
            '<div class="cost-box-grid">' +
                '<div class="cost-box-item">' +
                    '<span class="cost-label">Cost to Make</span>' +
                    '<span class="cost-value">$' + c.totalMake + '</span>' +
                    '<span class="cost-sub">$' + c.makePerServing + ' per serving</span>' +
                '</div>' +
                '<div class="cost-box-item">' +
                    '<span class="cost-label">Cost to Buy</span>' +
                    '<span class="cost-value">$' + c.totalBuy + '</span>' +
                    '<span class="cost-sub">$' + c.buyPerServing + ' per serving</span>' +
                '</div>' +
            '</div>' +
            '<div class="cost-coverage">' + c.coverage + '% ingredient price coverage · ' +
                c.servings + ' serving' + (c.servings !== 1 ? 's' : '') + '</div>';
        box.style.display = 'block';
    }

    // ── Collection Modal ──────────────────────────────────
    function openCollectionModal() {
        if (!window.AJPC) return;
        var cols = window.AJPC.Collections.getAll();

        var modal = getOrCreateModal('collection-modal');
        modal.innerHTML =
            '<div class="enh-modal-box">' +
                '<div class="enh-modal-header">' +
                    '<h3>Add to Collection</h3>' +
                    '<button class="enh-modal-close" onclick="document.getElementById(\'collection-modal\').style.display=\'none\'">×</button>' +
                '</div>' +
                '<div class="enh-modal-body">' +
                    (cols.length ? cols.map(function (c) {
                        var inCol = c.recipes.some(function (r) { return r.id === recipe.id; });
                        return '<div class="collection-row">' +
                            '<span class="collection-name">' + escHtml(c.name) +
                                ' <small>(' + c.recipes.length + ')</small></span>' +
                            '<button class="enh-btn ' + (inCol ? 'enh-btn-remove' : 'enh-btn-add') + '" ' +
                                'onclick="enhToggleCollection(\'' + c.id + '\',\'' + escAttr(recipe.id) + '\',\'' + escAttr(recipe.title || recipe.name) + '\')">' +
                                (inCol ? 'Remove' : 'Add') +
                            '</button>' +
                        '</div>';
                    }).join('') : '<p class="enh-empty">No collections yet.</p>') +
                '</div>' +
                '<div class="enh-modal-footer">' +
                    '<input type="text" id="newCollectionName" class="enh-input" placeholder="New collection name…" maxlength="50">' +
                    '<button class="enh-btn enh-btn-add" onclick="enhCreateCollection()">Create</button>' +
                '</div>' +
            '</div>';
        modal.style.display = 'flex';
    }

    window.enhToggleCollection = function (colId, recipeId, recipeName) {
        if (!window.AJPC) return;
        var col  = window.AJPC.Collections.get(colId);
        var inCol = col && col.recipes.some(function (r) { return r.id === recipeId; });
        if (inCol) window.AJPC.Collections.removeRecipe(colId, recipeId);
        else        window.AJPC.Collections.addRecipe(colId, recipeId, recipeName);
        openCollectionModal();
    };

    window.enhCreateCollection = function () {
        var input = document.getElementById('newCollectionName');
        if (!input || !input.value.trim()) return;
        if (!window.AJPC) return;
        window.AJPC.Collections.create(input.value.trim());
        window.AJPC.Collections.addRecipe(
            window.AJPC.Collections.getAll().slice(-1)[0].id,
            recipe.id,
            recipe.title || recipe.name
        );
        input.value = '';
        openCollectionModal();
        toast('Collection created');
    };

    // ── Daily Tracker Modal ───────────────────────────────
    function openTrackerModal() {
        if (!recipe.nutrition) return;
        var modal = getOrCreateModal('tracker-modal');
        var servingsNum = parseInt(recipe.servings) || 1;

        modal.innerHTML =
            '<div class="enh-modal-box">' +
                '<div class="enh-modal-header">' +
                    '<h3>Track Intake</h3>' +
                    '<button class="enh-modal-close" onclick="document.getElementById(\'tracker-modal\').style.display=\'none\'">×</button>' +
                '</div>' +
                '<div class="enh-modal-body">' +
                    '<p class="enh-modal-recipe-name">' + escHtml(recipe.title || recipe.name) + '</p>' +
                    '<div class="tracker-serving-row">' +
                        '<label for="trackerServings">How many servings?</label>' +
                        '<div class="tracker-serving-ctrl">' +
                            '<button class="scaler-btn" onclick="enhTrackerAdj(-1)">−</button>' +
                            '<span id="trackerServingsDisplay">1</span>' +
                            '<button class="scaler-btn" onclick="enhTrackerAdj(1)">+</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="tracker-nutrition-preview" id="trackerNutrPreview">' +
                        renderTrackerPreview(1) +
                    '</div>' +
                '</div>' +
                '<div class="enh-modal-footer">' +
                    '<button class="enh-btn enh-btn-add" onclick="enhAddToTracker()">Add to Today</button>' +
                    '<a href="daily-tracker.html" class="enh-btn">View Daily Log</a>' +
                '</div>' +
            '</div>';

        window._trackerServings = 1;
        modal.style.display = 'flex';
    }

    function renderTrackerPreview(servings) {
        if (!recipe.nutrition) return '';
        var n   = recipe.nutrition;
        var s   = parseInt(recipe.servings) || 1;
        var f   = servings / s;
        var cal = Math.round((n.cal || 0) * f);
        var pro = Math.round((n.protein || 0) * f);
        var car = Math.round((n.carbs || 0) * f);
        var fat = Math.round((n.fat || 0) * f);
        return '<div class="tracker-macros">' +
            '<span><strong>' + cal + '</strong> cal</span>' +
            '<span><strong>' + pro + 'g</strong> protein</span>' +
            '<span><strong>' + car + 'g</strong> carbs</span>' +
            '<span><strong>' + fat + 'g</strong> fat</span>' +
            '</div>';
    }

    window.enhTrackerAdj = function (delta) {
        window._trackerServings = Math.max(1, (window._trackerServings || 1) + delta);
        var disp = document.getElementById('trackerServingsDisplay');
        if (disp) disp.textContent = window._trackerServings;
        var prev = document.getElementById('trackerNutrPreview');
        if (prev) prev.innerHTML = renderTrackerPreview(window._trackerServings);
    };

    window.enhAddToTracker = function () {
        if (!window.AJPC) return;
        var ok = window.AJPC.DailyTracker.addEntry(recipe, window._trackerServings || 1);
        document.getElementById('tracker-modal').style.display = 'none';
        toast(ok ? 'Added to today\'s intake' : 'No nutrition data to track');
    };

    // ── Voice Read Cook Mode ──────────────────────────────
    var voiceActive     = false;
    var voiceStepIndex  = 0;
    var voiceUtterance  = null;

    function getSteps() {
        return (recipe.method || []).filter(function (s) { return s.instruction; });
    }

    function toggleVoiceRead() {
        var btn = document.getElementById('voiceReadBtn');
        if (voiceActive) {
            stopVoice();
            if (btn) { btn.textContent = 'Voice Read'; btn.classList.remove('active'); }
        } else {
            startVoice();
            if (btn) { btn.textContent = 'Stop Voice'; btn.classList.add('active'); }
        }
    }

    function startVoice() {
        voiceActive    = true;
        voiceStepIndex = 0;
        injectVoiceBar();
        speakStep(voiceStepIndex);
    }

    function stopVoice() {
        voiceActive = false;
        window.speechSynthesis.cancel();
        var bar = document.getElementById('voiceReadBar');
        if (bar) bar.remove();
    }

    function speakStep(idx) {
        var steps = getSteps();
        if (!voiceActive || idx >= steps.length) {
            stopVoice();
            var btn = document.getElementById('voiceReadBtn');
            if (btn) { btn.textContent = 'Voice Read'; btn.classList.remove('active'); }
            return;
        }
        window.speechSynthesis.cancel();
        var text = 'Step ' + (idx + 1) + '. ' + steps[idx].instruction;
        voiceUtterance = new SpeechSynthesisUtterance(text);
        voiceUtterance.rate  = 0.92;
        voiceUtterance.pitch = 1;
        voiceUtterance.onend = function () {
            if (voiceActive) updateVoiceBar(idx);
        };
        window.speechSynthesis.speak(voiceUtterance);
        updateVoiceBar(idx);
    }

    function injectVoiceBar() {
        var existing = document.getElementById('voiceReadBar');
        if (existing) return;
        var bar = document.createElement('div');
        bar.id        = 'voiceReadBar';
        bar.className = 'voice-read-bar';
        updateVoiceBar(0, bar);
        var container = document.getElementById('recipe-container');
        if (container) container.prepend(bar);
    }

    function updateVoiceBar(idx, bar) {
        var el    = bar || document.getElementById('voiceReadBar');
        if (!el) return;
        var steps = getSteps();
        el.innerHTML =
            '<div class="voice-bar-inner">' +
                '<span class="voice-step-label">Step ' + (idx + 1) + ' of ' + steps.length + '</span>' +
                '<div class="voice-bar-controls">' +
                    '<button class="voice-btn" onclick="enhVoicePrev()" ' + (idx === 0 ? 'disabled' : '') + '>← Prev</button>' +
                    '<button class="voice-btn voice-btn-replay" onclick="enhVoiceReplay()">↺ Replay</button>' +
                    '<button class="voice-btn" onclick="enhVoiceNext()" ' + (idx >= steps.length - 1 ? 'disabled' : '') + '>Next →</button>' +
                    '<button class="voice-btn voice-btn-stop" onclick="enhVoiceStop()">Stop</button>' +
                '</div>' +
                '<p class="voice-step-text">' + escHtml(steps[idx].instruction) + '</p>' +
            '</div>';
        voiceStepIndex = idx;
    }

    window.enhVoicePrev    = function () { speakStep(Math.max(0, voiceStepIndex - 1)); };
    window.enhVoiceNext    = function () { speakStep(voiceStepIndex + 1); };
    window.enhVoiceReplay  = function () { speakStep(voiceStepIndex); };
    window.enhVoiceStop    = function () {
        stopVoice();
        var btn = document.getElementById('voiceReadBtn');
        if (btn) { btn.textContent = 'Voice Read'; btn.classList.remove('active'); }
    };

    // ── Helpers ───────────────────────────────────────────
    function getOrCreateModal(id) {
        var existing = document.getElementById(id);
        if (existing) return existing;
        var modal = document.createElement('div');
        modal.id        = id;
        modal.className = 'enh-modal-overlay';
        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.style.display = 'none';
        });
        document.body.appendChild(modal);
        return modal;
    }

    function toast(msg) {
        var t = document.getElementById('toast') || document.createElement('div');
        if (!t.id) {
            t.id = 'enh-toast';
            t.className = 'toast';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(function () { t.classList.remove('show'); }, 2400);
    }

    function escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escAttr(str) {
        return String(str || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    }

})();