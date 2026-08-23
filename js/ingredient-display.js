/* =========================================================
   INGREDIENT DISPLAY — The Kitchen Notebook
   Given an ingredient entry from ingredients-master.json and a
   quantity, returns the ingredient name with correct English
   grammar: "1 egg" vs "2 eggs", "1 onion" vs "3 onions".

   Reads the entry's own data rather than guessing blind:
     - countable: false  -> mass noun (flour, oil, milk) - name
                             never changes regardless of quantity
     - grammar.stored: "singular" -> name is stored singular
                             (e.g. "brown onion") - pluralise it
                             for qty !== 1
     - grammar.stored: "plural"   -> name is stored plural
                             (e.g. "eggs") - use grammar.singular
                             for qty === 1, name as-is otherwise

   Falls back to regular English pluralisation rules for anything
   not explicitly tagged, so it still behaves sensibly for new
   ingredients added later without a grammar field.

   Depends on: nothing (pure functions, no external state)
========================================================= */

(function () {
    'use strict';

    // A handful of genuinely irregular English plurals worth hardcoding rather
    // than guessing - -o endings are inconsistent (tomato->tomatoes but
    // avocado->avocados), so these need to win over the regex rules below.
    const IRREGULAR_PLURALS = {
        'tomato': 'tomatoes', 'potato': 'potatoes',
    };
    const IRREGULAR_SINGULARS = Object.fromEntries(
        Object.entries(IRREGULAR_PLURALS).map(([s, p]) => [p, s])
    );

    // Regular English pluralisation - covers the vast majority of
    // food nouns correctly. Only used as a fallback when an entry
    // has no explicit grammar.plural override.
    function autoPluralize(word) {
        const lower = word.toLowerCase();
        if (IRREGULAR_PLURALS[lower]) return IRREGULAR_PLURALS[lower];
        if (/i$/i.test(word)) return word + 'es';          // chilli -> chillies
        if (/(s|ss|sh|ch|x|z)$/i.test(word)) return word + 'es';
        if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies';
        if (/(fe)$/i.test(word)) return word.slice(0, -2) + 'ves';
        if (/f$/i.test(word)) return word.slice(0, -1) + 'ves';
        return word + 's';
    }

    function autoSingularize(word) {
        const lower = word.toLowerCase();
        if (IRREGULAR_SINGULARS[lower]) return IRREGULAR_SINGULARS[lower];
        if (/(chillies)$/i.test(word)) return word.slice(0, -3) + 'i'; // chillies -> chilli
        if (/ies$/i.test(word)) return word.slice(0, -3) + 'y';
        if (/ves$/i.test(word)) return word.slice(0, -3) + 'f';
        if (/(sses|shes|ches|xes|zes)$/i.test(word)) return word.slice(0, -2);
        if (/s$/i.test(word) && !/ss$/i.test(word)) return word.slice(0, -1);
        return word;
    }

    // For multi-word ingredient names ("brown onion", "green beans"),
    // pluralise/singularise the LAST word only - "brown onions", not
    // "browns onion".
    function pluralizeName(name) {
        const words = name.split(' ');
        words[words.length - 1] = autoPluralize(words[words.length - 1]);
        return words.join(' ');
    }
    function singularizeName(name) {
        const words = name.split(' ');
        words[words.length - 1] = autoSingularize(words[words.length - 1]);
        return words.join(' ');
    }

    /**
     * Returns the correctly-grammared ingredient name for a given quantity.
     * @param {object} entry - an ingredient entry from ingredients-master.json
     *                         (must have at least a `name` field)
     * @param {number} qty - the quantity being used
     * @returns {string} the display name, e.g. "onion" / "onions"
     */
    function displayIngredientName(entry, qty) {
        if (!entry || !entry.name) return '';

        // Mass nouns never change - "500g flour", not "flours"
        if (entry.countable === false) return entry.name;

        const isSingularQty = (qty === 1 || qty === '1');
        const grammar = entry.grammar || { stored: 'singular' };

        if (grammar.stored === 'plural') {
            if (isSingularQty) {
                return grammar.singular || singularizeName(entry.name);
            }
            return entry.name; // already plural, use as stored
        }

        // stored === 'singular' (default)
        if (isSingularQty) return entry.name;
        return grammar.plural || pluralizeName(entry.name);
    }

    /**
     * Convenience helper: "2 eggs", "1 onion", "500g flour" style output.
     * Only prefixes the quantity for countable ingredients with a numeric
     * qty - pass qty as null/undefined for weight/volume-based lines and
     * build those separately (e.g. "500g flour").
     */
    function formatIngredientLine(entry, qty) {
        const name = displayIngredientName(entry, qty);
        if (entry.countable === false || qty == null) return name;
        return `${qty} ${name}`;
    }

    const api = { displayIngredientName, formatIngredientLine, autoPluralize, autoSingularize };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        window.KitchenNotebook = window.KitchenNotebook || {};
        window.KitchenNotebook.IngredientDisplay = api;
    }
})();
