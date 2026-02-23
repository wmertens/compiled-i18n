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
