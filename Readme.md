# compiled-i18n

- [compiled-i18n](#compiled-i18n)
	- [Introduction](#introduction)
	- [Installation](#installation)
		- [Qwik](#qwik)
	- [Usage](#usage)
	- [How it works](#how-it-works)
	- [Types](#types)
	- [JSON translations format](#json-translations-format)
	- [Client-side API](#client-side-api)
		- [``localize`str` `` or ``_`str` ``](#localizestr--or-_str-)
		- [`localize(key: I18nKey, ...params: any[])` or `_(key: I18nKey, ...params: any[])`](#localizekey-i18nkey-params-any-or-_key-i18nkey-params-any)
		- [`currentLocale: readonly string`](#currentlocale-readonly-string)
		- [`locales: readonly string[]`](#locales-readonly-string)
		- [`localeNames: readonly const {[key: string]: string}`](#localenames-readonly-const-key-string-string)
		- [`loadTranslations(translations: I18n.Data['translations'], locale?: string)`](#loadtranslationstranslations-i18ndatatranslations-locale-string)
	- [Server-side API](#server-side-api)
		- [`setLocaleGetter(getLocale: () => Locale)`](#setlocalegettergetlocale---locale)
		- [`setDefaultLocale(locale: string)`](#setdefaultlocalelocale-string)
	- [Utility API](#utility-api)
		- [`defaultLocale: readonly string`](#defaultlocale-readonly-string)
		- [`guessLocale(acceptsLanguage: string)`](#guesslocaleacceptslanguage-string)
		- [`interpolate(translation: I18nTranslation | I18nPlural, ...params: unknown[])`](#interpolatetranslation-i18ntranslation--i18nplural-params-unknown)
		- [`makeKey(...tpl: string[]): string`](#makekeytpl-string-string)
	- [Qwik API (from 'compiled-i18n/qwik')](#qwik-api-from-compiled-i18nqwik)
		- [`extractBase({serverData}: RenderOptions): string`](#extractbaseserverdata-renderoptions-string)
		- [`setSsrLocaleGetter(): void`](#setssrlocalegetter-void)
	- [Vite API (from 'compiled-i18n/vite')](#vite-api-from-compiled-i18nvite)
	- [Choosing a key name](#choosing-a-key-name)
	- [Automatic translation](#automatic-translation)
	- [Roadmap](#roadmap)

## Introduction

This module statically generates translated copies of code bundles, so that you can serve them to clients as-is, without any runtime translation code. This concept is based on `$localize` from Angular.

Anywhere in your code, you have simple template string interpolation:

```jsx
import {_} from 'compiled-i18n'

console.log(_`Logenv ${process.env.NODE_ENV}`)

export const Count = ({count}) => (
	<div title={_`countTitle`}>{_`${count} items`}</div>
)
```

This combines with translations in JSON files. French example:

`/i18n/fr.json`

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

On the server, these translations are loaded into memory and translated dependening on the current locale (you can define a callback with `setLocaleGetter` to choose the locale per translation call).

On the client, the translations are embedded directly into the code. For example, the client code for the `fr` locale becomes:

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

Note that the `interpolate` function is only added when a translation uses plurals.

You can also use the API functions to implement dynamic translations that you load at runtime.

Pros:

- 0-runtime in client
- all keys are known
- easy setup

Cons:

- changing language means reload
- must construct loading HTML to load the js from the per-locale dir

## Installation

Add the plugin as a dev dependency:

```sh
npm install --save-dev compiled-i18n
```

or

```sh
pnpm i -D compiled-i18n
```

or

```sh
yarn add -D compiled-i18n
```

There are several parts to localization:

- the locale data
- the locale selection (cookie, url, ...)
- the translation function
- getting the data to the client

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
