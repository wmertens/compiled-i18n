# Using with Astro and Qwik (without Qwik City)

When integrating `compiled-i18n` into a project using Astro for overall page structure and Qwik for interactive islands (without relying on `qwik-city` for routing or locale management), a specific setup is required to ensure translations work correctly both during Server-Side Rendering (SSR) and on the client-side, especially in development.

The core idea is to leverage Astro's i18n capabilities to determine the current locale and then communicate this locale to `compiled-i18n` before Qwik components are rendered.

## 1. Astro Configuration (`astro.config.mjs`)

Ensure your Astro configuration includes the `@qwikdev/astro` integration and the `i18nPlugin` from `compiled-i18n/vite`. The locales configured for Astro's `i18n` and `compiled-i18n`'s `i18nPlugin` must be consistent.

```javascript
// astro.config.mjs
import {defineConfig} from 'astro/config'
import qwikdev from '@qwikdev/astro'
import {i18nPlugin} from 'compiled-i18n/vite'

// Assuming you have locale definitions, e.g., from './src/locales.ts'
import {DEFAULT_LOCALE_SETTING, LOCALES_SETTING} from './src/locales'

export default defineConfig({
	site: 'https://example.com', // Your site URL
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
				localesDir: './src/i18n', // Directory for your .json translation files
				addMissing: true,
				// assetsDir is typically 'build/' by default when qwikVite plugin is detected
			}),
			// ... other Vite plugins
		],
	},
})
```

## 2. Locale Setup Helper (`src/lib/i18n-setup.ts`)

Create a helper file to manage `compiled-i18n`'s locale settings for both server and client environments.

```typescript
// src/lib/i18n-setup.ts
import {
	setLocaleGetter,
	setDefaultLocale,
	locales as compiledLocales, // Locales known by compiled-i18n
} from 'compiled-i18n'

// Assuming DEFAULT_LOCALE is your app's default locale string (e.g., 'en')
// imported from your Astro i18n configuration (e.g., '@/i18n')
import {DEFAULT_LOCALE} from '@/i18n'

export function setupI18nServer() {
	setLocaleGetter(() => {
		let currentSsrLocale: string | undefined
		if (
			typeof globalThis !== 'undefined' &&
			(globalThis as any).currentLocale
		) {
			currentSsrLocale = (globalThis as any).currentLocale
		}

		if (currentSsrLocale && compiledLocales.includes(currentSsrLocale)) {
			return currentSsrLocale
		}
		if (compiledLocales.includes(DEFAULT_LOCALE)) {
			return DEFAULT_LOCALE
		}
		return compiledLocales[0] || 'en' // Fallback to the first known or 'en'
	})
}

export function setupI18nClient() {
	if (import.meta.env.DEV) {
		const htmlLang = document.documentElement.lang
		let targetLocale = DEFAULT_LOCALE

		if (htmlLang) {
			if (compiledLocales.includes(htmlLang)) {
				targetLocale = htmlLang
			} else {
				const baseLang = htmlLang.split('-')[0]
				if (compiledLocales.includes(baseLang)) {
					targetLocale = baseLang
				}
			}
		}

		if (!compiledLocales.includes(targetLocale)) {
			targetLocale = compiledLocales.includes(DEFAULT_LOCALE)
				? DEFAULT_LOCALE
				: compiledLocales[0] || 'en'
		}
		setDefaultLocale(targetLocale)
	}
	// In production, locale is fixed per-bundle, setDefaultLocale has no effect.
}

export function setCurrentLocale(locale: string) {
	if (typeof globalThis !== 'undefined') {
		;(globalThis as any).currentLocale = locale
	}
}
```

## 3. Astro Base Layout (`src/layouts/Base.astro`)

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

## 4. Qwik Component (`src/components/MyQwikComponent.tsx`)

Use the `_` tag from `compiled-i18n` as usual within your Qwik components.

```tsx
// src/components/MyQwikComponent.tsx
import {component$, useSignal} from '@builder.io/qwik'
import {_} from 'compiled-i18n'

export default component$(() => {
	const userName = useSignal('Qwik')

	return (
		<div>
			<h2>{_`welcomeMessage`}</h2>{' '}
			{/* Key "welcomeMessage" must exist in your .json files */}
			<p>{_`greeting ${userName.value}`}</p> {/* Key "greeting $1" */}
		</div>
	)
})
```

## 5. Translation Files (`src/i18n/`)

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

- **Consistency:** Ensure locale codes (e.g., `en`, `fr-CA`, `zh-CN`) are used consistently across Astro's i18n configuration, `compiled-i18n`'s Vite plugin options, and your translation JSON file names/`locale` fields.
- **SSR:** The `globalThis.currentLocale` mechanism passes Astro's current locale to `compiled-i18n`'s `setLocaleGetter` callback during server-side rendering. This allows Qwik components to be rendered with the correct translations from the start.
- **Development Client-Side:** The `setupI18nClient` function uses the `<html>` tag's `lang` attribute (set by Astro) to inform `compiled-i18n` of the current locale in development mode, enabling live translation updates.
- **Production Client-Side:** In production builds, `compiled-i18n` bakes the translations directly into locale-specific Qwik component bundles. Astro's routing ensures the correct HTML page (referencing the correct locale-specific Qwik bundles) is served. The `assetsDir` option (defaulting to `build/` for Qwik) handles the creation of these localized asset folders (e.g., `/en/build/`, `/fr/build/`).

This setup allows `compiled-i18n` to function effectively within an Astro project that uses Qwik for islands of interactivity, without requiring `qwik-city`.
