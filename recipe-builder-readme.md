Recipe Builder — Documentation
The Recipe Builder (recipe-builder.html) is a standalone tool for creating, editing, and importing recipe JSON files for the AJPC Kitchen Notebook. It runs entirely in the browser with no server dependencies (except for the optional recipe-api-server.py for direct server saves).

Table of Contents
Browser Compatibility

Opening & Saving Files

Form Fields

Ingredients

Method Steps

Notes & Tips

Recipe Journal

Related Recipes

JSON Output Structure

Importing Recipes

Cooking Timeline Generator

Nutrition Calculator

Nav Snippet

Keyboard Shortcuts

LocalStorage & Autocomplete

API Server (Optional)

Browser Compatibility
Feature	Chrome / Edge	Firefox	Safari
All editing features	✅	✅	✅
File System Access API (Open/Save directly)	✅	❌	❌
Fallback file picker (Load/Download)	✅	✅	✅
PDF Import (PDF.js)	✅	✅	✅
DOCX Import (Mammoth.js)	✅	✅	✅
On Firefox and Safari, the "Save" button falls back to downloading the file. You can still use "Load JSON" to open files via the standard file picker.

Opening & Saving Files
Open a file
Click "Load JSON" — opens the system file picker. Works in all browsers.

The form populates with all recipe data. The filename appears in the header.

Save a file
Chrome/Edge: Clicking "Save" writes directly back to the original file using the File System Access API. No download prompt.

Firefox/Safari: Clicking "Save" falls back to downloading the file.

"Save As..." — always downloads a new copy regardless of browser.

Duplicate
"Duplicate" button creates a copy of the current recipe with "(Copy)" appended to the title. Useful for creating variations.

Form Fields
Basic Info
Field	Description
Recipe Title	Required. Used to auto-generate the recipe id (lowercase, no special chars, no spaces).
Emoji	Click the emoji picker to choose an icon for the recipe. Appears in the nav and search results.
Category	Must match one of: Breads, Baking, Biscuits, Entree, Dinner, Mains, Filipino, Desserts, Sauces, Pasta, Pizza, Soups, Salads, Sides, Snacks, Breakfast, Other. Controls which nav dropdown the recipe appears in.
Difficulty	Beginner, Intermediate, or Advanced.
Description	Short evocative description. Use the "¶ Break" button to insert paragraph breaks.
Time & Servings
Field	Example
Prep Time	15 min
Cook Time	30 min
Total Time	45 min (or 1 hr 15 min)
Servings	4 (or 8-10 slices)
Tags
Type a tag and press Enter or comma to add it. Press Backspace in an empty field to remove the last tag.

Tags should come from the official tag vocabulary for consistency. The tag picker in the Related Recipes section uses this vocabulary.

Ingredients
Adding ingredients
Each ingredient row has four fields:

Quantity — number or fraction (e.g., 1, 1/2, 2.5)

Unit — g, ml, tbsp, tsp, cup, each, etc.

Item — the ingredient name

Notes — optional (e.g., softened, chopped, optional)

Ingredient headings
Use headings to group ingredients into sections (e.g., "For the Base", "For the Filling", "Topping").

Drag to reorder
All ingredient rows and headings are draggable. Grab the ⋮⋮ handle to reorder.

Keyboard shortcuts
Enter in Quantity → jumps to Unit

Enter in Unit → jumps to Item

Enter in Item → selects autocomplete suggestion or jumps to Notes

Enter in Notes → adds a new ingredient row

Esc in Item → closes autocomplete dropdown

Autocomplete
As you type ingredient names, the builder suggests previously-used ingredients from all recipes you've saved (stored in localStorage under ingredientLibrary). Each suggestion shows how many times you've used that ingredient.

Method Steps
Adding steps
Each step has a numbered text area. Type your instruction.

Method headings
Use headings to break the method into sections (e.g., "Make the Sauce", "Assemble", "To Serve").

Keyboard shortcuts
Enter — adds a new step below

Shift + Enter — inserts a new line within the current step

Enter on a heading — commits the heading and adds a regular step below

Notes & Tips
Note types
Type	When to use
Acknowledgement	Credit the original recipe source
Serving	How to serve, garnish, pair
Technique	Specific technique explanation
Storage	How to store, freeze, reheat
Substitution	Ingredient swaps and alternatives
Variation	Different ways to make the recipe
Tip	General cooking tip
Each note has a title and content field. Notes are draggable to reorder.

Recipe Journal
A chronological log of experiments, tweaks, and observations. Each entry has:

Date — defaults to today

Content — freeform notes about what you tried and how it turned out

Entries are draggable to reorder.

Related Recipes
Manually curate links to other recipes in the notebook. Each related recipe can have matching tags to explain the relationship (e.g., "uses same dough", "variation of").

Adding tags to related recipes
Click "+ Add Tags" to open the tag picker modal. You can:

Browse all official tags organised by category

Search tags by name

Copy all tags from another recipe using the "Copy tags from" dropdown

JSON Output Structure
The builder outputs this JSON structure:

json
{
  "id": "recipeid",
  "title": "Recipe Title",
  "emoji": "🍰",
  "category": "Desserts",
  "description": "A short description of the recipe.",
  "prepTime": "15 min",
  "cookTime": "30 min",
  "totalTime": "45 min",
  "servings": "4",
  "difficulty": "Intermediate",
  "tags": ["Tag1", "Tag2"],
  "ingredients": [
    { "heading": "For the Base" },
    { "quantity": "500", "unit": "g", "item": "Flour", "notes": "sifted" },
    { "quantity": "", "unit": "", "item": "Pinch of salt" }
  ],
  "method": [
    { "heading": "Preparation" },
    { "step": 1, "instruction": "Preheat oven to 180°C." },
    { "step": 2, "instruction": "Mix dry ingredients." }
  ],
  "notes": [
    { "type": "tip", "title": "Make Ahead", "content": "Can be prepared a day in advance." },
    { "type": "acknowledgement", "title": "Source", "content": "Adapted from..." }
  ],
  "journal": [
    { "date": "2026-01-15", "content": "First attempt — reduced sugar by 20g. Worked well." }
  ],
  "related": [
    { "id": "otherrecipe", "title": "Other Recipe", "matchingTags": ["Shared Technique"] }
  ]
}
Field rules
id is auto-generated from the title (lowercase, alphanumeric only)

Only non-empty fields are included in the output

Ingredient and method headings use { "heading": "..." } instead of numbered items

notes type must be one of: acknowledgement, serving, technique, storage, substitution, variation, tip

Importing Recipes
The builder can extract recipe data from PDF, DOCX, and HTML files.

Supported formats
PDF — uses PDF.js to extract text

DOCX/DOC — uses Mammoth.js to extract text

HTML/HTM — strips tags and preserves block-level structure

How it works
Click "Import Recipe"

Select a file

The builder extracts all text from the file

A smart parser attempts to identify: title, description, ingredients, method steps, notes, servings, and times

The form populates with the parsed data

Review and adjust — the parser is good but not perfect

Parser capabilities
Detects section headings ("Ingredients", "Method", "Directions", "Chef's Notes")

Recognises part headings ("Part 1: Sponge Cake Base")

Parses ingredient lines with quantities and units

Identifies numbered and bulleted method steps

Extracts serving and time information

Strips common junk lines (copyright notices, page numbers, etc.)

Limitations
Heavily formatted PDFs with multi-column layouts may produce garbled text

Recipe names in all-caps or unusual formatting may not be detected as the title

The parser works best with simply formatted recipe documents

If the parser fails to extract clean data, the raw text is copied to your clipboard for manual entry.

Cooking Timeline Generator
Located in the right panel below the JSON output.

How it works
Uses Prep Time and Cook Time to calculate total duration

Distributes method steps evenly across the total time

Shows a clock-time timeline starting from "now"

Displays prep phase, each method step, and serving time

Example output
text
02:30 PM  🏁 Start cooking
02:30 PM  📋 Prep ingredients (15 min)
02:45 PM  ✓ Prep complete
02:52 PM  1. Preheat oven to 180°C
03:00 PM  2. Mix dry ingredients
03:07 PM  3. Combine wet and dry
03:15 PM  🍽️ Ready to serve!
Use "🔄 Regenerate" to recalculate after editing. Use "📋 Copy" to copy the timeline to clipboard.

Nutrition Calculator
Located in the right panel below the Cooking Timeline.

How it works
Matches ingredient names against a built-in nutrition database (per 100g values)

Converts quantities to grams using standard conversion factors

Calculates totals and divides by number of servings

Shows a standard nutrition facts label format

Coverage indicator
The calculator shows what percentage of ingredients were found in the database. Higher coverage = more accurate estimates.

Limitations
The nutrition database covers common ingredients but not branded products

Volume-to-weight conversions are approximate

This is an estimate only — not a replacement for proper nutritional analysis

Nav Snippet
Located in the right panel. Shows the exact HTML link tag to add to components/nav.html so the recipe appears in the correct dropdown. Automatically updates as you fill in Title and Category.

Example output
html
<!-- Add inside the Dessert dropdown -->
<a href="recipe.html?id=tiramisu">Tiramisu Gateau</a>
Keyboard Shortcuts
Key	Context	Action
Enter	Ingredient Qty field	Move to Unit
Enter	Ingredient Unit field	Move to Item
Enter	Ingredient Item field	Select autocomplete or move to Notes
Enter	Ingredient Notes field	Add new ingredient row
Enter	Method textarea	Add new step
Shift+Enter	Method textarea	New line within step
Enter	Heading input	Commit heading, add row below
Enter	Tag input	Add tag
Backspace	Empty tag input	Remove last tag
Esc	Autocomplete dropdown	Close dropdown
LocalStorage & Autocomplete
The builder stores an ingredient library in localStorage under the key ingredientLibrary. Each time you download or save a recipe, all ingredient names are added to this library with a usage count.

The autocomplete dropdown in the ingredient Item field queries this library to suggest previously-used ingredients, sorted by frequency. This makes data entry faster the more you use the tool.

To clear the ingredient library, run this in the browser console:

javascript
localStorage.removeItem('ingredientLibrary');
API Server (Optional)
A Python API server (recipe-api-server.py) enables direct server-side saves. When running, the "Save" button writes JSON files directly to the server's data/recipes/ directory and updates the recipe index.

Starting the server
bash
python recipe-api-server.py
Ping endpoint
javascript
fetch('http://localhost:5001/ping')
Save endpoint
text
POST http://localhost:5001/save-recipe
Content-Type: application/json
Body: { recipe JSON }
If the server is not running, saving falls back to downloading the file.

Dependencies
PDF.js (CDN) — PDF text extraction for imports

Mammoth.js (CDN) — DOCX text extraction for imports

Google Fonts — Playfair Display, IBM Plex Mono, DM Sans

No other external dependencies

Documentation for AJPC Kitchen Notebook Recipe Builder — last updated May 2026
[file content end]