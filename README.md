# AJPC Kitchen Notebook

A personal recipe website for Ana & John's kitchen. 114 recipes across bread, pastry, baking, dinner, sauces, Filipino cooking, and desserts — written down so they don't get lost.

---

## Structure

```
ajpc/
├── index.html                  # Homepage
├── recipe.html                 # Dynamic recipe viewer (?id=recipeid)
├── search.html                 # Full-text recipe search
├── gallery.html                # Kitchen photo gallery
├── recipe-builder.html         # Recipe JSON builder tool
├── culinaryterms.html          # Culinary terms reference
├── measurement.html            # Measurement conversion tables
├── ingredient_directory.html   # Ingredient glossary (169 entries)
├── breadtips.html
├── cheesesaucetips.html
├── tangzhongguide.html
├── gelatin-blooming-guide.html
├── friandstory.html
├── 404.html
│
├── css/
│   └── main.css                # Single consolidated stylesheet
│
├── js/
│   ├── nav-loader.js           # Navigation, search dropdown, dark mode, scroll
│   ├── recipe-renderer.js      # Loads and renders recipe JSON dynamically
│   ├── featured-recipes-rotator.js  # Weekly rotating featured recipes
│   ├── kitchen-truths-animator.js   # Homepage quote rotator
│   └── search.js               # Full-text search against recipe index
│
├── components/
│   └── nav.html                # Navigation HTML (loaded by nav-loader.js)
│
├── data/
│   └── recipes/                # 114 individual recipe JSON files
│       └── *.json
│
├── json/
│   ├── recipe-index.json           # Master index of all recipes
│   ├── ingredient_inventory_v6.json # 169-entry ingredient glossary
│   ├── official-tag-vocabulary.json
│   └── reference-index.json
│
└── assets/
    └── images/                 # Gallery and recipe images
```

---

## How Recipes Work

Each recipe is a standalone JSON file in `data/recipes/`. The recipe page (`recipe.html`) reads the `?id=` URL parameter and fetches the matching JSON file dynamically — no build step required.

### Recipe JSON structure

```json
{
  "id": "recipeid",
  "title": "Recipe Title",
  "category": "Dinner",
  "description": "Short description.",
  "prepTime": "15 min",
  "cookTime": "30 min",
  "totalTime": "45 min",
  "servings": "4",
  "difficulty": "Easy",
  "tags": ["Tag1", "Tag2"],
  "ingredients": [
    { "quantity": "500", "unit": "g", "item": "Ingredient Name" }
  ],
  "method": [
    { "step": 1, "instruction": "Do the thing." }
  ],
  "notes": [
    { "type": "tip", "title": "Note Title", "content": "Note content." }
  ],
  "related": [
    { "id": "relatedid", "title": "Related Recipe" }
  ]
}
```

Ingredient headings (to group sections within an ingredient list) use `{ "heading": "Section Name" }`. Method headings use `{ "heading": "Section Name" }`.

### Adding a new recipe

1. Create `data/recipes/yourrecipeid.json` following the structure above.
2. Add an entry to `json/recipe-index.json`:

```json
{
  "id": "yourrecipeid",
  "title": "Your Recipe Title",
  "category": "Category",
  "description": "Short description.",
  "tags": ["Tag1", "Tag2"]
}
```

3. The recipe is immediately accessible at `recipe.html?id=yourrecipeid` and will appear in search results.

---

## Features

- **Live search** — searches title, category, tags, and description across all 114 recipes. Available in the nav dropdown and on the dedicated search page.
- **Ingredient scaler** — multiply ingredient quantities up to 20x with text-fraction display (1/4, 1/2, 3/4).
- **Cook mode** — hides the toolbar for distraction-free cooking.
- **Shopping list** — generates and downloads a plain-text shopping list from the recipe's ingredients.
- **Dark / light mode** — toggles via the nav button, persisted in `localStorage`.
- **Print layout** — two-column print view (ingredients left, method right) designed to fit most recipes on a single A4 page at 100% scale with no manual adjustment.
- **Weekly featured recipes** — three recipes rotate each Monday using a seeded shuffle from the recipe index.
- **Ingredient directory** — filterable A–Z glossary of 169 ingredients with storage notes, substitutes, and categories.

---

## Running Locally

The site uses `fetch()` to load recipe JSON and the nav component, so it needs to be served over HTTP rather than opened directly as a file.

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .
```

Then open `http://localhost:8000`.

---

## Design

- **Palette:** Charcoal (`#16161a`), cream (`#f0ebe2`), copper (`#c97d3e`)
- **Fonts:** DM Serif Display (headings) + DM Sans (body) via Google Fonts
- **CSS:** Single file, CSS custom properties throughout, light mode via `.light-mode` class on `body`
- **No framework, no build step** — vanilla HTML, CSS, and JavaScript only

---

## Measurements

All recipes use **grams and millilitres** for accuracy. Spoon measures are provided where grams are impractical but weight equivalents are noted where relevant.

---

*Ana & John's Kitchen Notebook — Sydney, Australia*
