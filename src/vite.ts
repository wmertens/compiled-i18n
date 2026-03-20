import {resolve, sep} from 'node:path'
import type {UserConfig, Plugin} from 'vite'
import fs from 'node:fs'
import type {Locale, Data, Key} from 'compiled-i18n'
import {replaceGlobals, transformLocalize} from './transform-localize'

type Options = {
	/** The locales you want to support */
	locales?: string[]
	/**
	 * Build mode for production client builds:
	 *
	 * - `'inline'`: Duplicate the bundle per locale with baked-in translations
	 *   (default)
	 * - `'split'`: One shared bundle + per-locale translation chunks loaded at
	 *   runtime
	 *
	 * Split mode uses top-level await to load translations dynamically. The TLA
	 * is isolated in a private loader module to work around Safari's bug with
	 * multiple modules importing a TLA module.
	 */
	mode?: 'inline' | 'split'
	/** The directory where the locale files are stored, defaults to /i18n */
	localesDir?: string
	/** The default locale, defaults to the first locale */
	defaultLocale?: string
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

// const c = (...args: any[]): any => {
// 	console.log('vite i18n', ...args)
// 	return args[0]
// }

const sortObject = (o: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(o).sort(([a], [b]) =>
			a.localeCompare(b, 'en', {sensitivity: 'base'})
		)
	)

export function i18nPlugin(options: Options = {}): Plugin[] {
	const {
		localesDir = 'i18n',
		addMissing = true,
		removeUnusedKeys = false,
		tabs,
	} = options
	let assetsDir = options.assetsDir
	if (assetsDir && !assetsDir.endsWith('/')) assetsDir += '/'
	const locales = options.locales || ['en']
	const defaultLocale = options.defaultLocale || locales[0]
	const localeNames = {}
	let localesDirAbs: string
	let localesDirNode: string

	const buildMode = options.mode || 'inline'
	let shouldInline = false
	let shouldSplit = false
	let translations: Record<Locale, Data>
	let hasTabs: Record<Locale, boolean>
	let allKeys: Set<Key>
	let pluralKeys: Set<Key>
	/** In split mode: key→index mapping, computed lazily from locale files */
	let keyIndexMap: Record<Key, number> | null = null
	/** In split mode: locale→fallback mapping */
	let fallbackMap: Record<Locale, Locale | undefined> | null = null
	const getKeyIndexMap = () => {
		if (keyIndexMap) return keyIndexMap
		keyIndexMap = {}
		for (const locale of locales) {
			for (const key of Object.keys(translations[locale].translations).sort()) {
				if (!(key in keyIndexMap)) {
					keyIndexMap[key] = Object.keys(keyIndexMap).length
				}
			}
		}
		return keyIndexMap
	}
	const getFallbackMap = () => {
		if (fallbackMap) return fallbackMap
		fallbackMap = {}
		for (const locale of locales) {
			fallbackMap[locale] = translations[locale].fallback
		}
		return fallbackMap
	}
	return [
		{
			name: 'i18n',
			enforce: 'pre',

			async config() {
				const updatedViteConfig: UserConfig = {
					optimizeDeps: {
						// Make sure we process our virtual files
						exclude: ['compiled-i18n'],
					},
					ssr: {
						// Make sure we bundle our module
						noExternal: ['compiled-i18n'],
					},
				}
				if (buildMode === 'split') {
					// Split mode uses top-level await, which requires es2022+
					updatedViteConfig.build = {target: 'es2022'}
				}
				return updatedViteConfig
			},

			configResolved(config) {
				// c(config)
				localesDirAbs = resolve(config.root, localesDir)
				localesDirNode =
					sep !== '/' ? localesDirAbs.replaceAll(sep, '/') : localesDirAbs
				const isProductionClient =
					!config.build.ssr && config.mode === 'production'
				shouldInline = isProductionClient && buildMode === 'inline'
				shouldSplit = isProductionClient && buildMode === 'split'
				if (
					!assetsDir &&
					config.plugins.some(p => p.name === 'vite-plugin-qwik')
				)
					assetsDir = 'build/'
			},

			buildStart() {
				if (shouldSplit) {
					// Emit the loader as a separate entry chunk so TLA stays isolated
					// and doesn't propagate to modules that import __state
					this.emitFile({type: 'chunk', id: '@i18n/__loader'})
				}
				// Ensure the locales dir exists
				fs.mkdirSync(localesDirAbs, {recursive: true})
				// Verify/generate the locale files
				const fallbacks = {}
				translations = {}
				hasTabs = {}
				allKeys = new Set()
				pluralKeys = new Set()
				for (const locale of locales!) {
					const match = /^([a-z]{2})([_-]([A-Z]{2}))?$/.exec(locale)
					if (!match)
						throw new Error(
							`Invalid locale: ${locale} (does not match xx or xx_XX))`
						)
					const localeFile = resolve(localesDirAbs, `${locale}.json`)
					let data: Data
					if (fs.existsSync(localeFile)) {
						const text = fs.readFileSync(localeFile, 'utf8')
						hasTabs[locale] = tabs ?? text.slice(0, 100).includes('\t')
						data = JSON.parse(text) as Data
						if (data.locale !== locale)
							throw new Error(
								`Invalid locale file: ${localeFile} (locale mismatch ${data.locale} !== ${locale})`
							)
						if (!data.name)
							data.name = match[3] ? `${match[1]} (${match[3]})` : locale
						if (data.fallback) {
							if (!locales!.includes(data.fallback))
								throw new Error(
									`Invalid locale file: ${localeFile} (invalid fallback ${data.fallback})`
								)
							let follow
							while ((follow = fallbacks[data.fallback])) {
								if (follow === locale) {
									throw new Error(
										`Invalid locale file: ${localeFile} (circular fallback ${data.fallback})`
									)
								}
							}
							fallbacks[locale] = data.fallback
						}
					} else {
						data = {
							locale,
							name: match[3] ? `${match[1]} (${match[3]})` : locale,
							translations: {},
						}
						hasTabs[locale] = !!tabs
						if (addMissing)
							fs.writeFileSync(
								localeFile,
								JSON.stringify(data, null, tabs ? '\t' : 2)
							)
					}
					localeNames[locale] = data.name
					translations[locale] = data
					for (const [key, tr] of Object.entries(data.translations))
						if (tr && typeof tr === 'object') pluralKeys.add(key)
				}
			},

			// Redirect to our virtual data files
			async resolveId(id) {
				// c('resolveId', id) //, importer, await this.getModuleInfo(id))
				if (id.startsWith('@i18n/__locales')) return '\0i18n-locales.js'
				if (id.startsWith('@i18n/__data')) return '\0i18n-data.js'
				if (id.startsWith('@i18n/__state')) return '\0i18n-state.js'
				if (id.startsWith('@i18n/__loader')) return '\0i18n-loader.js'
				if (id.startsWith('@i18n/__tr')) return '\0i18n-tr.js'
				const localeMatch = id.match(/^@i18n\/__locale\/(.+)$/)
				if (localeMatch && locales.includes(localeMatch[1]))
					return `\0i18n-locale-${localeMatch[1]}.js`
			},

			// Load our virtual data files
			async load(id) {
				// c('load', id, await this.getModuleInfo(id))
				if (id === '\0i18n-tr.js') {
					// Split mode: translations array populated by the loader via _setTr
					return `
/** Generated by compiled-i18n. Translations array for split mode. */
export let tr = []
export const _setTr = (v) => { tr = v }
`
				}
				if (id === '\0i18n-locales.js') {
					if (shouldSplit) {
						// Split mode: empty mutable store, populated by the loader
						return `
/** Generated by compiled-i18n (split mode). Populated at runtime by the loader. */
export default {}
`
					}
					return `
/**
 * This file was generated by compiled-i18n.
 *
 * For server builds, it contains all translations. For client builds, it is
 * empty, and translations need to be loaded dynamically.
 */
${
	shouldInline
		? `export default {"__$LOCALE$__": {translations: {}}}`
		: `
${locales!
	.map((l, i) => `import _${i} from '${localesDirNode}/${l}.json'`)
	.join('\n')}

export default {
${locales!.map((l, i) => `  "${l}": _${i},`).join('\n')}
}
`
}
`
				}
				if (id === '\0i18n-data.js') {
					return `
/** This file is generated at build time by \`compiled-i18n\`. */
/** @type {import('compiled-i18n').Locale[]} */
export const locales = ${JSON.stringify(locales)}
/** @type {Record<import('compiled-i18n').Locale, string>} */
export const localeNames = ${JSON.stringify(localeNames)}
/** @type {Record<string, number>|undefined} key→index mapping for array-based translations (split mode) */
export const keyIndex = ${shouldSplit ? JSON.stringify(getKeyIndexMap()) : 'undefined'}
/** @type {Record<string, string|undefined>|undefined} locale→fallback mapping (split mode) */
export const fallbacks = ${shouldSplit ? JSON.stringify(getFallbackMap()) : 'undefined'}
`
				}
				if (id === '\0i18n-state.js') {
					if (shouldSplit) {
						// Split mode: runtime state detection (loader runs as separate entry)
						return `
/** This file is generated at build time by \`compiled-i18n\` (split mode). */
import {localeNames} from '@i18n/__data.js'

/** @typedef {import('compiled-i18n').Locale} Locale */
/** @type {Locale} */
export let defaultLocale = ${JSON.stringify(defaultLocale)}
/** @type {Locale} */
export let currentLocale

/** @type {() => Locale} */
export let getLocale = () => {
	if (currentLocale) return currentLocale
	if (typeof document !== 'undefined') {
		const lang = document.documentElement.lang
		if (lang && lang in localeNames) currentLocale = lang
	}
	if (!currentLocale) currentLocale = defaultLocale
	return currentLocale
}
const _checkLocale = l => {
	if (!localeNames[l]) {
		console.error(\`unknown locale \${l}\`)
		return defaultLocale
	}
	return l
}
/** @type {(locale: Locale) => void} */
export const setDefaultLocale = l => {
	defaultLocale = _checkLocale(l)
}
/** @type {(fn: () => Locale | undefined) => void} */
export const setLocaleGetter = fn => {
	getLocale = () => currentLocale = _checkLocale(fn())
}
`
					}
					return `
/** This file is generated at build time by \`compiled-i18n\`. */
import {localeNames} from '@i18n/__data.js'

/** @typedef {import('compiled-i18n').Locale} Locale */
/** @type {Locale} */
export let defaultLocale = ${JSON.stringify(defaultLocale)}
/** @type {Locale} */
export let currentLocale${shouldInline ? ' = "__$LOCALE$__"' : ''}

${
	shouldInline
		? // These functions shouldn't be called from client code
			`
export let getLocale = () => "__$LOCALE$__"
export const setDefaultLocale = () => {}
export const setLocaleGetter = () => {throw new Error('Do not call setLocaleGetter() in client code, use the html lang attribute or setDefaultLocale() (which only works in dev mode)')}
			`
		: `
/** @type {() => Locale} */
export let getLocale = () => {
	if (currentLocale) return currentLocale
	if (typeof document !== 'undefined') {
		const lang = document.documentElement.lang
		if (lang && lang in localeNames) currentLocale = lang
	}
	if (!currentLocale) currentLocale = defaultLocale
	return currentLocale
}
const _checkLocale = l => {
	if (!localeNames[l]) {
		console.error(\`unknown locale \${l}\`)
		return defaultLocale
	}
	return l
}
/** @type {(locale: Locale) => void} */
export const setDefaultLocale = l => {
	defaultLocale = _checkLocale(l)
}
/** @type {(fn: () => Locale | undefined) => void} */
export const setLocaleGetter = fn => {
	getLocale = () => currentLocale = _checkLocale(fn())
}`
}
`
				}
				if (id === '\0i18n-loader.js') {
					// Private TLA module — emitted as separate entry
					const switchCases = locales
						.map(
							l =>
								`\t\t\tcase ${JSON.stringify(l)}: return import('@i18n/__locale/${l}')`
						)
						.join('\n')
					return `
/** Generated by compiled-i18n. Private loader module with top-level await. */
import {_setTr} from '@i18n/__tr'

const _load = (l) => {
	switch(l) {
${switchCases}
		default: return import('@i18n/__locale/${defaultLocale}')
	}
}
const locale = typeof document !== 'undefined'
	? document.documentElement.lang || ${JSON.stringify(defaultLocale)}
	: ${JSON.stringify(defaultLocale)}
const {default: data} = await _load(locale)
_setTr(data)
`
				}
				// Per-locale data chunks (only used in split mode)
				const localeFileMatch = id.match(/^\0i18n-locale-(.+)\.js$/)
				if (localeFileMatch) {
					const locale = localeFileMatch[1]
					const data = translations[locale]
					if (!data)
						throw new Error(`Unknown locale in virtual module: ${locale}`)
					// Export a compact array: index position maps to the key via keyIndex
					// Fill in fallback values so every slot has a translation
					const kim = getKeyIndexMap()
					const arr = new Array(Object.keys(kim).length).fill(null)
					// Walk fallback chain from furthest ancestor to this locale
					const chain = [locale]
					let fb = data.fallback
					while (fb) {
						chain.unshift(fb)
						fb = translations[fb].fallback
					}
					for (const chainLocale of chain) {
						for (const [key, tr] of Object.entries(
							translations[chainLocale].translations
						)) {
							if (key in kim && tr) arr[kim[key]] = tr
						}
					}
					// Trim trailing nulls
					while (arr.length > 0 && arr[arr.length - 1] == null) arr.pop()
					return `export default ${JSON.stringify(arr)}`
				}
			},

			async transform(code, id) {
				if (
					(!shouldInline && !shouldSplit) ||
					!/\.(cjs|js|mjs|ts|jsx|tsx)($|\?)/.test(id)
				)
					return null
				// c('transform', id, await this.getModuleInfo(id))

				if (shouldSplit) {
					return transformLocalize({
						id,
						code,
						allKeys,
						pluralKeys,
						splitMode: true,
						keyIndexMap: getKeyIndexMap(),
					})
				}
				return transformLocalize({id, code, allKeys, pluralKeys})
			},
		},

		{
			name: 'i18n-post',
			enforce: 'post',

			// Emit the translated files as assets under locale subdirectories
			generateBundle: {
				// enforce isn't enough to make hooks be post, so we need to set the order
				order: 'post',
				handler(_options, bundle) {
					// console.log('generateBundle', _options, bundle, shouldInline)
					if (!shouldInline || shouldSplit) return
					for (const [fileName, chunk] of Object.entries(bundle)) {
						if (assetsDir && !fileName.startsWith(assetsDir)) continue
						for (const locale of locales!) {
							const newFilename = assetsDir
								? `${assetsDir}${locale}/${fileName.slice(assetsDir.length)}`
								: `${locale}/${fileName}`
							let source = chunk.type === 'asset' ? chunk.source : chunk.code
							if (fileName.endsWith('js') && typeof source === 'string') {
								source = replaceGlobals({
									code: source,
									locale,
									translations,
								})
							}
							this.emitFile({
								type: 'asset',
								fileName: newFilename,
								source,
							})
						}
					}
				},
			},

			buildEnd() {
				if (!shouldInline && !shouldSplit) return
				for (const locale of locales!) {
					const missingKeys = new Set(allKeys)
					const unusedKeys = new Set<Key>()
					for (const key of Object.keys(translations[locale].translations)) {
						missingKeys.delete(key)
						if (!allKeys.has(key)) unusedKeys.add(key)
					}

					if (missingKeys.size || unusedKeys.size)
						// eslint-disable-next-line no-console
						console.info(
							`i18n ${locale}: ${
								missingKeys.size
									? `missing ${missingKeys.size} keys: ${[...missingKeys]
											.map(k => `"${k}"`)
											.join(' ')}`
									: ''
							}${missingKeys.size && unusedKeys.size ? ', ' : ''}${
								unusedKeys.size
									? `unused ${unusedKeys.size} keys${removeUnusedKeys ? ' (will be deleted now)' : ''}: ${[
											...unusedKeys,
										]
											.map(k => `"${k}"`)
											.join(' ')}`
									: ''
							}`
						)
					if (removeUnusedKeys && unusedKeys.size) {
						for (const key of unusedKeys) {
							delete translations[locale].translations[key]
						}
						const data = translations[locale]
						sortObject(data.translations)
						fs.writeFileSync(
							resolve(localesDirAbs, `${locale}.json`),
							JSON.stringify(data, null, hasTabs[locale] ? '\t' : 2)
						)
					}
					if (addMissing && missingKeys.size) {
						for (const key of missingKeys) {
							translations[locale].translations[key] = ''
						}
						const data = translations[locale]
						sortObject(data.translations)
						fs.writeFileSync(
							resolve(localesDirAbs, `${locale}.json`),
							JSON.stringify(data, null, hasTabs[locale] ? '\t' : 2)
						)
					}
				}
			},
		},
	]
}
