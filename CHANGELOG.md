# Changelog

All notable changes to this project are documented here.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## 2026-08-23

### Added
- **Food Additives Database** — Composed a comprehensive database (`food-function.json`) containing chemical classes, primary purposes, typical food groups, and background safety notes for 85+ of the most common commercial additives.
- **Australian Products Additives Index** — Built an optimized local product database (`australian-products-additives.json`) containing retail food products sold in Australia and their associated additive ingredients lists.
- **Off-line Large Dataset Processor** — Created a stream-based Python extraction tool (`extract_additives.py`) to safely process the 12.7 GB Open Food Facts global database and compress it into a lightweight localized JSON index without consuming excessive RAM.
- **Directory Organizer Utility** — Designed a migration script (`organize-scripts.js`) to clean the project root directory and relocate all command-line utilities into a dedicated `scripts/` folder, featuring automated relative path patching and a `--undo` rollback flag.

### Changed
- **Overhauled Search Engine** — Upgraded `search.js` to search beyond recipes. The engine now performs fuzzy text matching across recipe titles, descriptions, and ingredients (instead of strict word-boundary matching solely on tags).
- **Additive & Product Search Integration** — Integrated additives and retail products into the main search flow. Searching for a chemical code, name, or grocery product now brings up matching food additives and localized retail products.
- **Interactive Additives Panel** — Re-engineered the product card layout to support inline interactive accordions. Users can now click on any additive badge to expand its full chemical details, typical usage, and safety notes in-place without scrolling or reloading.

### Fixed
- **Recipe Builder Row Deletion** — Resolved a bug in `builder-ui.js` where clicking the "✕" button next to an ingredient, method step, or equipment item mistakenly deleted the button itself rather than removing the parent container row.
- **Builder Equipment Inputs** — Restored the missing autocomplete input, enter-key handlers, and dropdown elements for the "You Will Also Need" section inside the Recipe Builder.
- **Additive Sub-class Resolution** — Patched the additive search and lookup engines to gracefully map simplified base codes (e.g., `160c` or `322`) to more specific sub-class listings (e.g., `160c(ii)` or `322(i)`) when exact matches are unavailable.

---

## 2026-08-02

### Fixed
- **Shopping list pricing** — `convertToPackageUnits()` had no way to bridge
  countable recipe units (cloves, sheets, bulbs, rashers, blank/each, etc.)
  against weight-based price entries, so it silently treated the raw
  quantity number as if it were already in the price database's unit.
  This produced wildly wrong costs in both directions — e.g. "300g Apples"
  was priced as 300 individual apples ($393 instead of ~$2.62), while
  "6 Chicken Thigh Fillets" was undercounted to a single 150g pack ($8
  instead of ~$48).
- Added an `AVG_UNIT_WEIGHT` reference table (grams per clove/sheet/rasher/
  average onion/chicken breast/etc., each labelled inline with what "1 unit"
  is assumed to weigh) so recipe units can be converted to price-database
  units even when they don't match directly.
- **Pantry page was broken** — `pantry.html` still called `window.AJPC.Pantry`,
  a namespace that no longer exists (`pantry.js` now exposes
  `window.KitchenNotebook.Pantry`). Every function silently no-op'd; the
  page loaded but nothing worked. Also wasn't linked from navigation at all.
- **Shopping panel item list was collapsing** — a leftover, unused
  `#shopping-modal` block in `recipe.html` (from an earlier version of the
  site) defined its own `.shopping-items-list` / `.shopping-item` CSS rules
  that came later in `main.css` than the real panel's rules, silently
  overriding the live panel's scroll/layout behaviour via normal CSS
  cascade order.
- **Print shopping list had no prices at all** — the print handler only
  ever collected the item *name* text before opening the print window,
  discarding quantity, unit price, and cost entirely.

### Added
- Pantry **Stocktake tab** — a full checklist of all ~505 ingredients from
  `pantry-staples.js`, grouped by category with a category filter, using
  CSS that already existed in `main.css` but had nothing wired up to it.
- Every pantry item can now be tracked **Full / Half / Low / Empty**, not
  just a fixed shortlist of ~46 staples.
- Shopping list items now show a **unit price** (e.g. `$1.90/kg`) and a
  **per-recipe cost** alongside the existing total buy cost.
- Shopping list items are now **flagged by pantry stock level**: FULL
  (red, struck through, can't be selected), HALF (orange, struck through,
  optional), LOW (green, struck through, optional), EMPTY (green, bold,
  pre-checked as needed).
- Print view now includes quantity, unit price, and buy cost per item,
  plus an estimated total.

### Changed
- Shopping panel widened (380px → 460px) and restructured into a single
  scrollable body under a fixed header, with Select All / Print always
  visible at the bottom regardless of list length.