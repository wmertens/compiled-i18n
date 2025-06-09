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

### Vite

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

You have to set up your project so the plugin knows the current locale, both on the server during SSR, and on the client.

### Server code

**On the server**, you can use the `setLocaleGetter` function to set a callback that returns the current locale, or you can call the `setDefaultLocale` function to set the locale directly if you only process one locale at a time. See [qwik.md](./qwik.md) for an example setup for Qwik.

### Browser code

**During development**, you need to either set the `lang` attribute on the `<html>` tag, or call `setDefaultLocale` to set the locale before the translations are used.

**In production**, the locale is fixed, so no need to set it.
However, you need to make sure that your HTML file loads the correct bundle for the locale.
For example, if your entry point is `/main.js` and your locales are `en` and `fr`, you need to load `/en/main.js` or `/fr/main.js` depending on the locale.

### Framework-specific instructions

- [Qwik](./docs/qwik.md)
- [Astro with Qwik](./docs/astro-qwik.md)

## Usage

In your code, use the `_` or `localize` function to translate strings (you must use template string notation). For example:

```tsx
import {_} from 'compiled-i18n'

// ...

const name = 'John'
const emoji = '👋'
const greeting = _`Hello ${name} ${emoji}!`
```

This will look up the key `"Hello $1 $2!"` in the locale JSON files.

It is recommended to keep your keys short and descriptive, with capitalization when appropriate. If you would like to change what's shown in your base language, it's best to change the translation and keep the key the same.

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

### Translation

A Translation is a string.
It can contain `$<number>` for interpolation, and `$$` for a literal `$`.

For example, `` _`Hello ${name} ${emoji}` `` is interpolating the values of `name` and `emoji`. To do so, these interpolations are replaced with `$1` and `$2` to make the lookup key `"Hello $1 $2"`.

This key is what you see in the JSON files.

Note that the key, being a string, is also a Translation, so when a translation is missing, its Key is used instead.

### Plural

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

You can for example use this for translating enums.

You can nest Plural objects; at every level the next parameter is used to match.

For example, `` _`time:${format}${amPm}${time}` `` will use the value of `format` to match the `short` or `long` key, and then use the value of `amPm` to match the `AM` or `PM` key.

```json
{
	"time:$1.$2.$3": {
		"short": "$3$2",
		"long": {
			"AM": "It is $3 in the morning",
			"PM": "It is $3 in the afternoon"
		}
	}
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

## API

These are exported from `compiled-i18n`:

### ``localize`str` `` or ``_`str` ``: Compile-time translation

This translates the given string at compile time.

Interpolations are converted to `$`+number to make a lookup key, and then the key is looked up in the JSON file.

``_`Hi ${honorific}${name}!` `` converts into a lookup of the I18nKey `"Hi $1 $2"`. A literal `$` will be converted to `$$`. Missing translations fall back to the key.

Nesting is achieved by passing result strings into translations again.

```tsx
_`There are ${_`${boys} boys`} and ${_`${girls} girls`}.`
```

### `localize(key: I18nKey, ...params: any[])` or `_(key: I18nKey, ...params: any[])`: Runtime translation

This translates the given string at runtime, using in-memory maps that you need to provide.

The key is not changed at build time, interpolations of template strings are not converted to `$`+number.

This means that when you do interpolate, you are generating new keys instead of a single key with a `$1` placeholder. For example:

```tsx
const name = 'Wout'

_`Hi ${name}!` // key: "Hi $1", params: ["Wout"]
_(`Hi ${name}`) // key: "Hi Wout", params: []
```

It is also your duty to call `loadTranslations` with data you provide, so the requested translations are present. The built client code will not include any translations.
Missing translations use the key.

### `currentLocale: readonly string`

The current locale. Is automatically set by the locate getter that runs on every translation.

On the client side, in production, it is hardcoded.
During dev mode on the client it is automatically set to the `lang` attribute of the HTML tag if that's valid. You can also set it with `setDefaultLocale`.

### `locales: readonly string[]`

The locales you configured, for example `['en_US', 'fr']`.

### `localeNames: readonly const {[key: string]: string}`

The locale names you configured, for example `{en_US: "English (US)", fr: "Français"}`.

### `loadTranslations(translations: I18n.Data['translations'], locale?: string)`

Add translations for a locale to the in-memory map. If you don't specify the locale, it uses `currentLocale`.

This is only needed for dynamic translations.
You need to run this both on the client and the server (when using SSR), so they have the same translations available.

## Server-side API

Also exported from `compiled-i18n`:

### `setLocaleGetter(getLocale: () => Locale)`

`getLocale` will be used to retrieve the locale on every translation. It defaults to `defaultLocale`.
For example, use this to grab the locale from context during SSR.

This should not be called on the client, as the locale is fixed in production. Instead, the client should set the locale via the HTML `lang` attribute or with `setDefaultLocale`.

### `setDefaultLocale(locale: string)`

Sets the default locale at runtime, which is used when no locale can be determined. This is useful during dev mode on the client side if you can't change the HTML's `lang` attribute. In production on the client, the locale is fixed, and this function has no effect.

## Utility API

Also exported from `compiled-i18n`:

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

## Vite API

Exported from `compiled-i18n/vite`: `i18nPlugin(options?: Options)`

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

## Roadmap

- allow specifying helper libs that re-export localize and interpolate, so those re-exports are also processed
- build client locales in dev mode as well, being smart about missing keys and hot reloading. In Qwik this might be hard because dev and prod are quite different.
- move unused keys to `unused` in the JSON files?
