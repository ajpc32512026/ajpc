/* =========================================================
   NAV LOADER — AJPC Kitchen Notebook
   Fixed: graceful fallback if fetch fails (file:// protocol),
   proper search integration, no phantom errors.
========================================================= */

(function () {
    'use strict';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadNavigation);
    } else {
        loadNavigation();
    }

    async function loadNavigation() {
        const placeholder = document.getElementById('nav-placeholder');
        if (!placeholder) return;

        try {
            const response = await fetch('components/nav.html');
            if (!response.ok) throw new Error('fetch failed');
            const html = await response.text();
            placeholder.innerHTML = html;
        } catch {
            // Fallback: inline minimal nav for file:// or server errors
            placeholder.innerHTML = buildFallbackNav();
        }

        initNavigation();
    }

    function buildFallbackNav() {
        return `<header class="nav-header">
            <div class="nav-container">
                <div class="nav-top-row">
                    <a href="index.html" class="nav-brand">Ana <span>&</span> John's Kitchen</a>
                    <div class="nav-search">
                        <svg class="search-icon" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2"/>
                            <path d="M12.5 12.5L17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        <input type="text" id="navSearch" placeholder="Search recipes..." autocomplete="off">
                        <div class="search-results-dropdown" id="searchDropdown"></div>
                    </div>
                    <div class="nav-controls">
                        <button class="dark-mode-toggle" id="darkModeToggle" title="Toggle theme">&#9790;</button>
                        <button class="mobile-menu-toggle" id="mobileMenuToggle">Menu</button>
                    </div>
                </div>
                <nav class="recipe-nav" id="mainNav">
                    <a href="index.html" class="nav-direct">Home</a>
                    <a href="search.html" class="nav-direct">Search</a>
                    <a href="gallery.html" class="nav-direct">Gallery</a>
                </nav>
            </div>
        </header>`;
    }

    function initNavigation() {
        initDropdowns();
        initMobileMenu();
        initNavSearch();
        initScrollProgress();
        initBackToTop();
        initDarkMode();
        highlightCurrentPage();
    }

    /* --------------------------------------------------
       Dropdowns
    -------------------------------------------------- */
    function initDropdowns() {
        const groups = document.querySelectorAll('.nav-group');

        groups.forEach(group => {
            const pill = group.querySelector('.nav-pill');
            if (!pill) return;

            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = group.classList.contains('open');

                // Close all
                groups.forEach(g => {
                    g.classList.remove('open');
                    const p = g.querySelector('.nav-pill');
                    if (p) p.setAttribute('aria-expanded', 'false');
                });

                if (!isOpen) {
                    group.classList.add('open');
                    pill.setAttribute('aria-expanded', 'true');
                }
            });

            // Keyboard support
            pill.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pill.click();
                }
                if (e.key === 'Escape') {
                    group.classList.remove('open');
                    pill.setAttribute('aria-expanded', 'false');
                    pill.focus();
                }
            });
        });

        // Close on outside click
        document.addEventListener('click', () => {
            groups.forEach(g => {
                g.classList.remove('open');
                const p = g.querySelector('.nav-pill');
                if (p) p.setAttribute('aria-expanded', 'false');
            });
        });
    }

    /* --------------------------------------------------
       Mobile Menu
    -------------------------------------------------- */
    function initMobileMenu() {
        const toggle = document.getElementById('mobileMenuToggle');
        const nav = document.getElementById('mainNav');
        if (!toggle || !nav) return;

        toggle.addEventListener('click', () => {
            const isOpen = nav.classList.toggle('mobile-open');
            toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            toggle.textContent = isOpen ? 'Close' : 'Menu';
        });
    }

    /* --------------------------------------------------
       Nav Search (live dropdown)
    -------------------------------------------------- */
    function initNavSearch() {
        const input = document.getElementById('navSearch');
        const dropdown = document.getElementById('searchDropdown');
        if (!input || !dropdown) return;

        let recipeIndex = null;
        let debounceTimer = null;

        async function loadIndex() {
            if (recipeIndex) return recipeIndex;
            try {
                const r = await fetch('json/recipe-index.json');
                if (r.ok) recipeIndex = await r.json();
            } catch { recipeIndex = []; }
            return recipeIndex || [];
        }

        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(doSearch, 180);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const q = input.value.trim();
                if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
            }
            if (e.key === 'Escape') {
                closeDropdown();
                input.blur();
            }
        });

        async function doSearch() {
            const q = input.value.trim().toLowerCase();
            if (q.length < 2) { closeDropdown(); return; }

            const index = await loadIndex();
            const matches = index
                .filter(r => {
                    const title = (r.title || '').toLowerCase();
                    const tags = (r.tags || []).join(' ').toLowerCase();
                    const cat = (r.category || '').toLowerCase();
                    return title.includes(q) || tags.includes(q) || cat.includes(q);
                })
                .slice(0, 8);

            if (!matches.length) {
                dropdown.innerHTML = `<div class="search-no-results">No results for "<strong>${escHtml(q)}</strong>"</div>`;
            } else {
                dropdown.innerHTML = matches.map(r =>
                    `<a href="recipe.html?id=${encodeURIComponent(r.id)}" class="search-result-item" role="option">
                        <strong>${highlightMatch(r.title || r.id, q)}</strong>
                        ${r.category ? `<span style="font-size:0.78rem;color:var(--cream-muted);margin-left:0.5rem;">${escHtml(r.category)}</span>` : ''}
                    </a>`
                ).join('');
            }

            dropdown.classList.add('visible');
        }

        function closeDropdown() {
            dropdown.classList.remove('visible');
            dropdown.innerHTML = '';
        }

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
        });
    }

    function highlightMatch(text, query) {
        const safe = escHtml(text);
        const idx = safe.toLowerCase().indexOf(query.toLowerCase());
        if (idx === -1) return safe;
        return safe.slice(0, idx)
            + '<mark style="background:rgba(201,125,62,0.25);color:var(--cream);border-radius:2px;">'
            + safe.slice(idx, idx + query.length)
            + '</mark>'
            + safe.slice(idx + query.length);
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* --------------------------------------------------
       Scroll Progress Bar
    -------------------------------------------------- */
    function initScrollProgress() {
        const bar = document.getElementById('scrollProgress');
        if (!bar) return;

        function update() {
            const docH = document.documentElement.scrollHeight - window.innerHeight;
            bar.style.width = docH > 0 ? (window.scrollY / docH * 100) + '%' : '0%';
        }

        window.addEventListener('scroll', update, { passive: true });
    }

    /* --------------------------------------------------
       Back To Top
    -------------------------------------------------- */
    function initBackToTop() {
        const btn = document.getElementById('backToTop');
        if (!btn) return;

        window.addEventListener('scroll', () => {
            btn.classList.toggle('visible', window.scrollY > 400);
        }, { passive: true });

        btn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    /* --------------------------------------------------
       Dark Mode Toggle
       The site is dark by default. Toggle adds 'light-mode' to body.
    -------------------------------------------------- */
    function initDarkMode() {
        const btn = document.getElementById('darkModeToggle');
        if (!btn) return;

        const stored = localStorage.getItem('ajpc-theme');
        if (stored === 'light') applyLight(true);

        btn.addEventListener('click', () => {
            const isLight = document.body.classList.contains('light-mode');
            applyLight(!isLight);
            localStorage.setItem('ajpc-theme', isLight ? 'dark' : 'light');
        });

        function applyLight(on) {
            document.body.classList.toggle('light-mode', on);
            btn.innerHTML = on ? '&#9728;' : '&#9790;';
            btn.title = on ? 'Switch to dark mode' : 'Switch to light mode';
        }
    }

    /* --------------------------------------------------
       Highlight Current Page Link
    -------------------------------------------------- */
    function highlightCurrentPage() {
        const path = window.location.pathname.split('/').pop() || 'index.html';
        document.querySelectorAll('.dropdown a, .nav-direct').forEach(link => {
            const href = link.getAttribute('href') || '';
            if (href === path || href.startsWith(path + '?')) {
                link.style.color = 'var(--copper-warm)';
                link.style.fontWeight = '600';
            }
        });
    }

})();
