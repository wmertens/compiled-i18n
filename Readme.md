# compiled-i18n

- [compiled-i18n](#compiled-i18n)
  - [Introduction](#introduction)
  - [Installation](#installation)
    - [Qwik](#qwik)
  - [Usage](#usage)
  - [How it works](#how-it-works)
  - [Types](#types)
  - [JSON translations format](#json-translations-format)
  - [API](#api)
    - [`setLocaleGetter(getLocale: () => Locale)`](#setlocalegettergetlocale---locale)
    - [`setDefaultLocale(locale: string)`](#setdefaultlocalelocale-string)
    - [``localize`str` `` or ``_`str` ``](#localizestr--or-_str-)
    - [`localize(key: I18nKey, ...params: any[])` or `_(key: I18nKey, ...params: any[])`](#localizekey-i18nkey-params-any-or-_key-i18nkey-params-any)
    - [`makeKey(...tpl: string[]): string`](#makekeytpl-string-string)
    - [`interpolate(translation: I18nTranslation | I18nPlural, ...params: unknown[])`](#interpolatetranslation-i18ntranslation--i18nplural-params-unknown)
    - [`guessLocale(acceptsLanguage: string)`](#guesslocaleacceptslanguage-string)
    - [`defaultLocale: readonly string`](#defaultlocale-readonly-string)
    - [`currentLocale: readonly string`](#currentlocale-readonly-string)
    - [`locales: readonly string[]`](#locales-readonly-string)
    - [`names: readonly const {[key: string]: string}`](#names-readonly-const-key-string-string)
    - [`loadTranslations(translations: I18n.Data['translations'], locale?: string)`](#loadtranslationstranslations-i18ndatatranslations-locale-string)
  - [vite plugin](#vite-plugin)
  - [To discover](#to-discover)

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

Add the plugin to your vite config:

```ts
import {defineConfig} from 'vite'
import {i18nPlugin} from 'compiled-i18n/vite'

export default defineConfig({
	plugins: [
		i18nPlugin({
			locales: ['en_us', 'en_uk', 'en', 'nl'],
			// For Qwik, browser assets are under /build. For other frameworks that differs
			// Leave out if all output is for the browser
			assetsDir: 'build',
		}),
		// ... other plugins
	],
})
```

The plugin will automatically create the JSON files under the i18n folder. Vite will embed necessary code into the build so there's no runtime dependency.

You now have to set up your project so the plugin knows the current locale, both on the server and on the client.

**On the server**, you can use the `setLocaleGetter` function to set a callback that returns the current locale, or you can call the `setDefaultLocale` function to set the locale directly if you only process one locale at a time. See below for an example setup for Qwik.

**In the browser code** during development, you need to either set the `lang` attribute on the `<html>` tag, or call `setDefaultLocale` to set the locale.
In production, the locale is fixed, so no need to set it.
However, you need to make sure that your HTML file loads the correct bundle for the locale.
For example, if your entry point is `/main.js` and your locales are `en` and `fr`, you need to load `/en/main.js` or `/fr/main.js` depending on the locale.

### Qwik

In your `entry.ssr.tsx` file, which is your **server entry point**, you need to set the locale getter, as well as the HTML `lang` attribute and the base path for assets:

```tsx
import {defaultLocale, setLocaleGetter} from 'compiled-i18n'

setLocaleGetter(() => getLocale(defaultLocale))

// Base path for assets, e.g. /build/en
const extractBase = ({serverData}: RenderOptions): string => {
	if (import.meta.env.DEV) {
		return '/build'
	} else {
		return '/build/' + serverData!.locale
	}
}

export default function (opts: RenderToStreamOptions) {
	return renderToStream(<Root />, {
		manifest,
		...opts,
		base: extractBase,
		// Use container attributes to set attributes on the html tag.
		containerAttributes: {
			lang: opts.serverData!.locale,
			...opts.containerAttributes,
		},
	})
}
```

Then, **in the client code**, you either need to manage the locale as a route, or use a cookie.

**When using a route**, you can use the `onGet` handler to redirect to the correct locale, and use the `locale()` function to set the locale for the current request:

- `/src/routes/index.tsx`:

```tsx
import type {RequestHandler} from '@builder.io/qwik-city'
import {guessLocale} from 'compiled-i18n'

export const onGet: RequestHandler = async ({request, redirect, url}) => {
	const acceptLang = request.headers.get('accept-language')
	const guessedLocale = guessLocale(acceptLang)
	throw redirect(301, `/${guessedLocale}/${url.search}`)
}
```

- `/src/routes/[locale]/layout.tsx`:

```tsx
import {component$, Slot} from '@builder.io/qwik'
import type {RequestHandler} from '@builder.io/qwik-city'
import {guessLocale, locales} from 'compiled-i18n'

const replaceLocale = (pathname: string, oldLocale: string, locale: string) => {
	const idx = pathname.indexOf(oldLocale)
	return (
		pathname.slice(0, idx) + locale + pathname.slice(idx + oldLocale.length)
	)
}

export const onGet: RequestHandler = async ({
	request,
	url,
	redirect,
	pathname,
	params,
	locale,
	cacheControl,
}) => {
	if (locales.includes(params.locale)) {
		// Set the locale for this request
		locale(params.locale)
	} else {
		const acceptLang = request.headers.get('accept-language')
		// Redirect to the correct locale
		const guessedLocale = guessLocale(acceptLang)
		const path =
			// You can use `__` as the locale in URLs to auto-select it
			params.locale === '__' ||
			/^([a-z]{2})([_-]([a-z]{2}))?$/i.test(params.locale)
				? // invalid locale
				  '/' + replaceLocale(pathname, params.locale, guessedLocale)
				: // no locale
				  `/${guessedLocale}${pathname}`
		throw redirect(301, `${path}${url.search}`)
	}
}

export default component$(() => {
	return <Slot />
})
```

**When using a cookie**, you can use the `onGet` handler in the top layout to set the locale for the current request:

- `/src/routes/layout.tsx`:

```tsx
// ... other imports
import {guessLocale} from 'compiled-i18n'

export const onGet: RequestHandler = async ({
	query,
	cookie,
	headers,
	cacheControl,
	locale,
}) => {
	// Allow overriding locale with query param `locale`
	// This sets the cookie but doesn't redirect to save another request
	if (query.has('locale')) {
		const newLocale = guessLocale(query.get('locale'))
		cookie.delete('locale')
		cookie.set('locale', newLocale, {})
		locale(newLocale)
	} else {
		// Choose locale based on cookie or accept-language header
		const maybeLocale =
			cookie.get('locale')?.value || headers.get('accept-language')
		locale(guessLocale(maybeLocale))
	}

	// ... other code, like the below default caching rules
	// Control caching for this request for best performance and to reduce hosting costs:
	// https://qwik.builder.io/docs/caching/
	if (!import.meta.env.DEV)
		cacheControl({
			// Always serve a cached response by default, up to a week stale
			staleWhileRevalidate: 60 * 60 * 24 * 7,
			// Max once every 5 seconds, revalidate on the server to get a fresh version of this page
			maxAge: 5,
		})
}
```

If you like, you can also add a visible task to remove the query string from the URL:

- `/src/routes/layout.tsx`, in the exported component:

```tsx
useOnDocument(
	'load',
	$(() => {
		// remove query string including ?
		if (location.search) {
			history.replaceState(
				history.state,
				'',
				location.href.slice(0, location.href.indexOf('?'))
			)
		}
	})
)
```

Finally, to allow the user to change the locale, you can use a locale selector like this:

- `/src/components/locale-selector.tsx`:

```tsx
import {component$, getLocale} from '@builder.io/qwik'
import {_, locales} from 'compiled-i18n'

export const LocaleSelector = component$(() => {
	const currentLocale = getLocale()
	return (
		<>
			{locales.map(locale => {
				const isCurrent = locale === currentLocale
				return (
					// Note, you must use `<a>` and not `<Link>` so the page reloads
					<a
						key={locale}
						// When using route-based locale selection, build the URL here
						href={`?locale=${locale}`}
						aria-disabled={isCurrent}
						class={
							'btn btn-ghost btn-sm' +
							(isCurrent
								? ' bg-neutralContent text-neutral pointer-events-none'
								: ' bg-base-100 text-base-content')
						}
					>
						{locale}
					</a>
				)
			})}
		</>
	)
})
```

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

## API

### `setLocaleGetter(getLocale: () => Locale)`

`getLocale` will be used to retrieve the locale on every translation. It defaults to `defaultLocale`.
For example, use this to grab the locale from context during SSR.

In production client builds, this is removed, since the locale is fixed.

### `setDefaultLocale(locale: string)`

Sets the default locale at runtime, which is used when no locale can be determined. This is useful during dev mode on the client side if you can't change the HTML's `lang` attribute. In production on the client, the locale is fixed, and this function has no effect.

### ``localize`str` `` or ``_`str` ``

translate template string using in-memory maps

``_`Hi ${name}!` `` converts into a lookup of the I18nKey `"Hi $1"`. A literal `$` will be converted to `$$`. Missing translations fall back to the key.

Nesting is achieved by passing result strings into translations again.

```tsx
_`There are ${_`${boys} boys`} and ${_`${girls} girls`}.`
```

### `localize(key: I18nKey, ...params: any[])` or `_(key: I18nKey, ...params: any[])`

Translates the key, but this form does not get statically replaced with the translation.
It is your duty to call `loadTranslations` so the requested translations are present. The built client code will not include any translations.

### `makeKey(...tpl: string[]): string`

Returns the calculated key for a given template string array. For example, it returns `"Hi $1"` for `["Hi ", ""]`

### `interpolate(translation: I18nTranslation | I18nPlural, ...params: unknown[])`

Perform parameter interpolation given a translation string or plural object. Normally you won't use this.

### `guessLocale(acceptsLanguage: string)`

Given an `accepts-language` header value, return the first matching locale.
If the given string is invalid, returns `undefined`.
Falls back to `defaultLocale`

### `defaultLocale: readonly string`

Default locale, defaults to the first specified locale. Can be set with `setDefaultLocale`, useful during dev mode on the client side if you can't change the HTML's `lang` attribute.

### `currentLocale: readonly string`

Current locale. Is automatically set by the locate getter that runs on every translation. In dev mode on the client side it is automatically set to the `lang` attribute of the HTML tag if it's valid.

### `locales: readonly string[]`

e.g. `['en_US', 'fr']`.

### `names: readonly const {[key: string]: string}`

e.g. `{en_US: "English (US)", fr: "Français"}`

### `loadTranslations(translations: I18n.Data['translations'], locale?: string)`

Add translations for a locale to the in-memory map. This is used for dynamic translations.

## vite plugin

This is what the plugin does:

- during build:
  - transform server source code:
    - create missing json locale files
    - output missing keys into all json files
  - transform client source code:
    - replace calls of `localize` and `_` with the "global" `__$LOCALIZE$__(key, ...values)` when no plurals are used for that key, or with `interpolate(__$LOCALIZE$__(key), ...values)` if there are. Tree shaking will remove the unused imports.
- after build, for client output:
  - copy bundle to each locale output dir, replacing the injected `__$LOCALIZE$__` calls with the resulting translation or plural object

## To discover

- build client locales in dev mode as well, being smart about missing keys and hot reloading. In Qwik this might be hard because dev and prod are quite different.
- allow helper libs that re-export localize and interpolate
