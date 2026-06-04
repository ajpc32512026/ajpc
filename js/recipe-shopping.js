// recipe-shopping.js - AJPC Kitchen Notebook
// Loads price database via HTTP once, caches in sessionStorage
// No file picker, no prompts, no "Load Price DB" button
// Saves by downloading the file (you replace manually)

(function() {
    'use strict';

    const CACHE_KEY = 'ajpc_price_database';
    const CACHE_TIMESTAMP_KEY = 'ajpc_price_timestamp';

    let priceDatabase = null;
    let currentRecipeData = null;
    let currentMultiplier = 1;
    let currentBaseServings = 1;
    let currentPanel = null;

    window.ShoppingList = {
        show: showShoppingList,
        updatePrice: updatePrice,
        addNewItem: addNewItem,
        closePanel: closePanel
    };

    // Load price database - from cache or fetch ONCE per session
    async function loadPriceDatabase() {
        if (priceDatabase) return priceDatabase;

        const cached = sessionStorage.getItem(CACHE_KEY);
        const timestamp = sessionStorage.getItem(CACHE_TIMESTAMP_KEY);

        if (cached && timestamp) {
            try {
                priceDatabase = JSON.parse(cached);
                console.log('[ShoppingList] Loaded from cache, items:', Object.keys(priceDatabase).length);
                return priceDatabase;
            } catch (e) {
                console.log('Cache parse failed, fetching fresh');
            }
        }

        try {
            const response = await fetch('json/recipe-prices.json?t=' + Date.now());
            if (!response.ok) throw new Error('Failed to load');
            const jsonData = await response.json();
            priceDatabase = flattenPriceDatabase(jsonData);

            sessionStorage.setItem(CACHE_KEY, JSON.stringify(priceDatabase));
            sessionStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
            console.log('[ShoppingList] Loaded from server, items:', Object.keys(priceDatabase).length);
            return priceDatabase;

        } catch (error) {
            console.error('[ShoppingList] Failed to load:', error);
            toast('Could not load recipe-prices.json');
            priceDatabase = {};
            return priceDatabase;
        }
    }

    function flattenPriceDatabase(jsonData) {
        const flatDB = {};
        for (const section in jsonData) {
            if (section === '_meta') continue;
            for (const key in jsonData[section]) {
                flatDB[key.toLowerCase().trim()] = {
                    size: jsonData[section][key].size,
                    unit: jsonData[section][key].unit,
                    price: jsonData[section][key].price,
                    brand: jsonData[section][key].brand,
                    section: section,
                    originalKey: key
                };
            }
        }
        return flatDB;
    }

    function rebuildJsonStructure(flatDB) {
        const result = {};
        for (const key in flatDB) {
            const item = flatDB[key];
            const section = item.section || 'uncategorised';
            const displayKey = item.originalKey || key;
            if (!result[section]) result[section] = {};
            result[section][displayKey] = {
                size: item.size,
                unit: item.unit,
                price: item.price,
                brand: item.brand
            };
        }
        if (!result._meta) result._meta = {};
        result._meta.lastUpdated = new Date().toISOString().split('T')[0];
        result._meta.version = '1.0';
        return result;
    }

    async function savePriceDatabase() {
        if (!priceDatabase) return false;

        const jsonToSave = rebuildJsonStructure(priceDatabase);
        const jsonString = JSON.stringify(jsonToSave, null, 2);

        const blob = new Blob([jsonString], {
            type: 'application/json'
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'recipe-prices.json';
        a.click();
        URL.revokeObjectURL(a.href);

        sessionStorage.setItem(CACHE_KEY, JSON.stringify(priceDatabase));
        toast('📥 File downloaded — replace in D:\\mysites\\ajpc\\json\\');
        return true;
    }

    async function updatePrice(itemName, size, unit, price, brand, section) {
        if (!priceDatabase) {
            await loadPriceDatabase();
        }
        const key = itemName.toLowerCase().trim();
        priceDatabase[key] = {
            size: parseFloat(size),
            unit: unit,
            price: parseFloat(price),
            brand: brand || '',
            section: section || 'uncategorised',
            originalKey: itemName
        };
        await savePriceDatabase();
        if (currentPanel && currentRecipeData) {
            closePanel();
            await showShoppingList(currentRecipeData, currentMultiplier);
        }
    }

    async function addNewItem(itemName, size, unit, price, brand, section) {
        await updatePrice(itemName, size, unit, price, brand, section);
    }

    function closePanel() {
        if (currentPanel) {
            currentPanel.remove();
            currentPanel = null;
        }
    }

    function formatQuantity(qty, unit) {
        if (!qty || qty === 0) return '';
        if (unit === 'g') return qty + 'g';
        if (unit === 'kg') return qty + 'kg';
        if (unit === 'ml') return qty + 'ml';
        if (unit === 'l') return qty + 'L';
        if (unit === 'tsp') return qty + ' tsp';
        if (unit === 'tbsp') return qty + ' tbsp';
        if (unit === 'cup') return qty + ' cup' + (qty !== 1 ? 's' : '');
        if (unit === 'each' || !unit) return Math.round(qty * 10) / 10 + '';
        return Math.round(qty * 10) / 10 + ' ' + unit;
    }

    function splitIngredientAndNotes(raw) {
        const text = raw.trim();
        let ingredient = text;
        let notes = '';
        const parenIndex = text.indexOf('(');
        if (parenIndex !== -1) {
            ingredient = text.substring(0, parenIndex).trim();
            const closeParen = text.indexOf(')', parenIndex);
            if (closeParen !== -1) {
                notes = text.substring(parenIndex + 1, closeParen).trim();
            }
        }
        return {
            ingredient,
            notes
        };
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function toast(msg) {
        const t = document.getElementById('toast');
        if (!t) {
            const newToast = document.createElement('div');
            newToast.id = 'toast';
            newToast.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#c9a961;color:#0e0e0e;font-family:monospace;font-size:0.75rem;font-weight:500;padding:0.7rem 1.2rem;border-radius:3px;opacity:0;transition:opacity 0.2s ease;z-index:10000;';
            document.body.appendChild(newToast);
            setTimeout(() => {
                newToast.textContent = msg;
                newToast.style.opacity = '1';
                setTimeout(() => {
                    newToast.style.opacity = '0';
                    setTimeout(() => newToast.remove(), 300);
                }, 2200);
            }, 10);
            return;
        }
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2200);
    }

    function itemExistsInDB(itemName) {
        const key = itemName.toLowerCase().trim();
        if (priceDatabase && priceDatabase[key]) {
            return {
                exists: true,
                data: priceDatabase[key]
            };
        }
        return {
            exists: false
        };
    }

    function getActionButton(itemName, existsInDB, existingData) {
        const safeName = escapeHtml(itemName).replace(/"/g, '&quot;');
        if (existsInDB) {
            return `<button class="action-btn update-btn" data-item="${safeName}" data-action="update" data-section="${existingData?.section || 'uncategorised'}" data-size="${existingData?.size || ''}" data-unit="${existingData?.unit || 'g'}" data-price="${existingData?.price || ''}" data-brand="${existingData?.brand || ''}">🔄 Update</button>`;
        } else {
            return `<button class="action-btn new-btn" data-item="${safeName}" data-action="new" data-section="uncategorised">✨ New</button>`;
        }
    }

    async function showShoppingList(recipe, scale) {
        if (currentPanel) {
            currentPanel.remove();
            currentPanel = null;
        }

        await loadPriceDatabase();

        currentRecipeData = recipe;
        currentMultiplier = scale || 1;
        currentBaseServings = parseInt(recipe.servings) || 1;
        const scaledServings = Math.round(currentBaseServings * currentMultiplier);

        const excludeItems = ['water', 'hot water', 'cold water', 'warm water', 'boiling water', 'tap water', 'salt', 'pepper', 'black pepper', 'white pepper', 'to taste'];
        const multiplier = currentMultiplier;

        const ingredients = [];
        (recipe.ingredients || []).forEach(function(ing) {
            if (ing.heading || ing.toTaste) return;
            const raw = parseFloat(ing.quantity);
            const qtyVal = isNaN(raw) ? 0 : raw * multiplier;
            const unit = (ing.unit || '').toLowerCase();
            const rawItem = (ing.item || ing.name || '').trim();
            const parsed = splitIngredientAndNotes(rawItem);
            const item = parsed.ingredient.toLowerCase();
            if (!item) return;
            if (excludeItems.includes(item)) return;
            ingredients.push({
                name: item,
                displayName: ing.item || ing.name || item,
                qty: qtyVal,
                unit: unit
            });
        });

        const shoppingItems = [];
        let totalBuyCost = 0;
        let totalMakeCost = 0;

        ingredients.forEach(function(ing) {
            const {
                exists,
                data
            } = itemExistsInDB(ing.name);

            if (!exists) {
                shoppingItems.push({
                    name: ing.displayName,
                    needed: formatQuantity(ing.qty, ing.unit),
                    hasPrice: false,
                    existsInDB: false
                });
                return;
            }

            const hasPriceData = data && data.price && data.price > 0 && data.size && data.size > 0;
            if (!hasPriceData) {
                shoppingItems.push({
                    name: ing.displayName,
                    needed: formatQuantity(ing.qty, ing.unit),
                    hasPrice: false,
                    existsInDB: true,
                    existingData: data
                });
                return;
            }

            let neededInPackageUnits = ing.qty;
            if (ing.unit === 'g' && data.unit === 'kg') neededInPackageUnits = ing.qty / 1000;
            if (ing.unit === 'ml' && data.unit === 'l') neededInPackageUnits = ing.qty / 1000;

            const pricePerUnit = data.price / data.size;
            const packagesNeeded = Math.ceil(neededInPackageUnits / data.size);
            const buyCost = packagesNeeded * data.price;
            totalBuyCost += buyCost;
            const makeCost = neededInPackageUnits * pricePerUnit;
            totalMakeCost += makeCost;

            const totalPurchasedQty = packagesNeeded * data.size;
            const remainingQty = totalPurchasedQty - neededInPackageUnits;
            const remainingValue = remainingQty * pricePerUnit;

            shoppingItems.push({
                name: ing.displayName,
                needed: formatQuantity(ing.qty, ing.unit),
                neededCost: makeCost.toFixed(2),
                packagesNeeded: packagesNeeded,
                packageSize: data.size + data.unit,
                packagePrice: data.price.toFixed(2),
                brand: data.brand,
                buyCost: buyCost.toFixed(2),
                remainingQty: formatQuantity(remainingQty, data.unit),
                remainingValue: remainingValue.toFixed(2),
                hasPrice: true,
                existsInDB: true,
                existingData: data
            });
        });

        const panel = document.createElement('div');
        panel.id = 'shoppingPanel';

        let inner = '<div class="shopping-panel-header"><span>🛒 Shopping List</span><button class="shopping-panel-close" onclick="window.ShoppingList.closePanel()">&times;</button></div>';
        inner += '<div class="recipe-title-small">' + escapeHtml(recipe.title || '') + '</div>';

        if (multiplier > 1) {
            inner += '<div class="scale-indicator">📏 Scaled ' + multiplier + 'x — Serves: <strong>' + scaledServings + '</strong> (from ' + currentBaseServings + ')</div>';
        }

        if (shoppingItems.length === 0) {
            inner += '<p style="color:var(--cream-muted);font-style:italic;">No ingredients found.</p>';
        } else {
            const savings = totalBuyCost - totalMakeCost;
            inner += '<div class="cost-summary">';
            inner += '<div class="cost-row"><span>Cost to MAKE:</span><span>$' + totalMakeCost.toFixed(2) + '</span></div>';
            inner += '<div class="cost-row"><span>Cost to BUY:</span><span>$' + totalBuyCost.toFixed(2) + '</span></div>';
            if (savings > 0) inner += '<div class="cost-row savings"><span>💡 Leftover value:</span><span>$' + savings.toFixed(2) + '</span></div>';
            inner += '<div class="cost-row serving"><span>🍽️ Serves (scaled):</span><span><strong>' + scaledServings + '</strong></span></div>';
            if (scaledServings > 0) inner += '<div class="cost-row serving"><span>💵 Cost per serving:</span><span><strong>$' + (totalMakeCost / scaledServings).toFixed(2) + '</strong></span></div>';
            inner += '</div><ul class="shopping-items-list">';

            shoppingItems.forEach(function(item, idx) {
                const actionButton = getActionButton(item.name, item.existsInDB, item.existingData);
                inner += '<li class="shopping-item"><div class="shopping-item-content">';
                inner += '<input type="checkbox" id="shop-' + idx + '" class="shopping-checkbox">';
                inner += '<div class="shopping-item-details">';
                inner += '<div class="shopping-item-name">' + escapeHtml(item.name) + '</div>';
                inner += '<div class="shopping-price-details">';
                if (item.hasPrice && item.brand) inner += '<div class="shopping-brand">' + escapeHtml(item.brand) + '</div>';
                
                if (item.hasPrice) {
                    inner += '<div class="shopping-needed">Needs: ' + item.needed + ' = $' + item.neededCost + '</div>';
                } else {
                    inner += '<div class="shopping-needed">Needs: ' + item.needed + '</div>';
                }

                if (item.hasPrice) {
                    inner += '<div class="shopping-package">Buy: ' + item.packagesNeeded + ' × ' + item.packageSize + ' @ $' + item.packagePrice + '</div>';
                    
                    if (parseFloat(item.remainingValue) > 0) {
                        inner += '<div class="shopping-remaining">Leftover: ' + item.remainingQty + ' ($' + item.remainingValue + ')</div>';
                    }
                    
                    inner += '<div class="shopping-cost"><strong>$' + item.buyCost + '</strong></div>';
                } else if (item.existsInDB) {
                    inner += '<div class="shopping-no-price">⚠️ Missing price/size — click Update</div>';
                } else {
                    inner += '<div class="shopping-no-price">✨ Not in database — click New</div>';
                }
                inner += '</div>' + actionButton + '</div></div></li>';
            });

            inner += '</ul><div class="shopping-panel-footer"><button id="shoppingSelectAll">Select All</button><button id="shoppingPrintBtn">🖨️ Print</button></div>';
        }

        panel.innerHTML = inner;
        document.body.appendChild(panel);
        currentPanel = panel;

        document.getElementById('shoppingSelectAll')?.addEventListener('click', function() {
            const checkboxes = panel.querySelectorAll('.shopping-checkbox');
            let allChecked = true;
            checkboxes.forEach(cb => {
                if (!cb.checked) allChecked = false;
            });
            checkboxes.forEach(cb => {
                cb.checked = !allChecked;
            });
            this.textContent = allChecked ? 'Select All' : 'Deselect All';
        });

        document.getElementById('shoppingPrintBtn')?.addEventListener('click', function() {
            const checkboxes = panel.querySelectorAll('.shopping-checkbox');
            const isAnyChecked = panel.querySelectorAll('.shopping-checkbox:checked').length > 0;
            
            const selectedItems = [];
            let printTotal = 0;

            checkboxes.forEach((cb, idx) => {
                if (!isAnyChecked || cb.checked) {
                    const itemData = shoppingItems[idx];
                    selectedItems.push(itemData);
                    if (itemData.hasPrice) {
                        printTotal += parseFloat(itemData.buyCost || 0);
                    }
                }
            });

            if (!selectedItems.length) return alert('Nothing to print.');

            const win = window.open('', '_blank');
            win.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Shopping List</title>
                    <style>
                        @page {
                            margin: 0.3in;
                        }
                        body { 
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
                            font-size: 11px;
                            line-height: 1.3;
                            color: #000; 
                            background: #fff;
                            margin: 0; 
                            padding: 0; 
                            max-width: 400px; /* Constrains list to a compact, receipt-like layout aligned top-left */
                        }
                        .header-container {
                            border-bottom: 2px solid #000;
                            padding-bottom: 5px;
                            margin-bottom: 10px;
                        }
                        h1 { 
                            font-size: 14px; 
                            text-transform: uppercase;
                            margin: 0 0 2px 0; 
                            color: #000; 
                            letter-spacing: 0.02em;
                        }
                        .subtitle { 
                            font-size: 10px; 
                            font-weight: bold;
                            color: #333; 
                            margin: 0;
                            text-transform: uppercase;
                        }
                        .scale { 
                            font-size: 10px; 
                            color: #555; 
                            margin-top: 2px;
                            font-style: italic;
                        }
                        ul { 
                            list-style: none; 
                            padding: 0; 
                            margin: 0; 
                        }
                        li { 
                            padding: 5px 0; 
                            border-bottom: 1px dashed #bbb; 
                            display: flex; 
                            justify-content: space-between; 
                            align-items: flex-start; 
                        }
                        .item-left { 
                            display: flex; 
                            align-items: flex-start; 
                            gap: 6px; 
                        }
                        .checkbox { 
                            font-family: monospace;
                            font-size: 12px; 
                            font-weight: bold;
                            color: #000; 
                            user-select: none; 
                        }
                        .item-text {
                            display: flex;
                            flex-direction: column;
                        }
                        .item-name { 
                            font-weight: bold; 
                            font-size: 11px; 
                        }
                        .brand { 
                            color: #555; 
                            font-size: 10px; 
                            font-weight: normal;
                            font-style: italic;
                        }
                        .sub-details { 
                            font-size: 10px; 
                            color: #444; 
                            margin-top: 1px; 
                        }
                        .item-cost { 
                            font-weight: bold; 
                            font-size: 11px; 
                            text-align: right; 
                            white-space: nowrap;
                            padding-left: 8px;
                        }
                        .no-price { 
                            color: #777; 
                            font-weight: normal; 
                            font-size: 10px; 
                        }
                        .total-row { 
                            margin-top: 15px; 
                            padding-top: 6px; 
                            border-top: 2px solid #000; 
                            display: flex; 
                            justify-content: space-between; 
                            align-items: center; 
                            font-size: 12px; 
                            font-weight: bold; 
                        }
                        .disclaimer { 
                            margin-top: 25px; 
                            font-size: 8px; 
                            color: #666; 
                            text-align: left; 
                            border-top: 1px solid #ddd; 
                            padding-top: 6px; 
                        }
                        @media print {
                            body { margin: 0; padding: 0; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header-container">
                        <h1>🛒 Shopping List</h1>
                        <div class="subtitle">${escapeHtml(recipe.title || '')}</div>
                        ${multiplier > 1 ? `<div class="scale">📏 Scaled ${multiplier}x — Serves: ${scaledServings}</div>` : ''}
                    </div>
                    <ul>
                        ${selectedItems.map(item => `
                            <li>
                                <div class="item-left">
                                    <span class="checkbox">[ ]</span>
                                    <div class="item-text">
                                        <div>
                                            <span class="item-name">${escapeHtml(item.name)}</span>
                                            ${item.brand ? `<span class="brand">(${escapeHtml(item.brand)})</span>` : ''}
                                        </div>
                                        <div class="sub-details">
                                            Needs: ${escapeHtml(item.needed)} ${item.hasPrice ? `= $${item.neededCost}` : ''}
                                            ${item.hasPrice ? ` | Buy: ${item.packagesNeeded} × ${item.packageSize} @ $${item.packagePrice}` : ''}
                                        </div>
                                    </div>
                                </div>
                                <div class="item-cost">
                                    ${item.hasPrice ? `$${item.buyCost}` : '<span class="no-price">—</span>'}
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                    <div class="total-row">
                        <span>Total Purchase Cost:</span>
                        <span>$${printTotal.toFixed(2)}</span>
                    </div>
                    <div class="disclaimer">Generated via AJPC Kitchen Notebook.</div>
                </body>
                </html>
            `);
            win.document.close();
            win.print();
        });

        panel.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', async function(e) {
                e.stopPropagation();
                const itemName = this.getAttribute('data-item');
                const action = this.getAttribute('data-action');
                const existingSection = this.getAttribute('data-section');
                const existingSize = this.getAttribute('data-size');
                const existingUnit = this.getAttribute('data-unit');
                const existingPrice = this.getAttribute('data-price');
                const existingBrand = this.getAttribute('data-brand');

                const li = this.closest('.shopping-item');
                const originalContent = li.innerHTML;
                const uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 6);

                li.innerHTML = `<div class="price-edit-form">
                    <div class="edit-status-note ${action === 'new' ? 'new-note' : 'update-note'}">${action === 'new' ? '✨ NEW ITEM' : '🔄 UPDATE ITEM'}: "${escapeHtml(itemName)}"</div>
                    <div class="edit-field"><label>Package Size</label><input type="number" id="size-${uniqueId}" value="${existingSize || ''}" step="any" placeholder="e.g. 500"></div>
                    <div class="edit-field"><label>Unit</label><select id="unit-${uniqueId}"><option value="g"${existingUnit === 'g' ? ' selected' : ''}>grams (g)</option><option value="kg"${existingUnit === 'kg' ? ' selected' : ''}>kilograms (kg)</option><option value="ml"${existingUnit === 'ml' ? ' selected' : ''}>millilitres (ml)</option><option value="l"${existingUnit === 'l' ? ' selected' : ''}>litres (L)</option><option value="each"${existingUnit === 'each' ? ' selected' : ''}>each</option></select></div>
                    <div class="edit-field"><label>Price ($AUD)</label><input type="number" id="price-${uniqueId}" value="${existingPrice || ''}" step="0.01" placeholder="e.g. 4.50"></div>
                    <div class="edit-field"><label>Brand</label><input type="text" id="brand-${uniqueId}" value="${existingBrand || ''}" placeholder="Brand name"></div>
                    <div class="edit-field"><label>Section</label><select id="section-${uniqueId}"><option value="uncategorised"${existingSection === 'uncategorised' ? ' selected' : ''}>Uncategorised</option><option value="flour_baking"${existingSection === 'flour_baking' ? ' selected' : ''}>Flour & Baking</option><option value="sugar_sweeteners"${existingSection === 'sugar_sweeteners' ? ' selected' : ''}>Sugar & Sweeteners</option><option value="eggs"${existingSection === 'eggs' ? ' selected' : ''}>Eggs</option><option value="butter_dairy"${existingSection === 'butter_dairy' ? ' selected' : ''}>Butter & Dairy</option><option value="milk_cream"${existingSection === 'milk_cream' ? ' selected' : ''}>Milk & Cream</option><option value="cheese"${existingSection === 'cheese' ? ' selected' : ''}>Cheese</option><option value="oils"${existingSection === 'oils' ? ' selected' : ''}>Oils</option><option value="rice_grains"${existingSection === 'rice_grains' ? ' selected' : ''}>Rice & Grains</option><option value="pasta_noodles"${existingSection === 'pasta_noodles' ? ' selected' : ''}>Pasta & Noodles</option><option value="canned_tomatoes"${existingSection === 'canned_tomatoes' ? ' selected' : ''}>Canned Tomatoes</option><option value="canned_fish_seafood"${existingSection === 'canned_fish_seafood' ? ' selected' : ''}>Canned Fish & Seafood</option><option value="canned_fruit"${existingSection === 'canned_fruit' ? ' selected' : ''}>Canned Fruit</option><option value="sauces_condiments"${existingSection === 'sauces_condiments' ? ' selected' : ''}>Sauces & Condiments</option><option value="spreads"${existingSection === 'spreads' ? ' selected' : ''}>Spreads</option><option value="spices_seasonings"${existingSection === 'spices_seasonings' ? ' selected' : ''}>Spices & Seasonings</option><option value="meat_poultry"${existingSection === 'meat_poultry' ? ' selected' : ''}>Meat & Poultry</option><option value="fresh_vegetables"${existingSection === 'fresh_vegetables' ? ' selected' : ''}>Fresh Vegetables</option><option value="fresh_fruit"${existingSection === 'fresh_fruit' ? ' selected' : ''}>Fresh Fruit</option></select></div>
                    <div class="edit-actions"><button class="save-price-btn" data-item="${escapeHtml(itemName).replace(/"/g, '&quot;')}" data-action="${action}" data-unique="${uniqueId}">Save</button><button class="cancel-edit-btn">Cancel</button></div>
                </div>`;

                li.querySelector('.save-price-btn').onclick = async function() {
                    const uid = this.getAttribute('data-unique');
                    const act = this.getAttribute('data-action');
                    const size = document.getElementById('size-' + uid).value;
                    const unit = document.getElementById('unit-' + uid).value;
                    const price = document.getElementById('price-' + uid).value;
                    const brand = document.getElementById('brand-' + uid).value;
                    const section = document.getElementById('section-' + uid).value;
                    if (!size || !price) {
                        alert('Please fill in size and price');
                        return;
                    }
                    if (act === 'new') {
                        await addNewItem(itemName, size, unit, price, brand, section);
                        toast('✨ Added: ' + itemName);
                    } else {
                        await updatePrice(itemName, size, unit, price, brand, section);
                        toast('🔄 Updated: ' + itemName);
                    }
                };

                li.querySelector('.cancel-edit-btn').onclick = () => {
                    li.innerHTML = originalContent;
                };
            });
        });
    }
})();