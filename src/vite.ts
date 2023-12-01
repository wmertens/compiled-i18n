import {resolve, sep} from 'node:path'
import type {UserConfig, Plugin} from 'vite'
import fs from 'node:fs'
import type {Locale, Data, Key} from 'compiled-i18n'
import {replaceGlobals, transformLocalize} from './transform-localize'

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
	const {localesDir = 'i18n', babelPlugins, addMissing = true, tabs} = options
	let assetsDir = options.assetsDir
	if (assetsDir && !assetsDir.endsWith('/')) assetsDir += '/'
	const locales = options.locales || ['en']
	const defaultLocale = options.defaultLocale || locales[0]
	const localeNames = {}
	const localesDirAbs = resolve(localesDir)
	const localesDirNode =
		sep !== '/' ? localesDirAbs.replaceAll(sep, '/') : localesDirAbs

	let shouldInline = false
	let translations: Record<Locale, Data>
	let hasTabs: Record<Locale, boolean>
	let allKeys: Set<Key>
	let pluralKeys: Set<Key>
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
				return updatedViteConfig
			},

			configResolved(config) {
				// c(config)
				shouldInline = !config.build.ssr && config.mode === 'production'
				if (
					!assetsDir &&
					config.plugins.some(p => p.name === 'vite-plugin-qwik')
				)
					assetsDir = 'build/'
			},

			buildStart() {
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
						hasTabs[locale] = text.slice(0, 100).includes('\t')
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
			},

			// Load our virtual data files
			async load(id) {
				// c('load', id, await this.getModuleInfo(id))
				if (id === '\0i18n-locales.js') {
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
`
				}
				if (id === '\0i18n-state.js') {
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
	if (!localeNames[l]) throw new TypeError(\`unknown locale \${l}\`)
}
/** @type {(locale: Locale) => void} */
export const setDefaultLocale = l => {
	_checkLocale(l)
	defaultLocale = l
	currentLocale = l
}
/** @type {(fn: () => Locale | undefined) => void} */
export const setLocaleGetter = fn => {
	getLocale = () => {
		const l = fn() || defaultLocale
		_checkLocale(l)
		currentLocale = l
	  return l
	}
}`
}
`
				}
			},

			async transform(code, id) {
				if (!shouldInline || !/\.(cjs|js|mjs|ts|jsx|tsx)($|\?)/.test(id))
					return null
				// c('transform', id, await this.getModuleInfo(id))

				return transformLocalize({id, code, allKeys, pluralKeys, babelPlugins})
			},
		},

		{
			name: 'i18n-post',
			enforce: 'post',

			// Emit the translated files as assets under locale subdirectories
			generateBundle(_options, bundle) {
				// console.log('generateBundle', _options, bundle, shouldInline)
				if (!shouldInline) return
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

			buildEnd() {
				if (!shouldInline) return
				for (const locale of locales!) {
					const missingKeys = new Set(allKeys)
					const unusedKeys = new Set()
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
									? `unused ${unusedKeys.size} keys: ${[...unusedKeys]
											.map(k => `"${k}"`)
											.join(' ')}`
									: ''
							}`
						)
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
