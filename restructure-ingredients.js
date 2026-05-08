// restructure-ingredients.js
// Run with: node restructure-ingredients.js

const fs = require('fs');

// Load the original file
const rawData = fs.readFileSync('json/ingredient_inventory_v6.json', 'utf8');
const ingredients = JSON.parse(rawData);

const structured = {};

for (const [name, data] of Object.entries(ingredients)) {
    const notes = data.notes || '';
    
    // Extract sections using regex patterns
    let storage = '';
    let substitutes = '';
    let usageTips = '';
    let remainingNotes = notes;
    
    // Extract Storage (patterns: "Store in", "Storage:", "Keep in")
    const storageMatch = notes.match(/Store in[^.]*\.|Storage:[^.]*\.|Keep in[^.]*\.|Avoid exposure[^.]*\./i);
    if (storageMatch) {
        storage = storageMatch[0].trim();
        remainingNotes = remainingNotes.replace(storageMatch[0], '');
    }
    
    // Extract Substitutes (patterns: "Can be substituted", "Substitute:", "Substitution")
    const subMatch = notes.match(/Can be substituted[^.]*\.|Substitute:[^.]*\.|Substitution:[^.]*\./i);
    if (subMatch) {
        substitutes = subMatch[0].trim();
        remainingNotes = remainingNotes.replace(subMatch[0], '');
    }
    
    // Extract Usage Tips (patterns: "Use sparingly", "Usage:", "Usage Tips:", "Commonly used")
    const usageMatch = notes.match(/Use sparingly[^.]*\.|Usage:[^.]*\.|Usage Tips:[^.]*\.|Commonly used[^.]*\./i);
    if (usageMatch) {
        usageTips = usageMatch[0].trim();
        remainingNotes = remainingNotes.replace(usageMatch[0], '');
    }
    
    // Clean up remaining notes (remove extra spaces, multiple periods)
    remainingNotes = remainingNotes.replace(/\s+/g, ' ').trim();
    
    // Build structured object
    structured[name] = {
        aka: data.aka || [],
        category: data.category || '',
        notes: remainingNotes || '',
        purpose: data.purpose || '',
        usedIn: data.usedIn || []
    };
    
    // Add extracted fields if they exist
    if (storage) structured[name].storage = storage;
    if (substitutes) structured[name].substitutes = substitutes;
    if (usageTips) structured[name].usageTips = usageTips;
    if (data.nutrition) structured[name].nutrition = data.nutrition;
}

// Save the new structured file
fs.writeFileSync('json/ingredient_inventory_v7.json', JSON.stringify(structured, null, 2), 'utf8');

console.log('✅ Done! Created ingredient_inventory_v7.json');
console.log(`📊 Processed ${Object.keys(structured).length} ingredients`);