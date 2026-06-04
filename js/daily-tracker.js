/* =========================================================
   DAILY TRACKER — AJPC Kitchen Notebook
   Renders today's intake log, running totals, RDI bars,
   and 7-day history. Depends on user-prefs.js
========================================================= */

(function () {
    'use strict';

    // ── Reference Daily Intake (Australian NRVs, adult average) ──
    var RDI = {
        cal:     2100,
        protein: 50,
        carbs:   310,
        fat:     70,
        sodium:  2000   // mg — WHO recommendation
    };

    // ── Init ──────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        renderToday();
        renderWeekHistory();

        // Listen for new entries added from other pages
        window.addEventListener('storage', function (e) {
            if (e.key === 'ajpc_daily_tracker') {
                renderToday();
                renderWeekHistory();
            }
        });

        // Clear today button
        var clearBtn = document.getElementById('clearTodayBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                if (!confirm('Clear today\'s entire log?')) return;
                if (window.AJPC) window.AJPC.DailyTracker.clearToday();
                renderToday();
                renderWeekHistory();
            });
        }
    }

    // ── Today ─────────────────────────────────────────────
    function renderToday() {
        var container = document.getElementById('todayLog');
        var totalsEl  = document.getElementById('todayTotals');
        if (!container || !window.AJPC) return;

        var day = window.AJPC.DailyTracker.getToday();

        // Totals bar
        if (totalsEl) totalsEl.innerHTML = renderTotals(day.totals);

        // Entry list
        if (!day.entries.length) {
            container.innerHTML = '<p class="tracker-empty">Nothing logged today. Open a recipe and click <strong>Track Intake</strong> to get started.</p>';
            return;
        }

        var html = '<ul class="tracker-entry-list">';
        day.entries.forEach(function (entry) {
            html += '<li class="tracker-entry">' +
                '<div class="tracker-entry-main">' +
                    '<span class="tracker-entry-name">' + escHtml(entry.name) + '</span>' +
                    '<span class="tracker-entry-servings">' + entry.servings + ' serving' + (entry.servings !== 1 ? 's' : '') + '</span>' +
                '</div>' +
                '<div class="tracker-entry-macros">' +
                    '<span>' + entry.cal + ' cal</span>' +
                    '<span>' + entry.protein + 'g protein</span>' +
                    '<span>' + entry.carbs + 'g carbs</span>' +
                    '<span>' + entry.fat + 'g fat</span>' +
                    '<span>' + entry.sodium + 'mg sodium</span>' +
                '</div>' +
                '<button class="tracker-remove-btn" onclick="enhRemoveEntry(' + entry.ts + ')">Remove</button>' +
                '</li>';
        });
        html += '</ul>';
        container.innerHTML = html;
    }

    function renderTotals(totals) {
        var t = totals || { cal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 };
        return '<div class="tracker-totals-grid">' +
            renderMacroBar('Calories',  t.cal,     RDI.cal,     'cal', '') +
            renderMacroBar('Protein',   t.protein,  RDI.protein, 'g',   'protein') +
            renderMacroBar('Carbs',     t.carbs,    RDI.carbs,   'g',   'carbs') +
            renderMacroBar('Fat',       t.fat,      RDI.fat,     'g',   'fat') +
            renderMacroBar('Sodium',    t.sodium,   RDI.sodium,  'mg',  'sodium') +
        '</div>';
    }

    function renderMacroBar(label, value, rdi, unit, cls) {
        var pct     = Math.min(Math.round((value / rdi) * 100), 100);
        var over    = value > rdi;
        var barCls  = over ? 'tracker-bar-fill over-rdi' : 'tracker-bar-fill';
        return '<div class="tracker-macro-item' + (cls ? ' tracker-macro-' + cls : '') + '">' +
            '<div class="tracker-macro-header">' +
                '<span class="tracker-macro-label">' + label + '</span>' +
                '<span class="tracker-macro-value">' + value + unit + ' / ' + rdi + unit + '</span>' +
            '</div>' +
            '<div class="tracker-bar">' +
                '<div class="' + barCls + '" style="width:' + pct + '%"></div>' +
            '</div>' +
            '<span class="tracker-macro-pct">' + pct + '% RDI' + (over ? ' ↑' : '') + '</span>' +
        '</div>';
    }

    window.enhRemoveEntry = function (ts) {
        if (!window.AJPC) return;
        window.AJPC.DailyTracker.removeEntry(ts);
        renderToday();
        renderWeekHistory();
    };

    // ── 7-Day History ─────────────────────────────────────
    function renderWeekHistory() {
        var container = document.getElementById('weekHistory');
        if (!container || !window.AJPC) return;

        var week = window.AJPC.DailyTracker.getWeek();
        var maxCal = Math.max.apply(null, week.map(function (d) {
            return d.data ? d.data.totals.cal : 0;
        })) || RDI.cal;

        var html = '<div class="week-chart">';
        week.forEach(function (d) {
            var cal  = d.data ? d.data.totals.cal : 0;
            var pct  = Math.min(Math.round((cal / maxCal) * 100), 100);
            var day  = formatDay(d.date);
            var isToday = d.date === new Date().toISOString().split('T')[0];

            html += '<div class="week-bar-col' + (isToday ? ' today' : '') + '">' +
                '<div class="week-bar-wrap">' +
                    '<div class="week-bar-fill" style="height:' + pct + '%">' +
                        (cal ? '<span class="week-bar-cal">' + cal + '</span>' : '') +
                    '</div>' +
                '</div>' +
                '<span class="week-bar-label">' + day + '</span>' +
            '</div>';
        });
        html += '</div>';

        // RDI line note
        html += '<p class="week-rdi-note">RDI reference: ' + RDI.cal + ' cal/day</p>';
        container.innerHTML = html;
    }

    function formatDay(dateStr) {
        var d = new Date(dateStr + 'T00:00:00');
        var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        return days[d.getDay()];
    }

    function escHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

})();
