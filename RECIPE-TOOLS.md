# Recipe Maintenance Tools

Three Node.js scripts for keeping the recipe collection clean and consistent.
Run from the project root.

---

## audit-recipes.js

**What it does:** Scans all 127 recipes and reports problems without changing anything.

**Run it:**
```
node audit-recipes.js
```

**Checks for:**
- Emoji anywhere in any field
- Deprecated `"emoji"` field still present
- Missing required fields (`id`, `title`, `category`, `description`)
- Recipe `id` doesn't match its filename
- Method steps with no instruction text
- Invalid JSON
- Missing `difficulty` field
- Missing `lastModified` field
- Ingredients with no quantity or unit
- Related recipe IDs pointing to recipes that don't exist
- Nutrition block missing key fields
- Tags not in `official-tag-vocabulary.json`

**When to run:** After adding or editing any recipe. Aim for `Clean: 127, Has issues: 0`.

---

## fix-recipes.js

**What it does:** Automatically fixes the four most common hard errors across all recipes in one pass. Creates a dated backup before touching anything.

**Run it:**
```
node fix-recipes.js
```

**Fixes:**
- Removes the deprecated `"emoji"` field
- Sets `recipe.id` to match its filename (the filename is always correct)
- Adds `lastModified` with today's date if missing
- Removes `related` recipe entries pointing to IDs not in the index

**After running:** Regenerate the recipe index, then run `audit-recipes.js` to confirm.

**Backup:** Creates `data/recipes/_backup_YYYYMMDD/` automatically before making any changes. Safe to run at any time.

---

## fix-tags.js

**What it does:** Updates `official-tag-vocabulary.json` with new tags and fixes tag spelling/spacing errors in recipes.

**Run it:**
```
node fix-tags.js
```

**Fixes:**
- Adds new legitimate tags to the vocabulary file
- Corrects misspelled or wrongly spaced tags in recipes (e.g. `"Gluten Free"` → `"Gluten-Free"`)
- Removes tags that are too niche for the vocabulary

**When to run:** After `audit-recipes.js` reports unofficial tag warnings, or when adding new tag categories to the vocabulary.

**After running:** Always run `audit-recipes.js` to verify.

---

## Recommended workflow when adding a new recipe

1. Build the recipe in `recipe-builder.html` and save the JSON to `data/recipes/`
2. Run `node rebuild-index.js` to update the recipe index
3. Run `node audit-recipes.js` to check for issues
4. Fix any hard errors manually or via `node fix-recipes.js`
5. Fix any unofficial tag warnings manually or via `node fix-tags.js`
6. Run `node audit-recipes.js` one final time — aim for clean

---

*These scripts require Node.js. Run all commands from the project root.*
