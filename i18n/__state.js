import {localeNames} from './__data'

/** @typedef {import('vite-plugin-i18n').Locale} Locale */
/** @type {Locale} */
export let defaultLocale = 'en'
/** @type {(locale: Locale) => void} */
export const setDefaultLocale = l => {
	if (!localeNames[l]) throw new TypeError(`unknown locale ${l}`)
	defaultLocale = l
}
export let getLocale = () => defaultLocale
/** @type {(fn: () => Locale) => void} */
export const setLocaleGetter = fn => {
	getLocale = fn
}
