/* =========================================================
   KITCHEN TRUTHS ANIMATOR — AJPC Kitchen Notebook
   Cycles through truths with fade transitions.
   Fixed: encapsulated, no global pollution, accessible.
========================================================= */

(function () {
    'use strict';

    const TRUTHS = [
        'Always remember — even salt looks like sugar.',
        'Always taste before you trust.',
        'Not everything bright is sweet.',
        'The quietest ingredient can ruin the whole dish.',
        'Too much heat hides more sins than it fixes.',
        'Good food forgives mistakes — great food exposes them.',
        'What you rush will teach you twice.',
        'The flavour always tells the truth in the end.',
        'Every shortcut leaves a footprint.',
        'If it smells wrong, it is.',
        'A sharp knife is safer than a dull one.',
        'Season in layers, not at the end.',
        'The pan knows before you do.',
        'Cold butter, warm hands — choose one.',
        'Rest the meat. Every time. No exceptions.',
    ];

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        const quoteEl   = document.getElementById('kitchenTruth');
        const counterEl = document.getElementById('truthCounter');
        if (!quoteEl) return;

        let current = Math.floor(Math.random() * TRUTHS.length);

        function show(index) {
            quoteEl.classList.add('fading');
            setTimeout(() => {
                quoteEl.textContent = '\u201C' + TRUTHS[index] + '\u201D';
                if (counterEl) counterEl.textContent = (index + 1) + ' / ' + TRUTHS.length;
                quoteEl.classList.remove('fading');
            }, 500);
        }

        show(current);
        setInterval(() => {
            current = (current + 1) % TRUTHS.length;
            show(current);
        }, 6000);
    }

})();
