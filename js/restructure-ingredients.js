// restructure-ingredients.js
// Run with: node restructure-ingredients.js

const fs = require('fs');

// Load the original file
const rawData = fs.readFileSync('json/ingredient_inventory_v6.json', 'utf8');
const ingredients = JSON.parse(rawData);

const structured = {};

// Common patterns for extraction (more comprehensive)
const patterns = {
    storage: [
        /Store in[^.!?]*[.!?]/i,
        /Storage:[^.!?]*[.!?]/i,
        /Keep in[^.!?]*[.!?]/i,
        /Avoid exposure[^.!?]*[.!?]/i,
        /Refrigerate[^.!?]*[.!?]/i,
        /Freeze[^.!?]*[.!?]/i,
        /Keep away[^.!?]*[.!?]/i,
        /Store[^.!?]*(?:tightly sealed|airtight|cool dark place)[^.!?]*[.!?]/i
    ],
    substitutes: [
        /Can be substituted[^.!?]*[.!?]/i,
        /Substitute:[^.!?]*[.!?]/i,
        /Substitution:[^.!?]*[.!?]/i,
        /Swap with[^.!?]*[.!?]/i,
        /Replace with[^.!?]*[.!?]/i,
        /Alternative:[^.!?]*[.!?]/i
    ],
    usageTips: [
        /Use sparingly[^.!?]*[.!?]/i,
        /Usage:[^.!?]*[.!?]/i,
        /Usage Tips?:[^.!?]*[.!?]/i,
        /Commonly used[^.!?]*[.!?]/i,
        /Best used[^.!?]*[.!?]/i,
        /Add at the end[^.!?]*[.!?]/i,
        /Toast briefly[^.!?]*[.!?]/i,
        /Bloom in oil[^.!?]*[.!?]/i,
        /Grind fresh[^.!?]*[.!?]/i,
        /Soak before[^.!?]*[.!?]/i,
        /Rehydrate[^.!?]*[.!?]/i
    ]
};

function extractField(notes, patternList) {
    for (const pattern of patternList) {
        const match = notes.match(pattern);
        if (match) {
            return match[0].trim();
        }
    }
    return '';
}

function removeFromNotes(notes, extractedText) {
    if (!extractedText) return notes;
    return notes.replace(extractedText, '').replace(/\s+/g, ' ').trim();
}

for (const [name, data] of Object.entries(ingredients)) {
    let notes = data.notes || '';
    
    // Extract fields
    const storage = extractField(notes, patterns.storage);
    notes = removeFromNotes(notes, storage);
    
    const substitutes = extractField(notes, patterns.substitutes);
    notes = removeFromNotes(notes, substitutes);
    
    const usageTips = extractField(notes, patterns.usageTips);
    notes = removeFromNotes(notes, usageTips);
    
    // Clean up remaining notes
    notes = notes.replace(/^\s*[-•*]\s*/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    
    // Build structured object with consistent field order
    structured[name] = {
        category: data.category || '',
        aka: data.aka || [],
        purpose: data.purpose || '',
        notes: notes || '',
        usedIn: data.usedIn || []
    };
    
    // Add optional fields only if they have content
    if (storage) structured[name].storage = storage;
    if (substitutes) structured[name].substitutes = substitutes;
    if (usageTips) structured[name].usageTips = usageTips;
    if (data.nutrition) structured[name].nutrition = data.nutrition;
}

// Save the new structured file
fs.writeFileSync('json/ingredient_inventory_v7.json', JSON.stringify(structured, null, 2), 'utf8');

console.log('Done! Created ingredient_inventory_v7.json');
console.log(`Processed ${Object.keys(structured).length} ingredients`);

// Summary statistics
let storageCount = 0, subCount = 0, usageCount = 0;
for (const ing of Object.values(structured)) {
    if (ing.storage) storageCount++;
    if (ing.substitutes) subCount++;
    if (ing.usageTips) usageCount++;
}

console.log('\nExtraction stats:');
console.log(`  Storage extracted: ${storageCount} ingredients`);
console.log(`  Substitutes extracted: ${subCount} ingredients`);
console.log(`  Usage tips extracted: ${usageCount} ingredients`);