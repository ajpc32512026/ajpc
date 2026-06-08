/* =========================================================
   BUILDER PARSER — PDF, DOCX, and HTML Import
========================================================= */

async function importRecipeFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const loadingModal = document.getElementById('loading-modal');
    const loadingMsg   = document.getElementById('loading-message');
    if (loadingModal) loadingModal.style.display = 'flex';
    if (loadingMsg)   loadingMsg.textContent = 'Reading ' + file.name + '…';

    try {
        let text = '';
        const name = file.name.toLowerCase();

        if (name.endsWith('.pdf')) {
            text = await extractTextFromPDF(file);
        } else if (name.endsWith('.docx') || name.endsWith('.doc')) {
            const buf = await file.arrayBuffer();
            const res = await mammoth.extractRawText({ arrayBuffer: buf });
            text = res.value;
        } else {
            // HTML or plain text
            const raw = await file.text();
            const doc = new DOMParser().parseFromString(raw, 'text/html');
            doc.querySelectorAll('script,style,nav,footer').forEach(el => el.remove());
            doc.querySelectorAll('h1,h2,h3,h4,li,p,br,tr').forEach(el => el.insertAdjacentText('afterend', '\n'));
            text = doc.body?.textContent || raw;
        }

        if (!text || text.trim().length < 50) {
            throw new Error('Could not extract enough text from the file.');
        }

        if (loadingMsg) loadingMsg.textContent = 'Parsing recipe…';
        const parsed = parseRecipeText(text);

        if (parsed && (parsed.ingredients?.length || parsed.method?.length)) {
            populateForm(parsed);
            document.getElementById('mode-label').textContent = 'Imported: ' + file.name;
            document.getElementById('mode-label').style.color = 'var(--copper)';
            toast('Import complete! Please review and adjust.');
        } else {
            navigator.clipboard.writeText(text).catch(() => {});
            alert('Could not auto-parse this recipe. The text has been copied to your clipboard — paste it in manually.');
        }
    } catch(err) {
        alert('Import error: ' + err.message);
    } finally {
        if (loadingModal) loadingModal.style.display = 'none';
        event.target.value = '';
    }
}

// ── PDF Text Extraction ───────────────────────────────────
async function extractTextFromPDF(file) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        // Group by Y row then sort by X so reading order is correct
        const rows = {};
        content.items.forEach(item => {
            const y = Math.round(item.transform[5]);
            if (!rows[y]) rows[y] = [];
            rows[y].push(item);
        });

        const lines = Object.keys(rows)
            .sort((a, b) => b - a)
            .map(y => rows[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').trim())
            .filter(l => l.length > 0);

        fullText += lines.join('\n') + '\n\n';
    }
    return fullText;
}

// ── Smart Recipe Parser ───────────────────────────────────
function parseRecipeText(rawText) {
    try {
        const recipe = {
            title: '', description: '', servings: '',
            prepTime: '', cookTime: '', totalTime: '',
            category: '', ingredients: [], method: [], notes: []
        };

        function stripEmoji(s) {
            return s
                .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
                .replace(/[\u{2600}-\u{26FF}]/gu, '')
                .replace(/[\u{2700}-\u{27BF}]/gu, '')
                .replace(/[^\x20-\x7E\u00A0-\u024F\u2013\u2014\u2018\u2019\u201C\u201D\u00B0\u00B7]/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
        }

        const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        const JUNK = [
            /^a\s*[&+]\s*j\s+personal/i, /cooked once/i, /always repeated/i,
            /all rights reserved/i, /^[©\u00A9]/, /^page \d+/i,
            /print (recipe|option)/i, /download full pdf/i,
            /netlify|porkbun|brevo/i, /^sitemap|privacy policy/i,
            /follow us on/i, /pinterest|twitter|facebook/i,
            /^https?:\/\/[^\s]+\/print/i, /nutrition information isn/i,
            /amount per serving:/i,
        ];
        const isJunk = raw => {
            const s = stripEmoji(raw).toLowerCase();
            return JUNK.some(r => r.test(s) || r.test(raw));
        };

        const ING_TRIGGERS = [
            /^(?:you['']?ll need|ingredients?)\s*:?\s*$/i,
            /^for the (batter|filling|topping|sauce|base)\s*:?/i,
        ];
        const METHOD_TRIGGERS = [
            /^(?:method|instructions?|directions?|steps?|how to (?:make|prepare|cook))\s*:?\s*$/i,
        ];
        const NOTE_TRIGGERS = [
            /^(?:chef['']?s?\s*notes?|tips?|notes?|storage|serving)\s*:?\s*$/i,
        ];

        const isTrigger = (raw, list) => list.some(r => r.test(stripEmoji(raw).trim()));

        function matchTime(raw) {
            const s = stripEmoji(raw).trim();
            const m = s.match(/^(prep|cook|total)\s*time:\s*(.+)/i);
            if (m) return { type: m[1].toLowerCase(), value: m[2].trim() };
            return null;
        }

        function matchServes(raw) {
            const m = stripEmoji(raw).match(/(?:serves?|servings?|yield|portions?):\s*([\d\-–]+)/i);
            return m ? m[1].trim() : null;
        }

        const UNITLESS_RE = /^(pinch|dash|splash|handful|bunch|drizzle|squeeze|to taste|as needed)\b/i;

        function parseIng(raw) {
            let line = stripEmoji(raw).replace(/^[-•*◆▪·]\s+/, '').trim();
            if (!line || line.length < 2) return null;
            if (UNITLESS_RE.test(line)) return { quantity: '', unit: '', item: line, notes: '' };

            const m = line.match(/^([\d¼½¾⅓⅔⅛⅜⅝⅞]+(?:[\/\.\s][\d]+)?)\s*(g|kg|ml|l|tsp|tbsp|cups?|oz|lbs?|cloves?|slices?|sheets?|cans?|pieces?|sticks?)\b\.?\s*(.*)/i);
            if (m) {
                let item  = m[3].trim(), notes = '';
                const cM  = item.match(/^(.+?),\s*(sifted|softened|melted|chopped|sliced|diced|grated|optional|to taste|cold|beaten|whisked)(.*)$/i);
                if (cM) { item = cM[1].trim(); notes = (cM[2] + (cM[3]||'')).trim(); }
                return { quantity: m[1].trim(), unit: m[2].trim().toLowerCase(), item, notes };
            }
            const m2 = line.match(/^([\d¼½¾⅓⅔]+(?:[\/\.][\d]+)?)\s+(.+)/);
            if (m2) return { quantity: m2[1].trim(), unit: '', item: m2[2].trim(), notes: '' };
            return { quantity: '', unit: '', item: line, notes: '' };
        }

        let section = 'header', titleDone = false, descDone = false, stepNum = 1;

        for (let i = 0; i < lines.length; i++) {
            const raw   = lines[i];
            const clean = stripEmoji(raw).trim();
            if (!clean || clean.length < 2 || isJunk(raw)) continue;

            // Time
            const timeM = matchTime(clean);
            if (timeM) {
                if (timeM.type === 'prep')  recipe.prepTime  = timeM.value;
                if (timeM.type === 'cook')  recipe.cookTime  = timeM.value;
                if (timeM.type === 'total') recipe.totalTime = timeM.value;
                continue;
            }

            // Serves
            const servesM = matchServes(clean);
            if (servesM) { recipe.servings = servesM; continue; }

            // Section triggers
            if (isTrigger(clean, ING_TRIGGERS))    { section = 'ingredients'; continue; }
            if (isTrigger(clean, METHOD_TRIGGERS))  { section = 'method';      continue; }
            if (isTrigger(clean, NOTE_TRIGGERS))    { section = 'notes';       continue; }

            if (section === 'header') {
                if (!titleDone && clean.length > 3) {
                    recipe.title = clean; titleDone = true; continue;
                }
                if (titleDone && !descDone && clean.length > 10 && !/^[-•*\d]/.test(clean)) {
                    recipe.description = recipe.description ? recipe.description + ' ' + clean : clean;
                    continue;
                }
            }

            if (section === 'ingredients') {
                if (isTrigger(clean, METHOD_TRIGGERS)) { section = 'method'; continue; }
                // Heading row (all caps or ends with colon, short, no quantity)
                if (/^[A-Z][^a-z]{2,}:?$/.test(clean) || (clean.endsWith(':') && clean.length < 40 && !/^\d/.test(clean))) {
                    recipe.ingredients.push({ heading: clean.replace(/:$/, '') });
                    continue;
                }
                const parsed = parseIng(clean);
                if (parsed && parsed.item) recipe.ingredients.push(parsed);
                continue;
            }

            if (section === 'method') {
                if (isTrigger(clean, NOTE_TRIGGERS)) { section = 'notes'; continue; }
                const stepM = clean.match(/^(\d+)[.)]\s+(.+)/);
                if (stepM) { recipe.method.push({ step: stepNum++, instruction: stepM[2].trim() }); continue; }
                const bulletM = clean.match(/^[-•*◆▪·]\s+(.+)/);
                if (bulletM) { recipe.method.push({ step: stepNum++, instruction: bulletM[1].trim() }); continue; }
                if (clean.length > 8) recipe.method.push({ step: stepNum++, instruction: clean });
                continue;
            }

            if (section === 'notes') {
                const bulletM = clean.match(/^[-•*◆▪·]\s+(.+)/);
                const content = bulletM ? bulletM[1].trim() : clean;
                if (content.length > 4) recipe.notes.push({ type: 'tip', title: "Tip", content });
            }
        }

        // Renumber method steps
        let s = 0;
        recipe.method = recipe.method.map(item => item.heading ? item : { step: ++s, instruction: item.instruction });

        return (recipe.ingredients.length || recipe.method.length) ? recipe : null;

    } catch(e) {
        console.error('Parser error:', e);
        return null;
    }
}
