(function () {
    'use strict';

    if (!window.showDirectoryPicker) {
        document.body.innerHTML = '<h1>Browser Not Supported</h1>';
        return;
    }

    // ── GLOBAL STATE ──
    let rootHandle = null, recipesDirHandle = null, jsonDirHandle = null, recipeIndexHandle = null, navHandle = null, ingredientsMasterHandle = null, officialVocabHandle = null;
    let recipeIndexData = [], navHtmlContent = "", ingredientsMasterData = {}, recipes = [], officialVocabData = null;
    let dirtyPaths = new Set(), masterIsDirty = false, indexIsDirty = false, navIsDirty = false, officialVocabIsDirty = false;
    // Maps the Tagger's own category keys to the group names actually used
    // inside official-tag-vocabulary.json's tagVocabulary object — only
    // "diet" differs (the file calls it "dietary").
    const VOCAB_GROUP_FOR_CATEGORY = { cuisine: 'cuisine', mealType: 'mealType', diet: 'dietary', cookingMethod: 'cookingMethod' };
    let activeTab = 'tab-reconciler', recipesData = {}, suggestions = {}, selections = {}, categoryValue = {};
    let auditorFields = [], stableRecipesList = [], showOnlyMismatchesFilter = false, currentAuditorFilter = null, currentAuditorSearch = '';
    let currentTaggerFilter = 'all', currentTaggerSearch = '', taggerOpenPaths = new Set();
    let uniqueIngredients = {}, currentIngSearch = '', ingShowStaples = false, ingSelectedKeys = new Set(), aliasMappingCache = {};
    let expandedIngredientKeys = new Set();
    let reconcilerConflicts = [], currentMasterSearch = '', currentCompletenessFilter = 'all';

    // STANDARD_CATEGORIES used to be hardcoded here — a second, independent
    // list of valid recipe categories that could silently drift from what
    // recipes actually use (the exact problem already fixed for tags via
    // official-tag-vocabulary.json). populateRecipeCategoryDatalist() below
    // derives the list from recipe-index.json instead, live, every time.
    const CATEGORIES = ['cuisine', 'mealType', 'diet', 'cookingMethod'];
    // Kept aligned with Pantry.EXCLUDE_ITEMS in pantry.js — same concept
    // (things nobody shops for or tracks stock of), just duplicated here
    // since this tool has no access to that file at runtime. The old
    // version only had bare 'water'/'salt'/'pepper', which meant "Hot
    // Water", "Cold Water", "Black Pepper" etc. never matched and kept
    // showing up as unmatched ingredients needing action.
    const IGNORED_STAPLES = new Set(['water', 'hot water', 'cold water', 'warm water', 'boiling water', 'tap water', 'ice-cold water', 'salt', 'pepper', 'black pepper', 'white pepper', 'to taste', 'ice']);

    // Auto-Tagger Rules
    // 'sugar' used to sit in the Dessert list on its own — it shows up in
    // just as many savory recipes (sweet and sour sauce, honey-soy glazes,
    // pineapple-chicken marinades) as it does in actual desserts, so it was
    // false-positiving those into "Dessert". Replaced with words that are
    // dessert-specific rather than just sweet-adjacent.
    const CUISINE_RULES = { 'Italian': ['pasta','pizza','basil','mozzarella'], 'Thai': ['coconut milk','fish sauce','lemongrass'], 'Indian': ['masala','naan','turmeric','cumin'], 'Chinese': ['soy','hoisin','ginger'] };
    const MEAL_RULES = { 'Breakfast': ['oats','pancake'], 'Dessert': ['chocolate','cake','custard','mousse','pudding','trifle','meringue'], 'Baking': ['flour','dough','yeast'] };

    // ── FOLDER HANDLE PERSISTENCE ──
    // FileSystemDirectoryHandle objects can be stored in IndexedDB directly
    // (they're structured-cloneable), which is what lets this survive a
    // page reload. Browsers still require a permission re-check on every
    // fresh page load for security — a page can never silently regain
    // write access to your filesystem with zero user action — but this
    // turns "browse and re-pick the folder every time" into "one click,
    // no folder dialog", using the SAME handle instead of asking you to
    // find it again.
    function openHandleDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('kitchen-notebook-tool', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('handles');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async function saveRootHandleToDB(handle) {
        const db = await openHandleDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('handles', 'readwrite');
            tx.objectStore('handles').put(handle, 'rootHandle');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
    async function loadRootHandleFromDB() {
        const db = await openHandleDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('handles', 'readonly');
            const req = tx.objectStore('handles').get('rootHandle');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    function init() {
        setupTabs();
        setupGlobalEventListeners();
        checkForRememberedFolder();
    }

    async function checkForRememberedFolder() {
        let handle;
        try {
            handle = await loadRootHandleFromDB();
        } catch (e) { return; } // IndexedDB unavailable — just fall back to manual connect
        if (!handle) return;

        const btn = document.getElementById('reconnectFolderBtn');
        const nameSpan = document.getElementById('reconnectFolderName');
        if (!btn) return;
        nameSpan.textContent = handle.name;
        btn.style.display = 'inline-block';
        btn.onclick = () => reconnectRememberedFolder(handle);
    }

    async function reconnectRememberedFolder(handle) {
        try {
            // Already granted from an earlier session in this browser
            // profile — no prompt at all in that case.
            let perm = await handle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') {
                // Requires this click as a genuine user gesture — browsers
                // won't grant filesystem write access without one.
                perm = await handle.requestPermission({ mode: 'readwrite' });
            }
            if (perm !== 'granted') {
                document.getElementById('folderStatus').textContent = 'Permission denied — connect the folder manually instead.';
                return;
            }
            rootHandle = handle;
            await scanFolderStructure();
            document.getElementById('folderStatus').textContent = `Connected: ${rootHandle.name}`;
            document.getElementById('globalRescanBtn').disabled = false;
            document.getElementById('reconnectFolderBtn').style.display = 'none';
        } catch (err) {
            console.error(err);
            document.getElementById('folderStatus').textContent = 'Could not reconnect — connect the folder manually instead.';
        }
    }

    function setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn, .tab-panel').forEach(el => el.classList.remove('active'));
                btn.classList.add('active');
                activeTab = btn.dataset.tab;
                document.getElementById(activeTab).classList.add('active');
                if (rootHandle) renderActiveTab();
            });
        });
    }

    function setupGlobalEventListeners() {
        document.getElementById('pickFolderBtn')?.addEventListener('click', connectFolder);
        document.getElementById('globalRescanBtn')?.addEventListener('click', scanFolderStructure);
        document.getElementById('saveBarSaveBtn')?.addEventListener('click', writeChangesToDisk);
        document.getElementById('masterManagerSearch')?.addEventListener('input', e => { currentMasterSearch = e.target.value.trim().toLowerCase(); renderMasterManager(); });
        document.getElementById('ingSearchInput')?.addEventListener('input', e => { currentIngSearch = e.target.value.trim().toLowerCase(); renderStandardizer(); });
        document.getElementById('saveMasterIngredientBtn')?.addEventListener('click', saveMasterIngredient);
        document.getElementById('deleteMasterBtn')?.addEventListener('click', () => deleteMasterIngredient(document.getElementById('master-edit-id').value));
        document.getElementById('rebuildIndexBtn')?.addEventListener('click', rebuildIndexFromFiles);
        document.getElementById('saveEditModalBtn')?.addEventListener('click', saveEditModal);
        document.getElementById('auditorSearch')?.addEventListener('input', e => { currentAuditorSearch = e.target.value.toLowerCase(); applyAuditorFiltering(); renderAuditor(); });
        document.getElementById('ingApplySelectedBtn')?.addEventListener('click', applySelectedStandardizerMappings);
    }

    async function connectFolder() {
        try {
            rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await scanFolderStructure();
            document.getElementById('folderStatus').textContent = `Connected: ${rootHandle.name}`;
            document.getElementById('globalRescanBtn').disabled = false;
            document.getElementById('reconnectFolderBtn').style.display = 'none';
            try { await saveRootHandleToDB(rootHandle); } catch (e) { console.warn('Could not remember folder for next time:', e); }
        } catch (err) { console.error(err); }
    }

    async function scanFolderStructure() {
        recipes = []; dirtyPaths.clear(); masterIsDirty = indexIsDirty = navIsDirty = officialVocabIsDirty = false;
        try {
            const dataDir = await rootHandle.getDirectoryHandle('data');
            recipesDirHandle = await dataDir.getDirectoryHandle('recipes');
            for await (const entry of walkDir(recipesDirHandle, '')) {
                const file = await entry.handle.getFile();
                const parsed = JSON.parse(await file.text());
                recipes.push({ path: entry.path, filename: entry.handle.name.replace('.json',''), data: parsed, title: parsed.title || entry.path, handle: entry.handle });
                recipesData[entry.path] = parsed;
                selections[entry.path] = { cuisine: new Set(), mealType: new Set(), diet: new Set(), cookingMethod: new Set() };
                if (parsed.tags) parsed.tags.forEach(t => { 
                    const cat = getCategoryForTag(t); 
                    if (selections[entry.path][cat]) selections[entry.path][cat].add(t);
                });
            }
            setDatasetStatus('dot-recipes', true);
            const lbl = document.getElementById('lbl-recipes');
            if (lbl) lbl.textContent = `data/recipes/ (${recipes.length})`;
        } catch(e) { console.error(e); }

        try {
            jsonDirHandle = await rootHandle.getDirectoryHandle('json');
            // Keep the handle (not just the parsed data) — writeChangesToDisk
            // needs it later to save the rebuilt index back to this same
            // file. This was the same bug the comment below already fixed
            // for ingredients-master.json, just still present here.
            recipeIndexHandle = await jsonDirHandle.getFileHandle('recipe-index.json');
            recipeIndexData = JSON.parse(await (await recipeIndexHandle.getFile()).text());
            setDatasetStatus('dot-index', true);
            // The old version chained getFileHandle -> getFile -> text() ->
            // JSON.parse all inline, using the file handle once to read the
            // data and then discarding it — ingredientsMasterHandle (needed
            // later by writeChangesToDisk to save back to this same file)
            // stayed null forever. That's the exact cause of "Cannot read
            // properties of null (reading 'createWritable')" on save.
            ingredientsMasterHandle = await jsonDirHandle.getFileHandle('ingredients-master.json');
            ingredientsMasterData = JSON.parse(await (await ingredientsMasterHandle.getFile()).text());
            setDatasetStatus('dot-master', true);
            populateCanonicalDatalist();
        } catch(e) { console.error(e); }

        try {
            // No { create: true } here — unlike the old tags-master.json,
            // this file is meant to already exist as a hand-curated
            // reference (its own notes say it's "for validation in
            // recipe-builder.html"), so a missing file is worth surfacing
            // as a real problem rather than silently creating an empty one.
            officialVocabHandle = await jsonDirHandle.getFileHandle('official-tag-vocabulary.json');
            officialVocabData = JSON.parse(await (await officialVocabHandle.getFile()).text());
            setDatasetStatus('dot-vocab', true);
            populateVocabDatalists();
        } catch(e) { console.error('Could not load json/official-tag-vocabulary.json:', e); }

        try {
            const componentsDir = await rootHandle.getDirectoryHandle('components');
            navHandle = await componentsDir.getFileHandle('nav.html');
            navHtmlContent = await (await navHandle.getFile()).text();
            setDatasetStatus('dot-nav', true);
        } catch(e) { console.error('Could not load components/nav.html:', e); }

        renderActiveTab();
        updateSaveBar();
    }

    async function* walkDir(handle, path) {
        for await (const [name, entry] of handle.entries()) {
            const ep = path ? `${path}/${name}` : name;
            if (entry.kind === 'file' && name.endsWith('.json')) yield { path: ep, handle: entry };
            else if (entry.kind === 'directory') yield* walkDir(entry, ep);
        }
    }

    function renderActiveTab() {
        const placeholders = ['reconciler-placeholder', 'auditor-summary-banner'];
        placeholders.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = rootHandle ? 'none' : 'block'; });
        
        const contents = ['reconciler-content', 'auditor-content', 'tagger-content', 'ingredients-content', 'master-manager-content'];
        contents.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = rootHandle ? 'block' : 'none'; });

        if (activeTab === 'tab-reconciler') runReconcilerAnalysis();
        if (activeTab === 'tab-auditor') runAuditorAnalysis();
        if (activeTab === 'tab-tagger') runTaggerAnalysis();
        if (activeTab === 'tab-ingredients') runStandardizerAnalysis();
        if (activeTab === 'tab-master-manager') renderMasterManager();
    }

    // ── RECONCILER ──
    function runReconcilerAnalysis() {
        const list = document.getElementById('reconcilerConflictList');
        reconcilerConflicts = recipes.filter(r => r.data.id !== r.filename).map(r => ({ title: r.title, filename: r.filename, fileId: r.data.id, path: r.path }));
        
        document.getElementById('reconciler-summary-text').innerHTML = reconcilerConflicts.length ? `⚠️ ${reconcilerConflicts.length} ID conflicts found.` : "🟢 IDs aligned.";
        list.innerHTML = reconcilerConflicts.map((c, i) => `
            <div class="conflict-card">
                <strong>${escapeHtml(c.title)}</strong><br>
                File: ${c.filename} | ID: ${c.fileId}
                <button class="btn primary small" onclick="fixId(${i})">Align ID to Filename</button>
            </div>
        `).join('');
        document.getElementById('rebuildIndexBtn').disabled = false;
    }
    window.fixId = function(i) {
        const c = reconcilerConflicts[i];
        const r = recipes.find(rec => rec.path === c.path);
        r.data.id = c.filename;
        dirtyPaths.add(c.path);
        runReconcilerAnalysis();
        updateSaveBar();
    };

    function rebuildIndexFromFiles() {
        recipeIndexData = recipes.map(r => ({ id: r.data.id, title: r.title, category: r.data.category, tags: r.data.tags }));
        indexIsDirty = true;
        updateSaveBar();
        toast("Index Rebuilt");
    }

    // ── AUDITOR ──
    function runAuditorAnalysis() {
        const keys = new Set();
        recipes.forEach(r => Object.keys(r.data).forEach(k => keys.add(k)));
        auditorFields = Array.from(keys).sort();
        document.getElementById('aud-stat-recipes').textContent = recipes.length;
        applyAuditorFiltering();
        renderAuditor();
    }
    function applyAuditorFiltering() {
        stableRecipesList = recipes.filter(r => !currentAuditorSearch || r.title.toLowerCase().includes(currentAuditorSearch));
    }
    function renderAuditor() {
        const tbody = document.getElementById('auditorTableBody');
        document.getElementById('auditorTableHead').innerHTML = '<th>Recipe</th><th>Actions</th>' + auditorFields.map(f => `<th>${f}</th>`).join('');
        tbody.innerHTML = stableRecipesList.map(r => `
            <tr>
                <td>${escapeHtml(r.title)}</td>
                <td><button class="btn primary small" onclick="openEditModal('${escapeAttr(r.path)}')">Edit</button></td>
                ${auditorFields.map(f => `<td>${r.data[f] ? '✓' : '✗'}</td>`).join('')}
            </tr>
        `).join('');
    }
    window.openEditModal = function(path) {
        const r = recipes.find(rec => rec.path === path);
        document.getElementById('edit-recipe-path').value = path;
        document.getElementById('edit-title').value = r.data.title;
        document.getElementById('edit-description').value = r.data.description || '';
        populateRecipeCategoryDatalist();
        document.getElementById('edit-category').value = r.data.category || 'Other';
        document.getElementById('auditorEditModal').classList.add('open');
    };
    // Derived from whatever categories are actually in use across the
    // currently-loaded recipes — no separate maintained list, so it can
    // never drift out of sync with real data. A free-text field (not a
    // <select>) so assigning a genuinely brand-new category is still
    // possible; the datalist is a suggestion, not a restriction.
    function populateRecipeCategoryDatalist() {
        const dl = document.getElementById('edit-category-datalist');
        if (!dl) return;
        const cats = [...new Set(recipes.map(r => r.data.category).filter(Boolean))].sort();
        dl.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">`).join('');
    }
    function saveEditModal() {
        const path = document.getElementById('edit-recipe-path').value;
        const r = recipes.find(rec => rec.path === path);
        r.data.title = document.getElementById('edit-title').value;
        r.data.category = document.getElementById('edit-category').value;
        dirtyPaths.add(path);
        closeEditModal();
        runAuditorAnalysis();
        updateSaveBar();
    }
    window.closeEditModal = () => document.getElementById('auditorEditModal').classList.remove('open');

    // ── TAGGER ──
    // Every category is scanned and suggested automatically the moment this
    // tab loads. The suggestion is a starting point, not a verdict — it
    // lands in an editable field (autocompleting against
    // official-tag-vocabulary.json) so a wrong guess like "Thai" can be
    // corrected to "Filipino" before Accept All ever writes anything to
    // r.data.tags. taggerEdits holds the current text of each category's
    // field per recipe, independent of what was originally suggested.
    let taggerEdits = {};
    function runTaggerAnalysis() {
        recipes.forEach(r => {
            suggestions[r.path] = computeSuggestions(r.data);
            const currentTags = r.data.tags || [];
            taggerEdits[r.path] = {};
            CATEGORIES.forEach(cat => {
                const pending = suggestions[r.path][cat].filter(t => !currentTags.includes(t));
                taggerEdits[r.path][cat] = pending.join(', ');
            });
        });
        renderTagger();
        renderTaggerToolbar();
    }
    window.setTaggerEdit = function(path, cat, value) {
        taggerEdits[path][cat] = value; // just tracks the field's text; no re-render needed, so typing doesn't lose focus/cursor
    };
    function renderTagger() {
        const container = document.getElementById('taggerRowsContainer');
        container.innerHTML = recipes.map((r, i) => {
            const currentTags = r.data.tags || [];
            return `
            <div class="tagger-row">
                <div class="tagger-card-top">
                    <strong>${escapeHtml(r.title)}</strong>
                    <button class="btn primary small" onclick="acceptAllTags('${escapeAttr(r.path)}', ${i})">Accept All</button>
                </div>
                <div class="tagger-card-detail open">
                    ${CATEGORIES.map(cat => `
                        <div class="tagger-edit-row">
                            <strong>${cat}:</strong>
                            <input type="text" class="input-standard tagger-edit-input" id="tagger-input-${i}-${cat}" list="datalist-${cat}"
                                value="${escapeAttr(taggerEdits[r.path][cat])}"
                                placeholder="type or pick tags, comma separated"
                                onchange="setTaggerEdit('${escapeAttr(r.path)}','${cat}', this.value)">
                        </div>
                    `).join('')}
                    <div class="current-tags-row">
                        <strong>Current tags:</strong>
                        ${currentTags.length ? currentTags.map(tag => `
                            <span class="tag-chip">${escapeHtml(tag)} <button class="tag-chip-remove" title="Remove this tag" onclick="removeAppliedTag('${escapeAttr(r.path)}', '${escapeAttr(tag)}')">&times;</button></span>
                        `).join('') : '<span class="hint">— none yet —</span>'}
                    </div>
                </div>
            </div>
        `;
        }).join('');
    }
    window.acceptAllTags = function(path, i) {
        const r = recipes.find(rec => rec.path === path);
        // Reads straight from the input elements (by their stable id) rather
        // than only from taggerEdits, so a field the user is still actively
        // typing in — onchange hasn't fired yet because they haven't
        // blurred it — still gets picked up when they click Accept All.
        const toAdd = new Set();
        CATEGORIES.forEach(cat => {
            const input = document.getElementById(`tagger-input-${i}-${cat}`);
            const raw = input ? input.value : (taggerEdits[path]?.[cat] || '');
            raw.split(',').map(t => t.trim()).filter(Boolean).forEach(t => toAdd.add(t));
        });
        const before = r.data.tags || [];
        const merged = [...new Set([...before, ...toAdd])];
        if (merged.length === before.length) { toast("No New Tags To Add"); return; }
        r.data.tags = merged;
        dirtyPaths.add(path);
        renderTagger();
        updateSaveBar();
        toast("Tags Staged");
    };
    window.removeAppliedTag = function(path, tag) {
        const r = recipes.find(rec => rec.path === path);
        r.data.tags = (r.data.tags || []).filter(t => t !== tag);
        dirtyPaths.add(path);
        renderTagger();
        updateSaveBar();
        toast("Tag Removed");
    };

    // tags-master.json used to live here as a derived snapshot of "every
    // tag currently in use". Now that official-tag-vocabulary.json exists
    // as the actual curated authority, and computeOrphanTags() below
    // compares live against it on demand, a separate persisted snapshot
    // file was just a second copy of the same fact — removed rather than
    // kept in sync with a third source.
    function renderTaggerToolbar() {
        renderOrphanTags();
    }

    // Compares tags actually in use across loaded recipes against
    // official-tag-vocabulary.json's flatList — anything used but not
    // listed there has drifted (a typo, a one-off, or a genuinely new tag
    // nobody's added to the official list yet). Computed live from
    // `recipes` rather than the possibly-stale tags-master.json, so it's
    // accurate even if you haven't clicked Rebuild Tag Dictionary yet.
    function computeOrphanTags() {
        if (!officialVocabData || !officialVocabData.flatList) return [];
        const officialSet = new Set(officialVocabData.flatList.map(t => t.toLowerCase()));
        const inUse = new Set();
        recipes.forEach(r => (r.data.tags || []).forEach(t => { if (t) inUse.add(t); }));
        return [...inUse].filter(t => !officialSet.has(t.toLowerCase())).sort((a, b) => a.localeCompare(b));
    }
    function renderOrphanTags() {
        const container = document.getElementById('orphanTagsContainer');
        if (!container) return;
        if (!officialVocabData) {
            container.innerHTML = '<span class="hint">official-tag-vocabulary.json not loaded.</span>';
            return;
        }
        const orphans = computeOrphanTags();
        if (!orphans.length) {
            container.innerHTML = '<span class="hint">No unlisted tags — everything in use matches the official vocabulary.</span>';
            return;
        }
        container.innerHTML = `<strong>${orphans.length} tag${orphans.length !== 1 ? 's' : ''} in use but not in official-tag-vocabulary.json:</strong> ` +
            orphans.map(t => `<span class="tag-chip orphan">${escapeHtml(t)} <button class="tag-chip-remove" title="Add to official vocabulary" onclick="addTagToVocabulary('${escapeAttr(t)}')">+</button></span>`).join('');
    }
    // Only appends to flatList (the validation list). It does NOT guess
    // which category group (cuisine, mealType, keyIngredients, etc.) the
    // tag belongs in — that's a judgment call the tagVocabulary structure
    // needs a human for, so it's left for you to place manually afterward.
    window.addTagToVocabulary = function(tag) {
        if (!officialVocabData) return;
        if (officialVocabData.flatList.some(t => t.toLowerCase() === tag.toLowerCase())) { toast("Already In Vocabulary"); return; }
        officialVocabData.flatList.push(tag);
        officialVocabData.flatList.sort((a, b) => a.localeCompare(b));
        officialVocabData.notes = officialVocabData.notes || {};
        officialVocabData.notes.totalTags = officialVocabData.flatList.length;
        officialVocabData.notes.lastUpdated = new Date().toISOString().slice(0, 10);
        officialVocabIsDirty = true;
        updateSaveBar();
        renderOrphanTags();
        toast(`Added "${tag}" to flatList — still needs placing in a tagVocabulary group`);
    };

    // ── STANDARDIZER ──
    // Checks whether a raw ingredient name already resolves to something in
    // ingredients-master.json — canonical key OR any alias, case-insensitive.
    // Returns the canonical key if found, otherwise null. This didn't exist
    // before; renderStandardizer used to hardcode every row as "Unmatched"
    // regardless of what was actually in the master file.
    function isKnownToMaster(rawName) {
        const key = (rawName || '').toLowerCase().trim();
        if (!key) return null;
        if (ingredientsMasterData[key]) return key;
        for (const [mKey, entry] of Object.entries(ingredientsMasterData)) {
            if ((entry.aliases || []).some(a => a.toLowerCase().trim() === key)) return mKey;
        }
        return null;
    }

    function getIngredientCategoriesList() {
        const cats = new Set(Object.values(ingredientsMasterData).map(e => e.category).filter(Boolean));
        return [...cats].sort();
    }

    function toTitleCase(s) {
        return (s || '').replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    }

    // Catches combined staple phrases like "Salt & Pepper" or "Salt and
    // Pepper" — a single exact-match Set lookup missed these entirely,
    // since neither string equals any single entry in IGNORED_STAPLES.
    // Splits on common separators and excludes only if EVERY resulting
    // part is itself a known staple, so this can't accidentally swallow
    // something like "Salt & Vinegar Chips".
    function isIgnoredStaple(name) {
        if (IGNORED_STAPLES.has(name)) return true;
        const parts = name.split(/\s*(?:&|\+|\/|,|\band\b)\s*/).map(p => p.trim()).filter(Boolean);
        return parts.length > 1 && parts.every(p => IGNORED_STAPLES.has(p));
    }

    function runStandardizerAnalysis() {
        uniqueIngredients = {};
        recipes.forEach(r => {
            if (r.data.ingredients) r.data.ingredients.forEach(i => {
                const name = (i.item || i.name || '').toLowerCase();
                if (!name || isIgnoredStaple(name)) return;
                if (!uniqueIngredients[name]) uniqueIngredients[name] = { rawName: i.item || i.name, count: 0, occurrences: [] };
                uniqueIngredients[name].count++;
                uniqueIngredients[name].occurrences.push({ path: r.path, id: r.data.id });
            });
        });
        renderStandardizer();
    }
    window.toggleIngredientExpand = function (key) {
        if (expandedIngredientKeys.has(key)) expandedIngredientKeys.delete(key);
        else expandedIngredientKeys.add(key);
        renderStandardizer();
    };

    // Renders the exact list of files an ingredient appears in, each with
    // its own editable text field — lets you fix one specific occurrence
    // (e.g. a typo in a single recipe) without touching every other recipe
    // that uses the same ingredient, which is what "Map to existing" /
    // "Add New" do instead (they rename ALL occurrences at once).
    function renderIngredientOccurrenceDetails(key, item) {
        const rows = item.occurrences.map((occ, i) => {
            const r = recipes.find(rec => rec.path === occ.path);
            const title = r ? r.title : occ.path;
            const inputId = `occ-edit-${escapeAttr(key)}-${i}`;
            return `
                <div class="occurrence-row">
                    <span class="occurrence-title" title="${escapeAttr(occ.path)}">${escapeHtml(title)}</span>
                    <input type="text" class="input-standard occurrence-edit-input" id="${inputId}" value="${escapeAttr(item.rawName)}">
                    <button class="btn secondary small" onclick="saveOccurrenceEdit('${escapeAttr(key)}', ${i}, '${inputId}')">Save</button>
                </div>`;
        }).join('');

        return `
            <tr class="occurrence-details-row">
                <td></td>
                <td colspan="4">
                    <div class="occurrence-details-panel">
                        <div class="occurrence-details-header">Appears in ${item.occurrences.length} file${item.occurrences.length !== 1 ? 's' : ''} — edit one at a time:</div>
                        ${rows}
                    </div>
                </td>
            </tr>`;
    }

    // Edits just ONE occurrence's raw ingredient text in its own file,
    // leaving every other recipe using the same original text untouched.
    window.saveOccurrenceEdit = function (key, occIndex, inputId) {
        const item = uniqueIngredients[key];
        if (!item) return;
        const occ = item.occurrences[occIndex];
        const newValue = document.getElementById(inputId).value.trim();
        if (!newValue) { alert('Value cannot be empty.'); return; }

        const r = recipes.find(rec => rec.path === occ.path);
        if (!r || !r.data.ingredients) return;

        // Only the FIRST matching line in this specific recipe is updated —
        // if the same recipe uses this ingredient in two sections (e.g. a
        // Poolish and a Bread Dough), editing here targets one occurrence
        // at a time rather than silently rewriting both.
        const target = r.data.ingredients.find(ing => (ing.item || ing.name || '').toLowerCase() === key);
        if (!target) return;
        if (target.item !== undefined) target.item = newValue; else target.name = newValue;

        dirtyPaths.add(occ.path);
        updateSaveBar();
        toast(`Updated "${item.rawName}" → "${newValue}" in ${r.title}`);

        // Re-scan so the standardizer reflects the edited recipe (the
        // occurrence just changed may now belong to a different
        // uniqueIngredients bucket entirely).
        runStandardizerAnalysis();
    };

    function renderStandardizer() {
        const tbody = document.getElementById('ingredientsTableBody');
        const categoriesList = getIngredientCategoriesList();

        let entries = Object.entries(uniqueIngredients);
        if (currentIngSearch) {
            entries = entries.filter(([key, item]) => key.includes(currentIngSearch) || item.rawName.toLowerCase().includes(currentIngSearch));
        }

        if (!entries.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="table-empty-row">No ingredients match "${escapeHtml(currentIngSearch)}".</td></tr>`;
            return;
        }

        tbody.innerHTML = entries.map(([key, item]) => {
            const matchedKey = isKnownToMaster(item.rawName);
            const isExpanded = expandedIngredientKeys.has(key);
            const countCell = `<button class="btn-link-count" onclick="toggleIngredientExpand('${escapeAttr(key)}')">${item.count} ${isExpanded ? '▾' : '▸'}</button>`;
            const detailsRow = isExpanded ? renderIngredientOccurrenceDetails(key, item) : '';

            if (matchedKey) {
                const matchedEntry = ingredientsMasterData[matchedKey];
                return `
                <tr>
                    <td></td>
                    <td>${escapeHtml(item.rawName)}</td>
                    <td>${countCell}</td>
                    <td><span class="gap-flag" style="color:#6fae6f;">Matched → ${escapeHtml(matchedEntry.displayName)}</span></td>
                    <td><em style="opacity:0.6;">Already in master pantry</em></td>
                </tr>${detailsRow}`;
            }

            return `
                <tr>
                    <td><input type="checkbox" class="ing-row-checkbox" data-key="${escapeAttr(key)}"></td>
                    <td>${escapeHtml(item.rawName)}</td>
                    <td>${countCell}</td>
                    <td><span class="gap-flag">Unmatched</span></td>
                    <td>
                        <input type="text" class="input-standard" list="pantry-canonical-datalist"
                               placeholder="Map to an existing pantry item..."
                               oninput="aliasMappingCache['${escapeAttr(key)}']=this.value">
                        <button class="btn secondary small" onclick="openInlineMasterCreator('${escapeAttr(key)}')">+ Add New</button>

                        <div class="inline-add-master-form" id="ing-creator-${escapeAttr(key)}" style="display:none;">
                            <div class="inline-add-master-form-row">
                                <label>Pantry Name</label>
                                <input type="text" class="ing-creator-display-name" value="${escapeAttr(toTitleCase(item.rawName))}">
                            </div>
                            <div class="inline-add-master-form-row">
                                <label>Category</label>
                                <select class="ing-creator-category-select">
                                    ${categoriesList.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('')}
                                    <option value="_NEW_">Create New Category...</option>
                                </select>
                            </div>
                            <div class="inline-add-master-form-row ing-creator-custom-cat-row" style="display:none;">
                                <label>New Category</label>
                                <input type="text" class="ing-creator-custom-cat" placeholder="Category name...">
                            </div>

                            <div class="inline-add-master-form-divider">Pricing (skip if unknown — flagged as missing on the Pantry Master Manager tab either way)</div>
                            <div class="inline-add-master-form-row-triple">
                                <div><label>Price ($)</label><input type="number" step="0.01" min="0" class="ing-creator-price" placeholder="e.g. 5.50"></div>
                                <div><label>Package Size</label><input type="number" step="any" min="0" class="ing-creator-size" placeholder="e.g. 500, or 1 for a single item"></div>
                                <div>
                                    <label>Unit</label>
                                    <select class="ing-creator-unit">
                                        <option value="g">grams (g)</option>
                                        <option value="kg">kilograms (kg)</option>
                                        <option value="ml">millilitres (ml)</option>
                                        <option value="l">litres (L)</option>
                                        <option value="each">each</option>
                                    </select>
                                </div>
                            </div>
                            <div class="inline-add-master-form-hint" id="ing-creator-unit-hint-${escapeAttr(key)}" style="display:none;">
                                For "each": Size is how many come per priced unit — 1 for a single banana priced individually, 6 if it's a bunch.
                            </div>
                            <div class="inline-add-master-form-row">
                                <label>Brand <span class="optional-label">(optional)</span></label>
                                <input type="text" class="ing-creator-brand" placeholder="e.g. Woolworths">
                            </div>

                            <div class="inline-add-master-form-nutrition-note">
                                ⚠ Nutrition data isn't collected here — this entry will show up under "Missing Nutrition" on the Pantry Master Manager tab until you add it directly.
                            </div>

                            <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.5rem;">
                                <button class="btn secondary small" onclick="closeInlineMasterCreator('${escapeAttr(key)}')">Cancel</button>
                                <button class="btn primary small" onclick="commitInlineMasterIngredient('${escapeAttr(key)}')">Save to Master</button>
                            </div>
                        </div>
                    </td>
                </tr>`;
        }).join('');
    }

    window.openInlineMasterCreator = function (rawKey) {
        const creator = document.getElementById(`ing-creator-${rawKey}`);
        if (!creator) return;
        creator.style.display = 'block';

        const select = creator.querySelector('.ing-creator-category-select');
        const customCatRow = creator.querySelector('.ing-creator-custom-cat-row');
        select.onchange = () => { customCatRow.style.display = select.value === '_NEW_' ? 'grid' : 'none'; };

        const unitSelect = creator.querySelector('.ing-creator-unit');
        const unitHint = document.getElementById(`ing-creator-unit-hint-${rawKey}`);
        unitSelect.onchange = () => { unitHint.style.display = unitSelect.value === 'each' ? 'block' : 'none'; };
    };

    window.closeInlineMasterCreator = function (rawKey) {
        const creator = document.getElementById(`ing-creator-${rawKey}`);
        if (creator) creator.style.display = 'none';
    };

    window.commitInlineMasterIngredient = function (rawKey) {
        const creator = document.getElementById(`ing-creator-${rawKey}`);
        if (!creator) return;

        const displayName = creator.querySelector('.ing-creator-display-name').value.trim();
        let category = creator.querySelector('.ing-creator-category-select').value;
        if (category === '_NEW_') category = creator.querySelector('.ing-creator-custom-cat').value.trim();

        if (!displayName || !category) {
            alert('Please specify both a display name and category.');
            return;
        }

        const priceStr = creator.querySelector('.ing-creator-price').value.trim();
        const sizeStr  = creator.querySelector('.ing-creator-size').value.trim();
        const unit     = creator.querySelector('.ing-creator-unit').value;
        const brand    = creator.querySelector('.ing-creator-brand').value.trim();
        const canonicalKey = displayName.toLowerCase().trim();

        const entry = {
            displayName: displayName,
            category: category,
            aliases: [canonicalKey, rawKey].filter((v, i, arr) => v && arr.indexOf(v) === i)
        };
        if (priceStr && sizeStr) {
            entry.priceData = { size: Number(sizeStr), unit: unit, price: Number(priceStr) };
            if (brand) entry.priceData.brand = brand;
        }

        ingredientsMasterData[canonicalKey] = entry;
        masterIsDirty = true;

        // Rename every occurrence of this raw ingredient text across every
        // recipe that used it, same as the existing "map to existing"
        // path already does.
        const item = uniqueIngredients[rawKey];
        if (item) {
            item.occurrences.forEach(occ => {
                const r = recipes.find(rec => rec.path === occ.path);
                if (r && r.data.ingredients) {
                    r.data.ingredients.forEach(ing => {
                        if ((ing.item || ing.name || '').toLowerCase() === rawKey) ing.item = displayName;
                    });
                    dirtyPaths.add(occ.path);
                }
            });
            delete uniqueIngredients[rawKey];
            delete aliasMappingCache[rawKey];
            ingSelectedKeys.delete(rawKey);
        }

        renderStandardizer();
        populateCanonicalDatalist();
        updateSaveBar();
        toast(`"${displayName}" added to master pantry!${!entry.priceData ? ' (still needs price + nutrition)' : ' (still needs nutrition)'}`);
    };
    function applySelectedStandardizerMappings() {
        document.querySelectorAll('.ing-row-checkbox:checked').forEach(cb => {
            const key = cb.dataset.key;
            const target = aliasMappingCache[key];
            if (!target) return;
            uniqueIngredients[key].occurrences.forEach(occ => {
                const r = recipes.find(rec => rec.path === occ.path);
                r.data.ingredients.forEach(ing => { if((ing.item||ing.name||'').toLowerCase() === key) ing.item = target; });
                dirtyPaths.add(occ.path);
            });
        });
        runStandardizerAnalysis();
        updateSaveBar();
    }

    // ── PANTRY MANAGER ──
    function renderMasterManager() {
        const allEntries = Object.entries(ingredientsMasterData);

        renderCompletenessBar(allEntries);

        let entries = allEntries;
        if (currentCompletenessFilter === 'missing-price') {
            entries = entries.filter(([, d]) => !d.priceData);
        } else if (currentCompletenessFilter === 'missing-nutrition') {
            entries = entries.filter(([, d]) => !d.nutrition);
        }

        const tbody = document.getElementById('masterManagerTableBody');
        if (currentMasterSearch) entries = entries.filter(([k, d]) => k.includes(currentMasterSearch) || d.displayName.toLowerCase().includes(currentMasterSearch));
        entries.sort((a,b) => a[0].localeCompare(b[0]));

        if (!entries.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="table-empty-row">No ingredients match this filter.</td></tr>`;
            return;
        }

        tbody.innerHTML = entries.map(([key, d]) => `
            <tr>
                <td><strong>${escapeHtml(d.displayName)}</strong><br><small>${key}</small></td>
                <td>${escapeHtml(d.category)}</td>
                <td>${d.priceData ? '$'+d.priceData.price : '<span class="gap-flag">Missing</span>'}</td>
                <td>${d.nutrition ? '✓' : '<span class="gap-flag">Missing</span>'}</td>
                <td><button class="btn primary small" onclick="openMasterIngredientModal('${escapeAttr(key)}')">Edit</button></td>
            </tr>
        `).join('');
    }

    // Real counts from the WHOLE dataset (not the current search/filter) so
    // the pills always show the true total — this replaces the old
    // one-shot summary that just listed up to 12 names and said "and 233
    // others", which wasn't actionable. Clicking a pill here filters the
    // actual table above instead.
    function renderCompletenessBar(allEntries) {
        const bar = document.getElementById('masterCompletenessBar');
        if (!bar) return;

        const missingPrice = allEntries.filter(([, d]) => !d.priceData).length;
        const missingNutrition = allEntries.filter(([, d]) => !d.nutrition).length;

        const pill = (key, label, count) => `
            <button class="filter-pill${currentCompletenessFilter === key ? ' active' : ''}"
                    onclick="setMasterCompletenessFilter('${key}')">
                ${label} (${count})
            </button>`;

        bar.innerHTML = pill('all', 'All', allEntries.length)
            + pill('missing-price', 'Missing Price', missingPrice)
            + pill('missing-nutrition', 'Missing Nutrition', missingNutrition);
    }

    window.setMasterCompletenessFilter = function (key) {
        currentCompletenessFilter = key;
        renderMasterManager();
    };

    window.openMasterIngredientModal = function(key = null) {
        const f = document.getElementById('masterIngredientForm'); f.reset();
        if (key) {
            const d = ingredientsMasterData[key];
            document.getElementById('master-edit-id').value = key;
            document.getElementById('master-display-name').value = d.displayName;
            document.getElementById('master-category').value = d.category;
            document.getElementById('master-aliases').value = (d.aliases || []).join(',');

            if (d.priceData) {
                document.getElementById('master-price-brand').value = d.priceData.brand || '';
                document.getElementById('master-price-val').value = d.priceData.price ?? '';
                document.getElementById('master-price-size').value = d.priceData.size ?? '';
                document.getElementById('master-price-unit').value = d.priceData.unit || 'g';
            }

            if (d.nutrition) {
                document.getElementById('nut-cal').value = d.nutrition.cal ?? '';
                document.getElementById('nut-protein').value = d.nutrition.protein ?? '';
                document.getElementById('nut-fat').value = d.nutrition.fat ?? '';
                document.getElementById('nut-carbs').value = d.nutrition.carbs ?? '';
                document.getElementById('nut-sugars').value = d.nutrition.sugars ?? '';
                document.getElementById('nut-fiber').value = d.nutrition.fiber ?? '';
                document.getElementById('nut-sodium').value = d.nutrition.sodium ?? '';
            }

            if (d.reference) {
                document.getElementById('master-ref-purpose').value = d.reference.purpose || '';
                document.getElementById('master-ref-notes').value = d.reference.notes || '';
                document.getElementById('master-ref-storage').value = d.reference.storage || '';
                document.getElementById('master-ref-subs').value = d.reference.substitutes || '';
            }
        }
        document.getElementById('masterIngredientModal').classList.add('open');
    };
    function saveMasterIngredient() {
        const name = document.getElementById('master-display-name').value.trim();
        const key = document.getElementById('master-edit-id').value || name.toLowerCase().trim();

        // Start from whatever already exists for this key (empty object for
        // a brand new entry) instead of building a fresh object from
        // scratch — this is the actual fix. The old version replaced the
        // whole entry every save, silently deleting anything the form
        // doesn't have a field for: brand, every nutrition field except
        // Cals/Protein, all of Reference Notes, plus fields with no form UI
        // at all like usageTips, usedIn (auto-tracked recipe usage), and
        // _source.
        const existing = ingredientsMasterData[key] || {};

        const aliasesRaw = document.getElementById('master-aliases').value;
        const aliases = aliasesRaw.split(',').map(a => a.trim()).filter(Boolean);

        // Numeric field helper: a blank input means "leave this alone", not
        // "set it to zero/NaN" — so editing just the price doesn't quietly
        // wipe out fat/carbs/sugars/fiber/sodium that were already there.
        const numOrKeep = (inputId, existingVal) => {
            const raw = document.getElementById(inputId).value.trim();
            return raw === '' ? existingVal : parseFloat(raw);
        };
        const strOrKeep = (inputId, existingVal) => {
            const raw = document.getElementById(inputId).value.trim();
            return raw === '' ? existingVal : raw;
        };

        const updated = {
            ...existing,
            displayName: name,
            category: document.getElementById('master-category').value.trim(),
            aliases: aliases
        };

        const priceBrand = strOrKeep('master-price-brand', existing.priceData?.brand);
        const priceVal   = numOrKeep('master-price-val', existing.priceData?.price);
        const priceSize  = numOrKeep('master-price-size', existing.priceData?.size);
        const priceUnit  = document.getElementById('master-price-unit').value;
        if (priceVal !== undefined || priceSize !== undefined) {
            updated.priceData = { price: priceVal, size: priceSize, unit: priceUnit };
            if (priceBrand) updated.priceData.brand = priceBrand;
        }

        const existingNutrition = existing.nutrition || {};
        const nutrition = {
            ...existingNutrition, // preserves calcium_mg/iron_mg/potassium_mg/etc. — no form field for these
            cal:           numOrKeep('nut-cal', existingNutrition.cal),
            protein:       numOrKeep('nut-protein', existingNutrition.protein),
            fat:           numOrKeep('nut-fat', existingNutrition.fat),
            carbs:         numOrKeep('nut-carbs', existingNutrition.carbs),
            sugars:        numOrKeep('nut-sugars', existingNutrition.sugars),
            fiber:         numOrKeep('nut-fiber', existingNutrition.fiber),
            sodium:        numOrKeep('nut-sodium', existingNutrition.sodium)
        };
        // Only keep the nutrition object if at least one real value exists —
        // otherwise every value is undefined and this would create a
        // nutrition object that LOOKS present (so builder-main.js would
        // stop treating this ingredient as "missing nutrition") while
        // actually holding nothing.
        if (Object.values(nutrition).some(v => v !== undefined)) {
            updated.nutrition = nutrition;
        } else {
            delete updated.nutrition;
        }

        const existingRef = existing.reference || {};
        const reference = {
            ...existingRef, // preserves usageTips, usedIn, _source — no form field for these
            purpose: strOrKeep('master-ref-purpose', existingRef.purpose),
            notes: strOrKeep('master-ref-notes', existingRef.notes),
            storage: strOrKeep('master-ref-storage', existingRef.storage),
            substitutes: strOrKeep('master-ref-subs', existingRef.substitutes)
        };
        if (Object.values(reference).some(v => v !== undefined)) {
            updated.reference = reference;
        } else {
            delete updated.reference;
        }

        // If the key changed (renamed via display name on a new entry, or
        // editing produced a different canonical key) don't leave the old
        // key behind as a duplicate.
        const oldKey = document.getElementById('master-edit-id').value;
        if (oldKey && oldKey !== key) delete ingredientsMasterData[oldKey];

        ingredientsMasterData[key] = updated;
        masterIsDirty = true;
        closeMasterModal(); renderMasterManager(); updateSaveBar();
        populateIngredientCategoryDatalist();
    }
    function deleteMasterIngredient(key) { if(confirm("Delete?")) { delete ingredientsMasterData[key]; masterIsDirty = true; renderMasterManager(); updateSaveBar(); closeMasterModal(); } }
    window.closeMasterModal = () => document.getElementById('masterIngredientModal').classList.remove('open');

    // ── CORE UTILS ──
    function updateSaveBar() {
        const count = dirtyPaths.size + (masterIsDirty?1:0) + (indexIsDirty?1:0) + (officialVocabIsDirty?1:0);
        document.getElementById('masterSaveBar').classList.toggle('visible', count > 0);
        document.getElementById('saveBarStatusText').textContent = `${count} unsaved changes staged.`;
    }
    async function writeChangesToDisk() {
        const errors = [];
        try {
            if (masterIsDirty) {
                const w = await ingredientsMasterHandle.createWritable();
                await w.write(JSON.stringify(ingredientsMasterData, null, 2));
                await w.close();
                masterIsDirty = false;
            }
        } catch (err) {
            errors.push(`ingredients-master.json: ${err.message}`);
        }

        try {
            if (indexIsDirty) {
                if (!recipeIndexHandle) {
                    errors.push('recipe-index.json: no file handle found — try Rescan All Files, then Rebuild Index again.');
                } else {
                    const w = await recipeIndexHandle.createWritable();
                    await w.write(JSON.stringify(recipeIndexData, null, 2));
                    await w.close();
                    indexIsDirty = false;
                }
            }
        } catch (err) {
            errors.push(`recipe-index.json: ${err.message}`);
        }

        try {
            if (officialVocabIsDirty) {
                if (!officialVocabHandle) {
                    errors.push('official-tag-vocabulary.json: no file handle found — try Rescan All Files, then add the tag again.');
                } else {
                    const w = await officialVocabHandle.createWritable();
                    await w.write(JSON.stringify(officialVocabData, null, 2));
                    await w.close();
                    officialVocabIsDirty = false;
                }
            }
        } catch (err) {
            errors.push(`official-tag-vocabulary.json: ${err.message}`);
        }

        for (const path of dirtyPaths) {
            try {
                const r = recipes.find(rec => rec.path === path);
                if (!r || !r.handle) {
                    errors.push(`${path}: no file handle found — try Rescan All Files, then re-apply this change.`);
                    continue;
                }
                const w = await r.handle.createWritable();
                await w.write(JSON.stringify(r.data, null, 2));
                await w.close();
                dirtyPaths.delete(path);
            } catch (err) {
                errors.push(`${path}: ${err.message}`);
            }
        }

        updateSaveBar();

        if (errors.length) {
            // Surfaced clearly instead of failing silently — this is the
            // actual fix. Before this, any error here (a permission issue,
            // a stale file handle) threw uncaught with zero feedback, which
            // looks exactly like clicking Save and having nothing happen.
            alert('Some changes could not be saved:\n\n' + errors.join('\n'));
        } else {
            toast("Saved to Disk!");
        }
    }
    // Whole-word match instead of a raw substring check — `text.includes('egg')`
    // used to match "eggplant", and multi-word keywords like "fish sauce"
    // still need substring behavior since \b won't split on the space
    // correctly for phrase matches, so single words get a word-boundary
    // regex and phrases keep using includes().
    function matchesKeyword(text, kw) {
        if (kw.includes(' ')) return text.includes(kw);
        return new RegExp(`\\b${kw}\\b`).test(text);
    }
    function computeSuggestions(data) {
        const s = { cuisine: [], mealType: [], diet: [], cookingMethod: [] };
        const text = JSON.stringify(data).toLowerCase();
        for (const [c, k] of Object.entries(CUISINE_RULES)) if(k.some(kw => matchesKeyword(text, kw))) s.cuisine.push(c);
        for (const [m, k] of Object.entries(MEAL_RULES)) if(k.some(kw => matchesKeyword(text, kw))) s.mealType.push(m);
        return s;
    }
    function getCategoryForTag(t) { return 'mealType'; } // Simplified helper
    // Fills a separate <datalist> per tagger category from
    // official-tag-vocabulary.json's own grouped lists, so the cuisine
    // field only ever autocompletes cuisines, not ingredients or methods.
    function populateVocabDatalists() {
        if (!officialVocabData || !officialVocabData.tagVocabulary) return;
        Object.entries(VOCAB_GROUP_FOR_CATEGORY).forEach(([cat, groupKey]) => {
            const el = document.getElementById(`datalist-${cat}`);
            if (!el) return;
            const options = officialVocabData.tagVocabulary[groupKey] || [];
            el.innerHTML = options.map(t => `<option value="${escapeAttr(t)}">`).join('');
        });
    }
    function populateCanonicalDatalist() {
        const dl = document.getElementById('pantry-canonical-datalist');
        dl.innerHTML = Object.keys(ingredientsMasterData).map(k => `<option value="${escapeHtml(ingredientsMasterData[k].displayName)}">`).join('');
        populateIngredientCategoryDatalist();
    }
    // category-datalist existed in the HTML but nothing ever filled it in —
    // the ingredient category field (e.g. "Spices Seasonings") had no
    // autocomplete at all. Rather than hardcode a category list here too
    // (a third place that could drift), it's derived straight from the
    // distinct category values already present in ingredients-master.json —
    // the same file is both the data and the source of its own valid values.
    function populateIngredientCategoryDatalist() {
        const dl = document.getElementById('category-datalist');
        if (!dl) return;
        const cats = [...new Set(Object.values(ingredientsMasterData).map(v => v.category).filter(Boolean))].sort();
        dl.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">`).join('');
    }
    function setDatasetStatus(id, loaded) { document.getElementById(id).className = 'dot' + (loaded ? ' loaded' : ''); }
    function escapeHtml(s) { return s ? String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])) : ''; }
    function escapeAttr(s) { return escapeHtml(s); }
    function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2000); }

    init();
})();