# Qwik + `compiled-i18n`

Make sure you have the Vite plugin installed, as per the instructions in the [README](../Readme.md).

## Extra API

These helpers are exported from `compiled-i18n/qwik`:

### `extractBase({serverData}: RenderOptions): string`

This sets the base path for assets for a Qwik application. Pass it to the
`base` property of the render options.

If running in development mode, the base path is simply `/build`. Otherwise,
it's `/build/${locale}`. It also includes the base path given to vite.

### `setSsrLocaleGetter(): void`

Configure compiled-i18n to use the locale from Qwik during SSR.

Call this in your entry.ssr file.

## Server code

In your `entry.ssr.tsx` file, which is your **server entry point**, you need to set the locale getter, as well as the HTML `lang` attribute and the base path for assets. Apply the lines marked with +++:

```tsx
// +++ Extra import
import {extractBase, setSsrLocaleGetter} from 'compiled-i18n/qwik'

// +++ Allow compiled-i18n to get the current SSR locale
setSsrLocaleGetter()

export default function (opts: RenderToStreamOptions) {
	return renderToStream(<Root />, {
		manifest,
		...opts,

		// +++ Configure the base path for assets
		base: extractBase,

		// Use container attributes to set attributes on the html tag.
		containerAttributes: {
			// +++ Set the HTML lang attribute to the SSR locale
			lang: opts.serverData!.locale,

			...opts.containerAttributes,
		},
	})
}
```

## Client code

Then, **in the client code**, you need to manage the locale as either a route, a query parameter, or use a cookie.

### Route-based locale selection

**When using a route**, you can use the `onGet` handler on `/` to redirect GET requests to the correct locale, and then use the `locale()` function to set the locale for the current request:

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

export const onRequest: RequestHandler = async ({
	request,
	url,
	redirect,
	pathname,
	params,
	locale,
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

### Query-based locale selection

**When using a query parameter**, you can use the `onRequest` handler in the top layout to set the locale for the current request:

- `/src/routes/layout.tsx`:

```tsx
// ... other imports
import {guessLocale} from 'compiled-i18n'

export const onRequest: RequestHandler = async ({query, headers, locale}) => {
	// Allow overriding locale with query param `locale`
	const maybeLocale = query.get('locale') || headers.get('accept-language')
	locale(guessLocale(maybeLocale))
}
```

### Cookie-based locale selection

**When using a cookie**, you can use the `onRequest` handler in the top layout to set the locale for the current request:

- `/src/routes/layout.tsx`:

```tsx
// ... other imports
import {guessLocale} from 'compiled-i18n'

export const onRequest: RequestHandler = async ({
	query,
	cookie,
	headers,
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
}
```

Note that you still need to set the cookie, this is done here with a query parameter. You could also set it in the client and reload.

If you like, you can also add a task to remove the entire query string from the URL:

- `/src/routes/layout.tsx`, in the exported component:

```tsx
useOnDocument(
	'load',
	$(() => {
		// remove all query params except allowed
		const allowed = new Set(['page'])
		if (location.search) {
			const params = new URLSearchParams(location.search)
			for (const [key] of params) {
				if (!allowed.has(key)) {
					params.delete(key)
				}
			}
			let search = params.toString()
			if (search) search = '?' + search
			history.replaceState(
				history.state,
				'',
				location.href.slice(0, location.href.indexOf('?')) + search
			)
		}
	})
)
```

## Client UI

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

## Plugin order using older qwik versions

If you are using a qwik version lower than 1.8, you will need to move the i18nPlugin to the top of the plugin list.

```ts
import {qwikVite} from '@builder.io/qwik/optimizer'
import {qwikCity} from '@builder.io/qwik-city/vite'
import {defineConfig} from 'vite'
import {i18nPlugin} from 'compiled-i18n/vite'

export default defineConfig({
	plugins: [
		i18nPlugin({
			locales: ['en_us', 'en_uk', 'en', 'nl'],
		}),
		qwikCity(),
		qwikVite(),
	],
})
```
