# compiled-i18n

Framework-independent buildtime and runtime translations.

This module statically generates translated copies of code bundles, so that you can serve them to clients as-is, without any runtime translation code. This concept is based on `$localize` from Angular.

## Example

Anywhere in your code, you have simple template string interpolation:

```jsx
import {_} from 'compiled-i18n'

console.log(_`Logenv ${process.env.NODE_ENV}`)

export const Count = ({count}) => (
	<div title={_`countTitle`}>{_`${count} items`}</div>
)
```

After building, for French, this becomes:

```jsx
import {interpolate} from 'compiled-i18n'

console.log(`Mode de Node.JS: ${process.env.NODE_ENV}`)

export const Count = ({count}) => (
	<div title="Nombre d'articles">
		{interpolate(
			{
				0: 'aucun article',
				1: 'un article',
				'*': '$1 articles',
			},
			count
		)}
	</div>
)
```

Translations are in JSON files. `/i18n/fr.json`:

```json
{
	"locale": "fr",
	"fallback": "en",
	"name": "Français",
	"translations": {
		"Logenv $1": "Mode de Node.JS: $1",
		"countTitle": "Nombre d'articles",
		"$1 items": {
			"0": "aucun article",
			"1": "un article",
			"*": "$1 articles"
		}
	}
}
```

On the server, these translations are loaded into memory and translated dependening on the current locale.
On the client, the translations are embedded directly into the code, and there is a build folder per locale.

You can also use the API functions to implement dynamic translations that you load at runtime.

## Installation

Add the plugin as a dev dependency:

```sh
npm install --save-dev compiled-i18n
pnpm i -D compiled-i18n
yarn add -D compiled-i18n
```

There are several parts to localization:

- the translations
- the runtime locale selection (cookie, url, ...)
- the translation function
- getting the translations to the client

`compiled-i18n` helps with most of these. You have to hook up the helpers to your project. To do this, you add the vite plugin and connect the locale selection.

The vite plugin will automatically create the JSON data files under the `i18n/` folder, add new keys to existing files, and embed the data in the build.
Add the plugin to your vite config:

```ts
import {defineConfig} from 'vite'
import {i18nPlugin} from 'compiled-i18n/vite'

export default defineConfig({
	plugins: [
		// ... other plugins
		i18nPlugin({
			locales: ['en_us', 'en_uk', 'en', 'nl'],
		}),
	],
})
```

> [!WARNING]
> If you are using an older qwik version than 1.8 please see [Plugin order using older qwik versions](./qwik.md#Plugin-order-using-older-qwik-versions)

You have to set up your project so the plugin knows the current locale, both on the server during SSR, and on the client.

**On the server**, you can use the `setLocaleGetter` function to set a callback that returns the current locale, or you can call the `setDefaultLocale` function to set the locale directly if you only process one locale at a time. See [qwik.md](./qwik.md) for an example setup for Qwik.

**In the browser code** during development, you need to either set the `lang` attribute on the `<html>` tag, or call `setDefaultLocale` to set the locale.
In production, the locale is fixed, so no need to set it.
However, you need to make sure that your HTML file loads the correct bundle for the locale.
For example, if your entry point is `/main.js` and your locales are `en` and `fr`, you need to load `/en/main.js` or `/fr/main.js` depending on the locale.

### Qwik

See detailed instructions in [qwik.md](./qwik.md).

## Usage

In your code, use the `_` or `localize` function to translate strings (you must use template string notation). For example:

```tsx
import {_} from 'compiled-i18n'

// ...

const name = 'John'
const emoji = '👋'
const greeting = _`Hello ${name} ${emoji}!`
```

You will need to specify the translations for the key `"Hello $1 $2!"` in the JSON files for the locales.

It is recommended to keep your keys short and descriptive, with capitalization when appropriate. If you would like to change what's shown in your base language, it's easiest if you change the translation and keep the key the same.

In your server code, you need to set the locale getter, which returns the locale that is needed for each translation. This differs per framework. For example, for Qwik:

```ts
import {defaultLocale, setLocaleGetter} from 'compiled-i18n'
import {getLocale} from '@builder.io/qwik'

setLocaleGetter(() => getLocale(defaultLocale))
```

## How it works

In the server and in dev mode, all translations are loaded into memory eagerly, but for a production client build, all the ``localize`x` `` calls are replaced with their translation.

Translations are stored in json files, by default under `/i18n` in the project root. The plugin will create missing files and add new keys to existing files.

## Types

See [index.ts](./src/index.ts) for the full types.

## JSON translations format

The JSON files are stored in the project root under `/i18n/$locale.json`, in the format `I18n.Data`. A translation is either a string or a Plural object.

```ts
export type Data = {
	locale: Locale // the locale key, e.g. en_US or en
	fallback?: Locale // try this locale for missing keys
	name?: string // the name of the locale in the locale, e.g. "Nederlands"
	translations: {
		[key: Key]: Translation | Plural
	}
}
```

A Translation is a string can that contain `$#` for interpolation, and `$$` for a literal `$`. For example, `` _`Hello ${name} ${emoji}` `` looks up the key `"Hello $1 $2"` and interpolates the values of `name` and `emoji`. Note that this definition means that the Key is also a Translation, so for missing translations, the Key is used as a fallback.

A Plural object contains keys to select a translation with the first interpolation value. The key `"*"` is used as a fallback. String values are treated as a translation string, and numbers are used to point to other keys. For example, the plural object

```json
{
	"$1 items": {
		"0": "no items",
		"1": "some items",
		"2": 1,
		"3": "three items",
		"three": 3,
		"*": "many items ($1)"
	}
}
```

will translate ``_`${count} items` `` to `"no items"` for `count = 0`, `"some items"` for `count = 1` or `count = 2`, `"three items"` for `count = 3` or `count = "three"`, and `` `many items (${count})` `` for any other number.

You can use any string or number as a Plural key, so you could also use it for enums, but perhaps it would be better to use runtime translation for that.

## Client-side API

### ``localize`str` `` or ``_`str` ``

translate template string using in-memory maps

``_`Hi ${name}!` `` converts into a lookup of the I18nKey `"Hi $1"`. A literal `$` will be converted to `$$`. Missing translations fall back to the key.

Nesting is achieved by passing result strings into translations again.

```tsx
_`There are ${_`${boys} boys`} and ${_`${girls} girls`}.`
```

### `localize(key: I18nKey, ...params: any[])` or `_(key: I18nKey, ...params: any[])`

Translates the key, but this form does not get statically replaced with the translation.
This means that when you interpolate, you are generating new keys instead of a single key with a `$1` placeholder. For example:

```tsx
const name = 'Wout'

_`Hi ${name}!` // key: "Hi $1", params: ["Wout"]
_(`Hi ${name}`) // key: "Hi Wout", params: []
```

It is also your duty to call `loadTranslations` with data you provide, so the requested translations are present. The built client code will not include any translations.
Missing translations use the key.

### `currentLocale: readonly string`

Current locale. Is automatically set by the locate getter that runs on every translation.

On the client side in production it is hardcoded.
During dev mode on the client it is automatically set to the `lang` attribute of the HTML tag if that's valid. You can also set it with `setDefaultLocale`.

### `locales: readonly string[]`

e.g. `['en_US', 'fr']`.

### `localeNames: readonly const {[key: string]: string}`

e.g. `{en_US: "English (US)", fr: "Français"}`

### `loadTranslations(translations: I18n.Data['translations'], locale?: string)`

Add translations for a locale to the in-memory map. If you don't specify the locale, it uses `currentLocale`.

This is only needed for dynamic translations.
You need to run this both on the client and the server (when using SSR), so they have the same translations available.

## Server-side API

### `setLocaleGetter(getLocale: () => Locale)`

`getLocale` will be used to retrieve the locale on every translation. It defaults to `defaultLocale`.
For example, use this to grab the locale from context during SSR.

This should not be called on the client, as the locale is fixed in production. Instead, the client should set the locale via the HTML `lang` attribute or with `setDefaultLocale`.

### `setDefaultLocale(locale: string)`

Sets the default locale at runtime, which is used when no locale can be determined. This is useful during dev mode on the client side if you can't change the HTML's `lang` attribute. In production on the client, the locale is fixed, and this function has no effect.

## Utility API

### `defaultLocale: readonly string`

Default locale, defaults to the first specified locale. Can be set with `setDefaultLocale`, useful during dev mode on the client side if you can't change the HTML's `lang` attribute.

### `guessLocale(acceptsLanguage: string)`

Given an `accepts-language` header value, return the first matching locale.
If the given string is invalid, returns `undefined`.
Falls back to `defaultLocale`

### `interpolate(translation: I18nTranslation | I18nPlural, ...params: unknown[])`

Perform parameter interpolation given a translation string or plural object. Normally you won't use this.

### `makeKey(...tpl: string[]): string`

Returns the calculated key for a given template string array. For example, it returns `"Hi $1"` for `["Hi ", ""]`

## Qwik API (from 'compiled-i18n/qwik')

### `extractBase({serverData}: RenderOptions): string`

This sets the base path for assets for a Qwik application. Pass it to the
`base` property of the render options.

If running in development mode, the base path is simply `/build`. Otherwise,
it's `/build/${locale}`. It also includes the base path given to vite.

### `setSsrLocaleGetter(): void`

Configure compiled-i18n to use the locale from Qwik during SSR.

Call this in your entry.ssr file.

## Vite API (from 'compiled-i18n/vite')

The vite plugin accepts these options:

```tsx
type Options = {
	/** The locales you want to support */
	locales?: string[]
	/** The directory where the locale files are stored, defaults to /i18n */
	localesDir?: string
	/** The default locale, defaults to the first locale */
	defaultLocale?: string
	/** Extra Babel plugins to use when transforming the code */
	babelPlugins?: any[]
	/**
	 * The subdirectory of browser assets in the output. Locale post-processing
	 * and locale subdirectory creation will only happen under this subdirectory.
	 * Do not include a leading slash.
	 *
	 * If the qwikVite plugin is detected, this defaults to `build/`.
	 */
	assetsDir?: string
	/** Automatically add missing keys to the locale files. Defaults to true */
	addMissing?: boolean
	/** Automatically remove unused keys from the locale files. Defaults to false. */
	removeUnusedKeys?: boolean
	/** Use tabs on new JSON files */
	tabs?: boolean
}
```

## Choosing a key name

It is recommended to keep your keys short and descriptive, with capitalization when appropriate. If you would like to change what's shown in your base language, it's easiest if you change the translation and keep the key the same.

If you need to provide some context for the translator, put it inside the key. For example, when translating the word "right" as a capitalized button label, you might want to specify if it's the direction or the opposite of wrong. In that case, you could use the keys `"Right-direction"` and `"Right-correct"`.

If it's unclear what the parameter is, you can add a comment to the key. For example:

```js
_`Greeting ${name}:name`
```

Newlines are not allowed in keys.

## Automatic translation

The JSON format includes the keys and tools like Github Copilot actually have enough context to translate the keys for you. This is workable for small amounts of translations.

A more robust way is to a tool like [deepl-localize](https://www.npmjs.com/package/deepl-localize). It includes support for `compiled-i18n`'s JSON format.



## Roadmap

- allow specifying helper libs that re-export localize and interpolate, so those re-exports are also processed
- build client locales in dev mode as well, being smart about missing keys and hot reloading. In Qwik this might be hard because dev and prod are quite different.
- move unused keys to `unused` in the JSON files?



## Using with Astro and Qwik (without Qwik City)

When integrating `compiled-i18n` into a project using Astro for overall page structure and Qwik for interactive islands (without relying on `qwik-city` for routing or locale management), a specific setup is required to ensure translations work correctly both during Server-Side Rendering (SSR) and on the client-side, especially in development.

The core idea is to leverage Astro's i18n capabilities to determine the current locale and then communicate this locale to `compiled-i18n` before Qwik components are rendered.

### 1. Astro Configuration (`astro.config.mjs`)

Ensure your Astro configuration includes the `@qwikdev/astro` integration and the `i18nPlugin` from `compiled-i18n/vite`. The locales configured for Astro's `i18n` and `compiled-i18n`'s `i18nPlugin` must be consistent.

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import qwikdev from '@qwikdev/astro';
import { i18nPlugin } from "compiled-i18n/vite";

// Assuming you have locale definitions, e.g., from './src/locales.ts'
import { DEFAULT_LOCALE_SETTING, LOCALES_SETTING } from './src/locales';

export default defineConfig({
  site: "https://example.com", // Your site URL
  i18n: {
    defaultLocale: DEFAULT_LOCALE_SETTING, // e.g., "en"
    locales: Object.keys(LOCALES_SETTING), // e.g., ["en", "fr", "es"]
    routing: {
      prefixDefaultLocale: true, // Or your preferred routing strategy
    },
  },
  integrations: [
    qwikdev(),
    // ... other integrations
  ],
  vite: {
    plugins: [
      i18nPlugin({
        locales: Object.keys(LOCALES_SETTING), // Must match Astro's locales
        defaultLocale: DEFAULT_LOCALE_SETTING,
        localesDir: "./src/i18n", // Directory for your .json translation files
        addMissing: true,
        // assetsDir is typically 'build/' by default when qwikVite plugin is detected
      }),
      // ... other Vite plugins
    ],
  },
});
```

### 2. Locale Setup Helper (`src/lib/i18n-setup.ts`)

Create a helper file to manage `compiled-i18n`'s locale settings for both server and client environments.

```typescript
// src/lib/i18n-setup.ts
import {
  setLocaleGetter,
  setDefaultLocale,
  locales as compiledLocales, // Locales known by compiled-i18n
} from "compiled-i18n";

// Assuming DEFAULT_LOCALE is your app's default locale string (e.g., 'en')
// imported from your Astro i18n configuration (e.g., '@/i18n')
import { DEFAULT_LOCALE } from "@/i18n";

export function setupI18nServer() {
  setLocaleGetter(() => {
    let currentSsrLocale: string | undefined;
    if (typeof globalThis !== "undefined" && (globalThis as any).currentLocale) {
      currentSsrLocale = (globalThis as any).currentLocale;
    }

    if (currentSsrLocale && compiledLocales.includes(currentSsrLocale)) {
      return currentSsrLocale;
    }
    if (compiledLocales.includes(DEFAULT_LOCALE)) {
      return DEFAULT_LOCALE;
    }
    return compiledLocales[0] || "en"; // Fallback to the first known or 'en'
  });
}

export function setupI18nClient() {
  if (import.meta.env.DEV) {
    const htmlLang = document.documentElement.lang;
    let targetLocale = DEFAULT_LOCALE;

    if (htmlLang) {
      if (compiledLocales.includes(htmlLang)) {
        targetLocale = htmlLang;
      } else {
        const baseLang = htmlLang.split("-")[0];
        if (compiledLocales.includes(baseLang)) {
          targetLocale = baseLang;
        }
      }
    }

    if (!compiledLocales.includes(targetLocale)) {
      targetLocale = compiledLocales.includes(DEFAULT_LOCALE)
        ? DEFAULT_LOCALE
        : compiledLocales[0] || "en";
    }
    setDefaultLocale(targetLocale);
  }
  // In production, locale is fixed per-bundle, setDefaultLocale has no effect.
}

export function setCurrentLocale(locale: string) {
  if (typeof globalThis !== "undefined") {
    (globalThis as any).currentLocale = locale;
  }
}
```

### 3. Astro Base Layout (`src/layouts/Base.astro`)

In your main Astro layout, call the setup functions. Astro's `Astro.currentLocale` will provide the locale for the current page.

```astro
---
// src/layouts/Base.astro
import { setupI18nServer, setCurrentLocale } from "@/lib/i18n-setup";
import { LOCALES, DEFAULT_LOCALE, type Lang } from "@/i18n"; // Your Astro i18n helpers

const currentAstroLocale = Astro.currentLocale as Lang;

// For SSR: Set up compiled-i18n before Qwik components render
if (import.meta.env.SSR) {
  setupI18nServer(); // Configures the locale getter for compiled-i18n
  setCurrentLocale(currentAstroLocale); // Makes the current locale available to the getter
}

const localeObject = LOCALES[currentAstroLocale] || LOCALES[DEFAULT_LOCALE as Lang];
---
<html lang={localeObject.lang || currentAstroLocale} dir={localeObject.dir || 'ltr'}>
  <head>
    <meta charset="UTF-8" />
    {/* ... other head elements ... */}
  </head>
  <body>
    {/* ... header, main content slot ... */}
    <main>
      <slot /> {/* Qwik components will be rendered within this slot */}
    </main>
    {/* ... footer ... */}

    {/* For client-side development mode: initialize compiled-i18n */}
    <script>
      import { setupI18nClient } from '@/lib/i18n-setup';
      if (typeof window !== 'undefined') { // Ensure client-side context
        setupI18nClient();
      }
    </script>
  </body>
</html>
```

### 4. Qwik Component (`src/components/MyQwikComponent.tsx`)

Use the `_` tag from `compiled-i18n` as usual within your Qwik components.

```tsx
// src/components/MyQwikComponent.tsx
import { component$, useSignal } from "@builder.io/qwik";
import { _ } from "compiled-i18n";

export default component$(() => {
  const userName = useSignal("Qwik");

  return (
    <div>
      <h2>{_`welcomeMessage`}</h2> {/* Key "welcomeMessage" must exist in your .json files */}
      <p>{_`greeting ${userName.value}`}</p> {/* Key "greeting $1" */}
    </div>
  );
});
```

### 5. Translation Files (`src/i18n/`)

Create your JSON translation files in the directory specified in `localesDir` (e.g., `src/i18n/en.json`, `src/i18n/fr.json`).

`src/i18n/en.json`:
```json
{
  "locale": "en",
  "name": "English",
  "translations": {
    "welcomeMessage": "Welcome!",
    "greeting $1": "Hello, $1!"
  }
}
```

`src/i18n/fr.json`:
```json
{
  "locale": "fr",
  "name": "Français",
  "translations": {
    "welcomeMessage": "Bienvenue !",
    "greeting $1": "Bonjour, $1 !"
  }
}
```

**Key Considerations:**

*   **Consistency:** Ensure locale codes (e.g., `en`, `fr-CA`, `zh-CN`) are used consistently across Astro's i18n configuration, `compiled-i18n`'s Vite plugin options, and your translation JSON file names/`locale` fields.
*   **SSR:** The `globalThis.currentLocale` mechanism passes Astro's current locale to `compiled-i18n`'s `setLocaleGetter` callback during server-side rendering. This allows Qwik components to be rendered with the correct translations from the start.
*   **Development Client-Side:** The `setupI18nClient` function uses the `<html>` tag's `lang` attribute (set by Astro) to inform `compiled-i18n` of the current locale in development mode, enabling live translation updates.
*   **Production Client-Side:** In production builds, `compiled-i18n` bakes the translations directly into locale-specific Qwik component bundles. Astro's routing ensures the correct HTML page (referencing the correct locale-specific Qwik bundles) is served. The `assetsDir` option (defaulting to `build/` for Qwik) handles the creation of these localized asset folders (e.g., `/en/build/`, `/fr/build/`).

This setup allows `compiled-i18n` to function effectively within an Astro project that uses Qwik for islands of interactivity, without requiring `qwik-city`.
