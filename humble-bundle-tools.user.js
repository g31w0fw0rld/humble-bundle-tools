// ==UserScript==
// @name         Humble Bundle Tools
// @namespace    https://www.humblebundle.com/
// @version      1.0.2
// @description  En la Humble Store: (1) en la lista de deseos (/store/wishlist) agrega ordenar y filtrar (agregado, nombre, precio, descuento; "solo con descuento" y por plataforma) con recuerdo y URL compartible; (2) en las páginas de producto de juegos de PC agrega botones a GG.deals y PCGamingWiki.
// @author       g31w0fw0rld
// @license      MIT
// @match        https://www.humblebundle.com/store/*
// @match        https://www.humblebundle.com/wishlist*
// @downloadURL  https://github.com/g31w0fw0rld/humble-bundle-tools/raw/main/humble-bundle-tools.user.js
// @updateURL    https://github.com/g31w0fw0rld/humble-bundle-tools/raw/main/humble-bundle-tools.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =============================================
    // DETECCIÓN DE RUTA
    // =============================================
    const WISHLIST_PATH_REGEX = /\/(?:store\/)?wishlist(?:\/|$)/i;
    function isWishlist() { return WISHLIST_PATH_REGEX.test(location.pathname); }

    // =============================================
    // UTILIDAD COMPARTIDA
    // =============================================
    // Parsea precios tipo "29,99 $" / "1.299,00 $" a Number (o null).
    function parsePrice(txt) {
        if (!txt) return null;
        const m = txt.replace(/\s/g, '').match(/[\d.,]+/);
        if (!m) return null;
        let s = m[0];
        const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
        if (lastDot >= 0 && lastComma >= 0) {
            if (lastDot > lastComma) s = s.replace(/,/g, '');
            else s = s.replace(/\./g, '').replace(',', '.');
        } else if (lastComma >= 0) {
            s = (s.length - 1 - lastComma === 3) ? s.replace(/,/g, '') : s.replace(',', '.');
        }
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
    }

    // =============================================
    // IDIOMA (auto-detect: si la página/navegador está en español -> es, si no -> en)
    // =============================================
    // Prioriza el lang del documento (idioma con que Humble sirve la página) y
    // cae al del navegador. Solo distingue español vs. resto (inglés por defecto).
    function detectLang() {
        const docLang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
        const navLang = (navigator.language || navigator.languages?.[0] || '').toLowerCase();
        return (docLang || navLang).startsWith('es') ? 'es' : 'en';
    }
    const LANG = detectLang();
    const I18N = {
        es: {
            sortLabel: 'Ordenar:', added: 'Agregado', name: 'Nombre', price: 'Precio', discount: 'Descuento',
            platformLabel: 'Plataforma:', all: 'Todas', uplay: 'Ubisoft', origin: 'EA', key: 'Clave', drmfree: 'Sin DRM',
            dirTitle: 'Ascendente / Descendente', onlyDiscount: 'Solo con descuento', remember: 'Recordar',
            copy: '🔗 Copiar enlace', copied: '✔ Copiado', copyPrompt: 'Copia este enlace:',
        },
        en: {
            sortLabel: 'Sort:', added: 'Added', name: 'Name', price: 'Price', discount: 'Discount',
            platformLabel: 'Platform:', all: 'All', uplay: 'Ubisoft', origin: 'EA', key: 'Key', drmfree: 'DRM-free',
            dirTitle: 'Ascending / Descending', onlyDiscount: 'Only discounted', remember: 'Remember',
            copy: '🔗 Copy link', copied: '✔ Copied', copyPrompt: 'Copy this link:',
        },
    };
    const t = I18N[LANG];

    // =========================================================================
    // MÓDULO 1 — WISHLIST: ordenar y filtrar
    // =========================================================================
    // El wishlist de Humble Bundle renderiza cada juego como <li.wishlist-entity>
    // dentro de <ul.js-entities-list>. El atributo data-entity-index-key ya trae
    // el orden original (el "agregado"), así que se usa tal cual sin taggear.
    const ITEM_SELECTOR = 'li.wishlist-entity';
    const LIST_SELECTOR = 'ul.js-entities-list';
    const TITLE_SELECTOR = '.entity-title';
    const ENTITY_SELECTOR = '.js-entity';                 // lleva la clase on-sale
    const PRICE_SELECTOR = '.js-price-button .price';      // precio vigente
    const FULL_PRICE_SELECTOR = '.breakdown-full-price';   // precio sin descuento
    const DISC_AMOUNT_SELECTOR = '.js-discount-amount';    // "-60 %"
    const PLATFORM_SELECTOR = '.platform.hb';              // li.platform.hb.hb-steam, etc.

    const ORD_ATTR = 'data-hbwl-ord';
    const TOOLBAR_ID = 'hbwl-toolbar';
    const WL_STYLES_ID = 'hbwl-styles';
    const SETTINGS_KEY = 'hbwl-settings';
    const SORTS = ['added', 'name', 'price', 'discount'];
    const SORT_LABELS = { added: t.added, name: t.name, price: t.price, discount: t.discount };
    const PLATFORM_LABELS = { all: t.all, steam: 'Steam', epic: 'Epic', uplay: t.uplay, gog: 'GOG', origin: t.origin, key: t.key, drmfree: t.drmfree };

    let settings = loadSettings();
    let applying = false;          // silencia el observer al reordenar
    let listObserver = null;
    let observerDebounce = null;
    let platformSelEl = null;

    // --- Persistencia -----------------------------------------------------------
    function loadSettings() {
        const def = { remember: true, sort: 'added', dir: 'asc', onlyDiscount: false, platform: 'all' };
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed && typeof parsed === 'object') {
                return Object.assign(def, parsed, {
                    sort: SORTS.includes(parsed.sort) ? parsed.sort : 'added',
                    dir: parsed.dir === 'desc' ? 'desc' : 'asc',
                    onlyDiscount: !!parsed.onlyDiscount,
                    platform: typeof parsed.platform === 'string' ? parsed.platform : 'all',
                    remember: parsed.remember !== false,
                });
            }
        } catch (e) { console.error('(hbwl): loadSettings error:', e); }
        return def;
    }
    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
        catch (e) { console.error('(hbwl): saveSettings error:', e); }
    }
    function persistIfRemember() { if (settings.remember !== false) saveSettings(); }

    // --- URL compartible (parámetros legibles) ----------------------------------
    function readUrlView() {
        const p = new URLSearchParams(location.search);
        if (!p.has('wlsort') && !p.has('wldir') && !p.has('wldisc') && !p.has('wlplat')) return null;
        return {
            sort: SORTS.includes(p.get('wlsort')) ? p.get('wlsort') : 'added',
            dir: p.get('wldir') === 'desc' ? 'desc' : 'asc',
            onlyDiscount: p.get('wldisc') === '1',
            platform: p.get('wlplat') || 'all',
        };
    }
    function buildShareUrl() {
        const p = new URLSearchParams();
        if (settings.sort && settings.sort !== 'added') p.set('wlsort', settings.sort);
        if (settings.dir && settings.dir !== 'asc') p.set('wldir', settings.dir);
        if (settings.onlyDiscount) p.set('wldisc', '1');
        if (settings.platform && settings.platform !== 'all') p.set('wlplat', settings.platform);
        const qs = p.toString();
        return location.origin + location.pathname + (qs ? ('?' + qs) : '');
    }

    // --- Extracción -------------------------------------------------------------
    // "-60 %" -> 0.60
    function parseDiscountPct(txt) {
        if (!txt) return 0;
        const m = txt.replace(/\s/g, '').match(/(\d+)/);
        if (!m) return 0;
        const n = parseInt(m[1], 10);
        return isNaN(n) ? 0 : n / 100;
    }

    function extract(el) {
        const name = (el.querySelector(TITLE_SELECTOR)?.textContent || '').trim();
        const entity = el.querySelector(ENTITY_SELECTOR);
        const onSale = !!entity && entity.classList.contains('on-sale');

        const price = parsePrice(el.querySelector(PRICE_SELECTOR)?.textContent);
        const original = parsePrice(el.querySelector(FULL_PRICE_SELECTOR)?.textContent);
        const pctText = el.querySelector(DISC_AMOUNT_SELECTOR)?.textContent;

        const discounted = onSale || (original != null && price != null && original > price);
        let disc = parseDiscountPct(pctText);
        if (!disc && discounted && original != null && price != null && original > 0) {
            disc = (original - price) / original;
        }

        const platforms = Array.from(el.querySelectorAll(PLATFORM_SELECTOR))
            .flatMap((li) => Array.from(li.classList))
            .filter((c) => c.startsWith('hb-') && c !== 'hb')
            .map((c) => c.slice(3));

        const ord = parseInt(el.getAttribute(ORD_ATTR), 10);
        return { name, price, original, discounted, disc, platforms, ord: isNaN(ord) ? 0 : ord };
    }

    // --- Ordenar / filtrar ------------------------------------------------------
    function getItems() { return Array.from(document.querySelectorAll(ITEM_SELECTOR)); }
    function getListEl() { return document.querySelector(LIST_SELECTOR) || (document.querySelector(ITEM_SELECTOR)?.parentElement || null); }

    // Fija el orden original. Prefiere data-entity-index-key (lo pone Humble),
    // con respaldo al índice de aparición si algún ítem no lo trajera.
    function tagOriginalOrder(items) {
        items.forEach((el, i) => {
            if (el.getAttribute(ORD_ATTR) != null) return;
            const key = parseInt(el.getAttribute('data-entity-index-key'), 10);
            el.setAttribute(ORD_ATTR, String(isNaN(key) ? i : key));
        });
    }
    function priceCmp(a, b) { const x = a == null ? Infinity : a, y = b == null ? Infinity : b; return x - y; }

    function matchesPlatform(d) {
        if (!settings.platform || settings.platform === 'all') return true;
        return d.platforms.includes(settings.platform);
    }

    // Recopila las plataformas presentes en el wishlist para poblar el selector.
    function collectPlatforms(rows) {
        const set = new Set();
        rows.forEach(({ d }) => d.platforms.forEach((p) => set.add(p)));
        return Array.from(set).sort();
    }

    function apply() {
        const list = getListEl();
        if (!list) return;
        const items = getItems();
        if (!items.length) return;
        tagOriginalOrder(items);

        // Desconectar el observer mientras reordenamos: appendChild dispara
        // mutaciones de childList que reentrarían en apply() en bucle. Reconectar
        // al final descarta esas mutaciones propias y sigue escuchando cambios externos.
        applying = true;
        if (listObserver) listObserver.disconnect();
        try {
            const mul = settings.dir === 'desc' ? -1 : 1;
            const rows = items.map((el) => ({ el, d: extract(el) }));

            refreshPlatformOptions(collectPlatforms(rows));

            rows.sort((a, b) => {
                let c = 0;
                if (settings.sort === 'name') c = a.d.name.localeCompare(b.d.name, undefined, { sensitivity: 'base' });
                else if (settings.sort === 'price') c = priceCmp(a.d.price, b.d.price);
                else if (settings.sort === 'discount') c = a.d.disc - b.d.disc;
                else c = a.d.ord - b.d.ord;
                if (c === 0) c = a.d.ord - b.d.ord;
                return c * mul;
            });
            rows.forEach(({ el, d }) => {
                const hide = (settings.onlyDiscount && !d.discounted) || !matchesPlatform(d);
                el.style.display = hide ? 'none' : '';
                list.appendChild(el);
            });
        } finally {
            applying = false;
            if (listObserver) listObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
        }
    }

    // --- UI ---------------------------------------------------------------------
    function injectWishlistStyles() {
        if (document.getElementById(WL_STYLES_ID)) return;
        const style = document.createElement('style');
        style.id = WL_STYLES_ID;
        style.textContent = `
            #${TOOLBAR_ID} {
                display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
                margin: 0 0 16px; padding: 10px 12px; border-radius: 8px;
                background: rgba(127,127,127,.16); font-size: 14px; color: inherit;
            }
            #${TOOLBAR_ID} label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
            #${TOOLBAR_ID} select, #${TOOLBAR_ID} button {
                font-size: 14px; padding: 4px 8px; border-radius: 6px;
                border: 1px solid rgba(127,127,127,.5); background: inherit; color: inherit; cursor: pointer;
            }
            #${TOOLBAR_ID} .hbwl-dir { min-width: 2.2em; text-align: center; font-weight: 600; }
            #${TOOLBAR_ID} .hbwl-share { background: #cb272c; color: #fff; border: none; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    // Rellena el <select> de plataforma con las presentes en el wishlist más "Todas".
    function refreshPlatformOptions(present) {
        if (!platformSelEl) return;
        const options = ['all', ...present];
        // Solo reconstruye si cambió el conjunto de opciones.
        const current = Array.from(platformSelEl.options).map((o) => o.value).join(',');
        if (current === options.join(',')) return;
        platformSelEl.textContent = '';
        options.forEach((p) => {
            const o = document.createElement('option');
            o.value = p;
            o.textContent = PLATFORM_LABELS[p] || (p.charAt(0).toUpperCase() + p.slice(1));
            if (p === settings.platform) o.selected = true;
            platformSelEl.appendChild(o);
        });
        // Si la plataforma guardada ya no existe, vuelve a "Todas".
        if (!options.includes(settings.platform)) { settings.platform = 'all'; platformSelEl.value = 'all'; }
    }

    function buildToolbar() {
        injectWishlistStyles();
        const bar = document.createElement('div');
        bar.id = TOOLBAR_ID;

        const sortLabel = document.createElement('label');
        sortLabel.appendChild(document.createTextNode(t.sortLabel));
        const sortSel = document.createElement('select');
        SORTS.forEach((s) => {
            const o = document.createElement('option');
            o.value = s; o.textContent = SORT_LABELS[s];
            if (s === settings.sort) o.selected = true;
            sortSel.appendChild(o);
        });
        sortSel.addEventListener('change', () => {
            settings.sort = sortSel.value;
            settings.dir = (settings.sort === 'discount') ? 'desc' : 'asc';
            dirBtn.textContent = settings.dir === 'desc' ? '↓' : '↑';
            persistIfRemember(); apply();
        });
        sortLabel.appendChild(sortSel);

        const dirBtn = document.createElement('button');
        dirBtn.type = 'button';
        dirBtn.className = 'hbwl-dir';
        dirBtn.title = t.dirTitle;
        dirBtn.textContent = settings.dir === 'desc' ? '↓' : '↑';
        dirBtn.addEventListener('click', () => {
            settings.dir = settings.dir === 'desc' ? 'asc' : 'desc';
            dirBtn.textContent = settings.dir === 'desc' ? '↓' : '↑';
            persistIfRemember(); apply();
        });

        const platLabel = document.createElement('label');
        platLabel.appendChild(document.createTextNode(t.platformLabel));
        platformSelEl = document.createElement('select');
        // Se puebla en apply() vía refreshPlatformOptions; se siembra con lo mínimo.
        ['all'].forEach((p) => {
            const o = document.createElement('option');
            o.value = p; o.textContent = PLATFORM_LABELS[p] || p;
            if (p === settings.platform) o.selected = true;
            platformSelEl.appendChild(o);
        });
        platformSelEl.addEventListener('change', () => { settings.platform = platformSelEl.value; persistIfRemember(); apply(); });
        platLabel.appendChild(platformSelEl);

        const discLabel = document.createElement('label');
        const discChk = document.createElement('input');
        discChk.type = 'checkbox';
        discChk.checked = !!settings.onlyDiscount;
        discChk.addEventListener('change', () => { settings.onlyDiscount = discChk.checked; persistIfRemember(); apply(); });
        discLabel.appendChild(discChk);
        discLabel.appendChild(document.createTextNode(t.onlyDiscount));

        const remLabel = document.createElement('label');
        const remChk = document.createElement('input');
        remChk.type = 'checkbox';
        remChk.checked = settings.remember !== false;
        remChk.addEventListener('change', () => { settings.remember = remChk.checked; saveSettings(); });
        remLabel.appendChild(remChk);
        remLabel.appendChild(document.createTextNode(t.remember));

        const shareBtn = document.createElement('button');
        shareBtn.type = 'button';
        shareBtn.className = 'hbwl-share';
        shareBtn.textContent = t.copy;
        shareBtn.addEventListener('click', async () => {
            const url = buildShareUrl();
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(url);
                    shareBtn.textContent = t.copied;
                    setTimeout(() => { shareBtn.textContent = t.copy; }, 2000);
                } else { window.prompt(t.copyPrompt, url); }
            } catch (e) { window.prompt(t.copyPrompt, url); }
        });

        bar.appendChild(sortLabel);
        bar.appendChild(dirBtn);
        bar.appendChild(platLabel);
        bar.appendChild(discLabel);
        bar.appendChild(remLabel);
        bar.appendChild(shareBtn);
        return bar;
    }

    function ensureToolbar() {
        if (document.getElementById(TOOLBAR_ID)) return;
        const list = getListEl();
        if (!list) return;
        // Coloca la barra encima de todo el bloque del wishlist si existe.
        const anchor = document.querySelector('.wishlist-item-container') || list;
        anchor.parentNode.insertBefore(buildToolbar(), anchor);
    }

    // --- Observer + init --------------------------------------------------------
    function startObserver() {
        if (listObserver) return;
        listObserver = new MutationObserver(() => {
            if (applying) return;
            if (observerDebounce) return;
            observerDebounce = setTimeout(() => {
                observerDebounce = null;
                if (!isWishlist()) return;
                ensureToolbar();
                apply();
            }, 250);
        });
        listObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }

    function waitForItems(timeoutMs) {
        return new Promise((resolve) => {
            if (getItems().length) return resolve(true);
            const deadline = Date.now() + (timeoutMs || 20000);
            const iv = setInterval(() => {
                if (getItems().length) { clearInterval(iv); resolve(true); }
                else if (Date.now() > deadline) { clearInterval(iv); resolve(false); }
            }, 250);
        });
    }

    async function initWishlist() {
        const ok = await waitForItems(25000);
        if (!ok) return;

        const fromUrl = readUrlView();
        if (fromUrl) {
            settings.sort = fromUrl.sort;
            settings.dir = fromUrl.dir;
            settings.onlyDiscount = fromUrl.onlyDiscount;
            settings.platform = fromUrl.platform;
            if (settings.remember !== false) saveSettings();
        }
        ensureToolbar();
        apply();
        startObserver();
        console.log('(hbwl): Humble Bundle wishlist tools activos');
    }

    // =========================================================================
    // MÓDULO 2 — PÁGINA DE PRODUCTO: botones a GG.deals y PCGamingWiki
    // =========================================================================
    const GGDEALS_SEARCH_URL = 'https://gg.deals/games/?title=';
    const PCGW_SEARCH_URL = 'https://pcgamingwiki.com/w/index.php?search=';
    // Icono de GG.deals: favicon remoto (su CDN permite hotlink y carga bien en Humble).
    const GGDEALS_ICON_URL = 'https://gg.deals/favicon.ico';
    // Icono de PCGamingWiki: SVG inline. Su favicon.ico responde 403 al hotlink
    // (Cloudflare) desde otros dominios, así que como <img> remoto no se ve; el SVG
    // inline es markup y siempre pinta, sin depender del CSP ni del hotlink.
    const PCGW_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 827 1158" width="13" height="18" aria-hidden="true" style="vertical-align:middle;flex:0 0 auto"><path d="M0 166.2 448.9-1.1 827.4 56.1l0 1023.9 0.1 28.9L452.1 1158.9 0 1008.4z" fill="#365798"/><path d="M25.3 985.5 24.1 190.5 413 46.8 412 1107.6zM478.1 1108.6 478.3 52.3 788.1 94.3l0 975.8z" fill="#a5b6d9"/><path d="M215.5 737 41.5 727 40.3 420.5 215.9 404.1zm16.7-334.5 156.1-19.4-1.2 359.8-155.2-4.8zM39.3 399.9l0-194.4 176-57.4 1.2 232.1zm350.8-317.2 0.9 274.5-158.7 20.4 0-238zm-253 909.7 0-235.1 141.7 9.3 0 268.4zm247 80.8-17.3-6.4c3.8-22.5-18.9-31.9-19.1-5.7l-18.7-5.5c-0.9-22.1-13.9-31.7-21.2-6.8l-9.7-3-0.6-277.7 12.3 0.9c-4.3 27.5 23.5 28.2 20.3 1.7L350.4 772c-4.4 28.6 23.2 28.9 20.4 1.3l12.7 0.8zM42.8 751.1l82.2 5.9-0.5 108-81.9-11.2zm83.1 129.3-0.9 110.4-82.7-20.2 0-102.4zM494.3 70l278.6 36.6 0 950-278.3 35.1z" fill="#365798"/><path d="m279 507.5c-0.1-5.1 0-10 3.2-14.2 6 0.2 4.9 9.7 5 14.3 10.3 5.1 4.9-10.8 10.2-15.3 7.6-0.8-0.6 16 6.9 15.8 4.9-0.1 3.9-2.4 3.8-6.7-0.1-3.9 0.4-7.8 3.8-10.3 8.2 3.1 0.8 18.2 11.2 15.8 0-6.4-1-14.2 5.8-17.6 2.6 5.2-0.1 14.8 5.4 16.1 7.4 1.7 8.4 3.6 10.2 10.5 0.8 3.1-0.4 4.6 2.8 6.4 3.5 2 7.6 1.4 7.7 6.1 0.1 6.4-2.7 5.5-7.6 5.5-1.8 0-2.4 3.4-2.5 4.7-0.4 4.7 0.4 5.7 5 7 5.9 1.7 4.9 3.3 4.9 8.7 0 2.7 0.5 1.2-3.1 1.9-5.7 1.1-7 0.3-6.7 6.8 0.4 7.8 13.4 1.4 9.7 12.6-1.6 4.8-9.5 1.1-9.5 5.3 0 5.3-1.1 7.7 5.4 8.2 6.4 0.5 6 9.1 0.4 11-3.4 1.2-4.6-0.1-5.8 4-1.2 4.1-1.1 8.4-2.6 12.5-6.1 4.5-11.6-1.7-11.6 8.4 0 2.7-0.6 4.7-1.1 7.3-0.9 5-2.2 0.7-5.8 1.8-1-1.2 0-7.9 0-9.5 0-4.7-1.6-5.8-7-5.4-0.3 5.8-0.2 12-4.9 16.2-2.9-1.9-4-4.8-4.2-8.1-0.3-6.5 0.2-6.7-6.5-8.3-1.2 2.9-2 11.4-1.5 14.5-5.2 2.6-6-5.4-6-8.6 0-2.7 1.1-5.7-2.3-6.7-3.4-0.9-4.6 0.8-4.7 3.9-0.2 6.1-0.5 8.8-5.3 12.2-1.9-5.4-0.3-14.7-6.6-16.4-7-1.8-7.9-6.9-8-13.6-0.1-7.3-8.9-0.3-8.9-8.2 0-0.8-0.6-4.9 0-5.5 2.9-2.1 5.8 1.2 8.5 0.1 1.3-3.6 1.8-9-2.1-9.9-4-0.9-7.8-1.4-6.9-6 1.1-5.7 0.1-5.4 6.3-5.8 4.7-0.3 3-5.2 3.1-8.4-6.2-2.9-8.8 0.8-8.8-7.4 0-5.6-0.4-5.1 5.2-5.1 4.8 0 3.4-1.7 3.4-6.3 0-5.1-9.2-0.6-9.6-7.6-0.2-3 1-5.6 3.9-6.7 5.1-2 5.7-2.3 5.9-7.8 0.3-8 5.6-8.9 12-12.1l0 0 0 0zM88.3 368.3l24.3-92.2-15.7 7.5 21.6-79 25.5-7.3-19.1 53.1 19.2-10.3-55.7 128.3 0 0z" fill="#a5b6d9"/><path d="m278.8 317.9c1.2-3.2 2.5-6.5 3.8-9.9 13.8 5.9 26.4 10.2 40.6 1.9 13.7-8 22.8-24.3 28-38.8 10.2-28.4 10.2-66.8-8.3-91.8-22.5-30.5-54.5-14.5-69.8 13.9-4.7 8.8-11.2 31.3-12.1 45.3-0.5 6.9-0.2 14.1 0.8 21.3 1 8.1 5.2 16.5 4.2 24.7-0.3 2.5-1.8 4.1-4.6 4.6-16.7-28-7.6-72.9 4.9-100.6 12.5-27.6 47.9-55.5 75.9-29 25.7 24.2 28.2 68.1 21.3 100.3-6.2 28.8-26 71.4-61.9 68.2-6.4-0.6-19.1-3.8-22.7-10l0 0zM299.3 272c-3.2-11.6 11.5-19.5 14.8-28.4 1.9-5.2-0.1-9.6-2.2-14-4.9-2.6-9-1.1-10.8 4-3.2 8.9-6.5 14.9-12.6 22.1-3.3-13.7-1.4-29.1 6.6-40.9 4.3-6.3 12.9-9.4 19.4-6.9 20.5 7.8 14.2 42.7 5.3 56.4-4.7 7.3-12.7 7.6-20.5 7.6L299.3 272zm3.4-25.8c0.5 0.7 0.5 1.4 0.2 2-9.4 21.3-18.7 42.6-28.2 64-0.9-0.4-1.4-0.4-1.7-0.7-3.3-3.9-5.6-8.5-7.8-13.1-0.9-1.8 0.1-3.6 1.2-5.1l32.8-43.7c0.9-1.3 2-2.6 3.4-3.4l0 0z" fill="#a5b6d8"/><path d="m188.7 921.7c-6.1 11.9-4.4 25.1-6 38-9.7-2.4-16.7-21.7-18.6-30 1.7-9.9 6.9-17.2 12.9-24.9 2.8-3.6 3.7-7.2 1.9-11.4-0.7-1.6-0.6-3.6-2-4.9-8.7 1.5-13.9 8.2-19.9 14-6.7-7-5.2-33.4 0.2-41.1 8.4-1.5 15.8 1 22.6 5.8 5.3-5.2 5.6-10.3 0.9-15.7-3.6-4.1-14.7-8.9-16.7-13.1-1.6-6.3 10.2-27.5 17.3-27.2 7.8 11.5 12.4 24.5 15 38.1 2.7 1.1 5.1 2.1 8.2 1.5 1.6-15.5-1.9-30.3-6.8-44.8 0.5-0.5 0.8-0.9 1-0.9 8.6 0.6 16.8 2.3 23.4 8.6 14.9 14.2-11.5 41.7 0.4 58.4 10.7-10.3 10.5-23.1 18.6-34 8 10.3 15 31 13.7 44.1-6.9 8.3-12.4 13-28.9 14.2 0.5 3.7-1.8 7.2-0.8 11.5 8.8 9.4 18.5 7.9 30.1 7.2 1.6 8.2-6.7 33.6-12.9 39.7-12.6-5.7-19.1-17.9-26.1-29.1-2.5 1.9-4.6 3.7-6.4 6.1 1.7 12.9 18 29.3 15.9 40.7-5.5 2.6-11.4 4.3-17.7 3.4-6.2-0.9-8.7-4.3-10.2-10.9-3.3-14.7 3.2-32.8-9.2-43.3zm118.5 22.1 0-63.8 67.8 10.9 0 67.4zM307.1 804.2 375 811.3 375 878.1 307.1 868.2zm67.7 165.5 0 66.8-67.6-18.6 0-63.6zm-320.5-31.7 0-28.9 13.7 2 16.5-16.6 0.7 67.6-16.3-20.9z" fill="#a5b6d9"/><path d="m89.1 914.4c1.4-0.6 2.3-0.5 3.4-0.2 2.8 6.5 3.9 13.4 3.6 20.5-0.1 2.7-1.1 5.1-1.7 7.6-0.5 1.9-1.8 3-3.4 3.9-1.3-1.3-0.9-2.5-0.6-3.8 0.8-3.7 1.6-7.3 1.7-11.1 0.2-5.8-1.6-11.2-2.9-16.9l0 0 0 0zm7 42.4c-0.3-3.3 0.9-6.2 1.6-9.1 1-4.4 2.5-8.8 3.1-13.2 0.8-5.6-1-11-2.4-16.4-0.7-2.5-1.5-5-2.2-7.5-0.4-1.6-0.7-3.1 0.2-4.5 1.3-0.1 1.8 0.6 2.1 1.3 2.1 4.3 3.6 8.6 4.5 13.3 1 5.5 0.5 10.9 0.9 16.3 0.3 3.5-0.8 6.9-1.3 10.2-0.6 3.8-2.6 7.4-6.6 9.6l0 0zm7.6 10.4c-1.9-3.7-1.4-6.5-0.1-9.8 3.1-8.1 5.9-16.4 5.3-25.2-0.5-7.7-1.8-15.2-4.6-22.4-1.2-3-2.3-6.1-3.3-9 0.8-1.2 1.7-2 3.4-1.6 1.8 4.1 3.9 8.3 5.1 12.8 5 19 5 37.4-5.7 55.3l0 0z" fill="#a5b6d9"/><path d="m598.7 1047.1-70.3 8.4-0.2-378.8 70.5-3.8zM688.5 533.1c-11 50.3-65.8 45.6-78.3 2.8l-92.4 3.1-0.2-67.9 89.4-3.3c22.8-54 64.5-46.2 81.8 0.2l66.2 0.4 1.6 61.8zm-172.4-237.1 0-24 241.7 7.5 0.1 19.4z" fill="#a5b6d9"/><path d="m52.3 827.5 62.6 9.7-19.2-43.4-8.2 15-13.4-29.3-21.8 48.1zM116.4 788c0 4.4-3.5 7.9-7.9 7.9-4.4 0-7.9-3.5-7.9-7.9 0-4.4 3.5-7.9 7.9-7.9 4.4 0 7.9 3.5 7.9 7.9z" fill="#a5b6d9"/><ellipse cx="649.4" cy="501.8" rx="31" ry="51.8" fill="#365798"/><path d="m177.7 627.1c-1.8 3-1.6 6.7 0.4 9.3l-26.3 40 6.6-0.1 25-36.7c3.2 0.6 6.6-0.9 8.5-3.8 2.4-3.9 1.2-9-2.7-11.4-3.9-2.4-9-1.2-11.5 2.7zm-110.8 29.7-9.7 12.9 4.6 4.3 7.9-11 7.1 0.3c0.4 0.7 0.9 1.4 1.5 2 3.3 3.3 8.6 3.3 11.8 0 3.3-3.3 3.3-8.6 0-11.8-3.3-3.3-8.6-3.3-11.8 0-1 1-1.7 2.3-2.1 3.6zm20.1-68.7c-4.4 0-8 3.6-8 8 0 4.4 3.6 8 8 8 3.7 0 6.8-2.5 7.7-6l44.5 1.3 17.4 21.5c-0.2 0.8-0.4 1.6-0.4 2.4 0 4.6 3.8 8.4 8.4 8.4 4.6 0 8.4-3.8 8.4-8.4 0-4.6-3.8-8.4-8.4-8.4-1.5 0-2.9 0.4-4.1 1.1l-18.9-22.9-48-1.3c-1.4-2.2-3.9-3.7-6.8-3.7zm13.5 27c-4.6 0.1-8.3 4-8.1 8.6 0.1 4.6 4 8.3 8.6 8.1 3.3-0.1 6-2.1 7.3-4.9l22.2-0.5c1.4 2.9 4.4 4.8 7.8 4.7 4.6-0.1 8.3-4 8.1-8.6-0.1-4.6-4-8.3-8.6-8.1-3.6 0.1-6.6 2.5-7.7 5.7l-21.5 0.5c-1.2-3.3-4.4-5.7-8.1-5.6zm-26 16.7c0 4.4-3.6 8-8 8-4.4 0-8-3.6-8-8 0-4.4 3.6-8 8-8 4.4 0 8 3.6 8 8zM87.6 476.5c-3.5 0.2-6.4 2.5-7.5 5.6l-22.6 1 0.3 6.2 22.6-1c1.4 3 4.4 5 7.9 4.9 4.6-0.2 8.1-4.1 7.9-8.7-0.2-4.6-4.1-8.2-8.7-8zm56.3 20c-4.6 0.1-8.3 4-8.1 8.6 0.1 4.6 4 8.3 8.6 8.1 3.3-0.1 6-2.1 7.3-4.9l25.3-0.7c1.4 2.9 4.4 4.8 7.8 4.7 4.6-0.1 8.3-4 8.1-8.6-0.1-4.6-4-8.3-8.6-8.1-3.6 0.1-6.6 2.5-7.7 5.7l-24.6 0.7c-1.2-3.3-4.4-5.7-8.1-5.6zm-44.4-30.4-4.1 4.7 19.8 17.1 80.9-3-0.5-6.2-78.3 2.8zm-41.6 51.7-0.2-6 68.2-4 71.4 103.9-5.3 3.3-70.1-101.1zm132.6 25.4c2.3-2.6 2.6-6.3 1.1-9.3l6.6-9.5 0.4-9-11.7 14.4c-3.1-1.1-6.7-0.2-9 2.4-3 3.5-2.7 8.7 0.8 11.7 3.5 3 8.7 2.7 11.8-0.8zm-32.3 0.4c2 2.9 5.5 4.1 8.7 3.3l30.7 44.3-0.1-9.8-25.5-38c1.8-2.8 1.8-6.4-0.2-9.3-2.6-3.8-7.8-4.7-11.6-2-3.8 2.6-4.7 7.8-2.1 11.6zm-34.8-9.6c-3.5 0.2-6.4 2.5-7.5 5.6l-57.2 2.9 0.3 6.2 57.2-2.9c1.4 3 4.4 5 7.9 4.9 4.6-0.2 8.1-4.1 7.9-8.7-0.2-4.6-4.1-8.2-8.7-8zm17.5 33-81.3 2 0.2 6.3 78.7-2 17.5 22.3c-0.2 0.8-0.4 1.6-0.4 2.4 0 4.6 3.8 8.4 8.4 8.4 4.6 0 8.4-3.8 8.4-8.4 0-4.6-3.8-8.4-8.4-8.4-1.5 0-2.9 0.4-4.1 1.1zM179.2 672.5c1.2 2.6 5 0.2 5.7 3.6-1 4.1-8.9 0.5-11.6 0.9-1.4-4.3 8.4-15.3 10.9-18.8 2.8-1.4 9.4 0 12.6 0 0.3 2.8 0.5 5.3-1.5 7.8-3.4 0.1-6.7-1.4-10.1-1.7-2 2.7-4 5.5-6 8.2zM67.3 604.9l-8.1 0 0-6.7c6.2 0 9.7-1.6 13.2 3.9 6.6 10.3 12.8 20.9 19.1 31.4 3.1 5.2 6.3 10.4 9.5 15.5 4.6 7.4 5.8 8 14.6 8.6 6.3 0.4 12.7 0.4 19.1 0.4 6.6 0 6.4-5.5 12.7-4.9 5.4 5.1 5.4 11.7 0 16.8-6 0.4-5.3-5.8-9.8-5.8l-19.2 0c-9.5 0-12.4 2.1-17.3-5.6-11.2-17.9-22.4-35.7-33.6-53.6z" fill="#a5b6d9"/><path d="m339.3 257.1c0 3.2-2.6 5.9-5.9 5.9-3.2 0-5.9-2.6-5.9-5.9 0-3.2 2.6-5.9 5.9-5.9 3.2 0 5.9 2.6 5.9 5.9zm14.4-13.7c0 3.2-2.6 5.9-5.9 5.9-3.2 0-5.9-2.6-5.9-5.9 0-3.2 2.6-5.9 5.9-5.9 3.2 0 5.9 2.6 5.9 5.9zm23 0c0 3.2-2.6 5.9-5.9 5.9-3.2 0-5.9-2.6-5.9-5.9 0-3.2 2.6-5.9 5.9-5.9 3.2 0 5.9 2.6 5.9 5.9zm-12.9 46.6c0 3.2-2.6 5.9-5.9 5.9-3.2 0-5.9-2.6-5.9-5.9 0-3.2 2.6-5.9 5.9-5.9 3.2 0 5.9 2.6 5.9 5.9zm14.7-11.5c0 3.2-2.6 5.9-5.9 5.9-3.2 0-5.9-2.6-5.9-5.9 0-3.2 2.6-5.9 5.9-5.9 3.2 0 5.9 2.6 5.9 5.9zm7.4-18.3c0 3.2-2.6 5.9-5.9 5.9-3.2 0-5.9-2.6-5.9-5.9 0-3.2 2.6-5.9 5.9-5.9 3.2 0 5.9 2.6 5.9 5.9z" transform="matrix(0.59478444,0,0,0.93466127,95.788817,-7.8295466)" fill="#365798"/></svg>';

    // La página de producto se identifica por este bloque, que NO existe en
    // /store (listado), /store/search ni /store/wishlist.
    const PRODUCT_GRID_SELECTOR = '.platform-pricing-grid';
    // Iconos de sistema operativo: su presencia marca que es un juego de PC.
    const PC_OS_SELECTOR = 'i.hb-windows, i.hb-mac, i.hb-apple, i.hb-linux';
    // Puntos de anclaje (en orden de preferencia) para insertar los botones.
    const ANCHOR_SELECTORS = ['.js-wishlist-container', '.shopping-cart-button-container', PRODUCT_GRID_SELECTOR];

    const LINKS_ID = 'hbx-external-links';
    const LINKS_STYLES_ID = 'hbx-external-styles';
    const TRADEMARK_REGEX = /[™®©]/g;
    // Prefijos/sufijos que Humble añade en og:title/document.title según el idioma,
    // p. ej. "Comprar {juego} en la tienda Humble" / "Buy {juego} on Humble Store".
    const TITLE_PREFIX_REGEX = /^\s*(?:comprar|compra|buy|acheter|kaufen|acquista|comprar agora)\s+/i;
    const TITLE_SUFFIX_REGEX = /\s+(?:en la tienda|na loja|on the|on|dans la boutique|im)\s+Humble.*$/i;

    // Nombre del juego. Fuente primaria: el <h1> visible (ya viene limpio); como
    // respaldo, og:title / document.title, a los que se les quita el prefijo/sufijo
    // que Humble añade (p. ej. "Comprar … en la tienda Humble").
    function getGameTitle() {
        const h1 = document.querySelector('.js-page-content h1, .main-content h1, h1')?.textContent;
        const og = document.querySelector('meta[property="og:title"]')?.content;
        let title = (h1 || og || document.title || '').trim();
        title = title
            .replace(TITLE_PREFIX_REGEX, '')          // "Comprar …"
            .replace(TITLE_SUFFIX_REGEX, '')          // "… en la tienda Humble"
            .replace(/\s*[-|]\s*Humble\b.*$/i, '')    // "… - Humble Store"
            .replace(TRADEMARK_REGEX, '')
            .replace(/\s+/g, ' ')
            .trim();
        return title;
    }

    // Es producto de PC si hay parrilla de precios y dentro un icono de SO.
    function isPcProductPage() {
        const grid = document.querySelector(PRODUCT_GRID_SELECTOR);
        if (!grid) return false;
        return !!grid.querySelector(PC_OS_SELECTOR);
    }

    function injectLinkStyles() {
        if (document.getElementById(LINKS_STYLES_ID)) return;
        const style = document.createElement('style');
        style.id = LINKS_STYLES_ID;
        style.textContent = `
            #${LINKS_ID} { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
            #${LINKS_ID} .hbx-btn {
                display: flex; align-items: center; justify-content: center; gap: 8px;
                width: 100%; box-sizing: border-box; padding: 12px 14px;
                border-radius: 4px; font-size: 14px; font-weight: 700; letter-spacing: .3px;
                text-transform: uppercase; text-decoration: none; cursor: pointer;
                transition: filter .15s ease;
            }
            #${LINKS_ID} .hbx-btn:hover { filter: brightness(1.12); text-decoration: none; }
            #${LINKS_ID} .hbx-ico { width: 18px; height: 18px; object-fit: contain; flex: 0 0 auto; }
            #${LINKS_ID} .hbx-gg   { background: #12a150; color: #fff; }
            #${LINKS_ID} .hbx-pcgw { background: #3d4450; color: #fff; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    // opts: { iconUrl } (favicon remoto) o { iconSvg } (SVG inline, a prueba de CSP/hotlink)
    function makeLinkButton(cls, label, href, opts) {
        const a = document.createElement('a');
        a.className = `hbx-btn ${cls}`;
        a.href = href;
        a.target = '_blank';
        a.rel = 'nofollow noopener external';
        if (opts && opts.iconSvg) {
            const span = document.createElement('span');
            span.className = 'hbx-ico';
            span.style.display = 'inline-flex';
            span.innerHTML = opts.iconSvg;
            a.appendChild(span);
        } else if (opts && opts.iconUrl) {
            const img = document.createElement('img');
            img.className = 'hbx-ico';
            img.src = opts.iconUrl;
            img.alt = '';
            img.addEventListener('error', () => img.remove());  // sin icono si el CSP lo bloquea
            a.appendChild(img);
        }
        a.appendChild(document.createTextNode(label));
        return a;
    }

    function buildLinks(title) {
        injectLinkStyles();
        const box = document.createElement('div');
        box.id = LINKS_ID;
        const q = encodeURIComponent(title);
        box.appendChild(makeLinkButton('hbx-gg', 'GG.deals', GGDEALS_SEARCH_URL + q, { iconUrl: GGDEALS_ICON_URL }));
        box.appendChild(makeLinkButton('hbx-pcgw', 'PCGamingWiki', PCGW_SEARCH_URL + q, { iconSvg: PCGW_ICON_SVG }));
        return box;
    }

    function insertLinks() {
        if (document.getElementById(LINKS_ID)) return;
        const title = getGameTitle();
        if (!title) return;

        let anchor = null;
        for (const sel of ANCHOR_SELECTORS) {
            anchor = document.querySelector(sel);
            if (anchor) break;
        }
        if (!anchor) return;

        const links = buildLinks(title);
        if (anchor.matches(PRODUCT_GRID_SELECTOR)) anchor.appendChild(links);
        else (anchor.closest('section') || anchor).after(links);
    }

    function initProductLinks() {
        let tries = 0;
        const iv = setInterval(() => {
            tries++;
            let done = false;
            try {
                if (isPcProductPage()) { insertLinks(); done = true; }
            } catch (e) { console.error('(hbx-links): Error:', e); done = true; }
            if (done || tries > 40) clearInterval(iv);  // ~10 s máx.
        }, 250);
    }

    // =========================================================================
    // INICIALIZACIÓN (por ruta + SPA)
    // =========================================================================
    function route() {
        try {
            if (isWishlist()) initWishlist();
            else initProductLinks();
        } catch (e) { console.error('(humble-bundle-tools): Error:', e); }
    }

    (function watchSpaNav() {
        const fire = () => setTimeout(route, 300);
        const p = history.pushState, r = history.replaceState;
        history.pushState = function () { p.apply(this, arguments); fire(); };
        history.replaceState = function () { r.apply(this, arguments); fire(); };
        window.addEventListener('popstate', fire);
    })();

    route();
})();
