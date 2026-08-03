/* =========================================================
   RECIPE ENHANCEMENTS — KitchenNotebook Kitchen Notebook
   Listens for 'recipeRendered' from recipe-renderer.js
   Adds: favourites, recently viewed, collections,
         daily tracker, cost per serving, voice read cook mode
   Depends on: user-prefs.js (window.KitchenNotebook)
========================================================= */

(function () {
    'use strict';

    var recipe      = null;  // full recipe object, set on recipeRendered
    var multiplier  = 1;     // tracks scaler state

    // ── Bootstrap ─────────────────────────────────────────
    document.addEventListener('recipeRendered', function (e) {
        recipe = e.detail;
        if (!recipe) return;

        // Track recently viewed
        if (window.KitchenNotebook && window.KitchenNotebook.RecentlyViewed) {
            window.KitchenNotebook.RecentlyViewed.add(recipe.id, recipe.title || recipe.name, recipe.category);
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
            if (!window.KitchenNotebook) return;
            var added = window.KitchenNotebook.Favourites.toggle(recipe.id);
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
        if (!window.KitchenNotebook) return;
        var isFav = window.KitchenNotebook.Favourites.isFav(recipe.id);
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
    // Delegates to window.ShoppingList.calculateCost() in recipe-shopping.js
    // — the SAME pricing engine the shopping panel uses (unit conversion
    // table, pantry-aware exclusions, all of it). This box used to run its
    // own separate, simpler copy of that math, which quietly drifted out
    // of sync and showed a different price than the shopping panel for
    // the same recipe. Now there's exactly one place this logic lives.
    async function loadCostPerServing() {
        if (!recipe || !recipe.ingredients) return;
        renderCostBox();
    }

    function renderCostBox() {
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

    async function updateCostDisplay() {
        var box = document.getElementById('cost-per-serving-box');
        if (!box || !window.ShoppingList || !window.ShoppingList.calculateCost) return;
        var c = await window.ShoppingList.calculateCost(recipe, multiplier);
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
        if (!window.KitchenNotebook) return;
        var cols = window.KitchenNotebook.Collections.getAll();

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
        if (!window.KitchenNotebook) return;
        var col  = window.KitchenNotebook.Collections.get(colId);
        var inCol = col && col.recipes.some(function (r) { return r.id === recipeId; });
        if (inCol) window.KitchenNotebook.Collections.removeRecipe(colId, recipeId);
        else        window.KitchenNotebook.Collections.addRecipe(colId, recipeId, recipeName);
        openCollectionModal();
    };

    window.enhCreateCollection = function () {
        var input = document.getElementById('newCollectionName');
        if (!input || !input.value.trim()) return;
        if (!window.KitchenNotebook) return;
        window.KitchenNotebook.Collections.create(input.value.trim());
        window.KitchenNotebook.Collections.addRecipe(
            window.KitchenNotebook.Collections.getAll().slice(-1)[0].id,
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
        if (!window.KitchenNotebook) return;
        var ok = window.KitchenNotebook.DailyTracker.addEntry(recipe, window._trackerServings || 1);
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