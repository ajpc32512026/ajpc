// js/shopping-list.js
// Shopping list and price calculator for recipe viewer

const PRICE_STORAGE_KEY = 'ajpc_price_database';
const PRICE_DISCLAIMER_KEY = 'ajpc_price_last_updated';

// Default prices from Woolworths Australia (your actual shopping data)
const DEFAULT_PRICES = {
    // Baking & Pantry Staples
    "plain flour": { size: 1000, unit: "g", price: 2.60, brand: "Essentials" },
    "self raising flour": { size: 1000, unit: "g", price: 2.50, brand: "Essentials" },
    "white sugar": { size: 1000, unit: "g", price: 2.60, brand: "Essentials" },
    "brown sugar": { size: 1000, unit: "g", price: 2.60, brand: "Essentials" },
    "caster sugar": { size: 1000, unit: "g", price: 2.60, brand: "Essentials" },
    "icing sugar": { size: 1000, unit: "g", price: 2.60, brand: "Essentials" },
    "vanilla extract": { size: 50, unit: "ml", price: 4.00, brand: "Queen Organic" },
    "rolled oats": { size: 900, unit: "g", price: 3.25, brand: "Uncle Tobys" },
    "breadcrumbs": { size: 250, unit: "g", price: 3.00, brand: "Essentials" },
    "custard powder": { size: 300, unit: "g", price: 3.20, brand: "Foster Clark's" },
    
    // Oils & Fats
    "olive oil": { size: 750, unit: "ml", price: 12.50, brand: "Cobram Estate" },
    "vegetable oil": { size: 2000, unit: "ml", price: 6.00, brand: "Woolworths" },
    "unsalted butter": { size: 500, unit: "g", price: 7.00, brand: "Essentials" },
    "spreadable butter": { size: 500, unit: "g", price: 7.00, brand: "Western Star" },
    
    // Dairy & Eggs
    "eggs": { size: 12, unit: "each", price: 8.50, brand: "Essentials" },
    "large eggs": { size: 12, unit: "each", price: 10.00, brand: "Free Range" },
    "milk": { size: 3000, unit: "ml", price: 5.15, brand: "Woolworths" },
    "cooking cream": { size: 300, unit: "ml", price: 3.95, brand: "Bulla" },
    "coconut cream": { size: 400, unit: "ml", price: 1.70, brand: "Essentials" },
    "tasty cheese": { size: 500, unit: "g", price: 10.00, brand: "Woolworths" },
    "parmesan cheese": { size: 250, unit: "g", price: 5.00, brand: "Perfect Italiano" },
    
    // Canned Goods
    "diced tomatoes": { size: 400, unit: "g", price: 1.10, brand: "Woolworths" },
    "crushed tomatoes": { size: 400, unit: "g", price: 1.10, brand: "Woolworths" },
    "tuna": { size: 425, unit: "g", price: 3.30, brand: "Essentials" },
    "tuna in brine": { size: 425, unit: "g", price: 3.30, brand: "Essentials" },
    "sardines": { size: 400, unit: "g", price: 1.10, brand: "Deep Cove" },
    "coconut milk": { size: 400, unit: "ml", price: 1.70, brand: "Essentials" },
    
    // Sauces & Condiments
    "soy sauce": { size: 500, unit: "ml", price: 10.20, brand: "Kikkoman" },
    "fish sauce": { size: 500, unit: "ml", price: 5.50, brand: "Squid" },
    "oyster sauce": { size: 500, unit: "ml", price: 5.00, brand: "Mae Krua" },
    "barbecue sauce": { size: 500, unit: "ml", price: 3.20, brand: "Eta" },
    "tomato sauce": { size: 500, unit: "ml", price: 2.50, brand: "Essentials" },
    "mayonnaise": { size: 440, unit: "ml", price: 4.50, brand: "Praise" },
    "sweet chilli sauce": { size: 690, unit: "ml", price: 5.50, brand: "Trident" },
    "mustard": { size: 200, unit: "g", price: 4.20, brand: "MasterFoods" },
    
    // Spices (small jars)
    "cajun seasoning": { size: 35, unit: "g", price: 3.00, brand: "MasterFoods" },
    "paprika": { size: 35, unit: "g", price: 3.00, brand: "MasterFoods" },
    "cumin": { size: 35, unit: "g", price: 3.00, brand: "MasterFoods" },
    "coriander": { size: 35, unit: "g", price: 3.00, brand: "MasterFoods" },
    "turmeric": { size: 35, unit: "g", price: 3.00, brand: "MasterFoods" },
    "cayenne pepper": { size: 30, unit: "g", price: 3.00, brand: "MasterFoods" },
    "oregano": { size: 15, unit: "g", price: 3.00, brand: "MasterFoods" },
    "basil": { size: 15, unit: "g", price: 3.00, brand: "MasterFoods" },
    "thyme": { size: 15, unit: "g", price: 3.00, brand: "MasterFoods" },
    "rosemary": { size: 15, unit: "g", price: 3.00, brand: "MasterFoods" },
    "garlic powder": { size: 100, unit: "g", price: 2.50, brand: "Essentials" },
    "onion powder": { size: 100, unit: "g", price: 2.50, brand: "Essentials" },
    "minced garlic": { size: 200, unit: "g", price: 1.25, brand: "Woolworths" },
    
    // Stock Cubes
    "beef stock cube": { size: 1, unit: "cube", price: 0.23, brand: "OXO" }, // ~$2.80 for 12
    "chicken stock cube": { size: 1, unit: "cube", price: 0.23, brand: "OXO" },
    "vegetable stock cube": { size: 1, unit: "cube", price: 0.23, brand: "OXO" },
    
    // Rice & Grains
    "jasmine rice": { size: 5000, unit: "g", price: 8.60, brand: "Sunrice" },
    "basmati rice": { size: 5000, unit: "g", price: 10.00, brand: "Sunrice" },
    "long grain rice": { size: 5000, unit: "g", price: 8.60, brand: "Sunrice" },
    "pasta": { size: 500, unit: "g", price: 1.50, brand: "Essentials" },
    "spaghetti": { size: 500, unit: "g", price: 1.50, brand: "Essentials" },
    
    // Vegetables (fresh approximate)
    "onion": { size: 1, unit: "each", price: 0.80, brand: "Fresh" },
    "brown onion": { size: 1, unit: "each", price: 0.80, brand: "Fresh" },
    "garlic": { size: 1, unit: "bulb", price: 1.20, brand: "Fresh" },
    "carrot": { size: 1, unit: "each", price: 0.40, brand: "Fresh" },
    "potato": { size: 1, unit: "kg", price: 3.50, brand: "Fresh" },
    "sweet potato": { size: 1, unit: "kg", price: 4.50, brand: "Fresh" },
    
    // Frozen
    "frozen peas": { size: 1000, unit: "g", price: 3.80, brand: "Woolworths" },
    "frozen corn": { size: 1000, unit: "g", price: 4.50, brand: "Woolworths" },
    "mixed vegetables": { size: 500, unit: "g", price: 5.00, brand: "Woolworths" },
    
    // Meat (approximate)
    "chicken breast": { size: 1000, unit: "g", price: 10.00, brand: "Woolworths RSPCA" },
    "chicken thigh": { size: 1000, unit: "g", price: 15.50, brand: "Woolworths" },
    "beef mince": { size: 1000, unit: "g", price: 12.00, brand: "Woolworths" },
    "pork mince": { size: 1000, unit: "g", price: 10.00, brand: "Woolworths" },
    "bacon": { size: 200, unit: "g", price: 5.00, brand: "Woolworths" },
    
    // Drinks
    "tea bags": { size: 100, unit: "bags", price: 6.75, brand: "Twinings" },
    "green tea": { size: 100, unit: "bags", price: 6.75, brand: "Twinings" },
    "milo": { size: 1000, unit: "g", price: 11.50, brand: "Milo" }
};

// Initialize price database
function initPriceDatabase() {
    const saved = localStorage.getItem(PRICE_STORAGE_KEY);
    if (!saved) {
        localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify(DEFAULT_PRICES));
        localStorage.setItem(PRICE_DISCLAIMER_KEY, new Date().toISOString());
    }
}

function getPriceDatabase() {
    initPriceDatabase();
    return JSON.parse(localStorage.getItem(PRICE_STORAGE_KEY) || '{}');
}

function updatePrice(itemName, size, unit, price) {
    const db = getPriceDatabase();
    const key = itemName.toLowerCase().trim();
    db[key] = {
        size: parseFloat(size),
        unit: unit,
        price: parseFloat(price),
        brand: db[key]?.brand || "User updated",
        userUpdated: new Date().toISOString().split('T')[0]
    };
    localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify(db));
    localStorage.setItem(PRICE_DISCLAIMER_KEY, new Date().toISOString());
}

function showShoppingList(recipe) {
    const modal = document.getElementById('shopping-modal');
    const contentDiv = document.getElementById('shopping-list-content');
    
    if (!modal || !contentDiv) return;
    
    const shoppingData = generateShoppingList(recipe);
    
    let html = `
        <div class="price-disclaimer">
            ⚠️ <strong>Prices are estimates</strong> based on last recorded purchases.
            Actual prices vary by store, season, and location.
            <br><small>Last updated: ${shoppingData.lastUpdated || 'Never'}</small>
        </div>
        
        <div class="shopping-total">
            <span class="total-label">Estimated Total:</span>
            <span class="total-amount">$${shoppingData.totalEstimatedCost}</span>
        </div>
    `;
    
    if (shoppingData.missingPrices.length > 0) {
        html += `
            <div class="missing-prices-warning">
                <strong>⚠️ Missing price data for:</strong> ${shoppingData.missingPrices.join(', ')}<br>
                <small>Click the edit button to add prices for these ingredients.</small>
            </div>
        `;
    }
    
    html += `<div class="shopping-items-list">`;
    
    shoppingData.items.forEach(item => {
        if (item.needsPrice) {
            html += `
                <div class="shopping-item missing-price">
                    <div class="item-name">${escapeHtml(item.item)}</div>
                    <div class="item-needed">Needs: ${item.needed}</div>
                    <div class="item-cost">Price: <span class="price-unknown">Unknown</span></div>
                    <button class="edit-price-btn" onclick="editPriceFromModal('${escapeHtml(item.item)}', this)">✏️ Edit Price</button>
                </div>
            `;
        } else {
            html += `
                <div class="shopping-item">
                    <div class="item-name">${escapeHtml(item.item)}</div>
                    <div class="item-needed">Needs: ${item.needed}</div>
                    <div class="item-package">Buy: ${item.packagesNeeded} × ${item.packageSize} @ $${item.packagePrice}</div>
                    <div class="item-cost">Cost: <strong>$${item.cost}</strong></div>
                    <div class="item-leftover">Leftover: ${item.leftoverDisplay}</div>
                    <button class="edit-price-btn" onclick="editPriceFromModal('${escapeHtml(item.item)}', this)">✏️ Edit Price</button>
                </div>
            `;
        }
    });
    
    html += `</div>`;
    
    contentDiv.innerHTML = html;
    modal.style.display = 'flex';
}

function generateShoppingList(recipe) {
    const ingredients = recipe.ingredients || [];
    const priceDB = getPriceDatabase();
    
    const items = [];
    let totalEstimatedCost = 0;
    const missingPrices = [];
    let totalIngredientsFound = 0;
    
    ingredients.forEach(ing => {
        if (ing.heading || ing.toTaste) return;
        
        const itemKey = ing.item.toLowerCase().trim();
        const priceInfo = priceDB[itemKey];
        const neededQty = parseFloat(ing.quantity) || 0;
        const unit = (ing.unit || '').toLowerCase();
        
        if (!priceInfo || !priceInfo.price) {
            missingPrices.push(ing.item);
            items.push({
                item: ing.item,
                needed: formatQuantity(neededQty, unit),
                needsPrice: true
            });
            return;
        }
        
        totalIngredientsFound++;
        
        // Convert needed amount to match package unit
        let neededInPackageUnits = neededQty;
        let leftoverInOriginalUnits = 0;
        
        if (unit === 'g' && priceInfo.unit === 'kg') {
            neededInPackageUnits = neededQty / 1000;
        } else if (unit === 'ml' && priceInfo.unit === 'l') {
            neededInPackageUnits = neededQty / 1000;
        } else if (unit === 'each' && priceInfo.unit === 'each') {
            neededInPackageUnits = neededQty;
        } else if (unit === 'g' && priceInfo.unit === 'g') {
            neededInPackageUnits = neededQty;
        } else if (unit === 'ml' && priceInfo.unit === 'ml') {
            neededInPackageUnits = neededQty;
        }
        
        const packagesNeeded = Math.ceil(neededInPackageUnits / priceInfo.size);
        const itemCost = packagesNeeded * priceInfo.price;
        totalEstimatedCost += itemCost;
        
        // Calculate leftover in user-friendly format
        const leftoverAmount = (packagesNeeded * priceInfo.size) - neededInPackageUnits;
        let leftoverDisplay = '';
        if (leftoverAmount > 0) {
            if (priceInfo.unit === 'g' && leftoverAmount > 1000) {
                leftoverDisplay = `${(leftoverAmount / 1000).toFixed(1)}kg left`;
            } else if (priceInfo.unit === 'ml' && leftoverAmount > 1000) {
                leftoverDisplay = `${(leftoverAmount / 1000).toFixed(1)}L left`;
            } else {
                leftoverDisplay = `${leftoverAmount.toFixed(0)}${priceInfo.unit} left`;
            }
        } else {
            leftoverDisplay = 'Exactly what you need';
        }
        
        items.push({
            item: ing.item,
            needed: formatQuantity(neededQty, unit),
            packagesNeeded,
            packageSize: `${priceInfo.size}${priceInfo.unit}`,
            packagePrice: priceInfo.price.toFixed(2),
            cost: itemCost.toFixed(2),
            leftoverAmount,
            leftoverDisplay,
            brand: priceInfo.brand
        });
    });
    
    return {
        items,
        totalEstimatedCost: totalEstimatedCost.toFixed(2),
        missingPrices,
        coverage: Math.round((totalIngredientsFound / (ingredients.filter(i => !i.heading && !i.toTaste).length)) * 100) || 0,
        lastUpdated: localStorage.getItem(PRICE_DISCLAIMER_KEY)?.split('T')[0] || 'Never'
    };
}

function formatQuantity(qty, unit) {
    if (!qty) return '';
    if (unit === 'g') return `${qty}g`;
    if (unit === 'kg') return `${qty}kg`;
    if (unit === 'ml') return `${qty}ml`;
    if (unit === 'l') return `${qty}L`;
    if (unit === 'tsp') return `${qty} tsp`;
    if (unit === 'tbsp') return `${qty} tbsp`;
    if (unit === 'cup') return `${qty} cup${qty !== 1 ? 's' : ''}`;
    if (unit === 'each' || !unit) return `${qty}`;
    return `${qty} ${unit}`;
}

function editPriceFromModal(itemName, btnElement) {
    const db = getPriceDatabase();
    const key = itemName.toLowerCase().trim();
    const existing = db[key] || { size: '', unit: 'g', price: '' };
    
    // Create inline edit form
    const itemDiv = btnElement.closest('.shopping-item');
    const originalContent = itemDiv.innerHTML;
    
    itemDiv.innerHTML = `
        <div class="price-edit-form">
            <div class="edit-field">
                <label>Package Size</label>
                <input type="number" id="edit-size" value="${existing.size}" step="any" placeholder="e.g. 500">
            </div>
            <div class="edit-field">
                <label>Unit</label>
                <select id="edit-unit">
                    <option value="g" ${existing.unit === 'g' ? 'selected' : ''}>grams (g)</option>
                    <option value="kg" ${existing.unit === 'kg' ? 'selected' : ''}>kilograms (kg)</option>
                    <option value="ml" ${existing.unit === 'ml' ? 'selected' : ''}>milliliters (ml)</option>
                    <option value="l" ${existing.unit === 'l' ? 'selected' : ''}>liters (L)</option>
                    <option value="each" ${existing.unit === 'each' ? 'selected' : ''}>each</option>
                </select>
            </div>
            <div class="edit-field">
                <label>Price ($AUD)</label>
                <input type="number" id="edit-price" value="${existing.price}" step="0.01" placeholder="e.g. 4.50">
            </div>
            <div class="edit-actions">
                <button class="save-price-btn" onclick="savePriceAndRefresh('${itemName.replace(/'/g, "\\'")}')">Save</button>
                <button class="cancel-edit-btn" onclick="this.closest('.shopping-item').innerHTML = \`${originalContent.replace(/`/g, '\\`')}\`">Cancel</button>
            </div>
        </div>
    `;
}

function savePriceAndRefresh(itemName) {
    const size = document.getElementById('edit-size')?.value;
    const unit = document.getElementById('edit-unit')?.value;
    const price = document.getElementById('edit-price')?.value;
    
    if (!size || !price) {
        alert('Please fill in all fields');
        return;
    }
    
    updatePrice(itemName, size, unit, price);
    
    // Refresh the shopping list with current recipe
    const recipeContainer = document.getElementById('recipe-container');
    if (recipeContainer && window.currentRecipe) {
        showShoppingList(window.currentRecipe);
    }
}

function closeShoppingModal() {
    const modal = document.getElementById('shopping-modal');
    if (modal) modal.style.display = 'none';
}

function printShoppingList() {
    const content = document.getElementById('shopping-list-content')?.innerHTML;
    if (!content) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Shopping List</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .shopping-item { border-bottom: 1px solid #ccc; padding: 10px 0; margin-bottom: 10px; }
                .item-name { font-weight: bold; font-size: 1.1em; }
                .item-cost { margin-top: 5px; color: #2c5f2d; }
                .shopping-total { font-size: 1.2em; font-weight: bold; margin: 20px 0; padding: 10px; background: #f0f0f0; }
                .price-disclaimer { background: #fff3cd; padding: 10px; margin-bottom: 20px; border: 1px solid #ffecb5; }
                .missing-prices-warning { background: #f8d7da; padding: 10px; margin-bottom: 20px; border: 1px solid #f5c6cb; }
                @media print {
                    .edit-price-btn { display: none; }
                }
            </style>
        </head>
        <body>
            ${content}
            <p style="margin-top: 30px; font-size: 0.8em; color: #666;">Generated from AJPC Kitchen Notebook</p>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
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

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('shopping-modal');
    if (modal && modal.style.display === 'flex') {
        if (e.target === modal) {
            closeShoppingModal();
        }
    }
});

// Initialize on page load
initPriceDatabase();