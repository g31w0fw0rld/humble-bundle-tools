// ==UserScript==
// @name         Humble Bundle Tools
// @namespace    https://www.humblebundle.com/
// @version      1.1.0
// @description  Humble Store, two things. On your wishlist: sort by added, name, price or discount with an ascending/descending toggle, filter by platform (built from what your list actually contains) or by 'only discounted', with remembered settings, a readable shareable URL and a 'Learn more' panel. On PC product pages: buttons to GG.deals and PCGamingWiki, searching by the cleaned game title and saying so in their tooltip.
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
        const m = txt.replace(/\s/g, '').match(/[\d.]+/);
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
    // IDIOMA
    // =============================================
    // Los 6 idiomas que sirve Humble, con los mismos códigos que usa el selector
    // del pie (atributo data-locale). Ojo: allí el chino va como 'zh_CN', con
    // guion BAJO, que normalizeLang convierte a 'zh-cn' y reduce a 'zh'.
    const SUPPORTED_LANGS = ['en', 'es', 'de', 'fr', 'it', 'zh'];

    // Reduce un código BCP-47 ('de-DE', 'zh_CN') al idioma soportado más cercano;
    // '' si no hay ninguno, para que la cascada pase al siguiente paso.
    function normalizeLang(raw) {
        const code = (raw || '').toLowerCase().replace(/_/g, '-');
        if (!code) return '';
        if (SUPPORTED_LANGS.includes(code)) return code;
        const base = code.split('-')[0];
        return SUPPORTED_LANGS.includes(base) ? base : '';
    }

    // Cascada, de la señal más fiel a la menos. Lo que manda es el paso 1: si el
    // usuario eligió un idioma en el selector de Humble, el script habla ESE
    // idioma en vez de adivinar por navegador y contradecir a la página.
    //   1) la opción marcada .active en el selector del pie: es su elección
    //      explícita, tal cual la guarda Humble.
    //   2) <html lang>: el idioma con el que Humble sirvió la página realmente
    //      (lo negocia por Accept-Language cuando no hay elección guardada).
    //   3) navigator.languages, si la página no dijo nada.
    //   4) inglés.
    // El script corre en document-idle, así que el pie ya está en el DOM; aun así
    // el paso 2 cubre cualquier cambio de maquetación sin romper nada.
    function detectLang() {
        const active = document.querySelector('.js-language-container li.active button[data-locale]');
        const fromPicker = normalizeLang(active && active.getAttribute('data-locale'));
        if (fromPicker) return fromPicker;
        const fromDoc = normalizeLang(document.documentElement.getAttribute('lang'));
        if (fromDoc) return fromDoc;
        for (const l of [navigator.language, ...(navigator.languages || [])]) {
            const n = normalizeLang(l);
            if (n) return n;
        }
        return 'en';
    }
    const LANG = detectLang();
    const I18N = {
        es: {
            sortLabel: 'Ordenar:', added: 'Agregado', name: 'Nombre', price: 'Precio', discount: 'Descuento',
            platformLabel: 'Plataforma:', all: 'Todas', uplay: 'Ubisoft', origin: 'EA', key: 'Clave', drmfree: 'Sin DRM',
            onlyDiscount: 'Solo con descuento', remember: 'Recordar',
            copy: '🔗 Copiar enlace', copied: '✔ Copiado', copyPrompt: 'Copia este enlace:',
            about: 'ℹ️ Saber más', close: 'Cerrar',
            sortTip: 'Ordena tu lista de deseos por fecha de agregado, nombre, precio o porcentaje de descuento.',
            dirTip: 'Alterna entre orden ascendente (↑) y descendente (↓).',
            platformTip: 'Muestra solo los juegos de la plataforma elegida (Steam, Epic, GOG, etc.). "Todas" no filtra.',
            onlyDiscountTip: 'Oculta los juegos que no están en oferta; muestra solo los que tienen descuento.',
            rememberTip: 'Guarda tu orden y filtros y los reaplica al volver a la lista de deseos.',
            copyTip: 'Copia un enlace que reproduce tu orden y filtros actuales al abrirlo.',
            aboutTip: 'Ver qué hace este script en su totalidad.',
            ggTip: 'Busca el título en el catálogo de GG.deals, sin filtro de tienda ni de DRM: Humble revende llaves de varias. Al buscar por nombre, puede no dar con el juego exacto.',
            pcgwTip: 'Busca el título en PCGamingWiki (compatibilidad y arreglos). Al buscar por nombre, puede no dar con el artículo exacto.',
            aboutTitle: '¿Qué hace este script?',
            aboutBody: [
                'Este script mejora la Humble Store en dos frentes:',
                '• En tu lista de deseos añade una barra de herramientas:',
                '– Ordenar: por fecha de agregado, nombre, precio o descuento, con un botón ↑/↓ para ascendente o descendente. "Agregado" restaura el orden original de Humble, leído del índice que el propio sitio pone en cada fila.',
                '– Plataforma: filtra por Steam, Epic, GOG, Ubisoft, EA, clave o sin DRM. El desplegable se arma con lo que realmente hay en tu lista, así que nunca ofrece una opción que devolvería cero.',
                '– Solo con descuento: muestra únicamente los juegos en oferta. Cuenta como rebajado si Humble lo marca en oferta o si el precio original es mayor que el actual; si falta el badge de porcentaje, el descuento se calcula con los dos precios.',
                '– Recordar: guarda tu orden y filtros y los reaplica al volver. Si lo apagas, no se guarda nada.',
                '– Copiar enlace: genera una URL que reproduce tu orden, dirección, plataforma y "solo con descuento". Los parámetros son legibles, así que el enlace se puede guardar en marcadores. Si el navegador bloquea el portapapeles, la muestra en un diálogo para copiarla a mano.',
                '• En las páginas de producto añade botones a GG.deals (precios/ofertas) y PCGamingWiki (compatibilidad y arreglos).',
                '– Solo en juegos de PC. Se reconocen por el icono de sistema operativo (Windows, Linux, Mac) o, si la parrilla no trae ninguno, por el de una tienda que solo existe en PC (Steam, GOG, Epic, Ubisoft, EA, Battle.net).',
                '– Ambos buscan por el título, que se limpia antes de los adornos comerciales de Humble ("Comprar …", "… en la tienda Humble", símbolos de marca). Al buscar por nombre pueden no acertar, y cada uno lo dice en su tooltip.',
                'Todo se procesa en tu navegador (se guarda en localStorage); no se envían datos a ningún servidor.'
            ]
        },
        en: {
            sortLabel: 'Sort:', added: 'Added', name: 'Name', price: 'Price', discount: 'Discount',
            platformLabel: 'Platform:', all: 'All', uplay: 'Ubisoft', origin: 'EA', key: 'Key', drmfree: 'DRM-free',
            onlyDiscount: 'Only discounted', remember: 'Remember',
            copy: '🔗 Copy link', copied: '✔ Copied', copyPrompt: 'Copy this link:',
            about: 'ℹ️ Learn more', close: 'Close',
            sortTip: 'Sorts your wishlist by date added, name, price or discount percentage.',
            dirTip: 'Toggles ascending (↑) and descending (↓) order.',
            platformTip: 'Shows only games for the chosen platform (Steam, Epic, GOG, etc.). "All" does not filter.',
            onlyDiscountTip: 'Hides games that are not on sale; shows only discounted ones.',
            rememberTip: 'Saves your sort and filters and reapplies them when you return to the wishlist.',
            copyTip: 'Copies a link that reproduces your current sort and filters when opened.',
            aboutTip: 'See everything this script does.',
            ggTip: 'Searches the title in the GG.deals catalogue, with no store or DRM filter: Humble resells keys for several. Being a title search, it may not hit the exact game.',
            pcgwTip: 'Searches the title on PCGamingWiki (compatibility and fixes). Being a title search, it may not hit the exact article.',
            aboutTitle: 'What does this script do?',
            aboutBody: [
                'This script improves the Humble Store in two ways:',
                '• On your wishlist it adds a toolbar:',
                '– Sort: by date added, name, price or discount, with an ↑/↓ button for ascending or descending. "Added" restores Humble\'s own original order, read from the index the site puts on each row.',
                '– Platform: filter by Steam, Epic, GOG, Ubisoft, EA, key or DRM-free. The dropdown is built from what is actually in your list, so it never offers an option that would return nothing.',
                '– Only discounted: shows only games on sale. A game counts as discounted if Humble marks it on sale or if the original price is higher than the current one; when the percentage badge is missing, the discount is worked out from the two prices.',
                '– Remember: saves your sort and filters and reapplies them on return. Turn it off and nothing is stored.',
                '– Copy link: builds a URL that reproduces your sort, direction, platform and "only discounted". The parameters are readable, so the link is bookmarkable. If the browser blocks clipboard access, it shows the URL in a dialog so you can copy it by hand.',
                '• On product pages it adds buttons to GG.deals (prices/deals) and PCGamingWiki (compatibility and fixes).',
                '– PC games only. They are recognised by the operating-system icon (Windows, Linux, Mac) or, when the grid carries none, by a storefront that only exists on PC (Steam, GOG, Epic, Ubisoft, EA, Battle.net).',
                '– Both search by title, cleaned first of Humble\'s commercial wrapping ("Buy …", "… on Humble Store", trademark symbols). Being title searches they can miss, and each says so in its tooltip.',
                'Everything runs in your browser (stored in localStorage); no data is sent to any server.'
            ]
        },
        de: {
            sortLabel: 'Sortieren:', added: 'Hinzugefügt', name: 'Name', price: 'Preis', discount: 'Rabatt',
            platformLabel: 'Plattform:', all: 'Alle', uplay: 'Ubisoft', origin: 'EA', key: 'Key', drmfree: 'DRM-frei',
            onlyDiscount: 'Nur reduzierte', remember: 'Merken',
            copy: '🔗 Link kopieren', copied: '✔ Kopiert', copyPrompt: 'Diesen Link kopieren:',
            about: 'ℹ️ Mehr erfahren', close: 'Schließen',
            sortTip: 'Sortiert deine Wunschliste nach Hinzufügedatum, Name, Preis oder Rabatt in Prozent.',
            dirTip: 'Wechselt zwischen aufsteigender (↑) und absteigender (↓) Reihenfolge.',
            platformTip: 'Zeigt nur Spiele der gewählten Plattform (Steam, Epic, GOG usw.). „Alle“ filtert nicht.',
            onlyDiscountTip: 'Blendet Spiele aus, die nicht im Angebot sind; zeigt nur reduzierte.',
            rememberTip: 'Speichert Sortierung und Filter und wendet sie bei der Rückkehr zur Wunschliste wieder an.',
            copyTip: 'Kopiert einen Link, der beim Öffnen deine aktuelle Sortierung und Filter wiederherstellt.',
            aboutTip: 'Alles ansehen, was dieses Skript macht.',
            ggTip: 'Sucht den Titel im Katalog von GG.deals, ohne Shop- oder DRM-Filter: Humble verkauft Keys für mehrere. Da es eine Titelsuche ist, wird nicht immer das exakte Spiel getroffen.',
            pcgwTip: 'Sucht den Titel auf PCGamingWiki (Kompatibilität und Fixes). Da es eine Titelsuche ist, wird nicht immer der exakte Artikel getroffen.',
            aboutTitle: 'Was macht dieses Skript?',
            aboutBody: [
                'Dieses Skript verbessert den Humble Store an zwei Stellen:',
                '• Auf deiner Wunschliste kommt eine Werkzeugleiste dazu:',
                '– Sortieren: nach Hinzufügedatum, Name, Preis oder Rabatt, mit einer ↑/↓-Schaltfläche für auf- oder absteigend. „Hinzugefügt“ stellt Humbles eigene ursprüngliche Reihenfolge wieder her, gelesen aus dem Index, den die Seite selbst in jede Zeile schreibt.',
                '– Plattform: filtert nach Steam, Epic, GOG, Ubisoft, EA, Key oder DRM-frei. Das Auswahlmenü wird aus dem gebaut, was wirklich in deiner Liste steht, und bietet deshalb nie eine Option an, die nichts zurückgäbe.',
                '– Nur reduzierte: zeigt ausschließlich Spiele im Angebot. Als reduziert gilt, was Humble als Angebot markiert oder wo der ursprüngliche Preis über dem aktuellen liegt; fehlt das Prozent-Abzeichen, wird der Rabatt aus den beiden Preisen berechnet.',
                '– Merken: speichert Sortierung und Filter und wendet sie bei der Rückkehr wieder an. Ausgeschaltet wird nichts gespeichert.',
                '– Link kopieren: baut eine URL, die deine Sortierung, Richtung, Plattform und „Nur reduzierte“ wiederherstellt. Die Parameter sind lesbar, der Link lässt sich also als Lesezeichen speichern. Blockiert der Browser die Zwischenablage, wird die URL in einem Dialog zum Abschreiben angezeigt.',
                '• Auf Produktseiten kommen Schaltflächen zu GG.deals (Preise/Angebote) und PCGamingWiki (Kompatibilität und Fixes) dazu.',
                '– Nur bei PC-Spielen. Erkannt werden sie am Betriebssystem-Symbol (Windows, Linux, Mac) oder, wenn keines vorhanden ist, an einem Shop, den es nur auf dem PC gibt (Steam, GOG, Epic, Ubisoft, EA, Battle.net).',
                '– Beide suchen nach dem Titel, zuvor bereinigt um Humbles Verkaufsbeiwerk („Buy …“, „… on Humble Store“, Markenzeichen). Als Titelsuche können sie danebenliegen, und jede sagt das in ihrem Tooltip.',
                'Alles läuft in deinem Browser (gespeichert im localStorage); es werden keine Daten an einen Server gesendet.'
            ]
        },
        fr: {
            sortLabel: 'Trier :', added: 'Ajout', name: 'Nom', price: 'Prix', discount: 'Remise',
            platformLabel: 'Plateforme :', all: 'Toutes', uplay: 'Ubisoft', origin: 'EA', key: 'Clé', drmfree: 'Sans DRM',
            onlyDiscount: 'Uniquement en promo', remember: 'Mémoriser',
            copy: '🔗 Copier le lien', copied: '✔ Copié', copyPrompt: 'Copiez ce lien :',
            about: 'ℹ️ En savoir plus', close: 'Fermer',
            sortTip: 'Trie votre liste de souhaits par date d’ajout, nom, prix ou pourcentage de remise.',
            dirTip: 'Bascule entre l’ordre croissant (↑) et décroissant (↓).',
            platformTip: 'N’affiche que les jeux de la plateforme choisie (Steam, Epic, GOG, etc.). « Toutes » ne filtre pas.',
            onlyDiscountTip: 'Masque les jeux qui ne sont pas en promotion ; n’affiche que ceux en remise.',
            rememberTip: 'Enregistre votre tri et vos filtres et les réapplique à votre retour sur la liste de souhaits.',
            copyTip: 'Copie un lien qui reproduit votre tri et vos filtres actuels à l’ouverture.',
            aboutTip: 'Voir tout ce que fait ce script.',
            ggTip: 'Recherche le titre dans le catalogue GG.deals, sans filtre de boutique ni de DRM : Humble revend des clés de plusieurs. S’agissant d’une recherche par titre, le jeu exact peut ne pas être trouvé.',
            pcgwTip: 'Recherche le titre sur PCGamingWiki (compatibilité et correctifs). S’agissant d’une recherche par titre, l’article exact peut ne pas être trouvé.',
            aboutTitle: 'Que fait ce script ?',
            aboutBody: [
                'Ce script améliore le Humble Store sur deux fronts :',
                '• Sur votre liste de souhaits, il ajoute une barre d’outils :',
                '– Trier : par date d’ajout, nom, prix ou remise, avec un bouton ↑/↓ pour l’ordre croissant ou décroissant. « Ajout » restaure l’ordre d’origine de Humble, lu dans l’index que le site lui-même place sur chaque ligne.',
                '– Plateforme : filtre par Steam, Epic, GOG, Ubisoft, EA, clé ou sans DRM. Le menu est construit à partir de ce que contient réellement votre liste, il ne propose donc jamais une option qui ne renverrait rien.',
                '– Uniquement en promo : n’affiche que les jeux en solde. Un jeu compte comme remisé si Humble le signale en promotion ou si le prix d’origine dépasse le prix actuel ; en l’absence du badge de pourcentage, la remise est calculée à partir des deux prix.',
                '– Mémoriser : enregistre votre tri et vos filtres et les réapplique au retour. Désactivé, rien n’est stocké.',
                '– Copier le lien : construit une URL qui reproduit votre tri, sa direction, la plateforme et « uniquement en promo ». Les paramètres sont lisibles, le lien peut donc être mis en favori. Si le navigateur bloque le presse-papiers, l’URL s’affiche dans une boîte de dialogue pour la copier à la main.',
                '• Sur les pages produit, il ajoute des boutons vers GG.deals (prix/promotions) et PCGamingWiki (compatibilité et correctifs).',
                '– Jeux PC uniquement. Ils sont reconnus à l’icône du système d’exploitation (Windows, Linux, Mac) ou, si la grille n’en porte aucune, à une boutique qui n’existe que sur PC (Steam, GOG, Epic, Ubisoft, EA, Battle.net).',
                '– Les deux cherchent par titre, nettoyé au préalable des habillages commerciaux de Humble (« Buy … », « … on Humble Store », symboles de marque). Étant des recherches par titre, elles peuvent se tromper, et chacune le précise dans son infobulle.',
                'Tout est traité dans votre navigateur (stocké dans localStorage) ; aucune donnée n’est envoyée à un serveur.'
            ]
        },
        it: {
            sortLabel: 'Ordina:', added: 'Aggiunta', name: 'Nome', price: 'Prezzo', discount: 'Sconto',
            platformLabel: 'Piattaforma:', all: 'Tutte', uplay: 'Ubisoft', origin: 'EA', key: 'Chiave', drmfree: 'Senza DRM',
            onlyDiscount: 'Solo scontati', remember: 'Ricorda',
            copy: '🔗 Copia link', copied: '✔ Copiato', copyPrompt: 'Copia questo link:',
            about: 'ℹ️ Scopri di più', close: 'Chiudi',
            sortTip: 'Ordina la tua lista dei desideri per data di aggiunta, nome, prezzo o percentuale di sconto.',
            dirTip: 'Alterna tra ordine crescente (↑) e decrescente (↓).',
            platformTip: 'Mostra solo i giochi della piattaforma scelta (Steam, Epic, GOG, ecc.). «Tutte» non filtra.',
            onlyDiscountTip: 'Nasconde i giochi non in offerta; mostra solo quelli scontati.',
            rememberTip: 'Salva ordinamento e filtri e li riapplica quando torni alla lista dei desideri.',
            copyTip: 'Copia un link che all’apertura riproduce l’ordinamento e i filtri attuali.',
            aboutTip: 'Vedi tutto quello che fa questo script.',
            ggTip: 'Cerca il titolo nel catalogo di GG.deals, senza filtro di negozio né di DRM: Humble rivende chiavi di diversi. Trattandosi di una ricerca per titolo, potrebbe non trovare il gioco esatto.',
            pcgwTip: 'Cerca il titolo su PCGamingWiki (compatibilità e correzioni). Trattandosi di una ricerca per titolo, potrebbe non trovare la voce esatta.',
            aboutTitle: 'Che cosa fa questo script?',
            aboutBody: [
                'Questo script migliora l’Humble Store su due fronti:',
                '• Nella tua lista dei desideri aggiunge una barra degli strumenti:',
                '– Ordina: per data di aggiunta, nome, prezzo o sconto, con un pulsante ↑/↓ per crescente o decrescente. «Aggiunta» ripristina l’ordine originale di Humble, letto dall’indice che il sito stesso mette su ogni riga.',
                '– Piattaforma: filtra per Steam, Epic, GOG, Ubisoft, EA, chiave o senza DRM. Il menu si costruisce con quello che c’è davvero nella tua lista, quindi non offre mai un’opzione che restituirebbe zero risultati.',
                '– Solo scontati: mostra unicamente i giochi in offerta. Un gioco conta come scontato se Humble lo segna in offerta o se il prezzo originale è superiore a quello attuale; se manca il badge della percentuale, lo sconto si calcola dai due prezzi.',
                '– Ricorda: salva ordinamento e filtri e li riapplica al ritorno. Se lo disattivi, non viene salvato nulla.',
                '– Copia link: genera un URL che riproduce ordinamento, direzione, piattaforma e «solo scontati». I parametri sono leggibili, quindi il link si può salvare nei preferiti. Se il browser blocca gli appunti, l’URL viene mostrato in una finestra per copiarlo a mano.',
                '• Nelle pagine di prodotto aggiunge pulsanti verso GG.deals (prezzi/offerte) e PCGamingWiki (compatibilità e correzioni).',
                '– Solo per i giochi PC. Si riconoscono dall’icona del sistema operativo (Windows, Linux, Mac) o, se la griglia non ne ha nessuna, da un negozio che esiste solo su PC (Steam, GOG, Epic, Ubisoft, EA, Battle.net).',
                '– Entrambi cercano per titolo, ripulito prima dagli orpelli commerciali di Humble («Buy …», «… on Humble Store», simboli di marchio). Trattandosi di ricerche per titolo possono sbagliare, e ciascuno lo dice nel proprio tooltip.',
                'Tutto viene elaborato nel tuo browser (salvato in localStorage); non viene inviato alcun dato a nessun server.'
            ]
        },
        zh: {
            sortLabel: '排序：', added: '加入时间', name: '名称', price: '价格', discount: '折扣',
            platformLabel: '平台：', all: '全部', uplay: 'Ubisoft', origin: 'EA', key: '激活码', drmfree: '无 DRM',
            onlyDiscount: '仅显示打折', remember: '记住设置',
            copy: '🔗 复制链接', copied: '✔ 已复制', copyPrompt: '复制此链接：',
            about: 'ℹ️ 了解更多', close: '关闭',
            sortTip: '按加入时间、名称、价格或折扣百分比对愿望单排序。',
            dirTip: '在升序（↑）与降序（↓）之间切换。',
            platformTip: '仅显示所选平台的游戏（Steam、Epic、GOG 等）。选择“全部”则不筛选。',
            onlyDiscountTip: '隐藏未打折的游戏，仅显示有折扣的。',
            rememberTip: '保存你的排序和筛选条件，回到愿望单时自动重新应用。',
            copyTip: '复制一个链接，打开后即可还原你当前的排序和筛选条件。',
            aboutTip: '查看此脚本的全部功能。',
            ggTip: '在 GG.deals 的目录中搜索该标题，不加商店或 DRM 筛选：Humble 转售多家商店的激活码。由于是按标题搜索，可能无法精确匹配到该游戏。',
            pcgwTip: '在 PCGamingWiki 上搜索该标题（兼容性与修复）。由于是按标题搜索，可能无法精确匹配到对应条目。',
            aboutTitle: '这个脚本有什么用？',
            aboutBody: [
                '本脚本从两个方面改进 Humble Store：',
                '• 在愿望单页面添加一个工具栏：',
                '– 排序：按加入时间、名称、价格或折扣排序，并有 ↑/↓ 按钮切换升序或降序。“加入时间”会还原 Humble 自己的原始顺序，该顺序读取自网站写在每一行上的索引。',
                '– 平台：按 Steam、Epic、GOG、Ubisoft、EA、激活码或无 DRM 筛选。下拉列表根据你清单中实际存在的内容生成，因此绝不会出现结果为零的选项。',
                '– 仅显示打折：只显示正在促销的游戏。只要 Humble 标记为促销，或原价高于现价，即视为打折；若缺少折扣百分比标签，则用两个价格算出折扣。',
                '– 记住设置：保存你的排序和筛选条件，返回时重新应用。关闭后不会保存任何内容。',
                '– 复制链接：生成一个可还原排序、方向、平台和“仅显示打折”的网址。参数可读，因此该链接可以加入书签。如果浏览器阻止访问剪贴板，会用对话框显示网址供手动复制。',
                '• 在商品页面添加通往 GG.deals（价格与优惠）和 PCGamingWiki（兼容性与修复）的按钮。',
                '– 仅限 PC 游戏。通过操作系统图标（Windows、Linux、Mac）识别；若该区域没有任何图标，则通过仅存在于 PC 的商店图标识别（Steam、GOG、Epic、Ubisoft、EA、Battle.net）。',
                '– 两者都按标题搜索，搜索前会先清除 Humble 的商业修饰（“Buy …”、“… on Humble Store”、商标符号）。按标题搜索有可能不准，各自的提示中都有说明。',
                '所有处理都在你的浏览器中完成（保存在 localStorage）；不会向任何服务器发送数据。'
            ]
        }
    };
    // Merge sobre `en`: una clave que falte en un idioma cae al inglés en vez de
    // quedar en undefined. Así se pueden añadir idiomas incompletos sin romper nada.
    const t = { ...I18N.en, ...(I18N[LANG] || {}) };
    const SCRIPT_VERSION = '1.1.0'; // sincronizar con @version

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
                    remember: parsed.remember !== false
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
            platform: p.get('wlplat') || 'all'
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

    // --- Modal "Saber más" (autocontenido) --------------------------------------
    function showAboutModal() {
        if (document.getElementById('hbwl-about-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'hbwl-about-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', zIndex: '2147483647',
            transition: 'opacity 180ms ease', opacity: '0'
        });
        const box = document.createElement('div');
        Object.assign(box.style, {
            background: '#12100f', color: '#f5f3f2', borderRadius: '14px',
            padding: '26px 30px', minWidth: '320px', maxWidth: '560px',
            maxHeight: '80vh', overflowY: 'auto', boxSizing: 'border-box',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '1px solid #cb272c',
            fontFamily: 'Inter, system-ui, sans-serif', fontSize: '14px', lineHeight: '1.5',
            transform: 'translateY(8px) scale(0.98)', opacity: '0',
            transition: 'transform 180ms ease, opacity 180ms ease'
        });
        const title = document.createElement('div');
        title.textContent = t.aboutTitle;
        title.style.cssText = 'font-weight:bold;font-size:17px;margin-bottom:14px;color:#f4646a;';
        box.appendChild(title);
        (t.aboutBody || []).forEach((p) => {
            const row = document.createElement('div');
            const trimmed = String(p).replace(/^\s+/, '');
            row.textContent = trimmed;
            row.style.marginBottom = '8px';
            if (trimmed.startsWith('–')) row.style.paddingLeft = '22px';
            else if (trimmed.startsWith('•')) row.style.paddingLeft = '10px';
            box.appendChild(row);
        });
        const gh = document.createElement('a');
        gh.href = 'https://github.com/g31w0fw0rld/humble-bundle-tools';
        gh.target = '_blank'; gh.rel = 'noopener';
        gh.textContent = 'github.com/g31w0fw0rld/humble-bundle-tools';
        gh.style.cssText = 'display:inline-block;margin-top:6px;color:#f4646a;text-decoration:underline;font-size:12px;';
        box.appendChild(gh);
        const kofi = document.createElement('a');
        kofi.href = 'https://ko-fi.com/g31w0fw0rld';
        kofi.target = '_blank'; kofi.rel = 'noopener';
        kofi.textContent = '☕ Apóyame en Ko-fi / Support me on Ko-fi';
        kofi.style.cssText = 'display:block;margin-top:8px;color:#f4646a;text-decoration:underline;font-size:12px;';
        box.appendChild(kofi);
        const foot = document.createElement('div');
        foot.textContent = 'v' + SCRIPT_VERSION + ' · g31w0fw0rld';
        foot.style.cssText = 'margin-top:2px;font-size:12px;opacity:0.7;';
        box.appendChild(foot);
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = t.close;
        closeBtn.style.cssText = 'display:block;margin-top:16px;padding:8px 14px;background:#cb272c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;font-size:13px;';
        box.appendChild(closeBtn);
        const closeIt = () => {
            overlay.style.opacity = '0'; box.style.opacity = '0';
            box.style.transform = 'translateY(8px) scale(0.98)';
            document.removeEventListener('keydown', onKey);
            setTimeout(() => overlay.remove(), 180);
        };
        const onKey = (e) => { if (e.key === 'Escape') closeIt(); };
        closeBtn.addEventListener('click', closeIt);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeIt(); });
        document.addEventListener('keydown', onKey);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        setTimeout(() => {
            overlay.style.opacity = '1';
            box.style.transform = 'translateY(0) scale(1)';
            box.style.opacity = '1';
        }, 10);
    }

    function buildToolbar() {
        injectWishlistStyles();
        const bar = document.createElement('div');
        bar.id = TOOLBAR_ID;

        const sortLabel = document.createElement('label');
        sortLabel.title = t.sortTip;
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
        dirBtn.title = t.dirTip;
        dirBtn.textContent = settings.dir === 'desc' ? '↓' : '↑';
        dirBtn.addEventListener('click', () => {
            settings.dir = settings.dir === 'desc' ? 'asc' : 'desc';
            dirBtn.textContent = settings.dir === 'desc' ? '↓' : '↑';
            persistIfRemember(); apply();
        });

        const platLabel = document.createElement('label');
        platLabel.title = t.platformTip;
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
        discLabel.title = t.onlyDiscountTip;
        const discChk = document.createElement('input');
        discChk.type = 'checkbox';
        discChk.checked = !!settings.onlyDiscount;
        discChk.addEventListener('change', () => { settings.onlyDiscount = discChk.checked; persistIfRemember(); apply(); });
        discLabel.appendChild(discChk);
        discLabel.appendChild(document.createTextNode(t.onlyDiscount));

        const remLabel = document.createElement('label');
        remLabel.title = t.rememberTip;
        const remChk = document.createElement('input');
        remChk.type = 'checkbox';
        remChk.checked = settings.remember !== false;
        remChk.addEventListener('change', () => { settings.remember = remChk.checked; saveSettings(); });
        remLabel.appendChild(remChk);
        remLabel.appendChild(document.createTextNode(t.remember));

        const shareBtn = document.createElement('button');
        shareBtn.type = 'button';
        shareBtn.className = 'hbwl-share';
        shareBtn.title = t.copyTip;
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

        // Botón "Saber más"
        const aboutBtn = document.createElement('button');
        aboutBtn.type = 'button';
        aboutBtn.className = 'hbwl-about';
        aboutBtn.title = t.aboutTip;
        aboutBtn.textContent = t.about;
        aboutBtn.addEventListener('click', showAboutModal);

        bar.appendChild(sortLabel);
        bar.appendChild(dirBtn);
        bar.appendChild(platLabel);
        bar.appendChild(discLabel);
        bar.appendChild(remLabel);
        bar.appendChild(shareBtn);
        bar.appendChild(aboutBtn);
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
    // Iconos de sistema operativo. Los nombres salen del platform_definition_dict del
    // bundle de Humble: el de Mac es hb-osx (hb-mac y hb-apple NO existen en su set).
    const PC_OS_SELECTOR = 'i.hb-windows, i.hb-linux, i.hb-osx';
    // Iconos de método de entrega de tiendas que solo existen en PC
    // (delivery_method_definition_dict: steam, gog, epic, uplay, origin, blizzard).
    // Hacen falta como segunda señal porque la parrilla se queda SIN iconos de SO cuando
    // el producto no trae `platforms` o cuando las que trae están en la lista que Humble
    // oculta (android/switch/switch2/3DS/new3ds), y el juego sigue siendo de PC.
    const PC_STORE_SELECTOR = 'i.hb-steam, i.hb-gog, i.hb-epic, i.hb-uplay, i.hb-origin, i.hb-bnet';
    // Tercera señal: con entrega por Humble app la plantilla sustituye TODOS los iconos
    // por hb-bundle (compartido con los juegos web), pero añade este bloque, cuyo propio
    // texto dice "The app only supports Windows PC".
    const HUMBLE_APP_SELECTOR = '.humble-app-required, .humble-app-requirement';
    // Puntos de anclaje (en orden de preferencia) para insertar los botones.
    const ANCHOR_SELECTORS = ['.js-wishlist-container', '.shopping-cart-button-container', PRODUCT_GRID_SELECTOR];

    const LINKS_ID = 'hbx-external-links';
    const LINKS_STYLES_ID = 'hbx-external-styles';
    const TRADEMARK_REGEX = /[™®©]/g;
    // Prefijo que Humble añade en og:title/document.title según el idioma,
    // p. ej. "Buy {juego} from the Humble Store" / "Comprar {juego} en la tienda Humble".
    const TITLE_PREFIX_REGEX = /^\s*(?:comprar|compra|buy|acheter|kaufen|acquista|comprar agora)\s+/i;
    // Cola de la envoltura comercial. Enumerar la preposición de cada idioma es lo que
    // dejó pasar el "from the Humble Store" real de og:title, así que en su lugar se
    // corta un enlace de 1-3 palabras antes de "Humble". Va SIN flag /i a propósito:
    // exigir minúsculas es lo que separa las palabras de enlace de las del título
    // (…"Anniversary Edition from the Humble Store" -> …"Anniversary Edition").
    const TITLE_SUFFIX_REGEX = /\s+[a-z]{1,6}(?:\s+[a-z]{1,7}){0,2}\s+Humble(?:\s+\S{1,14}){0,2}\s*$/;

    // Nombre del juego. Fuente primaria: el <h1> visible (ya viene limpio); como
    // respaldo, og:title / document.title, a los que se les quita el prefijo/sufijo
    // que Humble añade (p. ej. "Comprar … en la tienda Humble").
    function getGameTitle() {
        const h1 = document.querySelector('.js-page-content h1, .main-content h1, h1')?.textContent;
        const og = document.querySelector('meta[property="og:title"]')?.content;
        let title = (h1 || og || document.title || '').trim();
        title = title
            .replace(TITLE_PREFIX_REGEX, '')          // "Comprar …"
            .replace(TITLE_SUFFIX_REGEX, '')          // "… from the Humble Store"
            .replace(/\s*[-|]\s*Humble\b.*$/i, '')    // "… - Humble Store"
            .replace(TRADEMARK_REGEX, '')
            .replace(/\s+/g, ' ')
            .trim();
        // Mientras el SPA carga, document.title es "The Humble Store: Loading" (o
        // ": Error"); si se cuela, la búsqueda se haría con esa cadena.
        return /^the humble store\b/i.test(title) ? '' : title;
    }

    // Es producto de PC si hay parrilla de precios y dentro alguna de las tres señales.
    // Basta una: ver PC_STORE_SELECTOR y HUMBLE_APP_SELECTOR para el porqué.
    function isPcProductPage() {
        const grid = document.querySelector(PRODUCT_GRID_SELECTOR);
        if (!grid) return false;
        return !!grid.querySelector(PC_OS_SELECTOR)
            || !!grid.querySelector(PC_STORE_SELECTOR)
            || !!grid.querySelector(HUMBLE_APP_SELECTOR);
    }

    function injectLinkStyles() {
        if (document.getElementById(LINKS_STYLES_ID)) return;
        const style = document.createElement('style');
        style.id = LINKS_STYLES_ID;
        style.textContent = `
            #${LINKS_ID} { display: flex; gap: 8px; margin-top: 12px; }
            #${LINKS_ID} .hbx-btn {
                display: flex; align-items: center; justify-content: center; gap: 6px;
                flex: 1 1 0; min-width: 0; box-sizing: border-box; padding: 8px 10px;
                border-radius: 4px; font-size: 12px; font-weight: 700; letter-spacing: .3px;
                text-transform: uppercase; text-decoration: none; cursor: pointer;
                white-space: nowrap; overflow: hidden; transition: filter .15s ease;
            }
            #${LINKS_ID} .hbx-btn:hover { filter: brightness(1.12); text-decoration: none; }
            #${LINKS_ID} .hbx-ico { display: inline-flex; align-items: center; flex: 0 0 auto; }
            #${LINKS_ID} img.hbx-ico { width: 14px; height: 14px; object-fit: contain; }
            /* El logo de PCGamingWiki es más alto que ancho (viewBox 827x1158): se fija
               el alto y se deja el ancho automático para no deformarlo. */
            #${LINKS_ID} .hbx-ico svg { height: 14px; width: auto; display: block; }
            #${LINKS_ID} .hbx-gg   { background: #12a150; color: #fff; }
            #${LINKS_ID} .hbx-pcgw { background: #3d4450; color: #fff; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    // opts: { iconUrl } (favicon remoto) o { iconSvg } (SVG inline, a prueba de CSP/hotlink),
    // más { tooltip }: los dos botones buscan por nombre y pueden no acertar, así que la
    // etiqueta sola no basta — el tooltip es donde vive esa incertidumbre.
    function makeLinkButton(cls, label, href, opts) {
        const a = document.createElement('a');
        a.className = `hbx-btn ${cls}`;
        a.href = href;
        a.target = '_blank';
        a.rel = 'nofollow noopener external';
        if (opts && opts.tooltip) a.title = opts.tooltip;
        if (opts && opts.iconSvg) {
            const span = document.createElement('span');
            span.className = 'hbx-ico';
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
        box.appendChild(makeLinkButton('hbx-gg', 'GG.deals', GGDEALS_SEARCH_URL + q,
            { iconUrl: GGDEALS_ICON_URL, tooltip: t.ggTip }));
        box.appendChild(makeLinkButton('hbx-pcgw', 'PCGamingWiki', PCGW_SEARCH_URL + q,
            { iconSvg: PCGW_ICON_SVG, tooltip: t.pcgwTip }));
        return box;
    }

    // Devuelve true solo si los botones quedaron puestos (o ya estaban). El false
    // importa: es lo que mantiene vivo el polling cuando la parrilla ya existe pero
    // el título o el ancla todavía no.
    function insertLinks() {
        if (document.getElementById(LINKS_ID)) return true;
        const title = getGameTitle();
        if (!title) return false;

        let anchor = null;
        for (const sel of ANCHOR_SELECTORS) {
            anchor = document.querySelector(sel);
            if (anchor) break;
        }
        if (!anchor) return false;

        const links = buildLinks(title);
        if (anchor.matches(PRODUCT_GRID_SELECTOR)) anchor.appendChild(links);
        else (anchor.closest('section') || anchor).after(links);
        return true;
    }

    function initProductLinks() {
        let tries = 0;
        const iv = setInterval(() => {
            tries++;
            let done = false;
            try {
                if (isPcProductPage()) done = insertLinks();
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
