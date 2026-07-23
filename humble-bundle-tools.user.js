// ==UserScript==
// @name         Humble Bundle Tools
// @namespace    https://www.humblebundle.com/
// @version      1.0.1
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
    const PCGW_ICON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V7h3.5L13 3.5zM8 11h8v1.5H8zm0 3h8v1.5H8zm0-6h5v1.5H8z"/></svg>';

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
