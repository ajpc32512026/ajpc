#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');
const TODAY = new Date().toISOString().split('T')[0];
const VOC   = path.join(__dirname, 'json/official-tag-vocabulary.json');
const RECIPES = path.join(__dirname, 'data/recipes');

// 1. Add Asian and Strudel to flatList if missing
const vocab = JSON.parse(fs.readFileSync(VOC, 'utf8'));
['Asian', 'Strudel'].forEach(tag => {
    if (!vocab.flatList.includes(tag)) vocab.flatList.push(tag);
});
// Asian belongs in cuisine (already there), Strudel goes in style
if (!vocab.tagVocabulary.style) vocab.tagVocabulary.style = [];
if (!vocab.tagVocabulary.style.includes('Strudel')) vocab.tagVocabulary.style.push('Strudel');
vocab.flatList.sort();
vocab.tagVocabulary.style.sort();
vocab.notes.totalTags = vocab.flatList.length;
vocab.notes.lastUpdated = TODAY;
fs.writeFileSync(VOC, JSON.stringify(vocab, null, 2) + '\n', 'utf8');
console.log('Vocabulary patched — run node audit-recipes.js to confirm.');
