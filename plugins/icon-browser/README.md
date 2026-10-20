# Icon Browser for Desigma

An independently written icon browser powered by the public [Iconify API](https://iconify.design/docs/api/). This is not the Iconify Figma plugin and does not use its code or assets.

## Try the preview

Requires Node.js 22 or newer; no dependencies to install.

```sh
cd plugins/icon-browser
npm start
```

Open http://127.0.0.1:4318. Run `npm test` for offline API tests.

Search by keyword, filter by collection, save favorites, select an icon, adjust its color, height (8–512 pixels), rotation or horizontal flip, then copy or download SVG. Multicolor icons retain their fixed palette. This first version exports static SVG only; animated or active SVG content is rejected and shown as unavailable. The first search requests 64 results; Load more retrieves up to 999 matches and reveals 64 more at a time. Icon artwork is fetched in batches by collection, cached for the session, and customized locally to avoid a network request for every thumbnail or control change. Favorites are saved locally in this browser, with a limit of 200. Searches are submitted explicitly to avoid sending a request on every keystroke.

## Install in Desigma

Requires Desigma 0.1.0-alpha.8 or newer. Open **Plugins**, choose **Install plugin**, and paste:

```text
https://github.com/deepfounder-ai/desigma-plugins/blob/main/plugins/icon-browser/manifest.json
```

Choose **Open** to launch the panel in your browser. **Insert into Desigma** adds the selected icon to the current document as editable layers, and one Undo removes it. The plugin asks for `document:insert-svg`, `storage:local` (favorites) and network access to `https://api.iconify.design` only.

The source is split into `api.js` (network and settings validation), `main.js` (panel behavior), `index.html` and `styles.css` (original UI). `serve.js` serves the same files for the standalone preview, where Insert stays disabled because there is no host.

## Data and licenses

Searches, requested collections and SVG settings go directly to `https://api.iconify.design`; the preview sends no design document data and uses no authentication. A network connection is required. API failures, cancellation, timeouts and unavailable browser storage are handled in the interface.

Original plugin code is MIT licensed; see [LICENSE](LICENSE). Icon collections have their own licenses, which are not covered by this project's MIT license. The inspector shows each collection's author and license link as supplied by Iconify. Review that license and preserve any required attribution when using or redistributing an exported icon. SVG exports do not include a separate license file. No icon set is vendored in this repository.

API references: [search](https://iconify.design/docs/api/search.html), [collections](https://iconify.design/docs/api/collections.html), [SVG rendering](https://iconify.design/docs/api/svg.html).
