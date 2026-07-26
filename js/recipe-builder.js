/* =========================================================
   RECIPE BUILDER LOGIC — KitchenNotebook Kitchen Notebook
   Splits from monolithic HTML June 02, 2026
========================================================= */

(function() {
    'use strict';

    // ─────────────────────────────────────────────────────────
    // PDF.JS CONFIGURATION
    // ─────────────────────────────────────────────────────────
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    // ─────────────────────────────────────────────────────────
    // STATE VARIABLES
    // ─────────────────────────────────────────────────────────
    let NUTRITION_DB = {};
    let selectedEmoji = '';
    let rawNavSnippet = '';
    let currentFilename = '';
    let tags = [];
    let draggedIngredientElement = null;
    let currentAutocompleteInput = null;
    let selectedAutocompleteIndex = -1;
    let draggedStepElement = null;
    let draggedEquipmentItemElement = null;
    let draggedJournalElement = null;
    let draggedRelatedElement = null;
    let recipeIndex = [];
    let currentRelatedRow = null;
    let tagPickerSelections = new Set();
    let officialTagVocabulary = [];
    let tagVocabularyData = null;
    let currentFileHandle = null;
    let _rlpActiveTextarea = null;
    let _rlpActiveIndex = -1;

    // Pantry staples for ingredient matching
    const PANTRY_STAPLES = [
        'water', 'salt', 'pepper', 'black pepper', 'white pepper',
        'butter', 'unsalted butter', 'oil', 'olive oil', 'vegetable oil', 'canola oil',
        'flour', 'plain flour', 'all-purpose flour', 'bread flour', 'self-raising flour',
        'sugar', 'white sugar', 'caster sugar', 'brown sugar', 'icing sugar',
        'eggs', 'egg', 'milk',
        'baking powder', 'baking soda', 'bi-carb soda', 'bicarbonate of soda',
        'vanilla', 'vanilla extract', 'yeast',
        'stock', 'chicken stock', 'beef stock', 'vegetable stock',
        'garlic', 'onion', 'brown onion', 'red onion', 'spring onion',
        'to taste'
    ];

    const RECIPE_PATH = 'data/recipes/';
    const API_BASE = 'http://localhost:5001';

    // ─────────────────────────────────────────────────────────
    // ASYNCHRONOUS DATABASE HYDRATION
    // ─────────────────────────────────────────────────────────
    async function loadNutritionDatabase() {
        try {
            const res = await fetch('json/recipe-builder.json');
            if (res.ok) {
                NUTRITION_DB = await res.json();
                console.log('✅ Nutrition database loaded successfully.');
                update();
            }
        } catch (e) {
            console.warn('Could not load nutrition database:', e);
        }
    }

    // Initialize on load
    document.addEventListener('DOMContentLoaded', () => {
        loadNutritionDatabase();
        loadRecipeIndex();
        loadTagVocabulary();
        initScrollToTop();
        update();
    });

    // Load recipe index on page load
    function loadRecipeIndex() {
        fetch('json/recipe-index.json?t=' + new Date().getTime())
            .then(r => r.json())
            .then(data => {
                recipeIndex = data;
                populateRelatedRecipeDropdown();
                backfillRelatedRows();
            })
            .catch(err => {
                console.warn('Could not load recipe index:', err);
                const select = document.getElementById('related-recipe-select');
                if (select) select.innerHTML = '<option value="">Recipe index not found</option>';
            });
    }

    // Load official tag vocabulary
    function loadTagVocabulary() {
        fetch('json/official-tag-vocabulary.json?t=' + new Date().getTime())
            .then(r => r.json())
            .then(data => {
                tagVocabularyData = data;
                officialTagVocabulary = data.flatList || [];
                console.log('✅ Tag vocabulary loaded:', officialTagVocabulary.length, 'tags');
            })
            .catch(err => {
                console.warn('Could not load tag vocabulary, using fallback');
                officialTagVocabulary = [];
                tagVocabularyData = null;
            });
    }

    function backfillRelatedRows() {
        document.querySelectorAll('#related-list .related-row').forEach(row => {
            const savedTags = JSON.parse(row.dataset.tags || '[]');
            if (savedTags.length === 0) {
                const id = row.dataset.id;
                const entry = recipeIndex.find(r => r.id === id);
                if (entry && entry.tags && entry.tags.length) {
                    row.dataset.tags = JSON.stringify(entry.tags);
                    const container = row.querySelector('.tag-container');
                    if (container) {
                        const tagHtml = entry.tags.map(t =>
                            `<span class="tag-pill" onclick="removeTagFromRelated(this, '${t}')">${t}</span>`
                        ).join('');
                        container.insertAdjacentHTML('afterbegin', tagHtml);
                    }
                }
            }
        });
    }

    // ─────────────────────────────────────────────────────────
    // HELPER FUNCTIONS
    // ─────────────────────────────────────────────────────────
    function val(id) { 
        const el = document.getElementById(id); 
        return el ? el.value.trim() : ''; 
    }

    function toTitleCase(str) {
        if (!str) return str;
        return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1));
    }

    // ─────────────────────────────────────────────────────────
    // EMOJI MODAL
    // ─────────────────────────────────────────────────────────
    function openEmojiModal() { 
        renderEmojiModal(''); 
        document.getElementById('emoji-modal').classList.add('open'); 
        setTimeout(() => document.getElementById('emoji-search').focus(), 50); 
    }
    
    function closeEmojiModal() { 
        document.getElementById('emoji-modal').classList.remove('open'); 
        document.getElementById('emoji-search').value = ''; 
    }
    
    function closeEmojiIfOutside(e) { 
        if (e.target === document.getElementById('emoji-modal')) closeEmojiModal(); 
    }

    function renderEmojiModal(filter) {
        const body = document.getElementById('emoji-modal-body');
        const q = filter.toLowerCase();
        const seen = new Set();
        let html = '';

        if (q) {
            const matches = [];
            EMOJI_GROUPS.forEach(g => g.emojis.forEach(e => { if (!seen.has(e)) { seen.add(e); matches.push(e); } }));
            html = '<div class="emoji-group-label">All</div><div class="emoji-grid">';
            matches.forEach(e => { html += `<button class="emoji-btn${e === selectedEmoji ? ' selected' : ''}" onclick="pickEmoji('${e}')" title="${e}">${e}</button>`; });
            html += '</div>';
        } else {
            EMOJI_GROUPS.forEach(g => {
                const unique = g.emojis.filter(e => !seen.has(e));
                unique.forEach(e => seen.add(e));
                if (!unique.length) return;
                html += `<div class="emoji-group-label">${g.label}</div><div class="emoji-grid">`;
                unique.forEach(e => { html += `<button class="emoji-btn${e === selectedEmoji ? ' selected' : ''}" onclick="pickEmoji('${e}')" title="${e}">${e}</button>`; });
                html += '</div>';
            });
        }
        body.innerHTML = html;
    }

    function filterEmoji(val) { renderEmojiModal(val); }
    
    function pickEmoji(e) { 
        selectedEmoji = e; 
        document.getElementById('emoji').value = e; 
        document.getElementById('emoji-preview').textContent = e; 
        document.getElementById('emoji-trigger-text').textContent = e + '  — click to change'; 
        document.getElementById('emoji-trigger-text').style.color = 'var(--text)'; 
        closeEmojiModal(); 
        update(); 
    }

    // ─────────────────────────────────────────────────────────
    // TAGS
    // ─────────────────────────────────────────────────────────
    function handleTagKey(e) {
        if (e.key === 'Enter' || e.key === ',') { 
            e.preventDefault(); 
            const v = e.target.value.replace(/,/g, '').trim(); 
            if (v && !tags.includes(v)) { 
                tags.push(v); 
                renderTags(); 
                update(); 
            } 
            e.target.value = ''; 
        } else if (e.key === 'Backspace' && e.target.value === '' && tags.length) { 
            tags.pop(); 
            renderTags(); 
            update(); 
        }
    }

    function renderTags() {
        const wrap = document.getElementById('tags-wrap'); 
        const input = document.getElementById('tag-input');
        wrap.querySelectorAll('.tag-chip').forEach(c => c.remove());
        tags.forEach((t, i) => { 
            const chip = document.createElement('div'); 
            chip.className = 'tag-chip'; 
            chip.innerHTML = `${t}<button onclick="removeTag(${i})">×</button>`; 
            wrap.insertBefore(chip, input); 
        });
    }

    function removeTag(i) { 
        tags.splice(i, 1); 
        renderTags(); 
        update(); 
    }

    // ─────────────────────────────────────────────────────────
    // INGREDIENTS — DRAGGABLE WITH AUTOCOMPLETE
    // ─────────────────────────────────────────────────────────
    function addIngredient(qty='', unit='', item='', notes='') {
        const list = document.getElementById('ingredients-list');
        const row = document.createElement('div');
        row.className = 'ingredient-row';
        row.draggable = true;
        
        row.innerHTML = `
            <div class="drag-handle">⋮⋮</div>
            <input type="text" placeholder="Quantity" value="${qty}" oninput="update()" onkeydown="ingEnterKey(event, this, 0)">
            <input type="text" placeholder="Unit" value="${unit}" oninput="update()" onkeydown="ingEnterKey(event, this, 1)">
            <div class="autocomplete-wrapper" style="position: relative;">
                <input type="text" placeholder="Item" value="${item}" oninput="handleIngredientInput(this); update()" onfocus="handleIngredientFocus(this)" onblur="handleIngredientBlur(this)" onkeydown="handleIngredientKeydown(event, this)">
                <div class="autocomplete-dropdown"></div>
            </div>
            <input type="text" placeholder="Notes (optional)" value="${notes}" oninput="update()" onkeydown="ingEnterKey(event, this, 3)">
            <button class="btn danger" onclick="removeRow(this)">✕</button>
        `;
        
        row.addEventListener('dragstart', handleIngredientDragStart);
        row.addEventListener('dragend', handleIngredientDragEnd);
        row.addEventListener('dragover', handleIngredientDragOver);
        row.addEventListener('drop', handleIngredientDrop);
        row.addEventListener('dragleave', handleIngredientDragLeave);
        
        list.appendChild(row);
        update();

        if (!qty && !unit && !item && !notes) {
            const firstInput = row.querySelector('input');
            if (firstInput) firstInput.focus();
        }
    }

    function ingEnterKey(e, input, fieldIndex) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const row = input.closest('.ingredient-row');
        const inputs = row.querySelectorAll('input');
        
        if (fieldIndex === 0) { 
            inputs[1].focus();
        } else if (fieldIndex === 1) { 
            inputs[2].focus();
        } else if (fieldIndex === 3) { 
            addIngredient();
        }
    }

    function addToTaste(item='', notes='') {
        const list = document.getElementById('ingredients-list');
        const row = document.createElement('div');
        row.className = 'ingredient-totaste-row';
        row.draggable = true;
        row.innerHTML = `
            <div class="drag-handle">⋮⋮</div>
            <div class="autocomplete-wrapper" style="position:relative;">
                <input type="text" placeholder="e.g. Salt & Pepper, Chilli Flakes…" value="${item}"
                    oninput="handleToTasteInput(this); update()"
                    onfocus="handleToTasteFocus(this)"
                    onblur="handleToTasteBlur(this)"
                    onkeydown="handleToTasteKeydown(event, this)">
                <div class="autocomplete-dropdown"></div>
            </div>
            <div class="autocomplete-wrapper" style="position:relative;">
                <input type="text" placeholder="Note (optional — type a letter for suggestions)" value="${notes}"
                    oninput="handleToTasteNoteInput(this); update()"
                    onfocus="handleToTasteNoteFocus(this)"
                    onblur="handleToTasteNoteBlur(this)"
                    onkeydown="handleToTasteNoteKeydown(event, this)"
                    style="font-style:italic; color: var(--text-dim);">
                <div class="autocomplete-dropdown"></div>
            </div>
            <button class="btn danger" onclick="removeRow(this)">✕</button>
        `;
        row.addEventListener('dragstart', handleIngredientDragStart);
        row.addEventListener('dragend', handleIngredientDragEnd);
        row.addEventListener('dragover', handleIngredientDragOver);
        row.addEventListener('drop', handleIngredientDrop);
        row.addEventListener('dragleave', handleIngredientDragLeave);
        list.appendChild(row);
        update();
        if (!item) row.querySelector('input').focus();
    }

    function addIngredientHeading(heading='') {
        const list = document.getElementById('ingredients-list');
        const row = document.createElement('div');
        row.className = 'ingredient-heading-row';
        row.draggable = true;
        
        row.innerHTML = `
            <div class="drag-handle">⋮⋮</div>
            <input type="text" class="ingredient-heading-input" value="${heading}" oninput="update()" placeholder="e.g. For the Base, For the Filling, Topping…" onkeydown="headingEnterKey(event, this)">
            <button class="btn danger" onclick="removeRow(this)">✕</button>
        `;
        
        row.addEventListener('dragstart', handleIngredientDragStart);
        row.addEventListener('dragend', handleIngredientDragEnd);
        row.addEventListener('dragover', handleIngredientDragOver);
        row.addEventListener('drop', handleIngredientDrop);
        row.addEventListener('dragleave', handleIngredientDragLeave);
        
        list.appendChild(row);
        update();

        if (!heading) {
            row.querySelector('input').focus();
        }
    }

    function headingEnterKey(e, input) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        input.blur(); 
        addIngredient(); 
    }

    function handleIngredientDragStart(e) {
        draggedIngredientElement = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
    }

    function handleIngredientDragEnd(e) {
        this.classList.remove('dragging');
        document.querySelectorAll('.ingredient-row, .ingredient-heading-row').forEach(row => {
            row.classList.remove('drag-over');
        });
    }

    function handleIngredientDragOver(e) {
        if (e.preventDefault) e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (this !== draggedIngredientElement) {
            this.classList.add('drag-over');
        }
        return false;
    }

    function handleIngredientDragLeave(e) {
        this.classList.remove('drag-over');
    }

    function handleIngredientDrop(e) {
        if (e.stopPropagation) e.stopPropagation();
        this.classList.remove('drag-over');
        
        if (draggedIngredientElement !== this) {
            const list = document.getElementById('ingredients-list');
            const allIngredients = [...list.children];
            const draggedIndex = allIngredients.indexOf(draggedIngredientElement);
            const targetIndex = allIngredients.indexOf(this);
            
            if (draggedIndex < targetIndex) {
                this.parentNode.insertBefore(draggedIngredientElement, this.nextSibling);
            } else {
                this.parentNode.insertBefore(draggedIngredientElement, this);
            }
            update();
        }
        return false;
    }

    // ─────────────────────────────────────────────────────────
    // RECIPE LINK PICKER  ([[ trigger in step textareas)
    // ─────────────────────────────────────────────────────────
    function createRecipeLinkPicker() {
        const el = document.createElement('div');
        el.className = 'recipe-link-picker';
        el.id = 'recipeLinkPicker';
        el.style.display = 'none';
        el.innerHTML = `
            <div class="recipe-link-picker-header">Link to a recipe — type to filter</div>
            <div class="recipe-link-picker-list" id="rlpList"></div>
        `;
        document.body.appendChild(el);
        return el;
    }

    function getOrCreatePicker() {
        return document.getElementById('recipeLinkPicker') || createRecipeLinkPicker();
    }

    function showRecipeLinkPicker(textarea, query) {
        const picker = getOrCreatePicker();
        _rlpActiveTextarea = textarea;
        _rlpActiveIndex = -1;

        const q = query.toLowerCase();
        const matches = recipeIndex.filter(r =>
            !q || r.title.toLowerCase().includes(q) || (r.id && r.id.toLowerCase().includes(q))
        ).slice(0, 12);

        const list = document.getElementById('rlpList');
        if (matches.length === 0) {
            list.innerHTML = '<div class="recipe-link-picker-empty">No matching recipes</div>';
        } else {
            list.innerHTML = matches.map((r, i) => `
                <div class="recipe-link-picker-item" data-id="${r.id}" data-title="${(r.title||r.name||'').replace(/"/g,'&quot;')}" data-idx="${i}">
                    <span class="rlp-emoji">${r.emoji || '🍽️'}</span>
                    <span class="rlp-title">${r.title || r.name}</span>
                    <span class="rlp-cat">${r.category || ''}</span>
                </div>
            `).join('');
            list.querySelectorAll('.recipe-link-picker-item').forEach(item => {
                item.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    insertRecipeLink(this.dataset.id, this.dataset.title);
                });
            });
        }

        const rect = textarea.getBoundingClientRect();
        const scrollY = window.scrollY || window.pageYOffset;
        const scrollX = window.scrollX || window.pageXOffset;
        picker.style.display = 'block';
        picker.style.top = (rect.bottom + scrollY + 4) + 'px';
        picker.style.left = (rect.left + scrollX) + 'px';
    }

    function hideRecipeLinkPicker() {
        const picker = document.getElementById('recipeLinkPicker');
        if (picker) picker.style.display = 'none';
        _rlpActiveTextarea = null;
        _rlpActiveIndex = -1;
    }

    function insertRecipeLink(id, title) {
        const ta = _rlpActiveTextarea;
        if (!ta) return;
        const val = ta.value;
        const cursor = ta.selectionStart;
        const before = val.slice(0, cursor);
        const bracketPos = before.lastIndexOf('[[');
        if (bracketPos === -1) return;
        const after = val.slice(cursor);
        ta.value = val.slice(0, bracketPos) + `[[${id}|${title}]]` + after;
        const newCursor = bracketPos + id.length + title.length + 6;
        ta.setSelectionRange(newCursor, newCursor);
        hideRecipeLinkPicker();
        autoResize(ta);
        update();
        ta.focus();
    }

    function handleStepLinkTrigger(e, textarea) {
        const val = textarea.value;
        const cursor = textarea.selectionStart;
        const before = val.slice(0, cursor);
        const bracketPos = before.lastIndexOf('[[');

        if (bracketPos === -1) { hideRecipeLinkPicker(); return; }

        const between = before.slice(bracketPos + 2);
        if (between.includes(']]') || between.includes('[[')) { hideRecipeLinkPicker(); return; }

        const query = between;
        showRecipeLinkPicker(textarea, query);

        const picker = document.getElementById('recipeLinkPicker');
        if (!picker || picker.style.display === 'none') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const items = picker.querySelectorAll('.recipe-link-picker-item');
            _rlpActiveIndex = Math.min(_rlpActiveIndex + 1, items.length - 1);
            items.forEach((it, i) => it.classList.toggle('active', i === _rlpActiveIndex));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const items = picker.querySelectorAll('.recipe-link-picker-item');
            _rlpActiveIndex = Math.max(_rlpActiveIndex - 1, 0);
            items.forEach((it, i) => it.classList.toggle('active', i === _rlpActiveIndex));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            const items = picker.querySelectorAll('.recipe-link-picker-item');
            if (_rlpActiveIndex >= 0 && items[_rlpActiveIndex]) {
                e.preventDefault();
                const item = items[_rlpActiveIndex];
                insertRecipeLink(item.dataset.id, item.dataset.title);
            }
        } else if (e.key === 'Escape') {
            hideRecipeLinkPicker();
        }
    }

    // Close picker when clicking outside
    document.addEventListener('mousedown', function(e) {
        const picker = document.getElementById('recipeLinkPicker');
        if (picker && !picker.contains(e.target) && e.target !== _rlpActiveTextarea) {
            hideRecipeLinkPicker();
        }
    });

    // ─────────────────────────────────────────────────────────
    // STEP DRAG AND DROP
    // ─────────────────────────────────────────────────────────
    function handleStepDragStart(e) {
        draggedStepElement = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleStepDragEnd(e) {
        this.classList.remove('dragging');
        document.querySelectorAll('.step-row, .step-heading-row').forEach(r => r.classList.remove('drag-over'));
        renumberSteps();
    }

    function handleStepDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (this !== draggedStepElement) this.classList.add('drag-over');
        return false;
    }

    function handleStepDragLeave(e) {
        this.classList.remove('drag-over');
    }

    function handleStepDrop(e) {
        e.stopPropagation();
        this.classList.remove('drag-over');
        if (draggedStepElement && draggedStepElement !== this) {
            const list = document.getElementById('steps-list');
            const all = [...list.children];
            const di = all.indexOf(draggedStepElement);
            const ti = all.indexOf(this);
            if (di < ti) this.parentNode.insertBefore(draggedStepElement, this.nextSibling);
            else this.parentNode.insertBefore(draggedStepElement, this);
            renumberSteps();
        }
        return false;
    }

    // ─────────────────────────────────────────────────────────
    // YOU WILL ALSO NEED
    // ─────────────────────────────────────────────────────────
    function addEquipmentItem(item = '', notes = '') {
        const list = document.getElementById('equipment-list');
        const row = document.createElement('div');
        row.className = 'equipment-item-row';
        row.draggable = true;
        row.innerHTML = `
            <div class="drag-handle">⋮⋮</div>
            <input type="text" class="equipment-item-input" value="${escapeHtml(item)}"
                placeholder="Item" oninput="update()" style="background:transparent;border:none;border-bottom:1px solid var(--border);color:var(--text);font-family:var(--sans);font-size:0.88rem;font-weight:400;padding:0.2rem 0.1rem;outline:none;width:100%;transition:border-color 0.15s;"
                onfocus="this.style.borderBottomColor='var(--gold-dim)'" onblur="this.style.borderBottomColor='var(--border)'">
            <input type="text" class="equipment-note-input" value="${escapeHtml(notes)}"
                placeholder="Note (optional)" oninput="update()" style="background:transparent;border:none;border-bottom:1px solid var(--border);color:var(--text-dim);font-family:var(--sans);font-size:0.82rem;font-style:italic;font-weight:300;padding:0.2rem 0.1rem;outline:none;width:100%;transition:border-color 0.15s;"
                onfocus="this.style.borderBottomColor='var(--gold-dim)'" onblur="this.style.borderBottomColor='var(--border)'">
            <button class="btn danger" onclick="removeRow(this); update()">✕</button>
        `;
        row.dataset.item = item;
        row.dataset.notes = notes;
        row.addEventListener('dragstart', handleEquipmentItemDragStart);
        row.addEventListener('dragend', handleEquipmentItemDragEnd);
        row.addEventListener('dragover', handleEquipmentItemDragOver);
        row.addEventListener('drop', handleEquipmentItemDrop);
        row.addEventListener('dragleave', handleEquipmentItemDragLeave);
        list.appendChild(row);
        update();
        const input = document.getElementById('equipment-input');
        if (input) {
            input.value = '';
            if (!item) input.focus();
        }
    }

    function handleEquipmentItemDragStart(e) {
        draggedEquipmentItemElement = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleEquipmentItemDragEnd(e) {
        this.classList.remove('dragging');
        document.querySelectorAll('.equipment-item-row').forEach(r => r.classList.remove('drag-over'));
    }

    function handleEquipmentItemDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (this !== draggedEquipmentItemElement) this.classList.add('drag-over');
        return false;
    }

    function handleEquipmentItemDragLeave(e) {
        this.classList.remove('drag-over');
    }

    function handleEquipmentItemDrop(e) {
        e.stopPropagation();
        this.classList.remove('drag-over');
        if (draggedEquipmentItemElement && draggedEquipmentItemElement !== this) {
            const list = document.getElementById('equipment-list');
            const all = [...list.children];
            const di = all.indexOf(draggedEquipmentItemElement);
            const ti = all.indexOf(this);
            if (di < ti) this.parentNode.insertBefore(draggedEquipmentItemElement, this.nextSibling);
            else this.parentNode.insertBefore(draggedEquipmentItemElement, this);
            update();
        }
        return false;
    }

    // ─────────────────────────────────────────────────────────
    // YOU WILL ALSO NEED — AUTOCOMPLETE PRESETS
    // ─────────────────────────────────────────────────────────
    const EQUIPMENT_PRESETS = [
        'Plain Flour', 'Bread Crumbs', 'Panko Crumbs', 'Milk & Eggs',
        'Oil', 'Vegetable Oil', 'Cottonseed Oil', 'Sunflower Oil', 'Canola Oil', 'Peanut Oil', 'Olive Oil',
        'Baking Paper', 'Baking Sheet', 'Cooling Rack', 'Pastry Brush',
        'Rolling Pin', 'Skewer', 'Thermometer', 'Cooking Spray',
        'Shallow Dish', 'Wire Rack', 'Tongs',
        'Eggs', 'Milk', 'Full Cream Milk',
        'Plastic Wrap', 'Aluminium Foil', 'Kitchen Twine',
        'Butter', 'Salt', 'Pepper', 'Salt & Pepper',
        'Large Bowl', 'Small Bowl', 'Whisk', 'Spatula', 'Wooden Spoon',
        'Frying Pan', 'Heavy-Based Pot', 'Wok', 'Saucepan',
        'Food Processor', 'Blender', 'Hand Mixer', 'Stand Mixer',
        'Mortar & Pestle', 'Grater', 'Zester', 'Mandoline',
        'Colander', 'Sieve', 'Ladle', 'Slotted Spoon',
        'Meat Thermometer', 'Piping Bag', 'Springform Tin', 'Bundt Pan',
        'Loaf Pan', 'Muffin Tin', 'Cake Tin',
    ];

    const EQUIPMENT_NOTE_PRESETS = [
        "Dusting before egg wash.",
        "Crumbing.",
        "Crumbing — panko gives a lighter, crunchier crust.",
        "For egg wash — use 1 egg per 250ml full cream milk. Whisk well before using.",
        "For deep frying — use a high smoke point oil such as cottonseed, sunflower, canola, or peanut oil.",
        "For deep frying — high smoke point, neutral flavour.",
        "For deep frying — high smoke point with a mild nutty flavour.",
        "For shallow frying.",
        "For pan frying — medium heat.",
        "For greasing the pan.",
        "For lining the baking tray.",
        "For testing doneness.",
        "For brushing pastry.",
        "For rolling out dough.",
        "Greased and floured.",
        "At room temperature.",
        "Chilled.",
        "For garnish.",
        "Optional.",
    ];

    function getEquipmentSuggestions(query) {
        const q = query.toLowerCase().trim();
        if (!q) return [];
        const saved = JSON.parse(localStorage.getItem('equipmentLibrary') || '{}');
        const matches = {};
        EQUIPMENT_PRESETS.forEach(name => {
            if (name.toLowerCase().includes(q)) matches[name] = saved[name.toLowerCase()] || 0;
        });
        Object.keys(saved).forEach(key => {
            if (key.includes(q) && !matches[key]) matches[key] = saved[key];
        });
        return Object.entries(matches)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([name]) => ({ name, count: matches[name] }))
            .slice(0, 8);
    }

    function getEquipmentNoteSuggestions(query) {
        const q = query.toLowerCase().trim();
        if (!q) return [];
        const saved = JSON.parse(localStorage.getItem('equipmentNoteLibrary') || '{}');
        const matches = {};
        EQUIPMENT_NOTE_PRESETS.forEach(note => {
            if (note.toLowerCase().includes(q)) matches[note] = saved[note] || 0;
        });
        Object.keys(saved).forEach(key => {
            if (key.includes(q) && !matches[key]) matches[key] = saved[key];
        });
        return Object.entries(matches)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([name]) => ({ name, count: matches[name] }))
            .slice(0, 8);
    }

    function saveEquipmentItem(item) {
        if (!item) return;
        const lib = JSON.parse(localStorage.getItem('equipmentLibrary') || '{}');
        lib[item.toLowerCase()] = (lib[item.toLowerCase()] || 0) + 1;
        localStorage.setItem('equipmentLibrary', JSON.stringify(lib));
    }

    function handleEquipmentAutocompleteInput(input) {
        const val = input.value;
        const pipePos = val.indexOf('|');
        const dropdown = input.parentElement.querySelector('.autocomplete-dropdown');

        if (pipePos !== -1) {
            const noteQuery = val.slice(pipePos + 1).trim();
            if (noteQuery.length < 1) { dropdown.classList.remove('show'); return; }
            const suggestions = getEquipmentNoteSuggestions(noteQuery);
            if (!suggestions.length) { dropdown.classList.remove('show'); return; }
            renderAutocompleteSuggestions(dropdown, suggestions, input);
            dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
                item.onclick = function(e) {
                    e.preventDefault();
                    const before = val.slice(0, pipePos + 1) + ' ';
                    input.value = before + this.textContent.trim();
                    dropdown.classList.remove('show');
                    update();
                    input.focus();
                };
            });
        } else {
            const query = val.trim();
            if (query.length < 1) { dropdown.classList.remove('show'); return; }
            const suggestions = getEquipmentSuggestions(query);
            if (!suggestions.length) { dropdown.classList.remove('show'); return; }
            renderAutocompleteSuggestions(dropdown, suggestions, input);
        }
        currentAutocompleteInput = input;
        selectedAutocompleteIndex = -1;
    }

    function handleEquipmentAutocompleteFocus(input) {
        if (input.value.trim().length >= 1) handleEquipmentAutocompleteInput(input);
    }

    function handleEquipmentAutocompleteBlur(input) {
        setTimeout(() => {
            const dropdown = input.parentElement.querySelector('.autocomplete-dropdown');
            if (dropdown) dropdown.classList.remove('show');
            currentAutocompleteInput = null;
            selectedAutocompleteIndex = -1;
        }, 200);
    }

    function handleEquipmentAutocompleteKeydown(event, input) {
        const dropdown = input.parentElement.querySelector('.autocomplete-dropdown');
        const showing = dropdown.classList.contains('show');

        if (event.key === 'ArrowDown' && showing) {
            event.preventDefault();
            const items = dropdown.querySelectorAll('.autocomplete-item');
            selectedAutocompleteIndex = Math.min(selectedAutocompleteIndex + 1, items.length - 1);
            updateAutocompleteSelection(items);
        } else if (event.key === 'ArrowUp' && showing) {
            event.preventDefault();
            const items = dropdown.querySelectorAll('.autocomplete-item');
            selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, -1);
            updateAutocompleteSelection(items);
        } else if (showing && selectedAutocompleteIndex >= 0 && (event.key === 'Tab')) {
            event.preventDefault();
            const items = dropdown.querySelectorAll('.autocomplete-item');
            if (items[selectedAutocompleteIndex]) {
                const val = input.value;
                const pipePos = val.indexOf('|');
                if (pipePos !== -1) {
                    input.value = val.slice(0, pipePos + 1) + ' ' + items[selectedAutocompleteIndex].textContent.trim();
                } else {
                    input.value = items[selectedAutocompleteIndex].textContent.trim();
                }
                dropdown.classList.remove('show');
                update();
            }
        } else if (event.key === 'Escape') {
            dropdown.classList.remove('show');
        }
    }

    function handleEquipmentEnter(event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const input = document.getElementById('equipment-input');
        let value = input.value.trim();
        if (!value) return;
        let item = value, notes = '';
        if (value.includes('|')) {
            const parts = value.split('|');
            item = parts[0].trim();
            notes = parts.slice(1).join('|').trim();
        } else if (value.includes(':')) {
            const parts = value.split(':');
            item = parts[0].trim();
            notes = parts.slice(1).join(':').trim();
        }
        addEquipmentItem(item, notes);
    }

    // ─────────────────────────────────────────────────────────
    // INGREDIENT AUTOCOMPLETE
    // ─────────────────────────────────────────────────────────
    function handleIngredientInput(input) {
        const query = input.value.toLowerCase().trim();
        const dropdown = input.parentElement.querySelector('.autocomplete-dropdown');
        
        if (query.length < 2) {
            dropdown.classList.remove('show');
            return;
        }
        
        const ingredients = getIngredientSuggestions(query);
        
        if (ingredients.length === 0) {
            dropdown.classList.remove('show');
            return;
        }
        
        renderAutocompleteSuggestions(dropdown, ingredients, input);
        currentAutocompleteInput = input;
        selectedAutocompleteIndex = -1;
    }

    function handleIngredientFocus(input) {
        const query = input.value.toLowerCase().trim();
        if (query.length >= 2) {
            handleIngredientInput(input);
        }
    }

    function handleIngredientBlur(input) {
        setTimeout(() => {
            const dropdown = input.parentElement.querySelector('.autocomplete-dropdown');
            dropdown.classList.remove('show');
            currentAutocompleteInput = null;
            selectedAutocompleteIndex = -1;
        }, 200);
    }

    function handleIngredientKeydown(event, input) {
        const dropdown = input.parentElement.querySelector('.autocomplete-dropdown');
        const dropdownShowing = dropdown.classList.contains('show');

        if (event.key === 'ArrowDown' && dropdownShowing) {
            event.preventDefault();
            const items = dropdown.querySelectorAll('.autocomplete-item');
            selectedAutocompleteIndex = Math.min(selectedAutocompleteIndex + 1, items.length - 1);
            updateAutocompleteSelection(items);
        } else if (event.key === 'ArrowUp' && dropdownShowing) {
            event.preventDefault();
            const items = dropdown.querySelectorAll('.autocomplete-item');
            selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, -1);
            updateAutocompleteSelection(items);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const items = dropdown.querySelectorAll('.autocomplete-item');
            if (dropdownShowing && selectedAutocompleteIndex >= 0 && items[selectedAutocompleteIndex]) {
                selectAutocompleteItem(items[selectedAutocompleteIndex].textContent.split('(')[0].trim(), input);
            } else {
                dropdown.classList.remove('show');
                const row = input.closest('.ingredient-row');
                const notesInput = row.querySelector('input:nth-of-type(4)');
                if (notesInput) notesInput.focus();
            }
        } else if (event.key === 'Escape') {
            dropdown.classList.remove('show');
        }
    }

    function updateAutocompleteSelection(items) {
        items.forEach((item, index) => {
            if (index === selectedAutocompleteIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    function renderAutocompleteSuggestions(dropdown, ingredients, input) {
        dropdown.innerHTML = ingredients.map(ing => {
            const count = ing.count > 1 ? `<span class="autocomplete-count">(used ${ing.count}x)</span>` : '';
            return `<div class="autocomplete-item" onclick="selectAutocompleteItem('${ing.name.replace(/'/g, "\\'")}', this.parentElement.previousElementSibling)">${ing.name}${count}</div>`;
        }).join('');
        
        dropdown.classList.add('show');
    }

    function selectAutocompleteItem(itemName, input) {
        input.value = itemName;
        const dropdown = input.parentElement.querySelector('.autocomplete-dropdown');
        dropdown.classList.remove('show');
        update();
        
        const notesField = input.closest('.ingredient-row').querySelector('input:nth-of-type(4)');
        if (notesField) notesField.focus();
    }

    function getIngredientSuggestions(query) {
        const currentIngredients = [];
        document.querySelectorAll('#ingredients-list .ingredient-row').forEach(row => {
            const inputs = row.querySelectorAll('input');
            const item = inputs[2]?.value.trim().toLowerCase();
            if (item && item.includes(query)) {
                currentIngredients.push(item);
            }
        });
        
        const savedIngredients = JSON.parse(localStorage.getItem('ingredientLibrary') || '{}');
        const matches = {};
        
        Object.keys(savedIngredients).forEach(key => {
            if (key.includes(query)) {
                matches[key] = savedIngredients[key];
            }
        });
        
        return Object.keys(matches)
            .map(name => ({ name, count: matches[name] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
    }

    // ─────────────────────────────────────────────────────────
    // TO-TASTE AUTOCOMPLETE
    // ─────────────────────────────────────────────────────────
    const TO_TASTE_DEFAULT_NOTES = {
        'Salt':            "Don't add too much all at once — you can't take it out once it's in.",
        'Pepper':          "Don't add too much all at once — you can't take it out once it's in.",
        'Salt & Pepper':   "Don't add too much all at once — you can't take it out once it's in.",
        'Black Pepper':    "Don't add too much all at once — you can't take it out once it's in.",
        'White Pepper':    "Don't add too much all at once — you can't take it out once it's in.",
        'Sea Salt':        "Don't add too much all at once — you can't take it out once it's in.",
        'Chilli Flakes':   "Add gradually and taste — heat builds slowly.",
        'Chilli Powder':   "Add gradually and taste — heat builds slowly.",
        'Cayenne Pepper':  "Add gradually and taste — heat builds slowly.",
        'Plain Flour':     "Dusting before egg wash.",
        'Milk & Eggs':     "For egg wash — use 1 egg per 250ml full cream milk. Whisk well before using.",
        'Bread Crumbs':    "Crumbing.",
        'Panko Crumbs':    "Crumbing — panko gives a lighter, crunchier crust.",
        'Oil':             "For deep frying — use a high smoke point oil such as cottonseed, sunflower, canola, or peanut oil.",
        'Vegetable Oil':   "For deep frying — use a high smoke point oil such as cottonseed, sunflower, canola, or peanut oil.",
        'Cottonseed Oil':  "For deep frying — high smoke point, neutral flavour.",
        'Sunflower Oil':   "For deep frying — high smoke point, neutral flavour.",
        'Canola Oil':      "For deep frying — high smoke point, neutral flavour.",
        'Peanut Oil':      "For deep frying — high smoke point with a mild nutty flavour.",
    };

    const TO_TASTE_PRESETS = [
        'Salt', 'Pepper', 'Salt & Pepper', 'Black Pepper', 'White Pepper',
        'Sea Salt', 'Flaked Salt', 'Kosher Salt', 'Rock Salt',
        'Chilli Flakes', 'Chilli Powder', 'Cayenne Pepper',
        'Garlic Powder', 'Onion Powder', 'Paprika', 'Smoked Paprika',
        'Cumin', 'Coriander', 'Turmeric', 'Cinnamon', 'Nutmeg',
        'Mixed Herbs', 'Dried Oregano', 'Dried Thyme', 'Dried Basil',
        'Soy Sauce', 'Fish Sauce', 'Worcestershire Sauce',
        'Lemon Juice', 'Lime Juice', 'Vinegar',
        'Sugar', 'Honey', 'Salt to Taste', 'Pepper to Taste',
        'Plain Flour', 'Milk & Eggs', 'Bread Crumbs', 'Panko Crumbs',
        'Oil', 'Vegetable Oil', 'Cottonseed Oil', 'Sunflower Oil', 'Canola Oil', 'Peanut Oil',
        'Butter', 'Olive Oil', 'Cooking Spray', 'Parchment Paper', 'Plastic Wrap',
        'Pastry Brush', 'Rolling Pin', 'Skewer', 'Thermometer',
    ];

    function getToTasteSuggestions(query) {
        const q = query.toLowerCase().trim();
        if (!q) return [];
        const saved = JSON.parse(localStorage.getItem('toTasteLibrary') || '{}');
        const matches = {};
        TO_TASTE_PRESETS.forEach(name => {
            if (name.toLowerCase().includes(q)) matches[name] = saved[name.toLowerCase()] || 0;
        });
        Object.keys(saved).forEach(key => {
            if (key.includes(q) && !matches[key]) matches[key] = saved[key];
        });
        return Object.entries(matches)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([name]) => ({ name, count: matches[name] }))
            .slice(0, 8);
    }

    function saveToTasteItem(item) {
        if (!item) return;
        const key = item.toLowerCase();
        const lib = JSON.parse(localStorage.getItem('toTasteLibrary') || '{}');
        lib[key] = (lib[key] || 0) + 1;
        localStorage.setItem('toTasteLibrary', JSON.stringify(lib));
    }

    const TO_TASTE_NOTE_PRESETS = [
        "Don't add too much all at once — you can't take it out once it's in.",
        "Add gradually and taste — heat builds slowly.",
        "Season at the end of cooking for best flavour.",
        "Season each layer as you build the dish.",
        "Taste as you go.",
        "Add a pinch at a time.",
        "Adjust to your taste.",
        "Use sparingly.",
        "To taste.",
        "Add at the end — it loses potency with heat.",
        "Fresh is best — add just before serving.",
        "For garnish only.",
        "Optional — omit if preferred.",
        "For colour and flavour.",
        "For balance — cuts through the richness.",
        "For acidity — brightens the dish.",
        "Grind fresh for best flavour.",
        "Dusting before egg wash.",
        "Crumbing.",
        "Crumbing — panko gives a lighter, crunchier crust.",
        "For egg wash — use 1 egg per 250ml full cream milk. Whisk well before using.",
        "For deep frying — use a high smoke point oil such as cottonseed, sunflower, canola, or peanut oil.",
        "For deep frying — high smoke point, neutral flavour.",
        "For deep frying — high smoke point with a mild nutty flavour.",
        "For shallow frying.",
        "For pan frying — medium heat.",
        "Greasing the pan.",
        "For lining the baking tray.",
        "For testing doneness.",
        "For brushing pastry.",
        "For rolling out dough.",
    ];

    function getToTasteNoteSuggestions(query) {
        const q = query.toLowerCase().trim();
        if (!q) return [];
        const saved = JSON.parse(localStorage.getItem('toTasteNoteLibrary') || '{}');
        const matches = {};
        TO_TASTE_NOTE_PRESETS.forEach(note => {
            if (note.toLowerCase().includes(q)) matches[note] = saved[note] || 0;
        });
        Object.keys(saved).forEach(key => {
            if (key.includes(q) && !matches[key]) matches[key] = saved[key];
        });
        return Object.entries(matches)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([name]) => ({ name, count: matches[name] }))
            .slice(0, 8);
    }

    function saveToTasteNote(note) {
        if (!note) return;
        const lib = JSON.parse(localStorage.getItem('toTasteNoteLibrary') || '{}');
        lib[note] = (lib[note] || 0) + 1;
        localStorage.setItem('toTasteNoteLibrary', JSON.stringify(lib));
    }

    function handleToTasteNoteInput(input) {
        const query = input.value.trim();
        const dropdown = input.parentElement.querySelector('.autocomplete-dropdown');
        if (query.length < 1) { dropdown.classList.remove('show'); return; }
        const suggestions = getToTasteNoteSuggestions(query);
        if (!suggestions.length) { dropdown.classList.remove('show'); return; }
        renderAutocompleteSuggestions(dropdown, suggestions, input);
        currentAutocompleteInput = input;
        selectedAutocompleteIndex = -1;
    }

    function handleToTasteNoteFocus(input) {
        if (input.value.trim().length >= 1) handleToTasteNoteInput(input);
    }

    function handleToTasteNoteBlur(input) {
        setTimeout(() => {
            const dropdown = input.parentElement.querySelector('.autocomplete-dropdown');
            if (dropdown) dropdown.classList.remove('show');
            if (input.value.trim()) saveToTasteNote(input.value.trim());
            currentAutocompleteInput = null;
            selectedAutocompleteIndex = -1;
        }, 200);
    }

    function handleToTasteNoteKeydown(event, input) {
        const dropdown = input.parentElement.querySelector('.autocomplete-dropdown');
        const showing = dropdown.classList.contains('show');

        if (event.key === 'ArrowDown' && showing) {
            event.preventDefault();
            const items = dropdown.querySelectorAll('.autocomplete-item');
            selectedAutocompleteIndex = Math.min(selectedAutocompleteIndex + 1, items.length - 1);
            updateAutocompleteSelection(items);
        } else if (event.key === 'ArrowUp' && showing) {
            event.preventDefault();
            const items = dropdown.querySelectorAll('.autocomplete-item');
            selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, -1);
            updateAutocompleteSelection(items);
        } else if (event.key === 'Enter' || event.key === 'Tab') {
            const items = dropdown.querySelectorAll('.autocomplete-item');
            if (showing && selectedAutocompleteIndex >= 0 && items[selectedAutocompleteIndex]) {
                event.preventDefault();
                const val = items[selectedAutocompleteIndex].textContent.trim();
                input.value = val;
                dropdown.classList.remove('show');
                saveToTasteNote(val);
                update();
            } else {
                dropdown.classList.remove('show');
            }
        } else if (event.key === 'Escape') {
            dropdown.classList.remove('show');
        }
    }

    function handleToTasteInput(input) {
        const query = input.value.trim();
        const dropdown = input.parentElement.querySelector('.autocomplete-dropdown');
        if (query.length < 1) { dropdown.classList.remove('show'); return; }
        const suggestions = getToTasteSuggestions(query);
        if (!suggestions.length) { dropdown.classList.remove('show'); return; }
        renderAutocompleteSuggestions(dropdown, suggestions, input);
        currentAutocompleteInput = input;
        selectedAutocompleteIndex = -1;
    }

    function handleToTasteFocus(input) {
        if (input.value.trim().length >= 1) handleToTasteInput(input);
    }

    function handleToTasteBlur(input) {
        setTimeout(() => {
            const dropdown = input.parentElement.querySelector('.autocomplete-dropdown');
            if (dropdown) dropdown.classList.remove('show');
            if (input.value.trim()) saveToTasteItem(input.value.trim());
            currentAutocompleteInput = null;
            selectedAutocompleteIndex = -1;
        }, 200);
    }

    function handleToTasteKeydown(event, input) {
        const dropdown = input.parentElement.querySelector('.autocomplete-dropdown');
        const showing = dropdown.classList.contains('show');

        if (event.key === 'ArrowDown' && showing) {
            event.preventDefault();
            const items = dropdown.querySelectorAll('.autocomplete-item');
            selectedAutocompleteIndex = Math.min(selectedAutocompleteIndex + 1, items.length - 1);
            updateAutocompleteSelection(items);
        } else if (event.key === 'ArrowUp' && showing) {
            event.preventDefault();
            const items = dropdown.querySelectorAll('.autocomplete-item');
            selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, -1);
            updateAutocompleteSelection(items);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const items = dropdown.querySelectorAll('.autocomplete-item');
            if (showing && selectedAutocompleteIndex >= 0 && items[selectedAutocompleteIndex]) {
                const val = items[selectedAutocompleteIndex].textContent.split('(')[0].trim();
                input.value = val;
                dropdown.classList.remove('show');
                saveToTasteItem(val);
                const notesInput = input.closest('.ingredient-totaste-row')?.querySelector('input:last-of-type');
                if (notesInput && !notesInput.value.trim() && TO_TASTE_DEFAULT_NOTES[val]) {
                    notesInput.value = TO_TASTE_DEFAULT_NOTES[val];
                }
                if (notesInput) notesInput.focus();
                update();
            } else {
                dropdown.classList.remove('show');
                const notesInput = input.closest('.ingredient-totaste-row')?.querySelector('input:last-of-type');
                if (notesInput) notesInput.focus();
            }
        } else if (event.key === 'Escape') {
            dropdown.classList.remove('show');
        } else if (event.key === 'Tab') {
            dropdown.classList.remove('show');
        }
    }

    function updateIngredientLibrary() {
        const library = JSON.parse(localStorage.getItem('ingredientLibrary') || '{}');
        
        document.querySelectorAll('#ingredients-list .ingredient-row').forEach(row => {
            const inputs = row.querySelectorAll('input');
            const item = inputs[2]?.value.trim().toLowerCase();
            if (item && !row.classList.contains('ingredient-heading-row')) {
                library[item] = (library[item] || 0) + 1;
            }
        });
        
        localStorage.setItem('ingredientLibrary', JSON.stringify(library));
    }

    // ─────────────────────────────────────────────────────────
    // TOAST NOTIFICATION
    // ─────────────────────────────────────────────────────────
    function toast(msg) {
        const t = document.getElementById('toast');
        if (!t) {
            console.warn('Toast element not found:', msg);
            alert(msg);
            return;
        }
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(function() {
            t.classList.remove('show');
        }, 2200);
    }

    function checkRequiredFields() {
        const title = document.getElementById('title')?.value.trim();
        const category = document.getElementById('category')?.value;
        const difficulty = document.getElementById('difficulty')?.value;
        const description = document.getElementById('description')?.value.trim();
        
        const missing = [];
        
        if (!title) missing.push('Recipe Title');
        if (!category || category === '') missing.push('Category');
        if (!difficulty || difficulty === '') missing.push('Difficulty');
        if (!description) missing.push('Description');
        
        if (missing.length > 0) {
            const missingList = missing.join(', ');
            toast(`⚠️ Cannot save. Required fields missing: ${missingList}`);
            
            missing.forEach(field => {
                let element = null;
                if (field === 'Recipe Title') element = document.getElementById('title');
                if (field === 'Category') element = document.getElementById('category');
                if (field === 'Difficulty') element = document.getElementById('difficulty');
                if (field === 'Description') element = document.getElementById('description');
                
                if (element) {
                    element.style.transition = 'all 0.2s';
                    element.style.borderColor = 'var(--red)';
                    element.style.backgroundColor = 'rgba(192, 57, 43, 0.1)';
                    setTimeout(() => {
                        element.style.borderColor = '';
                        element.style.backgroundColor = '';
                    }, 2000);
                }
            });
            
            return false;
        }
        
        return true;
    }

    // ─────────────────────────────────────────────────────────
    // STEPS
    // ─────────────────────────────────────────────────────────
    function addStep(text='', insertAfter=null){
        const list=document.getElementById('steps-list'); 
        const row=document.createElement('div'); 
        row.className='step-row';
        row.draggable=true;
        row.innerHTML=`
            <div class="step-num-handle"><span class="step-num">1</span><div class="drag-handle">⋮⋮</div></div>
            <textarea placeholder="Describe this step… Type [[ to link to another recipe" oninput="autoResize(this); update(); handleStepLinkTrigger(event, this)" onkeydown="stepEnterKey(event, this); handleStepLinkTrigger(event, this)">${text}</textarea>
            <button class="btn danger" onclick="removeRow(this); renumberSteps()">✕</button>
        `;
        row.addEventListener('dragstart', handleStepDragStart);
        row.addEventListener('dragend', handleStepDragEnd);
        row.addEventListener('dragover', handleStepDragOver);
        row.addEventListener('drop', handleStepDrop);
        row.addEventListener('dragleave', handleStepDragLeave);

        if (insertAfter) {
            insertAfter.parentNode.insertBefore(row, insertAfter.nextSibling);
        } else {
            list.appendChild(row);
        }
        renumberSteps();

        if (!text) {
            const ta = row.querySelector('textarea');
            ta.focus();
            autoResize(ta);
        }
    }

    function stepEnterKey(e, textarea) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const currentRow = textarea.closest('.step-row');
            addStep('', currentRow);
        }
    }

    function addStepHeading(heading='') {
        const list = document.getElementById('steps-list');
        const row = document.createElement('div');
        row.className = 'step-heading-row';
        row.draggable = true;

        row.innerHTML = `
            <div class="drag-handle">⋮⋮</div>
            <input type="text" placeholder="e.g. Make the Sauce, Assemble, To Serve…" value="${heading}" oninput="update()" onkeydown="stepHeadingEnterKey(event, this)">
            <button class="btn danger" onclick="removeRow(this); renumberSteps()">✕</button>
        `;

        row.addEventListener('dragstart', handleStepDragStart);
        row.addEventListener('dragend', handleStepDragEnd);
        row.addEventListener('dragover', handleStepDragOver);
        row.addEventListener('drop', handleStepDrop);
        row.addEventListener('dragleave', handleStepDragLeave);

        list.appendChild(row);
        update();

        if (!heading) {
            row.querySelector('input').focus();
        }
    }

    function stepHeadingEnterKey(e, input) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        input.blur();
        addStep();
    }

    function renumberSteps(){ 
        let stepCount = 0;
        document.querySelectorAll('#steps-list .step-row').forEach(row => {
            stepCount++;
            row.querySelector('.step-num').textContent = stepCount;
        });
        update(); 
    }
    
    function autoResize(el){ el.style.height='auto'; el.style.height=el.scrollHeight+'px'; }

    // ─────────────────────────────────────────────────────────
    // NOTES — DRAGGABLE
    // ─────────────────────────────────────────────────────────
    function addNote(type='serving', title='', content=''){
        const list=document.getElementById('notes-list'); 
        const row=document.createElement('div'); 
        row.className='note-row';
        row.draggable = true;
        
        row.innerHTML=`
            <div class="drag-handle">⋮⋮</div>
            <select onchange="update()">
                <option value="acknowledgement" ${type==='acknowledgement'?'selected':''}>Acknowledgement</option>
                <option value="serving" ${type==='serving'?'selected':''}>Serving</option>
                <option value="technique" ${type==='technique'?'selected':''}>Technique</option>
                <option value="storage" ${type==='storage'?'selected':''}>Storage</option>
                <option value="substitution" ${type==='substitution'?'selected':''}>Substitution</option>
                <option value="variation" ${type==='variation'?'selected':''}>Variation</option>
                <option value="tip" ${type==='tip'?'selected':''}>Tip</option>
            </select>
            <div class="note-inner">
                <input type="text" placeholder="Title" value="${title}" oninput="update()">
                <textarea placeholder="Content…" oninput="autoResize(this); update()">${content}</textarea>
            </div>
            <button class="btn danger" onclick="removeRow(this)">✕</button>
        `;
        
        row.addEventListener('dragstart', handleNoteDragStart);
        row.addEventListener('dragend', handleNoteDragEnd);
        row.addEventListener('dragover', handleNoteDragOver);
        row.addEventListener('drop', handleNoteDrop);
        row.addEventListener('dragleave', handleNoteDragLeave);
        
        list.appendChild(row); 
        update();
    }

    function handleNoteDragStart(e) {
        draggedNoteElement = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
    }

    function handleNoteDragEnd(e) {
        this.classList.remove('dragging');
        document.querySelectorAll('.note-row').forEach(row => {
            row.classList.remove('drag-over');
        });
    }

    function handleNoteDragOver(e) {
        if (e.preventDefault) e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (this !== draggedNoteElement) {
            this.classList.add('drag-over');
        }
        return false;
    }

    function handleNoteDragLeave(e) {
        this.classList.remove('drag-over');
    }

    function handleNoteDrop(e) {
        if (e.stopPropagation) e.stopPropagation();
        this.classList.remove('drag-over');
        
        if (draggedNoteElement !== this) {
            const list = document.getElementById('notes-list');
            const allNotes = [...list.children];
            const draggedIndex = allNotes.indexOf(draggedNoteElement);
            const targetIndex = allNotes.indexOf(this);
            
            if (draggedIndex < targetIndex) {
                this.parentNode.insertBefore(draggedNoteElement, this.nextSibling);
            } else {
                this.parentNode.insertBefore(draggedNoteElement, this);
            }
            update();
        }
        return false;
    }

    // ─────────────────────────────────────────────────────────
    // REMOVE ROW
    // ─────────────────────────────────────────────────────────
    function removeRow(btn){ btn.closest('[class$="-row"]').remove(); update(); }

    // ─────────────────────────────────────────────────────────
    // BUILD JSON
    // ─────────────────────────────────────────────────────────
    function buildJSON(){
        const title=val('title'); const id=title.toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,'').trim();
        
        if (!title) return {obj:{},id:'',title:''};

        const ingredients=[];
        document.querySelectorAll('#ingredients-list > div').forEach(row=>{
            if(row.classList.contains('ingredient-heading-row')){
                const headingText = row.querySelector('.ingredient-heading-input').value.trim();
                if(headingText) ingredients.push({ heading: headingText });
            } else if (row.classList.contains('ingredient-totaste-row')) {
                const inputs = row.querySelectorAll('input');
                const item = toTitleCase((inputs[0]?.value || '').trim());
                const note = (inputs[1]?.value || '').trim();
                if (!item) return;
                const ing = { item, toTaste: true };
                if (note) ing.notes = note;
                ingredients.push(ing);
            } else {
                const inputs=row.querySelectorAll('input');
                const qty=inputs[0].value.trim(); const unit=inputs[1].value.trim();
                const item=toTitleCase(inputs[2].value.trim()); const note=inputs[3].value.trim();
                if(!item) return;
                const ing={quantity:qty,unit,item}; if(note) ing.notes=note;
                ingredients.push(ing);
            }
        });

        const method=[];
        let stepNum = 0;
        document.querySelectorAll('#steps-list > div').forEach(row => {
            if (row.classList.contains('step-heading-row')) {
                const heading = row.querySelector('input')?.value.trim();
                if (heading) method.push({ heading });
            } else if (row.classList.contains('step-row')) {
                const txt = row.querySelector('textarea')?.value.trim();
                if (txt) { stepNum++; method.push({ step: stepNum, instruction: txt }); }
            }
        });

        const notes=[];
        document.querySelectorAll('#notes-list .note-row').forEach(row=>{
            const type=row.querySelector('select').value;
            const title=row.querySelector('input').value.trim();
            const content=row.querySelector('textarea').value.trim();
            if(title||content) notes.push({type,title,content});
        });

        const journal=[];
        document.querySelectorAll('#journal-list .journal-row').forEach(row=>{
            const date=row.querySelector('input[type="date"]').value;
            const content=row.querySelector('textarea').value.trim();
            if(content) journal.push({date,content});
        });

        const youWillNeed=[];
        document.querySelectorAll('#equipment-list .equipment-item-row').forEach(row=>{
            const itemInput = row.querySelector('.equipment-item-input');
            const noteInput = row.querySelector('.equipment-note-input');
            const item = (itemInput ? itemInput.value : row.dataset.item || '').trim();
            const note = (noteInput ? noteInput.value : row.dataset.notes || '').trim();
            if(item) { const entry={item}; if(note) entry.note=note; youWillNeed.push(entry); }
        });

        const related=[];
        document.querySelectorAll('#related-list .related-row').forEach(row=>{
            const id=row.dataset.id;
            const title=row.dataset.title;
            const matchingTags=JSON.parse(row.dataset.tags || '[]');
            const rel={id,title};
            if(matchingTags.length) rel.matchingTags=matchingTags;
            related.push(rel);
        });

        const obj={id,title};
        if(val('emoji')) obj.emoji=val('emoji');
        if(val('category')) obj.category=val('category');
        if(val('description')) obj.description=val('description');
        if(val('prepTime')) obj.prepTime=val('prepTime');
        if(val('cookTime')) obj.cookTime=val('cookTime');
        if(val('totalTime')) obj.totalTime=val('totalTime');
        if(val('servings')) obj.servings=val('servings');
        if(val('yieldPerBatch')) obj.yieldPerBatch=val('yieldPerBatch');
        if(val('difficulty')) obj.difficulty=val('difficulty');
        if(tags.length) obj.tags=[...tags];
        if(ingredients.length) obj.ingredients=ingredients;
        if(youWillNeed.length) obj.youWillNeed=youWillNeed;
        if(method.length) obj.method=method;
        if(notes.length) obj.notes=notes;
        if(journal.length) obj.journal=journal;
        if(related.length) obj.related=related;

        // Embed nutrition calculations
        const servingsNum = parseInt(val('servings')) || 1;
        const ingList = ingredients.filter(i => !i.heading);
        
        const conversions = {
            'g': 1, 'gram': 1, 'grams': 1,
            'kg': 1000, 'kilogram': 1000,
            'ml': 1, 'l': 1000, 'liter': 1000,
            'cup': 240, 'cups': 240,
            'tbsp': 15, 'tablespoon': 15,
            'tsp': 5, 'teaspoon': 5,
            'oz': 28, 'ounce': 28,
            'lb': 454, 'pound': 454
        };
        
        const skipItems = ['water', 'hot water', 'cold water', 'warm water', 'boiling water', 'tap water'];
        const actualTotalIngs = ingList.filter(i => {
            const n = (i.item || '').toLowerCase().trim();
            return skipItems.indexOf(n) === -1 && n.length > 0;
        }).length;
        
        let totalCal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0, totalFiber = 0, totalSodium = 0;
        let totalSaturatedFat = 0, totalSugars = 0;
        let totalCalcium = 0, totalIron = 0, totalPotassium = 0, totalMagnesium = 0, totalZinc = 0;
        let totalCholesterol = 0, totalVitaminA = 0, totalVitaminC = 0, totalVitaminD = 0;
        let foundCount = 0;
        
        ingList.forEach(ing => {
            const itemName = (ing.item || '').toLowerCase().trim();
            const qty = parseFloat(ing.quantity) || 0;
            const unit = (ing.unit || '').toLowerCase().trim();
            
            if (skipItems.indexOf(itemName) !== -1) return;
            if (!itemName || !qty) return;
            
            let nd = NUTRITION_DB[itemName];
            if (!nd) {
                for (let key in NUTRITION_DB) {
                    if (itemName.includes(key) || key.includes(itemName)) {
                        nd = NUTRITION_DB[key];
                        break;
                    }
                }
            }
            if (!nd) return;
            
            foundCount++;
            
            if (nd.per === 'each') {
                const factor = qty;
                totalCal += nd.cal * factor;
                totalProtein += nd.protein * factor;
                totalCarbs += nd.carbs * factor;
                totalFat += nd.fat * factor;
                totalFiber += (nd.fiber || 0) * factor;
                totalSodium += (nd.sodium || 0) * factor;
                totalSaturatedFat += (nd.saturated_fat || 0) * factor;
                totalSugars += (nd.sugars || 0) * factor;
                totalCalcium += (nd.calcium_mg || 0) * factor;
                totalIron += (nd.iron_mg || 0) * factor;
                totalPotassium += (nd.potassium_mg || 0) * factor;
                totalMagnesium += (nd.magnesium_mg || 0) * factor;
                totalZinc += (nd.zinc_mg || 0) * factor;
                totalCholesterol += (nd.cholesterol_mg || 0) * factor;
                totalVitaminA += (nd.vitamin_a_ug || 0) * factor;
                totalVitaminC += (nd.vitamin_c_mg || 0) * factor;
                totalVitaminD += (nd.vitamin_d_ug || 0) * factor;
            } else {
                const grams = qty * (conversions[unit] || 100);
                const factor = grams / 100;
                totalCal += nd.cal * factor;
                totalProtein += nd.protein * factor;
                totalCarbs += nd.carbs * factor;
                totalFat += nd.fat * factor;
                totalFiber += (nd.fiber || 0) * factor;
                totalSodium += (nd.sodium || 0) * factor;
                totalSaturatedFat += (nd.saturated_fat || 0) * factor;
                totalSugars += (nd.sugars || 0) * factor;
                totalCalcium += (nd.calcium_mg || 0) * factor;
                totalIron += (nd.iron_mg || 0) * factor;
                totalPotassium += (nd.potassium_mg || 0) * factor;
                totalMagnesium += (nd.magnesium_mg || 0) * factor;
                totalZinc += (nd.zinc_mg || 0) * factor;
                totalCholesterol += (nd.cholesterol_mg || 0) * factor;
                totalVitaminA += (nd.vitamin_a_ug || 0) * factor;
                totalVitaminC += (nd.vitamin_c_mg || 0) * factor;
                totalVitaminD += (nd.vitamin_d_ug || 0) * factor;
            }
        });
        
        if (foundCount > 0) {
            obj.nutrition = {
                servings: servingsNum,
                cal: Math.round(totalCal / servingsNum),
                kj: Math.round((totalCal / servingsNum) * 4.184),
                protein: Math.round(totalProtein / servingsNum),
                carbs: Math.round(totalCarbs / servingsNum),
                sugars: Math.round(totalSugars / servingsNum),
                fat: Math.round(totalFat / servingsNum),
                saturated_fat: Math.round(totalSaturatedFat / servingsNum),
                fiber: Math.round(totalFiber / servingsNum),
                sodium: Math.round(totalSodium / servingsNum),
                coverage: Math.round((foundCount / actualTotalIngs) * 100)
            };
            
            const calcium = Math.round(totalCalcium / servingsNum);
            if (calcium > 0) obj.nutrition.calcium_mg = calcium;
            
            const iron = Math.round(totalIron / servingsNum);
            if (iron > 0) obj.nutrition.iron_mg = iron;
            
            const potassium = Math.round(totalPotassium / servingsNum);
            if (potassium > 0) obj.nutrition.potassium_mg = potassium;
            
            const magnesium = Math.round(totalMagnesium / servingsNum);
            if (magnesium > 0) obj.nutrition.magnesium_mg = magnesium;
            
            const zinc = Math.round(totalZinc / servingsNum);
            if (zinc > 0) obj.nutrition.zinc_mg = zinc;
            
            const cholesterol = Math.round(totalCholesterol / servingsNum);
            if (cholesterol > 0) obj.nutrition.cholesterol_mg = cholesterol;
            
            const vitaminA = Math.round(totalVitaminA / servingsNum);
            if (vitaminA > 0) obj.nutrition.vitamin_a_ug = vitaminA;
            
            const vitaminC = Math.round(totalVitaminC / servingsNum);
            if (vitaminC > 0) obj.nutrition.vitamin_c_mg = vitaminC;
            
            const vitaminD = Math.round(totalVitaminD / servingsNum);
            if (vitaminD > 0) obj.nutrition.vitamin_d_ug = vitaminD;
        }

        return {obj,id,title};
    }

    // ─────────────────────────────────────────────────────────
    // NAV SNIPPET
    // ─────────────────────────────────────────────────────────
    const NAV_GROUP_MAP={ 'Breads':'Bread','Baking':'Dessert','Biscuits':'Biscuits','Bistro':'Dinner','Entree':'Entree','Dinner':'Dinner','Mains':'Dinner','Filipino':'Filipino','Desserts':'Dessert','Sauces':'Sauces','Pasta':'Dinner','Pizza':'Bread','Soups':'Dinner','Salads':'Dinner','Sides':'Dinner','Snacks':'Dinner','Breakfast':'Breakfast','Other':'Dinner' };
    const BREAD_SUBGROUP_MAP={ 'Breads':'Bread','Pizza':'Pastry & Sweet' };

    function buildNavSnippet(filename, title, category) {
        if (!filename || !title || !category) { 
            return { snippet: '', note: '' }; 
        }
        
        const group = NAV_GROUP_MAP[category] || 'Dinner';
        const link = `<a href="recipe.html?id=${filename}" role="menuitem" aria-label="${title.replace(/"/g, '&quot;')} recipe">${title}</a>`;
        
        let snippet = '';
        let note = '';
        
        if (group === 'Bread') {
            const sub = BREAD_SUBGROUP_MAP[category] || 'Bread';
            snippet = `<!-- Add inside the Bread dropdown, under the <h4>${sub}</h4> sub-heading -->\n${link}`;
            note = `<strong>Nav group:</strong> Bread → ${sub} sub-section`;
        } else {
            snippet = `<!-- Add inside the ${group} dropdown -->\n${link}`;
            note = `<strong>Nav group:</strong> ${group}`;
        }
        
        return { snippet, note };
    }

    function update(){
        const {obj,id,title}=buildJSON();
        
        const effectiveId = currentFilename || id || 'recipe';
        const filename = `${effectiveId}.json`;
        
        document.getElementById('filename-label').textContent = filename;
        document.getElementById('json-output').innerHTML = highlight(JSON.stringify(obj,null,2));

        const category = val('category');
        const navId = effectiveId;
        const {snippet, note} = buildNavSnippet(navId, title, category);
        
        rawNavSnippet = snippet || '';
        document.getElementById('nav-note').innerHTML = note 
            ? `Paste this line into <strong>nav.html</strong> — ${note}` 
            : 'Fill in Title and Category to generate the nav snippet.';
        document.getElementById('nav-output').innerHTML = snippet 
            ? highlightHTML(snippet) 
            : '<span style="color:var(--text-dim);font-style:italic">— waiting for title &amp; category —</span>';
        
        if (obj.method && obj.method.length > 0) {
            generateTimeline();
        } else {
            document.getElementById('timeline-box').style.display = 'none';
        }
        
        if (obj.ingredients && obj.ingredients.length > 0) {
            calculateNutrition();
        } else {
            document.getElementById('nutrition-box').style.display = 'none';
        }
        
        updateDuplicateButton();
    }

    // ─────────────────────────────────────────────────────────
    // CODE HIGHLIGHTING
    // ─────────────────────────────────────────────────────────
    function highlight(json){ return json.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,m=>{ if(/^"/.test(m)){ if(/:$/.test(m)) return `<span class="j-key">${m}</span>`; return `<span class="j-str">${m}</span>`;} if(/true|false/.test(m)) return `<span class="j-bool">${m}</span>`; if(/null/.test(m)) return `<span class="j-null">${m}</span>`; return `<span class="j-num">${m}</span>`; }); }
    function highlightHTML(html){ return html.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/(&lt;!--.*?--&gt;)/g,'<span class="h-comment">$1</span>').replace(/(&lt;\/?[a-z][a-z0-9]*)/gi,'<span class="h-tag">$1</span>').replace(/([a-z]+)=(&quot;|")/gi,'<span class="h-attr">$1</span>=<span class="h-val">"').replace(/(&gt;)([^&<\n]+)(&lt;)/g,'$1<span class="h-text">$2</span>$3').replace(/&gt;/g,'<span class="h-tag">&gt;</span>'); }

    // ─────────────────────────────────────────────────────────
    // DOWNLOAD / COPY ACTIONS
    // ─────────────────────────────────────────────────────────
    function copyJSON() {
        const text = document.getElementById('json-output').innerText;
        navigator.clipboard.writeText(text).then(() => toast('JSON copied!')).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            toast('JSON copied!');
        });
    }

    function copyNav() {
        if (!rawNavSnippet) { toast('Add title & category first'); return; }
        const linkLine = rawNavSnippet.split('\n').find(l => l.trim().startsWith('<a ')) || rawNavSnippet;
        navigator.clipboard.writeText(linkLine).then(() => toast('Nav link copied!')).catch(() => toast('Copy failed'));
    }

    function downloadJSON(){ 
        if (!checkRequiredFields()) return;
        
        updateIngredientLibrary();
        calculateNutrition();
        const {obj,id} = buildJSON(); 
        if(!obj.title){ alert('Add a title first.'); return; }

        obj.lastModified = new Date().toISOString().split('T')[0];

        updateRecipeIndex(obj).then(() => {
            const blob = new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'}); 
            const a = document.createElement('a'); 
            a.href = URL.createObjectURL(blob); 
            a.download = `${id || 'recipe'}.json`; 
            a.click(); 
            URL.revokeObjectURL(a.href);
        }).catch(() => {
            const blob = new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'}); 
            const a = document.createElement('a'); 
            a.href = URL.createObjectURL(blob); 
            a.download = `${id || 'recipe'}.json`; 
            a.click(); 
            URL.revokeObjectURL(a.href);
        }); 
    }

    // ─────────────────────────────────────────────────────────
    // RESET FORM
    // ─────────────────────────────────────────────────────────
    function clearForm(){
        if(!confirm('Clear everything and start fresh?')) return;
        ['title','category','difficulty','description','prepTime','cookTime','totalTime','servings','yieldPerBatch'].forEach(id=>{ const el=document.getElementById(id); if(el.tagName==='SELECT') el.selectedIndex=0; else el.value=''; });
        selectedEmoji=''; document.getElementById('emoji').value=''; document.getElementById('emoji-preview').textContent='＋'; document.getElementById('emoji-trigger-text').textContent='Choose an emoji…'; document.getElementById('emoji-trigger-text').style.color=''; tags=[]; renderTags();
        document.getElementById('ingredients-list').innerHTML=''; document.getElementById('steps-list').innerHTML=''; document.getElementById('notes-list').innerHTML=''; document.getElementById('journal-list').innerHTML=''; document.getElementById('related-list').innerHTML=''; document.getElementById('equipment-list').innerHTML='';
        document.getElementById('nutrition-box').style.display='none';
        document.getElementById('timeline-box').style.display='none';
        document.getElementById('mode-label').textContent='New Recipe';
        document.getElementById('mode-label').style.color='';
        currentFileHandle = null;
        currentFilename = '';  
        update();
    }

    // ─────────────────────────────────────────────────────────
    // LOAD & EDIT FILE
    // ─────────────────────────────────────────────────────────
    async function openJSONFile() {
        if (window.showOpenFilePicker) {
            try {
                const [handle] = await window.showOpenFilePicker({
                    types: [{ description: 'Recipe JSON', accept: { 'application/json': ['.json'] } }],
                    multiple: false
                });
                currentFileHandle = handle;
                const file = await handle.getFile();
                const text = await file.text();
                try {
                    const data = JSON.parse(text);
                    currentFilename = file.name.replace('.json', '');
                    populateForm(data);
                    updateSaveButton(file.name);
                    toast('Loaded: ' + file.name);
                } catch(err) {
                    alert('Could not parse JSON: ' + err.message);
                    currentFileHandle = null;
                }
            } catch(err) {
                // User cancelled
            }
        } else {
            document.getElementById('load-file').click();
        }
    }

    function updateSaveButton(filename) {
        const btn = document.getElementById('save-btn');
        if (!btn) return;
        btn.title = 'Save to: ' + filename;
        document.getElementById('mode-label').textContent = 'Editing: ' + filename;
        document.getElementById('mode-label').style.color = 'var(--gold)';
    }

    async function saveJSON() {
        if (!checkRequiredFields()) return;
        
        updateIngredientLibrary();
        calculateNutrition();
        
        const { obj } = buildJSON();
        obj.lastModified = new Date().toISOString().split('T')[0];
        
        if (!obj.title) { 
            alert('Add a title first.'); 
            return; 
        }

        const json = JSON.stringify(obj, null, 2);

        if (currentFileHandle) {
            try {
                const writable = await currentFileHandle.createWritable();
                await writable.write(json);
                await writable.close();
                
                currentFilename = currentFileHandle.name.replace('.json', '');
                document.getElementById('mode-label').textContent = 'Editing: ' + currentFileHandle.name;
                
                await updateRecipeIndex(obj);
                toast('Saved to ' + currentFileHandle.name);
            } catch(err) {
                alert('Could not save file: ' + err.message);
            }
        } else {
            downloadJSON();
        }
    }

    function loadJSONFile(event){
        const file=event.target.files[0]; if(!file) return;
        
        const reader=new FileReader();
        reader.onload=e=>{
            try{ 
                const data=JSON.parse(e.target.result); 
                currentFilename = file.name.replace('.json', '');
                populateForm(data); 
                document.getElementById('mode-label').textContent='✎ Editing: '+file.name; 
                document.getElementById('mode-label').style.color='var(--gold)'; 
                toast('Loaded: '+file.name); 
            }
            catch(err){ alert('Could not parse JSON: '+err.message); }
        };
        reader.readAsText(file); event.target.value='';
    }

    // ─────────────────────────────────────────────────────────
    // AUTO-UPDATE MASTER INDEX
    // ─────────────────────────────────────────────────────────
    async function updateRecipeIndex(recipe) {
        try {
            const res = await fetch('json/recipe-index.json?t=' + Date.now());
            if (!res.ok) throw new Error('Could not fetch index');
            let index = await res.json();
            
            const existingIndex = index.findIndex(r => r.id === recipe.id);
            
            const indexEntry = {
                id: recipe.id,
                title: recipe.title,
                emoji: recipe.emoji || '',
                category: recipe.category || '',
                tags: recipe.tags || [],
                description: recipe.description || ''
            };
            
            if (existingIndex !== -1) {
                index[existingIndex] = indexEntry;
            } else {
                index.push(indexEntry);
                index.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            }
            
            console.log('✅ Recipe index updated in memory:', index.length, 'recipes');
            toast(`📋 Index updated — ${index.length} recipes total`);
            return index;
            
        } catch(e) {
            console.warn('Could not update recipe index:', e);
            return null;
        }
    }

    function populateForm(data){
        ['title','category','difficulty','description','prepTime','cookTime','totalTime','servings','yieldPerBatch'].forEach(id=>{
            const el=document.getElementById(id); if(!el) return; if(el.tagName==='SELECT') el.selectedIndex=0; else el.value='';
        });
        selectedEmoji=''; document.getElementById('emoji').value=''; document.getElementById('emoji-preview').textContent='＋'; document.getElementById('emoji-trigger-text').textContent='Choose an emoji…'; document.getElementById('emoji-trigger-text').style.color=''; tags=[]; document.getElementById('ingredients-list').innerHTML=''; document.getElementById('steps-list').innerHTML=''; document.getElementById('notes-list').innerHTML=''; document.getElementById('journal-list').innerHTML=''; document.getElementById('related-list').innerHTML=''; document.getElementById('equipment-list').innerHTML='';

        if(data.title) document.getElementById('title').value=data.title;
        if(data.description) document.getElementById('description').value=data.description;
        if(data.prepTime) document.getElementById('prepTime').value=data.prepTime;
        if(data.cookTime) document.getElementById('cookTime').value=data.cookTime;
        if(data.totalTime) document.getElementById('totalTime').value=data.totalTime;
        if(data.servings) document.getElementById('servings').value=data.servings;
        if(data.yieldPerBatch) document.getElementById('yieldPerBatch').value=data.yieldPerBatch;

        if(data.category){
            const sel=document.getElementById('category'); for(let i=0;i<sel.options.length;i++){ if(sel.options[i].text===data.category){ sel.selectedIndex=i; break; } }
        }

        if(data.difficulty){
            const sel=document.getElementById('difficulty'); for(let i=0;i<sel.options.length;i++){ if(sel.options[i].text===data.difficulty){ sel.selectedIndex=i; break; } }
        }

        if(data.emoji) pickEmoji(data.emoji);

        tags=Array.isArray(data.tags)?[...data.tags]:[]; renderTags();

        if(Array.isArray(data.ingredients)) data.ingredients.forEach(ing=>{
            if(ing.heading) addIngredientHeading(ing.heading);
            else if(ing.toTaste) addToTaste(toTitleCase(ing.item||''), ing.notes||'');
            else addIngredient(ing.quantity||'',ing.unit||'',toTitleCase(ing.item||''),ing.notes||'');
        });

        if(Array.isArray(data.method)) data.method.forEach(step=>{
            if(step.heading) addStepHeading(step.heading);
            else addStep(step.instruction||'');
        });
        (data.youWillNeed||[]).forEach(entry => addEquipmentItem(entry.item||'', entry.note||''));
        if(Array.isArray(data.notes)) data.notes.forEach(note=>{ 
            if(note.type) addNote(note.type,note.title||'',note.content||''); 
        });
        if(Array.isArray(data.journal)) data.journal.forEach(entry=>{
            addJournalEntry(entry.date||'',entry.content||'');
        });
        if(Array.isArray(data.related)) data.related.forEach(rel=>{
            loadRelatedRecipe(rel.id, rel.title, rel.matchingTags || []);
        });

        update();
        window.scrollTo(0, 0);
    }

    function loadRelatedRecipe(id, title, matchingTags) {
        if (!matchingTags || matchingTags.length === 0) {
            const indexEntry = recipeIndex.find(r => r.id === id);
            if (indexEntry && indexEntry.tags && indexEntry.tags.length) {
                matchingTags = indexEntry.tags;
            }
        }

        const list = document.getElementById('related-list');
        const row = document.createElement('div');
        row.className = 'related-row';
        row.draggable = true;
        row.dataset.id = id;
        row.dataset.title = title;
        row.dataset.tags = JSON.stringify(matchingTags);

        const tagHtml = matchingTags.length
            ? matchingTags.map(t => `<span class="tag-pill" onclick="removeTagFromRelated(this, '${t}')">${t}</span>`).join('')
            : '';
        
        row.innerHTML = `
            <div class="drag-handle">⋮⋮</div>
            <div>
                <div style="font-weight:500;margin-bottom:0.25rem;">${title}</div>
                <div style="font-size:0.7rem;color:var(--text-dim);font-family:var(--mono);">${id}</div>
            </div>
            <div class="tag-container">
                ${tagHtml}
                <button class="add-tag-btn" onclick="openTagPicker(this.closest('.related-row'))">+ Add Tags</button>
            </div>
            <button class="btn remove" onclick="this.closest('.related-row').remove();update();">✕</button>
        `;
        
        list.appendChild(row);
        setupDragHandlers(row);
    }

    // ─────────────────────────────────────────────────────────
    // DOCUMENT PARSER CONVERSION UTILITIES
    // ─────────────────────────────────────────────────────────
    function showLoading(message) {
        document.getElementById('loading-message').textContent = message;
        document.getElementById('loading-modal').style.display = 'flex';
    }

    function hideLoading() {
        document.getElementById('loading-modal').style.display = 'none';
    }

    async function importRecipeFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const fileName = file.name.toLowerCase();
        let recipeText = '';
        
        try {
            showLoading('Reading file...');
            
            if (fileName.endsWith('.pdf')) {
                recipeText = await extractTextFromPDF(file);
            } else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
                recipeText = await extractTextFromHTML(file);
            } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
                recipeText = await extractTextFromDOCX(file);
            }
            
            if (!recipeText || recipeText.trim().length < 50) {
                hideLoading();
                alert('Could not extract enough text from the file. Please try a different file.');
                event.target.value = '';
                return;
            }
            
            showLoading('Parsing recipe...');
            
            let parsedRecipe = parseRecipeText(recipeText);
            
            if (parsedRecipe && (parsedRecipe.ingredients?.length > 0 || parsedRecipe.method?.length > 0)) {
                hideLoading();
                populateForm(parsedRecipe);
                document.getElementById('mode-label').textContent = '✎ Imported: ' + file.name;
                document.getElementById('mode-label').style.color = 'var(--gold)';
                toast('Recipe imported! Please review and adjust as needed.');
            } else {
                hideLoading();
                navigator.clipboard.writeText(recipeText).catch(()=>{});
                alert('Could not parse the recipe automatically. The text has been copied to your clipboard.');
            }
            
        } catch (error) {
            hideLoading();
            console.error('Import error:', error);
            alert('Error importing recipe: ' + error.message);
        }
        
        event.target.value = '';
    }

    function parseRecipeText(rawText) {
        try {
            const recipe = { title: '', description: '', servings: '', prepTime: '', cookTime: '', totalTime: '', category: '', ingredients: [], method: [], notes: [] };

            function stripEmoji(s) {
                return s
                    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
                    .replace(/[\u{2600}-\u{26FF}]/gu, '')
                    .replace(/[\u{2700}-\u{27BF}]/gu, '')
                    .replace(/[\u0080-\u009F]/g, '')
                    .replace(/[\uD800-\uDFFF]/g, '')
                    .replace(/[^\x20-\x7E\u00A0-\u024F\u2013\u2014\u2018\u2019\u201C\u201D\u00B0\u00B7\u2192\u00A9]/g, ' ')
                    .replace(/\s{2,}/g, ' ')
                    .trim();
            }

            const lines = rawText
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0);

            const JUNK = [
                /^a\s*[&+]\s*j\s+personal/i,
                /cooked once/i,
                /always repeated/i,
                /all rights reserved/i,
                /^©|^\u00A9/,
                /^page \d+/i,
                /^my notes:?\s*$/i,
                /print (recipe|option)/i,
                /download full pdf/i,
                /←\s*back/i,
                /netlify|porkbun|brevo/i,
                /handcrafted in the philippines/i,
                /tradition\.\s*love\.\s*patience/i,
                /^sitemap|privacy policy|terms of/i,
                /follow us on/i,
                /pinterest|twitter|facebook/i,
                /^https?:\/\/[^\s]+\/print/i,
                /^https?:\/\/[^\s]+\/wp-json/i,
                /^\d+\/\d+\/\d+,\s*\d+:\d+/i,
                /^nutrition information/i,
                /^cuisine:/i,
                /©\s*lovefoodies/i,
                /nutrition information isn['’]t always accurate/i,
                /amount per serving:/i,
            ];
            
            const isJunk = raw => {
                const s = stripEmoji(raw).toLowerCase();
                return JUNK.some(r => r.test(s) || r.test(raw));
            };

            function matchServes(raw) {
                const s = stripEmoji(raw).trim();
                const m = s.match(/^(?:serves?|servings?|yield|portions?):?\s*([\d][\d\s\-–]+)/i);
                return m ? m[1].trim() : null;
            }
            
            function matchYield(raw) {
                const s = stripEmoji(raw).trim();
                const m = s.match(/^yield:\s*(\d+)/i);
                if (m) return m[1];
                const m2 = s.match(/(\d+)\s*(?:slices?|servings?)/i);
                if (m2 && s.length < 30) return m2[1];
                return null;
            }
            
            function matchCategory(raw) {
                const s = stripEmoji(raw).trim();
                const m = s.match(/category:\s*(.+)/i);
                if (m) return m[1].trim();
                const m2 = s.match(/cuisine:.*\/\s*category:\s*(.+)/i);
                if (m2) return m2[1].trim();
                return null;
            }

            const ING_TRIGGERS = [
                /^(?:you['']?ll need|what you['']?ll need|what you need|mix together|you need|ingredients?)\s*:?\s*$/i,
                /^ingredients\s*:?\s*$/i,
                /^for the batter:|^for the filling:|^for the topping:|^the cake batter:|^the topping:/i,
            ];
            
            const METHOD_TRIGGERS = [
                /^(?:method|instructions?|directions?|steps?|how to (?:make|whip|prepare|cook|assemble)|now build|method\s*[:\-—])\s*:?\s*$/i,
                /^how to whip it\s*:?\s*$/i,
                /^instructions\s*:?\s*$/i,
            ];
            
            const NOTE_TRIGGERS = [
                /^(?:chef['']?s?\s*notes?|tips?|notes?|bonus\s*tip|important\s*tip|make[\- ]ahead|storage|serving\s*suggestions?)\s*:?\s*$/i,
                /^when you['']?re ready to serve/i,
            ];
            
            const isTrigger = (raw, list) => {
                const s = stripEmoji(raw).trim().toLowerCase();
                return list.some(r => r.test(s));
            };

            function isTimeLabel(clean) {
                const lower = clean.toLowerCase();
                return lower === 'prep time' || lower === 'cook time' || lower === 'total time';
            }

            function isSubHeading(raw) {
                const s = stripEmoji(raw).trim();
                if (s.length < 3 || s.length > 50) return false;
                if (/^\d/.test(s)) return false;
                if (/^(\d+)[.)]\s/.test(s)) return false;
                if (/^[-•*◆▪·]\s/.test(s)) return false;
                if (/[.!?]$/.test(s)) return false;
                if (/\b(and|the|to|for|with|from|by|of|in|on|at|into|onto|until|while|when|then|so|but|or)\b/i.test(s) && s.length < 20) return false;
                if (/\b(add|place|pour|mix|stir|fold|whisk|beat|bake|cook|heat|remove|transfer|allow|let|use|dust|start|slowly|lastly|finally|meanwhile)\b/i.test(s) && s.length < 25) return false;
                if (/^[A-Z]/.test(s) && s.length < 30 && !/\s(and|of|the|to)\s/.test(s)) return true;
                return false;
            }

            const UNITLESS_RE = /^(pinch|dash|splash|handful|bunch|drizzle|squeeze|knob|sprig|sprigs|zest of|juice of|to taste|as needed|as required)\b/i;

            function parseIng(raw) {
                let line = stripEmoji(raw).replace(/^[-•*◆▪·]\s+/, '').replace(/^\s+/, '').trim();
                if (!line || line.length < 2) return null;

                if (UNITLESS_RE.test(line)) return { quantity: '', unit: '', item: line, notes: '' };

                const m = line.match(/^([\d¼½¾⅓⅔⅛⅜⅝⅞]+(?:[\/\.\s][\d]+)?)\s*(g|kg|ml|l|litre|litres|tsp|tbsp|tablespoons?|teaspoons?|cups?|oz|lbs?|pinch|handful|bunch|cloves?|slices?|sheets?|rashers?|sprigs?|heads?|cans?|tins?|pkts?|packs?|pieces?|sticks?|strips?)\.?\s*(.*)/i);
                if (m) {
                    let qty = m[1].trim(), unit = m[2].trim().toLowerCase(), rest = m[3].trim(), notes = '';
                    const commaM = rest.match(/^(.+?),\s*(sifted|softened|melted|chopped|sliced|diced|grated|optional|to taste|roughly|finely|lightly|cold|room temp|divided|plus extra|separated|beaten|whisked|cooled)(.*)$/i);
                    if (commaM) { rest = commaM[1].trim(); notes = (commaM[2] + (commaM[3]||'')).trim(); }
                    rest = rest.replace(/\s*\(optional[^)]*\)/i, '').trim();
                    return { quantity: qty, unit, item: rest, notes };
                }
                
                const m2 = line.match(/^([\d¼½¾⅓⅔⅛⅜⅝⅞]+(?:[\/\.][\d]+)?)\s+(.+)/);
                if (m2) return { quantity: m2[1].trim(), unit: '', item: m2[2].trim(), notes: '' };
                
                return { quantity: '', unit: '', item: line, notes: '' };
            }

            const TIP_PREFIX_RE = /^(important\s*tip|bonus\s*tip|tip|note)\s*:\s*/i;
            const NOTES_PART_RE = /^(chef['']?s?\s*notes?|notes?)/i;

            let section = 'header';
            let titleDone = false;
            let descDone = false;
            let stepNum = 1;

            for (let i = 0; i < lines.length; i++) {
                const raw = lines[i];
                const clean = stripEmoji(raw).trim();

                if (!clean || clean.length < 2) continue;
                if (isJunk(raw)) continue;

                const categoryM = matchCategory(clean);
                if (categoryM) {
                    recipe.category = categoryM;
                    continue;
                }

                const yieldM = matchYield(clean);
                if (yieldM) {
                    recipe.servings = yieldM;
                    continue;
                }

                const servesM = matchServes(clean);
                if (servesM) {
                    recipe.servings = servesM;
                    continue;
                }

                if (isTimeLabel(clean)) {
                    const nextLine = i + 1 < lines.length ? stripEmoji(lines[i + 1]).trim() : '';
                    if (nextLine && nextLine.match(/\d+/)) {
                        const lower = clean.toLowerCase();
                        if (lower === 'prep time') recipe.prepTime = nextLine;
                        else if (lower === 'cook time') recipe.cookTime = nextLine;
                        else if (lower === 'total time') recipe.totalTime = nextLine;
                        i++; 
                    }
                    continue;
                }

                const inlineTimeMatch = clean.match(/^(prep|cook|total)\s*time:\s*(.+)/i);
                if (inlineTimeMatch) {
                    const type = inlineTimeMatch[1].toLowerCase();
                    const val = inlineTimeMatch[2].trim();
                    if (type === 'prep') recipe.prepTime = val;
                    else if (type === 'cook') recipe.cookTime = val;
                    else if (type === 'total') recipe.totalTime = val;
                    continue;
                }

                if (isTrigger(clean, ING_TRIGGERS)) { 
                    section = 'ingredients'; 
                    continue; 
                }
                if (isTrigger(clean, METHOD_TRIGGERS)) { 
                    section = 'method'; 
                    continue; 
                }
                if (isTrigger(clean, NOTE_TRIGGERS)) { 
                    section = 'notes'; 
                    continue; 
                }

                if (TIP_PREFIX_RE.test(clean)) {
                    const content = clean.replace(TIP_PREFIX_RE, '').trim();
                    if (content.length > 3) recipe.notes.push({ type: 'tip', title: "Chef's Tip", content });
                    continue;
                }

                if (section === 'header') {
                    if (!titleDone) {
                        if (clean.length > 3 && !isTimeLabel(clean) && !clean.match(/^yield/i) && !ING_TRIGGERS.some(r => r.test(clean))) {
                            recipe.title = clean;
                            titleDone = true;
                            if (i + 1 < lines.length && stripEmoji(lines[i + 1]).trim().startsWith(clean)) {
                                i++;
                            }
                        }
                        continue;
                    }
                    if (!descDone) {
                        if (isTimeLabel(clean) || isTrigger(clean, ING_TRIGGERS) || clean.match(/^yield/i)) {
                            descDone = true;
                        } else if (clean.length > 10 && !clean.match(/^\d/) && !clean.match(/^[•\-*]/)) {
                            recipe.description = recipe.description ? recipe.description + ' ' + clean : clean;
                        }
                        continue;
                    }
                    continue;
                }

                if (section === 'ingredients') {
                    if (isTrigger(clean, METHOD_TRIGGERS)) { 
                        section = 'method'; 
                        continue; 
                    }

                    if (UNITLESS_RE.test(clean)) {
                        recipe.ingredients.push({ quantity: '', unit: '', item: clean, notes: '' });
                        continue;
                    }

                    if (isSubHeading(clean)) {
                        const testParsed = parseIng(clean);
                        if (!testParsed || !testParsed.quantity) {
                            recipe.ingredients.push({ heading: clean.replace(/:$/, '').trim() });
                            continue;
                        }
                    }

                    const parsed = parseIng(clean);
                    if (parsed && parsed.item) {
                        recipe.ingredients.push(parsed);
                    }
                    continue;
                }

                if (section === 'method') {
                    if (isTrigger(clean, NOTE_TRIGGERS)) { 
                        section = 'notes'; 
                        continue; 
                    }
                    if (NOTES_PART_RE.test(clean)) { 
                        section = 'notes'; 
                        continue; 
                    }
                    if (isJunk(clean)) continue;

                    const stepM = clean.match(/^(\d+)[.)]\s+(.+)/);
                    if (stepM) {
                        recipe.method.push({ step: stepNum++, instruction: stepM[2].trim() });
                        continue;
                    }

                    const bulletM = clean.match(/^[-•*◆▪·]\s+(.+)/);
                    if (bulletM) {
                        const content = bulletM[1].trim();
                        const parsed = parseIng(content);
                        if (parsed && parsed.quantity && content.length < 50) {
                            recipe.ingredients.push(parsed);
                        } else {
                            recipe.method.push({ step: stepNum++, instruction: content });
                        }
                        continue;
                    }

                    if (isSubHeading(clean)) {
                        recipe.method.push({ heading: clean.replace(/:$/, '').trim() });
                        continue;
                    }

                    if (clean.length > 5 && !isJunk(clean)) {
                        const last = recipe.method[recipe.method.length - 1];
                        if (last && last.instruction && !last.instruction.match(/[.!?]$/) && clean.length < 60 && !/^[A-Z]/.test(clean)) {
                            last.instruction += ' ' + clean;
                        } else {
                            recipe.method.push({ step: stepNum++, instruction: clean });
                        }
                    }
                    continue;
                }

                if (section === 'notes') {
                    const bulletM = clean.match(/^[-•*◆▪·]\s+(.+)/);
                    const content = bulletM ? bulletM[1].trim() : clean;
                    if (content.length > 4 && !isJunk(content)) {
                        recipe.notes.push({ type: 'tip', title: "Chef's Note", content });
                    }
                    continue;
                }
            }

            let s = 0;
            recipe.method = recipe.method.map(item => item.heading ? item : { step: ++s, instruction: item.instruction });

            if (recipe.ingredients.length === 0 && recipe.method.length === 0) return null;
            return recipe;

        } catch(e) {
            console.error('Parser error:', e);
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────
    // COOKING TIMELINE GENERATOR
    // ─────────────────────────────────────────────────────────
    function generateTimeline() {
        const {obj} = buildJSON();
        
        if (!obj.method || obj.method.length === 0) {
            document.getElementById('timeline-output').innerHTML = '<p style="color:var(--text-dim);font-style:italic;">Add method steps to generate a timeline</p>';
            document.getElementById('timeline-box').style.display = 'none';
            return;
        }
        
        const prepMinutes = parseTimeToMinutes(obj.prepTime || '0');
        const cookMinutes = parseTimeToMinutes(obj.cookTime || '0');
        const totalMinutes = parseTimeToMinutes(obj.totalTime || '') || (prepMinutes + cookMinutes);
        
        if (totalMinutes === 0) {
            document.getElementById('timeline-output').innerHTML = '<p style="color:var(--text-dim);font-style:italic;">Add prep/cook times to generate a timeline</p>';
            document.getElementById('timeline-box').style.display = 'none';
            return;
        }
        
        const now = new Date();
        const servingTime = new Date(now.getTime() + totalMinutes * 60000);
        
        const timeline = [];
        
        timeline.push({
            time: formatTime(now),
            event: '🏁 Start cooking',
            style: 'font-weight: 600; color: var(--green);'
        });
        
        const methodSteps = obj.method.length;
        const avgMinutesPerStep = totalMinutes / (methodSteps + 1);
        
        if (prepMinutes > 0) {
            const prepEnd = new Date(now.getTime() + prepMinutes * 60000);
            timeline.push({
                time: formatTime(now),
                event: `📋 Prep ingredients (${obj.prepTime})`,
                style: 'margin-left: 1rem;'
            });
            timeline.push({
                time: formatTime(prepEnd),
                event: '✓ Prep complete',
                style: 'color: var(--text-dim); font-style: italic; margin-left: 1rem;'
            });
        }
        
        obj.method.forEach((step, index) => {
            const stepTime = new Date(now.getTime() + ((index + 1) * avgMinutesPerStep) * 60000);
            const instruction = step.instruction;
            
            timeline.push({
                time: formatTime(stepTime),
                event: `${index + 1}. ${instruction}`,
                style: 'margin-left: 1rem; align-items: start;'
            });
        });
        
        timeline.push({
            time: formatTime(servingTime),
            event: '🍽️ Ready to serve!',
            style: 'font-weight: 600; color: var(--gold); margin-top: 0.5rem;'
        });
        
        const html = timeline.map(item => 
            `<div style="display: grid; grid-template-columns: 90px 1fr; gap: 1rem; margin-bottom: 0.6rem; align-items: start; ${item.style || ''}">
                <span style="font-family: var(--mono); color: var(--gold); font-size: 0.8rem; padding-top: 0.1rem; white-space: nowrap;">${item.time}</span>
                <span style="line-height: 1.5; word-break: break-word;">${item.event}</span>
            </div>`
        ).join('');
        
        document.getElementById('timeline-output').innerHTML = html;
        document.getElementById('timeline-box').style.display = 'block';
    }

    function formatTime(date) {
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        const minutesStr = minutes.toString().padStart(2, '0');
        return `${hours}:${minutesStr} ${ampm}`;
    }

    function copyTimeline() {
        const timelineEl = document.getElementById('timeline-output');
        const text = Array.from(timelineEl.querySelectorAll('div')).map(div => {
            const spans = div.querySelectorAll('span');
            const time = spans[0]?.textContent?.trim() || '';
            const event = spans[1]?.textContent?.trim() || '';
            return `${time}  ${event}`;
        }).filter(line => line.trim()).join('\n');
        
        navigator.clipboard.writeText(text).then(() => toast('Timeline copied!'));
    }

    // ─────────────────────────────────────────────────────────
    // NUTRITION FACT SHEET GENERATOR
    // ─────────────────────────────────────────────────────────
    function calculateNutrition() {
        const {obj} = buildJSON();
        
        if (!obj.ingredients || obj.ingredients.length === 0) {
            document.getElementById('nutrition-box').style.display = 'none';
            return;
        }
        
        const servings = parseInt(obj.servings) || 1;
        let totalNutrition = { 
            cal: 0, protein: 0, carbs: 0, fat: 0, saturated_fat: 0, sugars: 0, fiber: 0, sodium: 0,
            calcium_mg: 0, iron_mg: 0, potassium_mg: 0, magnesium_mg: 0, zinc_mg: 0,
            cholesterol_mg: 0, vitamin_a_ug: 0, vitamin_c_mg: 0, vitamin_d_ug: 0
        };
        let foundIngredients = 0;
        let totalIngredients = 0;
        
        const skipItems = ['water', 'hot water', 'cold water', 'warm water', 'boiling water', 'tap water'];
        const conversions = {
            'g': 1, 'gram': 1, 'grams': 1, 'kg': 1000, 'kilogram': 1000,
            'ml': 1, 'l': 1000, 'liter': 1000, 'cup': 240, 'cups': 240,
            'tbsp': 15, 'tablespoon': 15, 'tsp': 5, 'teaspoon': 5,
            'oz': 28, 'ounce': 28, 'lb': 454, 'pound': 454
        };
        
        obj.ingredients.forEach(ing => {
            if (ing.heading || ing.toTaste) return;
            
            totalIngredients++;
            const itemName = (ing.item || '').toLowerCase().trim();
            const quantity = parseFloat(ing.quantity) || 0;
            const unit = (ing.unit || '').toLowerCase().trim();
            
            if (skipItems.includes(itemName)) {
                totalIngredients--;
                return;
            }
            if (!itemName || !quantity) return;
            
            let nd = NUTRITION_DB[itemName];
            if (!nd) {
                for (let key in NUTRITION_DB) {
                    if (itemName.includes(key) || key.includes(itemName)) {
                        nd = NUTRITION_DB[key];
                        break;
                    }
                }
            }
            if (!nd) return;
            
            foundIngredients++;
            
            let factor = 0;
            if (nd.per === 'each') {
                factor = quantity;
            } else {
                const grams = quantity * (conversions[unit] || 100);
                factor = grams / 100;
            }
            
            totalNutrition.cal += nd.cal * factor;
            totalNutrition.protein += nd.protein * factor;
            totalNutrition.carbs += nd.carbs * factor;
            totalNutrition.fat += nd.fat * factor;
            totalNutrition.saturated_fat += (nd.saturated_fat || 0) * factor;
            totalNutrition.sugars += (nd.sugars || 0) * factor;
            totalNutrition.fiber += (nd.fiber || 0) * factor;
            totalNutrition.sodium += (nd.sodium || 0) * factor;
            totalNutrition.calcium_mg += (nd.calcium_mg || 0) * factor;
            totalNutrition.iron_mg += (nd.iron_mg || 0) * factor;
            totalNutrition.potassium_mg += (nd.potassium_mg || 0) * factor;
            totalNutrition.magnesium_mg += (nd.magnesium_mg || 0) * factor;
            totalNutrition.zinc_mg += (nd.zinc_mg || 0) * factor;
            totalNutrition.cholesterol_mg += (nd.cholesterol_mg || 0) * factor;
            totalNutrition.vitamin_a_ug += (nd.vitamin_a_ug || 0) * factor;
            totalNutrition.vitamin_c_mg += (nd.vitamin_c_mg || 0) * factor;
            totalNutrition.vitamin_d_ug += (nd.vitamin_d_ug || 0) * factor;
        });
        
        if (foundIngredients === 0) {
            document.getElementById('nutrition-output').innerHTML = '<p style="color:var(--text-dim);font-style:italic;">Could not find nutrition data for ingredients. Try using common names like "flour", "sugar", "butter".</p>';
            document.getElementById('nutrition-box').style.display = 'block';
            return;
        }
        
        const perServing = {
            cal: Math.round(totalNutrition.cal / servings),
            kj: Math.round((totalNutrition.cal / servings) * 4.184),
            protein: Math.round(totalNutrition.protein / servings),
            carbs: Math.round(totalNutrition.carbs / servings),
            sugars: Math.round(totalNutrition.sugars / servings),
            fat: Math.round(totalNutrition.fat / servings),
            saturated_fat: Math.round(totalNutrition.saturated_fat / servings),
            fiber: Math.round(totalNutrition.fiber / servings),
            sodium: Math.round(totalNutrition.sodium / servings),
            calcium_mg: Math.round(totalNutrition.calcium_mg / servings),
            iron_mg: Math.round(totalNutrition.iron_mg / servings),
            potassium_mg: Math.round(totalNutrition.potassium_mg / servings),
            magnesium_mg: Math.round(totalNutrition.magnesium_mg / servings),
            zinc_mg: Math.round(totalNutrition.zinc_mg / servings),
            cholesterol_mg: Math.round(totalNutrition.cholesterol_mg / servings),
            vitamin_a_ug: Math.round(totalNutrition.vitamin_a_ug / servings),
            vitamin_c_mg: Math.round(totalNutrition.vitamin_c_mg / servings),
            vitamin_d_ug: Math.round(totalNutrition.vitamin_d_ug / servings)
        };
        
        const coverage = Math.round((foundIngredients / totalIngredients) * 100);
        
        let micronutrientsHtml = '';
        const micronutrients = [];
        if (perServing.calcium_mg) micronutrients.push(`<div class="nutrition-row" style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--border);color:var(--text-dim);"><span>Calcium</span><span>${perServing.calcium_mg}mg</span></div>`);
        if (perServing.iron_mg) micronutrients.push(`<div class="nutrition-row" style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--border);color:var(--text-dim);"><span>Iron</span><span>${perServing.iron_mg}mg</span></div>`);
        if (perServing.potassium_mg) micronutrients.push(`<div class="nutrition-row" style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--border);color:var(--text-dim);"><span>Potassium</span><span>${perServing.potassium_mg}mg</span></div>`);
        if (perServing.magnesium_mg) micronutrients.push(`<div class="nutrition-row" style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--border);color:var(--text-dim);"><span>Magnesium</span><span>${perServing.magnesium_mg}mg</span></div>`);
        if (perServing.zinc_mg) micronutrients.push(`<div class="nutrition-row" style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--border);color:var(--text-dim);"><span>Zinc</span><span>${perServing.zinc_mg}mg</span></div>`);
        if (perServing.cholesterol_mg) micronutrients.push(`<div class="nutrition-row" style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--border);color:var(--text-dim);"><span>Cholesterol</span><span>${perServing.cholesterol_mg}mg</span></div>`);
        if (perServing.vitamin_a_ug) micronutrients.push(`<div class="nutrition-row" style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--border);color:var(--text-dim);"><span>Vitamin A</span><span>${perServing.vitamin_a_ug}mcg</span></div>`);
        if (perServing.vitamin_c_mg) micronutrients.push(`<div class="nutrition-row" style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--border);color:var(--text-dim);"><span>Vitamin C</span><span>${perServing.vitamin_c_mg}mg</span></div>`);
        if (perServing.vitamin_d_ug) micronutrients.push(`<div class="nutrition-row" style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--border);color:var(--text-dim);"><span>Vitamin D</span><span>${perServing.vitamin_d_ug}mcg</span></div>`);
        
        if (micronutrients.length) {
            micronutrientsHtml = `<div style="border-top:4px solid var(--text);margin:0.5rem 0;"></div>${micronutrients.join('')}`;
        }
        
        const html = `
            <div style="border:2px solid var(--border);border-radius:8px;padding:1rem;max-width:400px;font-family:var(--sans);">
                <div style="font-weight:600;font-size:1.2rem;border-bottom:4px solid var(--text);padding-bottom:0.5rem;margin-bottom:0.5rem;color:var(--text);">Nutrition Facts</div>
                <div style="font-size:0.85rem;margin-bottom:0.5rem;color:var(--text-dim);">Serving Size: 1 of ${servings} servings</div>
                <div style="border-top:1px solid var(--border);padding-top:0.5rem;">
                    <div style="display:flex;justify-content:space-between;font-weight:600;font-size:1.1rem;margin-bottom:0.25rem;color:var(--text);">
                        <span>Calories</span>
                        <span class="nutrition-cal-value" data-cal="${perServing.cal}">${perServing.cal}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:0.5rem;color:var(--text-dim);">
                        <span>Energy (kJ)</span>
                        <span>${perServing.kj}</span>
                    </div>
                    <div style="border-top:4px solid var(--text);margin:0.5rem 0;"></div>
                    <div style="font-size:0.75rem;font-weight:600;margin-bottom:0.25rem;text-align:right;color:var(--text-dim);">Amount / serving</div>
                    
                    <div style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--border);color:var(--text-dim);">
                        <span style="font-weight:600;">Protein</span>
                        <span>${perServing.protein}g</span>
                    </div>
                    
                    <div style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--border);color:var(--text-dim);">
                        <span style="font-weight:600;">Total Carbohydrate</span>
                        <span>${perServing.carbs}g</span>
                    </div>
                    
                    <div style="display:flex;justify-content:space-between;padding:0.25rem 0 0.25rem 1rem;border-bottom:1px solid var(--border);font-size:0.9rem;color:var(--text-dim);">
                        <span>— Sugars</span>
                        <span>${perServing.sugars}g</span>
                    </div>
                    
                    <div style="display:flex;justify-content:space-between;padding:0.25rem 0 0.25rem 1rem;border-bottom:1px solid var(--border);font-size:0.9rem;color:var(--text-dim);">
                        <span>Dietary Fibre</span>
                        <span>${perServing.fiber}g</span>
                    </div>
                    
                    <div style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--border);color:var(--text-dim);">
                        <span style="font-weight:600;">Total Fat</span>
                        <span>${perServing.fat}g</span>
                    </div>
                    
                    <div style="display:flex;justify-content:space-between;padding:0.25rem 0 0.25rem 1rem;border-bottom:1px solid var(--border);font-size:0.9rem;color:var(--text-dim);">
                        <span>— Saturated Fat</span>
                        <span>${perServing.saturated_fat}g</span>
                    </div>
                    
                    <div style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--border);color:var(--text-dim);">
                        <span style="font-weight:600;">Sodium</span>
                        <span>${perServing.sodium}mg</span>
                    </div>
                    
                    ${micronutrientsHtml}
                </div>
                <div style="margin-top:0.75rem;font-size:0.75rem;color:var(--text-dim);font-style:italic;">
                    ℹ️ Estimates based on ${foundIngredients}/${totalIngredients} ingredients (${coverage}% coverage)
                </div>
                <div style="margin-top:0.5rem;font-size:0.65rem;color:var(--text-dim);">
                    ⚙️ <em>Adjust servings or ingredient quantities in the form and click Recalculate to update.</em>
                </div>
            </div>
        `;
        
        document.getElementById('nutrition-output').innerHTML = html;
        document.getElementById('nutrition-box').style.display = 'block';
    }

    function copyNutrition() {
        const {obj} = buildJSON();
        const servings = parseInt(obj.servings) || 1;
        const nutritionEl = document.getElementById('nutrition-output');
        const cal = nutritionEl.querySelector('div > div > span:last-child')?.textContent || '0';
        
        const text = `Nutrition Facts (per serving of ${servings}):\nCalories: ${cal}\nFull details available in recipe builder`;
        navigator.clipboard.writeText(text).then(() => toast('Nutrition info copied!'));
    }

    // ─────────────────────────────────────────────────────────
    // DOCUMENT PARSER TEXT EXTRACTIONS
    // ─────────────────────────────────────────────────────────
    async function extractTextFromPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            const rows = {};
            textContent.items.forEach(item => {
                const y = Math.round(item.transform[5]);
                if (!rows[y]) rows[y] = [];
                rows[y].push(item);
            });
            
            const rawLines = Object.keys(rows)
                .sort((a, b) => b - a)
                .map(y => {
                    const sorted = rows[y].sort((a, b) => a.transform[4] - b.transform[4]);
                    return sorted.map(item => item.str).join(' ').trim();
                })
                .filter(l => l.length > 0);
            
            const mergedLines = [];
            for (let j = 0; j < rawLines.length; j++) {
                let line = rawLines[j];
                while (j + 1 < rawLines.length && 
                       (!line.match(/[.!?;:]$/) || rawLines[j + 1].length < 10 && !rawLines[j+1].match(/^[A-Z]/)) && 
                       rawLines[j + 1].length > 0 &&
                       !rawLines[j + 1].match(/^\d+\.|^•|^-|^Ingredients|^Instructions|^Method/i)) {
                    j++;
                    line += ' ' + rawLines[j];
                }
                if (line.trim().length > 0) mergedLines.push(line);
            }
            fullText += mergedLines.join('\n') + '\n\n';
        }
        return fullText;
    }

    async function extractTextFromHTML(file) {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        
        doc.querySelectorAll('script, style, nav, footer, .print-cue').forEach(el => el.remove());
        doc.querySelectorAll('h1,h2,h3,h4,li,p,br,tr,div').forEach(el => {
            el.insertAdjacentText('afterend', '\n');
        });
        return doc.body.textContent || '';
    }

    async function extractTextFromDOCX(file) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        return result.value;
    }

    // ─────────────────────────────────────────────────────────
    // RECIPE JOURNAL — DRAGGABLE
    // ─────────────────────────────────────────────────────────
    function addJournalEntry(date='', content='') {
        const list = document.getElementById('journal-list');
        const row = document.createElement('div');
        row.className = 'journal-row';
        row.draggable = true;
        
        const today = date || new Date().toISOString().split('T')[0];
        
        row.innerHTML = `
            <div class="drag-handle">⋮⋮</div>
            <input type="date" value="${today}" oninput="update()">
            <textarea placeholder="What did you try? How did it turn out?" oninput="autoResize(this); update()">${content}</textarea>
            <button class="btn danger" onclick="removeRow(this)">✕</button>
        `;
        
        row.addEventListener('dragstart', handleJournalDragStart);
        row.addEventListener('dragend', handleJournalDragEnd);
        row.addEventListener('dragover', handleJournalDragOver);
        row.addEventListener('drop', handleJournalDrop);
        row.addEventListener('dragleave', handleJournalDragLeave);
        list.appendChild(row);
        
        if (content) {
            const textarea = row.querySelector('textarea');
            autoResize(textarea);
        }
        update();
    }

    function handleJournalDragStart(e) {
        draggedJournalElement = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
    }

    function handleJournalDragEnd(e) {
        this.classList.remove('dragging');
        document.querySelectorAll('.journal-row').forEach(row => {
            row.classList.remove('drag-over');
        });
    }

    function handleJournalDragOver(e) {
        if (e.preventDefault) e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (this !== draggedJournalElement) {
            this.classList.add('drag-over');
        }
        return false;
    }

    function handleJournalDragLeave(e) {
        this.classList.remove('drag-over');
    }

    function handleJournalDrop(e) {
        if (e.stopPropagation) e.stopPropagation();
        this.classList.remove('drag-over');
        
        if (draggedJournalElement !== this) {
            const list = document.getElementById('journal-list');
            const allEntries = [...list.children];
            const draggedIndex = allEntries.indexOf(draggedJournalElement);
            const targetIndex = allEntries.indexOf(this);
            
            if (draggedIndex < targetIndex) {
                this.parentNode.insertBefore(draggedJournalElement, this.nextSibling);
            } else {
                this.parentNode.insertBefore(draggedJournalElement, this);
            }
            update();
        }
        return false;
    }

    // ─────────────────────────────────────────────────────────
    // RELATED RECIPES - DRAGGING & REMOVALS
    // ─────────────────────────────────────────────────────────
    function setupDragHandlers(row) {
        row.addEventListener('dragstart', handleRelatedDragStart);
        row.addEventListener('dragend', handleRelatedDragEnd);
        row.addEventListener('dragover', handleRelatedDragOver);
        row.addEventListener('dragleave', handleRelatedDragLeave);
        row.addEventListener('drop', handleRelatedDrop);
    }

    function handleRelatedDragStart(e) {
        draggedRelatedElement = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
    }

    function handleRelatedDragEnd(e) {
        this.classList.remove('dragging');
        document.querySelectorAll('.related-row').forEach(row => {
            row.classList.remove('drag-over');
        });
    }

    // Related lists drag overlays
    function handleRelatedDragOver(e) {
        if (e.preventDefault) e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (this !== draggedRelatedElement) {
            this.classList.add('drag-over');
        }
        return false;
    }

    function handleRelatedDragLeave(e) {
        this.classList.remove('drag-over');
    }

    function handleRelatedDrop(e) {
        if (e.stopPropagation) e.stopPropagation();
        this.classList.remove('drag-over');
        
        if (draggedRelatedElement !== this) {
            const list = document.getElementById('related-list');
            const allItems = [...list.children];
            const draggedIndex = allItems.indexOf(draggedRelatedElement);
            const targetIndex = allItems.indexOf(this);
            
            if (draggedIndex < targetIndex) {
                this.parentNode.insertBefore(draggedRelatedElement, this.nextSibling);
            } else {
                this.parentNode.insertBefore(draggedRelatedElement, this);
            }
            update();
        }
        return false;
    }

    // ─────────────────────────────────────────────────────────
    // DUPLICATE RECIPE
    // ─────────────────────────────────────────────────────────
    function duplicateRecipe() {
        const currentData = buildJSON().obj;
        const duplicateData = JSON.parse(JSON.stringify(currentData));
        
        if (duplicateData.title) {
            duplicateData.title = duplicateData.title + ' (Copy)';
        } else {
            duplicateData.title = 'Recipe Copy';
        }
        
        const newId = duplicateData.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '').trim();
        duplicateData.id = newId;
        
        clearForm();
        populateForm(duplicateData);
        
        document.getElementById('mode-label').textContent = '📋 Duplicated - Edit & Save';
        document.getElementById('mode-label').style.color = 'var(--accent)';
        
        toast('Recipe duplicated! Edit and download when ready.');
        document.getElementById('title').focus();
        document.getElementById('title').select();
    }

    function updateDuplicateButton() {
        const {obj} = buildJSON();
        const hasContent = obj.title || (obj.ingredients && obj.ingredients.length > 0) || (obj.method && obj.method.length > 0);
        const duplicateBtn = document.getElementById('duplicate-btn');
        if (duplicateBtn) {
            duplicateBtn.style.display = hasContent ? 'inline-block' : 'none';
        }
    }

    // ─────────────────────────────────────────────────────────
    // DESCRIPTION FORMATTING - ¶ INSERTIONS
    // ─────────────────────────────────────────────────────────
    function insertParagraphBreak() {
        const textarea = document.getElementById('description');
        const cursorPos = textarea.selectionStart;
        const textBefore = textarea.value.substring(0, cursorPos);
        const textAfter = textarea.value.substring(cursorPos);
        
        textarea.value = textBefore + '\n\n' + textAfter;
        textarea.selectionStart = textarea.selectionEnd = cursorPos + 2;
        textarea.focus();
        update();
    }

    // ─────────────────────────────────────────────────────────
    // EXPOSE GLOBAL API BINDINGS
    // ─────────────────────────────────────────────────────────
    window.openJSONFile = openJSONFile;
    window.loadJSONFile = loadJSONFile;
    window.duplicateRecipe = duplicateRecipe;
    window.importRecipeFile = importRecipeFile;
    window.clearForm = clearForm;
    window.saveJSON = saveJSON;
    window.downloadJSON = downloadJSON;
    window.update = update;
    window.openEmojiModal = openEmojiModal;
    window.closeEmojiModal = closeEmojiModal;
    window.closeEmojiIfOutside = closeEmojiIfOutside;
    window.filterEmoji = filterEmoji;
    window.pickEmoji = pickEmoji;
    window.handleTagKey = handleTagKey;
    window.removeTag = removeTag;
    window.addIngredient = addIngredient;
    window.addIngredientHeading = addIngredientHeading;
    window.addToTaste = addToTaste;
    window.handleIngredientInput = handleIngredientInput;
    window.handleIngredientFocus = handleIngredientFocus;
    window.handleIngredientBlur = handleIngredientBlur;
    window.handleIngredientKeydown = handleIngredientKeydown;
    window.handleToTasteInput = handleToTasteInput;
    window.handleToTasteFocus = handleToTasteFocus;
    window.handleToTasteBlur = handleToTasteBlur;
    window.handleToTasteKeydown = handleToTasteKeydown;
    window.handleToTasteNoteInput = handleToTasteNoteInput;
    window.handleToTasteNoteFocus = handleToTasteNoteFocus;
    window.handleToTasteNoteBlur = handleToTasteNoteBlur;
    window.handleToTasteNoteKeydown = handleToTasteNoteKeydown;
    window.handleEquipmentEnter = handleEquipmentEnter;
    window.handleEquipmentAutocompleteKeydown = handleEquipmentAutocompleteKeydown;
    window.handleEquipmentAutocompleteInput = handleEquipmentAutocompleteInput;
    window.handleEquipmentAutocompleteFocus = handleEquipmentAutocompleteFocus;
    window.handleEquipmentAutocompleteBlur = handleEquipmentAutocompleteBlur;
    window.addStep = addStep;
    window.addStepHeading = addStepHeading;
    window.addNote = addNote;
    window.addJournalEntry = addJournalEntry;
    window.addRelatedRecipe = addRelatedRecipe;
    window.copyJSON = copyJSON;
    window.copyTimeline = copyTimeline;
    window.copyNutrition = copyNutrition;
    window.generateTimeline = generateTimeline;
    window.calculateNutrition = calculateNutrition;
    window.copyNav = copyNav;
    window.closeTagPickerIfOutside = closeTagPickerIfOutside;
    window.confirmTagSelection = confirmTagSelection;
    window.removeTagFromRelated = removeTagFromRelated;
    window.copyTagsFromRecipe = copyTagsFromRecipe;
    window.filterTagCategory = filterTagCategory;
    window.filterTagPicker = filterTagPicker;
    window.removeRow = removeRow;
    window.renumberSteps = renumberSteps;
    window.ingEnterKey = ingEnterKey;
    window.headingEnterKey = headingEnterKey;
    window.stepEnterKey = stepEnterKey;
    window.stepHeadingEnterKey = stepHeadingEnterKey;
    window.insertParagraphBreak = insertParagraphBreak;

    const EMOJI_GROUPS = [
        { label: 'Bread & Baked', emojis: ['🍞','🥖','🥐','🫓','🥨','🥯','🧁','🍰','🎂','🍮','🥧','🫕','🥞','🧇'] },
        { label: 'Biscuits & Sweets', emojis: ['🍪','🍩','🍫','🍬','🍭','🍮','🍯','🧆','🍡','🍢','🍣','🍧','🍨','🍦'] },
        { label: 'Meat & Poultry', emojis: ['🥩','🍖','🍗','🥓','🌭','🍔','🍟','🌮','🌯','🫔','🧆','🥚','🍳'] },
        { label: 'Seafood', emojis: ['🦐','🦞','🦀','🦑','🐙','🦈','🐟','🐠','🐡','🦪','🍣','🍤','👑'] },
        { label: 'Vegetables', emojis: ['🥦','🥕','🌽','🍅','🧅','🧄','🥔','🍆','🫑','🌶️','🥑','🥒','🫒','🍄','🥬','🥗','🫛','🌿'] },
        { label: 'Fruits', emojis: ['🍎','🍊','🍋','🍇','🍓','🫐','🍈','🍑','🍒','🥭','🍍','🥥','🍌','🍉','🍏','🍐','🫙'] },
        { label: 'Pasta & Rice', emojis: ['🍝','🍜','🍲','🍛','🍚','🍙','🍘','🥟','🥠','🫕','🥘'] },
        { label: 'Dairy & Eggs', emojis: ['🧀','🥛','🍼','🧈','🥚','🍳','🫙'] },
        { label: 'Sauces & Condiments', emojis: ['🫙','🧂','🧃','🍶','🫗','🧴','🫖','🍵','🥫'] },
        { label: 'Herbs & Spices', emojis: ['🌿','🍃','🌱','🌾','🫚','🫛','🧄','🌶️','🍂'] },
        { label: 'Drinks', emojis: ['☕','🍵','🧋','🥤','🍹','🍷','🥂','🍾','🧊','🫖'] },
        { label: 'Kitchen & Tools', emojis: ['🍽️','🥣','🥗','🍴','🥄','🔪','🫕','🥘','🍲','🫙','⚗️','🧪','🌡️','⏱️','🔥','❄️'] },
        { label: 'Misc Food', emojis: ['🥙','🧆','🥗','🥪','🫔','🍱','🥡','🍿','🧂','🍽️','🛒','🌍'] }
    ];

    // Scroll to Top UI Animation Trigger
    function initScrollToTop() {
        const scrollTopBtn = document.getElementById('scrollTopBtn');
        if (!scrollTopBtn) return;

        function checkScrollPosition() {
            const scrollY = window.scrollY;
            const pageHeight = document.documentElement.scrollHeight;
            const viewportHeight = window.innerHeight;
            const distanceFromBottom = pageHeight - (scrollY + viewportHeight);
            
            if (distanceFromBottom <= 150) {
                scrollTopBtn.classList.add('show');
            } else {
                scrollTopBtn.classList.remove('show');
            }
        }

        window.addEventListener('scroll', checkScrollPosition);
        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        checkScrollPosition();
    }
	
	// Database list of tools, equipment, or extra supplies
const equipmentDatabase = [
    "Baking Sheet", "Mixing Bowl", "Whisk", "Rolling Pin", "Parchment Paper",
    "Spatula", "Saucepan", "Frying Pan", "Chef's Knife", "Cutting Board",
    "Measuring Cups", "Measuring Spoons", "Colander", "Sieve", "Grater"
];

// Array to hold the user's selected equipment
let equipmentList = [];
let currentEquipmentFocusIndex = -1;

/**
 * Adds an item to the list and updates the DOM
 */
function addEquipment(value) {
    const trimmedValue = value.trim();
    if (trimmedValue && !equipmentList.includes(trimmedValue)) {
        equipmentList.push(trimmedValue);
        renderEquipmentList();
    }
}

/**
 * Removes an item from the list
 */
function removeEquipment(index) {
    equipmentList.splice(index, 1);
    renderEquipmentList();
}

/**
 * Renders the chosen equipment list items to the DOM
 */
function renderEquipmentList() {
    const listContainer = document.getElementById('equipment-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    equipmentList.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'dynamic-list-item';
        
        // Handle names that have notes separated by "|"
        const parts = item.split('|');
        const name = parts[0].trim();
        const note = parts[1] ? ` (${parts[1].trim()})` : '';

        itemDiv.innerHTML = `
            <span>${name}${note}</span>
            <span class="remove-btn" onclick="removeEquipment(${index})" style="margin-left: 8px; cursor: pointer; color: red;">&times;</span>
        `;
        listContainer.appendChild(itemDiv);
    });
}

/**
 * Handles the Enter key on the input field
 */
function handleEquipmentEnter(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        
        const dropdown = event.target.nextElementSibling;
        const items = dropdown ? dropdown.querySelectorAll('.autocomplete-item') : [];
        
        // If an item in the autocomplete dropdown is highlighted, select it
        if (currentEquipmentFocusIndex > -1 && items[currentEquipmentFocusIndex]) {
            items[currentEquipmentFocusIndex].click();
            return;
        }
        
        // Otherwise, add what the user has typed directly
        const value = event.target.value.trim();
        if (value) {
            addEquipment(value);
            event.target.value = '';
            closeEquipmentDropdown(event.target);
        }
    }
}

/**
 * Handles keyboard navigation (Up, Down, Escape) within the dropdown
 */
function handleEquipmentAutocompleteKeydown(event, inputElement) {
    const dropdown = inputElement.nextElementSibling;
    if (!dropdown || dropdown.style.display === 'none') return;

    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (!items.length) return;

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        currentEquipmentFocusIndex++;
        if (currentEquipmentFocusIndex >= items.length) currentEquipmentFocusIndex = 0;
        setActiveEquipmentItem(items);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        currentEquipmentFocusIndex--;
        if (currentEquipmentFocusIndex < 0) currentEquipmentFocusIndex = items.length - 1;
        setActiveEquipmentItem(items);
    } else if (event.key === 'Escape') {
        closeEquipmentDropdown(inputElement);
    }
}

/**
 * Helper to update visual styling of the active/selected dropdown item
 */
function setActiveEquipmentItem(items) {
    items.forEach((item, index) => {
        if (index === currentEquipmentFocusIndex) {
            item.classList.add('autocomplete-active');
            item.style.backgroundColor = '#e9e9e9'; // fallback styling
        } else {
            item.classList.remove('autocomplete-active');
            item.style.backgroundColor = '';
        }
    });
}

/**
 * Handles text entry and filters suggestions
 */
function handleEquipmentAutocompleteInput(inputElement) {
    const rawValue = inputElement.value;
    const dropdown = inputElement.nextElementSibling;
    if (!dropdown) return;

    dropdown.innerHTML = '';
    currentEquipmentFocusIndex = -1;

    // Split at '|' to only filter suggestions based on the equipment name,
    // keeping any notes after '|' intact for when they hit enter
    const namePart = rawValue.split('|')[0].trim().toLowerCase();

    if (!namePart) {
        dropdown.style.display = 'none';
        return;
    }

    const matches = equipmentDatabase.filter(item => 
        item.toLowerCase().includes(namePart)
    );

    if (matches.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    matches.forEach(match => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'autocomplete-item';
        itemDiv.textContent = match;
        itemDiv.style.padding = '8px';
        itemDiv.style.cursor = 'pointer';
        
        // Handle click on suggestions
        itemDiv.onmousedown = () => {
            const notePart = rawValue.split('|')[1];
            const note = notePart ? ` | ${notePart.trim()}` : '';
            addEquipment(match + note);
            inputElement.value = '';
            dropdown.style.display = 'none';
        };

        dropdown.appendChild(itemDiv);
    });

    dropdown.style.display = 'block';
}

/**
 * Shows dropdown on focus if input has text
 */
function handleEquipmentAutocompleteFocus(inputElement) {
    if (inputElement.value.trim()) {
        handleEquipmentAutocompleteInput(inputElement);
    }
}

/**
 * Closes the dropdown when focus is lost (with slight delay to allow clicks to register)
 */
function handleEquipmentAutocompleteBlur(inputElement) {
    setTimeout(() => {
        closeEquipmentDropdown(inputElement);
    }, 200);
}

/**
 * Utility to close dropdown
 */
function closeEquipmentDropdown(inputElement) {
    const dropdown = inputElement.nextElementSibling;
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    currentEquipmentFocusIndex = -1;
}

})();