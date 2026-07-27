# Contributing to The Kitchen Notebook

Thanks for taking an interest in this project. It grew organically over several months to solve one home kitchen's problems, so there are almost certainly rough edges — bug reports, fixes, and improvements are genuinely welcome.

This is a plain static site: HTML, CSS, and vanilla JavaScript, no build step, no framework, no backend. That's intentional — keep contributions in that spirit.

---

## Ways to Contribute

- **Report a bug** — open an [Issue](../../issues) describing what happened, what you expected, and the page/browser it happened on.
- **Suggest a feature** — open an Issue first before writing code, so we can talk it through before you spend time on it.
- **Fix something** — fork the repo, make your change, open a Pull Request.
- **Add or improve a recipe** — see [Adding a Recipe](#adding-a-recipe) below.

---

## Getting Set Up Locally

The site uses `fetch()` to load JSON and nav components, so it needs to be served over HTTP — opening the HTML files directly (`file://`) will not work correctly.

Any static server works. For example:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .
```

Then visit `http://localhost:8000`.

---

## Project Conventions

Please keep pull requests consistent with the existing codebase:

- **No CSS inside `.js` files.** Styling belongs in `css/`. If a script needs to generate markup (e.g. a popup window), link to a stylesheet rather than embedding a `<style>` block or `.cssText`.
- **Recipe and ingredient IDs are lowercase, no spaces, no hyphens** — e.g. `tiramisu`, `sweetchillisauce`, `mockcreamtraditionalmethod`. This matches `data/recipes/*.json` filenames and the `id` field in `json/recipe-index.json`. (Note: the schema example further down in the main README shows a hyphenated `your-recipe-id` — that's a leftover inconsistency, not the actual convention. Follow the real recipe files, not that example.)
- **Ingredient quantities use metric units** — grams (`g`) and millilitres (`ml`), even for small amounts like a `1/4 tsp`-style measure. Keep this consistent across any recipe or nutrition data you add.
- **Tags should come from the controlled vocabulary** in `json/official-tag-vocabulary.json`. If a tag you need doesn't exist yet, add it there too rather than inventing a one-off tag that only your recipe uses.
- **Validate JSON before committing.** A single malformed recipe file or index entry can break search, the sitemap, or the gallery for the whole site. Run it through any JSON validator, or:
  ```bash
  python3 -c "import json; json.load(open('data/recipes/your-recipe.json'))"
  ```
- **Check JS syntax before committing:**
  ```bash
  node --check js/your-file.js
  ```

---

## Adding a Recipe

1. Use `recipe-builder.html` (the in-browser recipe builder tool) to create and export a recipe JSON, or write one by hand following the schema documented in the main [README](README.md#recipe-json-schema).
2. Save it to `data/recipes/your-recipe-id.json`.
3. Add a matching entry to `json/recipe-index.json` (id, title, category, description, tags) — this is what makes the recipe searchable and visible in the gallery, tags page, and sitemap. A recipe with a data file but no index entry is effectively invisible; a recipe indexed with no matching data file will 404. Keep the two in sync.
4. If you use any ingredients not already in `data/nutrition-db.json`, either add them there or leave the nutrition panel to degrade gracefully — don't fabricate nutrition numbers.

---

## Nutrition Data

`data/nutrition-db.json` is derived from FSANZ's AUSNUT 2023 dataset and carries its own attribution/licence requirements, separate from this repo's MIT license — see [README § Where the Nutrition Data Comes From](README.md#where-the-nutrition-data-comes-from) before modifying or redistributing that file specifically.

---

## Pull Request Checklist

Before opening a PR:

- [ ] JSON files you touched are valid
- [ ] JS files you touched pass `node --check`
- [ ] No CSS embedded in `.js` files
- [ ] Recipe IDs match the existing lowercase/no-hyphen convention
- [ ] `recipe-index.json` and `data/recipes/*.json` are kept in sync if you added/changed a recipe
- [ ] You tested the change in an actual browser via a local server, not just read the code

Small, focused PRs are easier to review than large ones — if you're planning something big, open an Issue first to discuss the approach.

Thanks for contributing.
