# Changelog

All notable changes to this project are documented here.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
