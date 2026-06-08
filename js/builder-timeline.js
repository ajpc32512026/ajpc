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
        <div class="tl-row tl-row-start">
            <span class="tl-time tl-time-start">${formatTime(now)}</span>
            <span class="tl-label tl-label-start">Start cooking</span>
        </div>
    `;

    steps.forEach((s, i) => {
        const t = new Date(now.getTime() + i * stepGap * 60000);
        const preview = s.instruction.length > 70
            ? s.instruction.substring(0, 70) + '…'
            : s.instruction;
        html += `
            <div class="tl-row">
                <span class="tl-time">${formatTime(t)}</span>
                <span class="tl-step">${i + 1}. ${preview}</span>
            </div>
        `;
    });

    html += `
        <div class="tl-row tl-row-end">
            <span class="tl-time tl-time-end">${formatTime(endTime)}</span>
            <span class="tl-label tl-label-end">Ready to serve</span>
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
