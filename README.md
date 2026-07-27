# Humble Bundle Tools

Userscript de Tampermonkey para la Humble Store: herramientas de lista de deseos + botones a GG.deals y PCGamingWiki. / Tampermonkey userscript for the Humble Store: wishlist tools + GG.deals and PCGamingWiki buttons.

## Español

**Qué hace:**
- En tu **lista de deseos** (`/store/wishlist`) añade una barra de herramientas:
  - **Ordenar** por agregado, nombre, precio o descuento (ascendente/descendente).
  - **Filtrar por plataforma** (Steam, Epic, GOG, Ubisoft, EA, clave, sin DRM).
  - **Solo con descuento** y **Recordar** tu configuración.
  - **Copiar enlace con filtros**, tooltips y botón **"Saber más"**.
- En las **páginas de producto de juegos de PC** añade botones a **[GG.deals](https://gg.deals/)** (precios/ofertas) y **[PCGamingWiki](https://www.pcgamingwiki.com/)** (compatibilidad y arreglos).

**Idioma:** detección automática español / inglés.

**Instalación:**
1. Instala [Tampermonkey](https://www.tampermonkey.net/).
2. Abre el instalador: [humble-bundle-tools.user.js](https://github.com/g31w0fw0rld/humble-bundle-tools/raw/main/humble-bundle-tools.user.js) (también en [GreasyFork](https://greasyfork.org/es-419/users/1590477-g31w) y [OpenUserJS](https://openuserjs.org/users/g31w0fw0rldgmail.com/scripts)).

**Sitio:** `humblebundle.com`

## English

**What it does:**
- On your **wishlist** (`/store/wishlist`) it adds a toolbar:
  - **Sort** by date added, name, price or discount (ascending/descending).
  - **Filter by platform** (Steam, Epic, GOG, Ubisoft, EA, key, DRM-free).
  - **Only discounted** and **Remember** your setup.
  - **Copy link with filters**, tooltips and a **"Learn more"** button.
- On **PC game product pages** it adds buttons to **[GG.deals](https://gg.deals/)** (prices/deals) and **[PCGamingWiki](https://www.pcgamingwiki.com/)** (compatibility and fixes).

**Language:** automatic Spanish / English detection.

**Install:**
1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the installer: [humble-bundle-tools.user.js](https://github.com/g31w0fw0rld/humble-bundle-tools/raw/main/humble-bundle-tools.user.js) (also on [GreasyFork](https://greasyfork.org/es-419/users/1590477-g31w) and [OpenUserJS](https://openuserjs.org/users/g31w0fw0rldgmail.com/scripts)).

**Site:** `humblebundle.com`

## Privacidad / Privacy

**ES:** el script no hace ninguna petición de red: lee de la propia página los títulos, precios y plataformas para ordenar y filtrar, y construye los enlaces a GG.deals y PCGamingWiki a partir del título del juego. Declara `@grant none`, así que no tiene acceso a las APIs privilegiadas del gestor de userscripts (almacenamiento, peticiones entre dominios). Guarda en `localStorage` de `humblebundle.com` (clave `hbwl-settings`) solo tu orden y tus filtros; el botón de copiar enlace escribe en el portapapeles únicamente cuando haces clic. No se envía nada a terceros ni al autor, y solo visitas GG.deals o PCGamingWiki si haces clic en un botón.

**EN:** the script makes no network requests: it reads titles, prices and platforms from the page itself to sort and filter, and builds the GG.deals and PCGamingWiki links from the game title. It declares `@grant none`, so it has no access to the userscript manager's privileged APIs (storage, cross-origin requests). It stores in `localStorage` on `humblebundle.com` (key `hbwl-settings`) only your sort order and filters; the copy-link button writes to the clipboard only when you click it. Nothing is sent to third parties or to the author, and you only visit GG.deals or PCGamingWiki if you click a button.

## Apoyar / Support

Esto es parte de algo que estoy construyendo para crecer. Si te sirve y quieres apoyar, puedes invitarme un café en **[Ko-fi](https://ko-fi.com/g31w0fw0rld)** —solo si quieres—; y si hay una causa que lo necesite más que yo, ayúdala a ella.

This is part of something I'm building to grow. If it helps you and you'd like to support it, you can tip me on **[Ko-fi](https://ko-fi.com/g31w0fw0rld)** —only if you want—; and if a cause needs it more than I do, help that one instead.

---
Autor / Author: **g31w0fw0rld** · Licencia / License: **MIT**
