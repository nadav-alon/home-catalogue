# Material Symbols as per-icon SVGs in an offline Preact PWA

Research for #127 (part of #125, feeds #131 Icon component). Checked 2026-09-29 against Vite 8.3.1,
Preact 10, TypeScript 7.0.2, vite-plugin-pwa 1.x.

## Recommendation

**`unplugin-icons` + `@iconify-json/material-symbols`, Preact JSX compiler, `scale: 1`.**

```sh
npm i -D unplugin-icons @iconify-json/material-symbols @svgr/core @svgr/plugin-jsx
```

```ts
// vite.config.ts
import Icons from 'unplugin-icons/vite'
// plugins: [preact(), Icons({ compiler: 'jsx', jsx: 'preact', scale: 1 }), ...]
```

```jsonc
// tsconfig.json → compilerOptions.types
["vite/client", "@testing-library/jest-dom", "unplugin-icons/types/preact"]
```

```tsx
import ShoppingCart from '~icons/material-symbols/shopping-cart-outline'
<ShoppingCart aria-hidden="true" />   // 1em × 1em, fill="currentColor"
```

- Naming: Iconify ids are kebab-case Google names. Unsuffixed = **filled** (FILL 1);
  `-outline` = outlined unfilled (FILL 0, Material's default look); `-rounded`, `-outline-rounded`,
  `-sharp`, `-outline-sharp` for other styles. E.g. `home` vs `home-outline` in the set data below.
- Size: `width="1em" height="1em"` with `scale: 1` → size with `font-size` (24px for M3 standard icons).
- Colour: every path carries `fill="currentColor"` → set CSS `color`.
- Wrap in one `Icon` component in `src/ui/` (#131) so a11y props and the class live in one place.

## Why this one

| | unplugin-icons + @iconify-json/material-symbols | @material-symbols/svg-400 + `?raw` |
|---|---|---|
| Source | Google's `symbols/web/*/…_24px.svg`, re-normalised to 24×24 viewBox | Google's `…_48px.svg` verbatim |
| Optical size | **24** (matches 24dp icons) | 48 only (heavier detail at 24px) |
| `currentColor` | built in (`fill="currentColor"` on paths) | none — SVG has no fill; needs CSS `svg { fill: currentColor }` |
| Result type | typed Preact component | string → `dangerouslySetInnerHTML` wrapper |
| Plugin | yes (build-time) | none (Vite `?raw`) |
| Cost / icon (measured, gz) | **~184 B** | ~223 B |

Rejected:
- `@material-design-icons/svg` — the old Material *Icons*, not Symbols.
- `material-symbols`, `@material-symbols/font-*`, Google Fonts CSS — icon **fonts**; question rules them out.
- `@material-symbols-svg/react` — React peer (`react ^16–19`), 329 MB unpacked; would need `preact/compat`.
- Plain `import url from '…svg'` (no `?raw`) — gives an `<img>`-able URL/data-URI: no `currentColor`,
  and emitted `.svg` files aren't in vite-plugin-pwa's default precache glob (see Offline).

## Tree-shaking and bundle cost

Not tree-shaking in the Rollup sense: each `~icons/…` import is a **virtual module** the plugin
generates at build time from the icon's entry in `icons.json`; nothing else from the 16k-icon set
reaches the bundle ([unplugin-icons README][ui-readme]: "Only bundle the icons you really use").

Measured (`vite build`, Vite 8.3.1, gzip -9), Preact app rendering 5 icons
(home, shopping-cart, settings, add, inventory-2 — outlined):

| Build | JS raw | JS gz | Δ gz vs empty |
|---|---|---|---|
| empty Preact app | 11 415 | 4 833 | — |
| unplugin-icons jsx/preact | 13 533 | 5 751 | +918 (≈184 B/icon) |
| @material-symbols/svg-400 `?raw` + wrapper | 13 723 | 5 948 | +1 115 (≈223 B/icon) |

Per-icon cost is dominated by path length: `add` ≈ 30 B of path data, `settings` ≈ 700 B raw. A
tabbed app with ~20 icons costs ~4 KB gz. The `@svgr/*` deps are build-time only (they pull in Babel
at build; nothing ships).

## Offline behaviour

- Icons compile into the JS chunk that imports them — no `.svg` requests, no runtime fetch.
- vite-plugin-pwa's default `globPatterns` is `**/*.{js,css,html}` ([vite-pwa docs][pwa-glob]), so
  those chunks are precached → icons work offline from first SW install, with no config change.
- Build is offline too: `@iconify-json/material-symbols` is a local dependency; `autoInstall`
  defaults to `false` ([README options][ui-readme]), so no network at build.

## Keeping current

- `@iconify-json/material-symbols` 1.2.93 (2026-09-22), 16 422 icons + 8 147 aliases, Apache-2.0,
  author Google ([npm][iconify-npm]; `info.json` points at google/material-design-icons).
- Upstream `google/material-design-icons` last push 2026-09-25; the Iconify set tracks it within
  days. Weight is 400 only (Google's default); other weights would need the marella packages.

## Sources

- [unplugin-icons README][ui-readme] — Preact config, `scale`, `defaultClass`, `autoInstall`,
  `unplugin-icons/types/preact`; [vite-preact example][ui-example].
- [@iconify-json/material-symbols on npm][iconify-npm] — package data inspected locally
  (`icons.json`, `info.json`).
- [@material-symbols/svg-400 README][marella] — file layout `{style}/{icon}[-fill].svg`, opsz 48 only.
- [google/material-design-icons `symbols/web/`][google-repo] — `home_24px.svg`, `home_48px.svg`;
  marella's `home.svg` is byte-identical in path data to `home_48px.svg`.
- [Material Symbols guide (Google Fonts)][google-guide] — opsz axis 20–48dp, default static font is
  opsz 24 / wght 400 / FILL 0.
- [vite-plugin-pwa static assets][pwa-glob] — default precache glob.

[ui-readme]: https://github.com/unplugin/unplugin-icons#readme
[ui-example]: https://github.com/unplugin/unplugin-icons/tree/main/examples/vite-preact
[iconify-npm]: https://www.npmjs.com/package/@iconify-json/material-symbols
[marella]: https://github.com/marella/material-symbols/tree/main/svg/400
[google-repo]: https://github.com/google/material-design-icons/tree/master/symbols/web
[google-guide]: https://developers.google.com/fonts/docs/material_symbols
[pwa-glob]: https://vite-pwa-org.netlify.app/guide/static-assets.html#globpatterns
