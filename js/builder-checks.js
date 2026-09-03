/* =========================================================
   BUILDER CHECKS — Recipe Builder
   - Duplicate ID detection against recipe-index.json
   - Recipe diff view (loaded JSON vs current form state)
   Depends on: builder-main.js (val, buildJSON, currentFilename)
========================================================= */

(function () {
    'use strict';

    var recipeIndex  = [];
    var loadedJSON   = null;   // the JSON as it was when loaded/last saved

    // ── Load index on startup ─────────────────────────────
    async function loadIndex() {
        try {
            var res = await fetch('json/recipe-index.json?t=' + Date.now());
            if (res.ok) recipeIndex = await res.json();
        } catch(e) { console.warn('builder-checks: could not load recipe index'); }
    }

    // ── Duplicate ID Detection ────────────────────────────
    function checkDuplicate() {
        var title    = (typeof val === 'function') ? val('title') : '';
        var id       = title.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        var warnEl   = document.getElementById('duplicate-id-warning');

        if (!id || !warnEl) return;

        var editingId = (typeof currentFilename !== 'undefined') ? currentFilename.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        var isDup = recipeIndex.some(function (r) {
            return r.id === id && r.id !== editingId;
        });

        warnEl.style.display = isDup ? 'block' : 'none';
        warnEl.textContent   = isDup
            ? 'Warning: A recipe with this ID already exists in the notebook: "' + id + '"'
            : '';
    }

    // ── Diff View ─────────────────────────────────────────
    function snapshotLoaded(data) {
        loadedJSON = JSON.parse(JSON.stringify(data));
    }

    function generateDiff() {
        if (!loadedJSON) {
            showDiff('<p class="diff-note">No file loaded — diff requires loading an existing recipe first.</p>');
            return;
        }

        var current = (typeof buildJSON === 'function') ? buildJSON().obj : {};
        var changes = [];

        // Compare flat fields
        var flatFields = ['title','category','difficulty','description',
                          'prepTime','cookTime','totalTime','servings'];
        flatFields.forEach(function (field) {
            var oldVal = loadedJSON[field] || '';
            var newVal = current[field]    || '';
            if (String(oldVal).trim() !== String(newVal).trim()) {
                changes.push({ field: field, old: oldVal, new: newVal });
            }
        });

        // Tags
        var oldTags = (loadedJSON.tags || []).slice().sort().join(', ');
        var newTags = (current.tags   || []).slice().sort().join(', ');
        if (oldTags !== newTags) {
            changes.push({ field: 'tags', old: oldTags || '(none)', new: newTags || '(none)' });
        }

        // Ingredient count
        var oldIngCount = (loadedJSON.ingredients || []).filter(function(i){return !i.heading;}).length;
        var newIngCount = (current.ingredients    || []).filter(function(i){return !i.heading;}).length;
        if (oldIngCount !== newIngCount) {
            changes.push({ field: 'ingredient count', old: oldIngCount, new: newIngCount });
        }

        // Step count
        var oldStepCount = (loadedJSON.method || []).filter(function(s){return s.instruction;}).length;
        var newStepCount = (current.method    || []).filter(function(s){return s.instruction;}).length;
        if (oldStepCount !== newStepCount) {
            changes.push({ field: 'step count', old: oldStepCount, new: newStepCount });
        }

        // Note count
        var oldNoteCount = (loadedJSON.notes || []).length;
        var newNoteCount = (current.notes   || []).length;
        if (oldNoteCount !== newNoteCount) {
            changes.push({ field: 'note count', old: oldNoteCount, new: newNoteCount });
        }

        // Related recipe count
        var oldRelatedCount = (loadedJSON.related || []).length;
        var newRelatedCount = (current.related   || []).length;
        if (oldRelatedCount !== newRelatedCount) {
            changes.push({ field: 'related recipe count', old: oldRelatedCount, new: newRelatedCount });
        }

        if (!changes.length) {
            showDiff('<p class="diff-note diff-clean">No changes detected from loaded state.</p>');
            return;
        }

        var html = '<table class="diff-table">' +
            '<thead><tr><th>Field</th><th>Was</th><th>Now</th></tr></thead>' +
            '<tbody>';
        changes.forEach(function (c) {
            html += '<tr class="diff-row">' +
                '<td class="diff-field">' + escHtml(c.field) + '</td>' +
                '<td class="diff-old">'   + escHtml(String(c.old)) + '</td>' +
                '<td class="diff-new">'   + escHtml(String(c.new)) + '</td>' +
            '</tr>';
        });
        html += '</tbody></table>';
        html += '<p class="diff-note">' + changes.length + ' field' + (changes.length !== 1 ? 's' : '') + ' changed</p>';
        showDiff(html);
    }

    function showDiff(html) {
        var panel = document.getElementById('diff-panel');
        var output = document.getElementById('diff-output');
        if (!output) return;
        output.innerHTML = html;
        if (panel) {
            panel.style.display = 'block';
            // Smoothly scroll the diff panel into view on the right-hand panel
            panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function closeDiff() {
        var panel = document.getElementById('diff-panel');
        if (panel) panel.style.display = 'none';
    }

    // ── Safe Initialization ────────────────────────────────
    function initChecks() {
        loadIndex();

        // Watch title input for duplicate checking
        var titleInput = document.getElementById('title');
        if (titleInput) {
            titleInput.addEventListener('input', checkDuplicate);
        }

        // Diff button click handlers
        var diffBtn = document.getElementById('show-diff-btn');
        if (diffBtn) {
            diffBtn.addEventListener('click', generateDiff);
        }

        var closeDiffBtn = document.getElementById('close-diff-btn');
        if (closeDiffBtn) {
            closeDiffBtn.addEventListener('click', closeDiff);
        }
    }

    // Prevents DOMContentLoaded race condition
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChecks);
    } else {
        initChecks();
    }

    // Expose API
    window.BuilderChecks = {
        snapshotLoaded: snapshotLoaded,
        checkDuplicate: checkDuplicate,
        generateDiff:   generateDiff,
        closeDiff:      closeDiff
    };

    function escHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

})();