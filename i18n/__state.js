import {localeNames} from './__data'

/** @typedef {import('../src/index.ts').Locale} Locale */
/** @type {Locale} */
export let defaultLocale = 'en'

/** @type {Locale} */
export let currentLocale = defaultLocale

const _checkLocale = l => {
	if (!localeNames[l]) throw new TypeError(`unknown locale ${l}`)
}
/** @type {(locale: Locale) => void} */
export const setDefaultLocale = l => {
	_checkLocale(l)
	defaultLocale = l
}
export let getLocale = () => defaultLocale
/** @type {(fn: () => Locale | undefined) => void} */
export const setLocaleGetter = fn => {
	getLocale = () => {
		const l = fn() || defaultLocale
		_checkLocale(l)
		currentLocale = l
		return l
	}
}
