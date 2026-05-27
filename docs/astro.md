# Using with Astro

## 1. Astro Config

Configure both Astro [Internationalization Routing](https://docs.astro.build/en/guides/internationalization/)
& the compiled-i18n [Vite plugin](https://github.com/wmertens/compiled-i18n?tab=readme-ov-file#vite), making sure to keep their locales consistent.

```javascript
// astro.config.mjs
import { defineConfig } from "astro/config";
import { i18nPlugin } from "compiled-i18n/vite";

const defaultLocale = "en";
const locales = ["en", "fr"];

export default defineConfig({
  i18n: {
    defaultLocale: defaultLocale,
    locales: locales,
    routing: {
      prefixDefaultLocale: true,
    },
  },
  vite: {
    plugins: [i18nPlugin({ defaultLocale: defaultLocale, locales: locales })],
  },
});
```

### Accurate unused/missing key reporting (`usageGlobs`)

compiled-i18n collects used keys from Vite's `transform`, which only runs on
`.cjs/js/mjs/ts/jsx/tsx`. It never sees `.astro` files, so keys used **only** in
`.astro` components (especially in template expressions such as
`<p>{localize\`helloWorld\`}</p>`) are reported as `unused` at build time — and
would be deleted if you enable `removeUnusedKeys`. (In Astro's multi-pass build
this can even surface as "every key is unused".)

Pass `usageGlobs` so the plugin also statically scans those files when deciding
which keys are missing/unused:

```javascript
vite: {
  plugins: [
    i18nPlugin({
      defaultLocale,
      locales,
      usageGlobs: ["src/**/*.astro"],
    }),
  ],
},
```

This is an opt-in, framework-agnostic option (use it for Vue/Svelte/MDX too).
It only affects the missing/unused report (and `removeUnusedKeys`), not the
emitted bundles. The scan is a loose textual match for `_` / `localize`
tagged-templates, so a match inside a comment counts as "used" — the safe
direction (it never removes a key that is actually referenced).

## 2. Dynamic Routes

Astro [Dynamic Routes](https://docs.astro.build/en/guides/routing/#dynamic-routes) can be used to create single pages that resolve differently based on the current locale. For example a `pages/[locale]/index.astro` file can resolve to `pages/en/index.astro` & `pages/fr/index.astro`.

### SSG
```javascript
// src/pages/[locale]/index.astro
---
import { locales, localize, setLocaleGetter } from "compiled-i18n";

setLocaleGetter(() => Astro.params.locale);

export function getStaticPaths() {
  return locales.map((locale) => ({ params: { locale } }));
}
---

<div>{localize`helloWorld`}</div>
```

### On-demand
```javascript
// src/pages/[locale]/index.astro
---
import { localize, setLocaleGetter } from "compiled-i18n";
export const prerender = false; // Not needed in 'server' mode

setLocaleGetter(() => Astro.params.locale);
---

<div>{localize`helloWorld`}</div>
```

## 3. Redirect (optional)

Astro [Middleware](https://docs.astro.build/en/guides/middleware/) can be used to redirect based on the user's browser language settings. This requires the [redirectToDefaultLocale](https://docs.astro.build/en/guides/internationalization/#redirecttodefaultlocale) value to be `false` in `astro.config.mjs`.

```javascript
// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { defaultLocale, locales } from "compiled-i18n";

export const onRequest = defineMiddleware((context, next) => {
  if (
    !context.url.pathname.includes("_actions") &&
    locales.every((l) => !context.url.pathname.includes(`/${l}`))
  ) {
    return context.redirect(
      (context.preferredLocale ?? defaultLocale) + context.url.pathname,
    );
  }

  return next();
});
```
