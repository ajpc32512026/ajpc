/* =========================================================
   BUILDER TIMELINE — Cooking Timeline Generator
========================================================= */

function generateTimeline() {
    const { obj } = buildJSON();
    const box = document.getElementById('timeline-box');
    const out = document.getElementById('timeline-output');
    if (!box || !out) return;

    const steps = (obj.method || []).filter(s => s.instruction);
    if (!steps.length) { box.style.display = 'none'; return; }

    const totalMins = parseTimeToMinutes(obj.totalTime || '')
                   || (parseTimeToMinutes(obj.prepTime || '') + parseTimeToMinutes(obj.cookTime || ''));

    if (totalMins === 0) { box.style.display = 'none'; return; }

    const now      = new Date();
    const endTime  = new Date(now.getTime() + totalMins * 60000);
    const stepGap  = totalMins / steps.length;

    let html = `
        <div style="display:grid;grid-template-columns:80px 1fr;gap:0.5rem;margin-bottom:0.75rem;align-items:center;">
            <span style="font-family:var(--mono);color:var(--green);font-size:0.8rem;">${formatTime(now)}</span>
            <span style="font-weight:600;color:var(--green);">Start cooking</span>
        </div>
    `;

    steps.forEach((s, i) => {
        const t = new Date(now.getTime() + i * stepGap * 60000);
        const preview = s.instruction.length > 70
            ? s.instruction.substring(0, 70) + '…'
            : s.instruction;
        html += `
            <div style="display:grid;grid-template-columns:80px 1fr;gap:0.5rem;margin-bottom:0.5rem;align-items:start;">
                <span style="font-family:var(--mono);color:var(--gold-dim);font-size:0.8rem;padding-top:0.1rem;">${formatTime(t)}</span>
                <span style="line-height:1.5;">${i + 1}. ${preview}</span>
            </div>
        `;
    });

    html += `
        <div style="display:grid;grid-template-columns:80px 1fr;gap:0.5rem;margin-top:0.75rem;align-items:center;border-top:1px solid var(--border);padding-top:0.75rem;">
            <span style="font-family:var(--mono);color:var(--gold);font-size:0.8rem;">${formatTime(endTime)}</span>
            <span style="font-weight:600;color:var(--gold);">Ready to serve</span>
        </div>
    `;

    out.innerHTML = html;
    box.style.display = 'block';
}

function parseTimeToMinutes(str) {
    if (!str) return 0;
    const s = str.toLowerCase();
    let mins = 0;
    const h = s.match(/(\d+)\s*h/);
    const m = s.match(/(\d+)\s*m/);
    if (h) mins += parseInt(h[1]) * 60;
    if (m) mins += parseInt(m[1]);
    return mins;
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
