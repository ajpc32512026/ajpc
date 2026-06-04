/* =========================================================
   BUILDER UI — Row Management, Modals, Drag-and-Drop
   Depends on globals: tags, selectedEmoji, EMOJI_GROUPS (builder-main.js)
========================================================= */

// ── Ingredients ───────────────────────────────────────────
function addIngredient(qty='', unit='', item='', notes='') {
    const list = document.getElementById('ingredients-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.draggable = true;
    row.innerHTML = `
        <div class="drag-handle">⋮⋮</div>
        <input type="text" placeholder="Qty"   value="${escHtml(qty)}"   oninput="update()">
        <input type="text" placeholder="Unit"  value="${escHtml(unit)}"  oninput="update()">
        <input type="text" placeholder="Item"  value="${escHtml(item)}"  oninput="update()">
        <input type="text" placeholder="Notes (optional)" value="${escHtml(notes)}" oninput="update()">
        <button class="btn danger" onclick="removeRow(this)">✕</button>
    `;
    setupDragEvents(row, 'ingredients-list');
    list.appendChild(row);
    if (!qty && !item) row.querySelector('input').focus();
    update();
}

function addToTaste(item='', notes='') {
    const list = document.getElementById('ingredients-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'ingredient-totaste-row';
    row.draggable = true;
    row.innerHTML = `
        <div class="drag-handle">⋮⋮</div>
        <span class="ingredient-totaste-badge">To Taste</span>
        <input type="text" placeholder="e.g. Salt &amp; Pepper" value="${escHtml(item)}" oninput="update()">
        <input type="text" placeholder="Note (optional)" value="${escHtml(notes)}" oninput="update()" style="font-style:italic;color:var(--text-dim);">
        <button class="btn danger" onclick="removeRow(this)">✕</button>
    `;
    setupDragEvents(row, 'ingredients-list');
    list.appendChild(row);
    if (!item) row.querySelector('input').focus();
    update();
}

function addIngredientHeading(heading='') {
    const list = document.getElementById('ingredients-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'ingredient-heading-row';
    row.draggable = true;
    row.innerHTML = `
        <div class="drag-handle">⋮⋮</div>
        <input type="text" class="ingredient-heading-input" value="${escHtml(heading)}" oninput="update()" placeholder="e.g. For the Base, For the Filling…">
        <button class="btn danger" onclick="removeRow(this)">✕</button>
    `;
    setupDragEvents(row, 'ingredients-list');
    list.appendChild(row);
    if (!heading) row.querySelector('input').focus();
    update();
}

// ── Equipment / You Will Also Need ────────────────────────
function addEquipmentItem(item='', notes='') {
    const list = document.getElementById('equipment-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'equipment-item-row';
    row.draggable = true;
    row.innerHTML = `
        <div class="drag-handle">⋮⋮</div>
        <input type="text" value="${escHtml(item)}"  placeholder="Item" oninput="update()">
        <input type="text" value="${escHtml(notes)}" placeholder="Note (optional)" oninput="update()" style="font-style:italic;color:var(--text-dim);">
        <button class="btn danger" onclick="removeRow(this); update()">✕</button>
    `;
    setupDragEvents(row, 'equipment-list');
    list.appendChild(row);
    update();
}

// ── Method ────────────────────────────────────────────────
function addStep(text='', insertAfter=null) {
    const list = document.getElementById('steps-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'step-row';
    row.draggable = true;
    row.innerHTML = `
        <div class="step-num-handle">
            <span class="step-num"></span>
            <div class="drag-handle">⋮⋮</div>
        </div>
        <textarea placeholder="Describe this step…" oninput="autoResize(this); update()" onkeydown="stepEnterKey(event,this)">${escHtml(text)}</textarea>
        <button class="btn danger" onclick="removeRow(this); renumberSteps()">✕</button>
    `;
    setupDragEvents(row, 'steps-list', renumberSteps);
    if (insertAfter) insertAfter.parentNode.insertBefore(row, insertAfter.nextSibling);
    else list.appendChild(row);
    renumberSteps();
    const ta = row.querySelector('textarea');
    autoResize(ta);
    if (!text) ta.focus();
}

function stepEnterKey(e, ta) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        addStep('', ta.closest('.step-row'));
    }
}

function addStepHeading(heading='') {
    const list = document.getElementById('steps-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'step-heading-row';
    row.draggable = true;
    row.innerHTML = `
        <div class="drag-handle">⋮⋮</div>
        <input type="text" placeholder="e.g. Make the Sauce, To Serve…" value="${escHtml(heading)}" oninput="update()">
        <button class="btn danger" onclick="removeRow(this); renumberSteps()">✕</button>
    `;
    setupDragEvents(row, 'steps-list', renumberSteps);
    list.appendChild(row);
    if (!heading) row.querySelector('input').focus();
    update();
}

function renumberSteps() {
    let n = 0;
    document.querySelectorAll('#steps-list .step-row').forEach(row => {
        const el = row.querySelector('.step-num');
        if (el) el.textContent = ++n;
    });
    update();
}

// ── Notes ─────────────────────────────────────────────────
function addNote(type='tip', title='', content='') {
    const list = document.getElementById('notes-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'note-row';
    row.draggable = true;
    row.innerHTML = `
        <div class="drag-handle">⋮⋮</div>
        <select onchange="update()">
            <option value="acknowledgement" ${type==='acknowledgement'?'selected':''}>Acknowledgement</option>
            <option value="serving"         ${type==='serving'?'selected':''}>Serving</option>
            <option value="technique"       ${type==='technique'?'selected':''}>Technique</option>
            <option value="storage"         ${type==='storage'?'selected':''}>Storage</option>
            <option value="substitution"    ${type==='substitution'?'selected':''}>Substitution</option>
            <option value="variation"       ${type==='variation'?'selected':''}>Variation</option>
            <option value="tip"             ${type==='tip'?'selected':''}>Tip</option>
        </select>
        <div class="note-inner">
            <input type="text" placeholder="Title" value="${escHtml(title)}" oninput="update()">
            <textarea placeholder="Content…" oninput="autoResize(this); update()">${escHtml(content)}</textarea>
        </div>
        <button class="btn danger" onclick="removeRow(this)">✕</button>
    `;
    setupDragEvents(row, 'notes-list');
    list.appendChild(row);
    autoResize(row.querySelector('textarea'));
    update();
}

// ── Journal ───────────────────────────────────────────────
function addJournalEntry(date='', content='') {
    const list = document.getElementById('journal-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'journal-row';
    row.draggable = true;
    row.innerHTML = `
        <div class="drag-handle">⋮⋮</div>
        <input type="date" value="${date || new Date().toISOString().split('T')[0]}" oninput="update()">
        <textarea placeholder="What did you try? How did it turn out?" oninput="autoResize(this); update()">${escHtml(content)}</textarea>
        <button class="btn danger" onclick="removeRow(this)">✕</button>
    `;
    setupDragEvents(row, 'journal-list');
    list.appendChild(row);
    autoResize(row.querySelector('textarea'));
    update();
}

// ── Tags ──────────────────────────────────────────────────
function handleTagKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const v = e.target.value.replace(/,/g, '').trim();
        if (v && !tags.includes(v)) { tags.push(v); renderTags(); update(); }
        e.target.value = '';
    } else if (e.key === 'Backspace' && e.target.value === '' && tags.length) {
        tags.pop(); renderTags(); update();
    }
}

function renderTags() {
    const wrap  = document.getElementById('tags-wrap');
    const input = document.getElementById('tag-input');
    if (!wrap || !input) return;
    wrap.querySelectorAll('.tag-chip').forEach(c => c.remove());
    tags.forEach((t, i) => {
        const chip = document.createElement('div');
        chip.className = 'tag-chip';
        chip.innerHTML = `${escHtml(t)}<button onclick="removeTag(${i})">×</button>`;
        wrap.insertBefore(chip, input);
    });
}

function removeTag(i) { tags.splice(i, 1); renderTags(); update(); }

// ── Emoji Modal ───────────────────────────────────────────
function openEmojiModal() {
    const modal = document.getElementById('emoji-modal');
    const body  = document.getElementById('emoji-modal-content');
    if (!modal || !body) return;

    let html = `
        <div class="emoji-modal-header">
            <span>Choose Emoji</span>
            <button class="emoji-modal-close" onclick="closeEmojiModal()">×</button>
        </div>
        <div class="emoji-modal-search">
            <input type="text" id="emoji-search" placeholder="Search…" oninput="filterEmoji(this.value)">
        </div>
        <div class="emoji-modal-body" id="emoji-modal-body">
    `;
    EMOJI_GROUPS.forEach(g => {
        html += `<div class="emoji-group-label">${g.label}</div><div class="emoji-grid">`;
        g.emojis.forEach(e => {
            html += `<button class="emoji-btn${e === selectedEmoji ? ' selected' : ''}" onclick="pickEmoji('${e}')">${e}</button>`;
        });
        html += '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
    modal.classList.add('open');
    setTimeout(() => document.getElementById('emoji-search')?.focus(), 50);
}

function filterEmoji(query) {
    const q = query.toLowerCase();
    const body = document.getElementById('emoji-modal-body');
    if (!body) return;
    let html = '';
    EMOJI_GROUPS.forEach(g => {
        const matches = q ? g.emojis : g.emojis;
        if (!matches.length) return;
        html += `<div class="emoji-group-label">${g.label}</div><div class="emoji-grid">`;
        matches.forEach(e => {
            html += `<button class="emoji-btn${e === selectedEmoji ? ' selected' : ''}" onclick="pickEmoji('${e}')">${e}</button>`;
        });
        html += '</div>';
    });
    body.innerHTML = html;
}

function closeEmojiModal() { document.getElementById('emoji-modal')?.classList.remove('open'); }

function closeEmojiIfOutside(e) {
    if (e.target === document.getElementById('emoji-modal')) closeEmojiModal();
}

function pickEmoji(e) {
    selectedEmoji = e;
    document.getElementById('emoji').value = e;
    const preview = document.getElementById('emoji-preview');
    const text    = document.getElementById('emoji-trigger-text');
    if (preview) preview.textContent = e;
    if (text) { text.textContent = e + ' — click to change'; text.style.color = 'var(--text)'; }
    closeEmojiModal();
    update();
}

// ── Duplication & Form Management ─────────────────────────
function duplicateRecipe() {
    const dupe = JSON.parse(JSON.stringify(buildJSON().obj));
    dupe.title = (dupe.title || 'Recipe') + ' (Copy)';
    dupe.id    = dupe.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    clearForm(true);
    populateForm(dupe);
    document.getElementById('mode-label').textContent = 'Duplicated — Edit & Save';
    document.getElementById('mode-label').style.color = 'var(--gold)';
    toast('Recipe duplicated!');
    document.getElementById('title').focus();
    document.getElementById('title').select();
}

function updateDuplicateButton() {
    const { obj } = buildJSON();
    const btn = document.getElementById('duplicate-btn');
    if (btn) btn.style.display = (obj.title || (obj.ingredients && obj.ingredients.length)) ? '' : 'none';
}

function clearForm(skipConfirm=false) {
    if (!skipConfirm && !confirm('Clear everything and start fresh?')) return;
    document.querySelectorAll('input[type="text"], input[type="number"], textarea').forEach(i => i.value = '');
    document.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
    document.querySelectorAll('.dynamic-list').forEach(l => l.innerHTML = '');
    selectedEmoji = '';
    document.getElementById('emoji').value = '';
    const preview = document.getElementById('emoji-preview');
    const text    = document.getElementById('emoji-trigger-text');
    if (preview) preview.textContent = '＋';
    if (text) { text.textContent = 'Choose an emoji…'; text.style.color = ''; }
    tags = []; renderTags();
    currentFilename   = '';
    currentFileHandle = null;
    document.getElementById('mode-label').textContent = 'New Recipe';
    document.getElementById('mode-label').style.color = '';
    document.getElementById('nutrition-box').style.display = 'none';
    document.getElementById('timeline-box').style.display  = 'none';
    update();
}

function insertParagraphBreak() {
    const ta = document.getElementById('description');
    if (!ta) return;
    const pos = ta.selectionStart;
    ta.value = ta.value.slice(0, pos) + '\n\n' + ta.value.slice(pos);
    ta.selectionStart = ta.selectionEnd = pos + 2;
    ta.focus();
    update();
}

// ── Utility Helpers ───────────────────────────────────────
function removeRow(btn) {
    const row = btn.closest('[class]');
    if (row && row !== document.body) { row.remove(); update(); }
}

function autoResize(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) { console.warn('Toast:', msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
}

function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── Drag and Drop ─────────────────────────────────────────
let draggedEl = null;

function setupDragEvents(el, listId, callback) {
    el.addEventListener('dragstart', e => {
        draggedEl = el;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        draggedEl = null;
        if (callback) callback();
        else update();
    });
    // The list itself handles dragover/drop (delegated in initDragDrop)
}

// Attach dragover+drop to each list container once
function initDragDrop() {
    ['ingredients-list','equipment-list','steps-list','notes-list','journal-list'].forEach(listId => {
        const list = document.getElementById(listId);
        if (!list) return;
        list.addEventListener('dragover', e => {
            e.preventDefault();
            if (!draggedEl) return;
            const after = getDragAfterElement(list, e.clientY);
            if (after == null) list.appendChild(draggedEl);
            else list.insertBefore(draggedEl, after);
        });
    });
}

function getDragAfterElement(container, y) {
    const items = [...container.querySelectorAll('[draggable]:not(.dragging)')];
    return items.reduce((closest, child) => {
        const box    = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

document.addEventListener('DOMContentLoaded', initDragDrop);
