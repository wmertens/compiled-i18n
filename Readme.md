# vite-plugin-i18n

This statically generates translated copies of code bundles, so that you can serve them to clients as-is, without any runtime translation code.

You can also use the helper functions to implement dynamic translations.

Pro:

- 0-runtime in client
- All keys are known

Con:

- changing language means reload
- must tell client to load js from locale dir

## How it works

In the server and in dev mode, all translations are loaded into memory eagerly, but for a production client build, all the ``localize`x` `` calls are replaced with their translation.

## types

See [utils.ts](./src/utils.ts) for the full types.

## lib

### `init(options?: {getLocale?: () => string})`

Must be called before the first translation happens. Ensures that the locales are loaded into memory.
In production client builds, this is removed.

`getLocale` will be used to retrieve the locale on every translation. It defaults to `defaultLocale`.
For example, use this to grab the locale from context during SSR.

### `setLocale(locale: string)`

sets the default locale at runtime.

### ``localize`str` `` or ``_`str` ``

translate template string using in-memory maps

``_`Hi ${name}!` `` converts into a lookup of the I18nKey `"Hi $1"`. A literal `$` will be converted to `$$`. Missing translations fall back to the key.

Nesting is achieved by passing result strings into translations again.

```tsx
_`There are ${plural`${boys} boys`} and ${plural`${girls} girls`}.`
```

### `plural`

translate template string using in-memory maps but vary based on the first interpolation. Translation is of the form

```json
{
	"0": "There are none",
	"1": "There are some",
	"2": 1,
	"3": 1,
	"*": "There are many"
}
```

but if a string is given it falls back to the `_` replacement

### `localize(key: I18nKey, ...params: any[]) ` or `_(key: I18nKey, ...params: any[])`

Translates the key, but this form does not get statically replaced with the translation.
It is your duty to call `loadTranslations` so the requested keys are present.

### `makeKey(...tpl: string[]): string`

Returns the calculated key for a given template string array. For example, it returns `"Hi $1"` for `["Hi ", ""]`

### `translate(translation: I18nTranslation | I18nPlural, ...params: unknown[])`

Perform parameter interpolation given a translation string or plural object. Normally you won't use this.

### `guessLocale(acceptsLanguage: string)`

Given an `accepts-language` header value, return the first matching locale.
If the given string is invalid, returns `undefined`.
Falls back to `defaultLocale`

### `defaultLocale: readonly string`

Default locale, defaults to the first specified locale.

### `locales: readonly string[]`

e.g. `['en_US', 'fr']`.

### `names: readonly const {[key: string]: string}`

e.g. `{en_US: "English (US)", fr: "Français"}`

### `vite-static-i18n/locales`

The vite plugin will populate this import with an array of the locale data (`I18nPlural[]`)

## vite plugin

- pass locales to vite plugin
- during build:
  - transform server source code:
    - create missing json locale files
    - replace `init()` with `init(locales, [await import '~/../i18n/locale1.json', ...])`
    - output missing keys into all json files
    - complain if `init()` call was missing
  - transform client source code:
    - remove `init` call if any
    - replace `__$I18N_LOCALES$__` and `__$I18N_LOCALES$__` with literals in the library code ``
    - replace calls of `localize` and `_` with the "global" `__$LOCALIZE$__(key, ...values)`.
    - replace calls of `plural` with `plural(__$LOCALIZE$__(key), ...values)`
- after build for client:
  - copy bundle to each locale dir, replacing `__$LOCALIZE$__` calls with the resulting translation or just the original
  - Unchanged files are symlinked to the parent dir copy (if not on windows?)

## JSON

Translation maps are objects with keys based on the interpolation string. Each variable converts to `$#`, and `$$` stands for a literal `$`.

They are stored under `~/../i18n/$locale.json`. When new keys are encountered, the JSON is amended.

Format: `I18nPlural`

## Questions

- how to copy bundle in vite
- how to detect the imports
- how to replace the original calls
- how to replace the replaced calls after build
- helper for qwik routing, what API?

  - I18n links use `_` for the href
  - entry.ssr.tsx:

    ```tsx
    export default function (opts: RenderToStreamOptions) {
    	return renderToStream(<Root />, {
    		manifest,
    		...opts,
    		base: extractBase, // determine the base URL for the client code
    		// Use container attributes to set attributes on the html tag.
    		containerAttributes: {
    			lang: opts.serverData!.locale,
    			...opts.containerAttributes,
    		},
    	})
    }
    ```

  - calling `locale()` inside layout.tsx
