
# The Kitchen Notebook

A personal recipe collection and kitchen utility, built to run entirely as static files with no backend. It ships with over 110 kitchen-tested recipes spanning bread, pastry, baking, dinner, sauces, Filipino heritage cooking, and desserts as example content — fork it, swap in your own recipes, and it's ready to go.

---

## Directory Structure
ajpc/
├── index.html # Homepage with weekly rotating features
├── recipe.html # Dynamic recipe viewer (?id=recipeid)
├── search.html # Full-text and ingredient-based search
├── gallery.html # Visual index of completed bakes
├── recipe-builder.html # Utility to build valid recipe JSON
├── culinaryterms.html # Glossary of technical culinary terms
├── measurement.html # Measurement and oven temp conversion tables
├── ingredient_directory.html # Ingredient directory (approx. 170 entries)
├── breadtips.html # Reference guide for soft bread baking
├── cheesesaucetips.html # Guide to smooth, split-free cheese sauces
├── tangzhongguide.html # Technical guide to water roux lamination
├── gelatin-blooming-guide.html # Guide to smooth, cold-set gelatine desserts
├── friandstory.html # Narrative on resilience in the kitchen
├── 404.html # Missing page fallback
│
├── css/
│ └── main.css # Centralised site-wide stylesheet
│
├── js/
│ ├── nav-loader.js # Navigation loading, dynamic header, and dark mode toggling
│ ├── recipe-renderer.js # Decodes and renders recipe JSON files
│ ├── featured-recipes-rotator.js # Weekly seeded rotating recipe selector
│ ├── kitchen-truths-animator.js # Dynamic home quotes animator
│ └── search.js # Multi-parameter search logic
│
├── components/
│ └── nav.html # Shared navigation menu markup
│
├── data/
│ └── recipes/ # Individual flat-file recipe JSON documents
│ └── *.json
│
├── json/
│ ├── recipe-index.json # Master dynamic index of all recipes
│ ├── ingredient_inventory_v7.json # Database of ingredient notes and substitutes
│ ├── official-tag-vocabulary.json # Controlled tags for recipe categorisation
│ └── reference-index.json # Technical reference indexing
│
└── assets/
└── images/ # Gallery photographs and media assets
code
Code
---

## How Recipes Work

The site does not rely on databases, static site generators, or build pipelines. Each recipe is defined as a standalone JSON file within `data/recipes/`. 

When a user visits `recipe.html?id=recipeid`, client-side JavaScript (`recipe-renderer.js`) reads the URL query parameter, fetches the corresponding JSON file, and populates the layout.

### Recipe JSON Schema

```json
{
  "id": "your-recipe-id",
  "title": "Recipe Title",
  "category": "Dinner",
  "description": "Short description of the dish.",
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
    { "step": 1, "instruction": "Step-by-step instruction." }
  ],
  "notes": [
    { "type": "tip", "title": "Note Title", "content": "Note details." }
  ],
  "related": [
    { "id": "relatedid", "title": "Related Recipe" }
  ]
}
Section Headers: To group items within ingredients or method steps, use { "heading": "Section Name" } instead of an ingredient object.
Adding a New Recipe
Write a valid JSON file following the schema and save it to data/recipes/your-recipe-id.json.
Add a reference block to the master index in json/recipe-index.json:
code
JSON
{
  "id": "your-recipe-id",
  "title": "Your Recipe Title",
  "category": "Category",
  "description": "Short description of the dish.",
  "tags": ["Tag1", "Tag2"]
}
The recipe will immediately become discoverable via search and viewable at recipe.html?id=your-recipe-id.
Technical Features
Advanced Search Engine: Supports standard text queries, category filtering, tag filtering, and dynamic multi-ingredient matching (comma-separated, e.g. chicken, cream, mushrooms).
Dynamic Scaling: Real-time quantity calculator scales ingredients up to 20×, converting decimals to clean fractions (e.g., 0.25 to 1/4) for ease of reading in the kitchen.
Plain-Text Shopping Lists: Generates structured shopping lists from the ingredient checklist for plain-text download.
Print Optimisation: Print stylesheet rules format recipes into a clean, two-column layout (ingredients on the left, method on the right) structured to fit on a standard A4 page.
Weekly Rotation: Three recipes are selected every Monday using a deterministic, date-seeded shuffle of the recipe index.
Bulk Printing Utility: The print-all.html page scans the recipe index and compiles all entries into a structured queue for bulk printing, ensuring clean page-breaks between recipes.
Index Rebuilder Tool: An administrative page (rebuild-index.html) leverages the File System Access API to scan local recipe directories and rebuild recipe-index.json directly from the browser.
Running Locally
Because the system uses asynchronous network requests (fetch()) to load content dynamically, pages cannot be opened directly from the local file system (file://). The project must be served over HTTP.
Python
code
Bash
python3 -m http.server 8000
Node.js
code
Bash
npx serve .
Once running, navigate to http://localhost:8000 in your web browser.
Design and Typography
Palette: Charcoal (#16161a), Cream (#f0ebe2), and Copper (#c97d3e).
Typography: Editorial headlines are styled in DM Serif Display, with highly legible body text set in DM Sans (served via Google Fonts).
Light/Dark Mode: Dynamic theme shifting using a .light-mode body class, with preferences persisted in the browser's localStorage.
Measurements
To maintain consistency and accuracy:
All weights are defined in grams (g) or kilograms (kg).
All liquids are measured in millilitres (ml) or litres (L).
Standard Australian spoon measurements are noted where weights are impractical (e.g., a standard tablespoon is equivalent to 20 ml in Australian kitchen standards).
The Kitchen Notebook