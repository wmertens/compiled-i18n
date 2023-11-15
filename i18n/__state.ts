import type {Locale} from 'compiled-i18n'
import {localeNames} from './__data'

/** The default locale as set in `vite.config.ts`. */
export let defaultLocale: Locale = 'en'

/**
 * The current locale. You may change this if you don't process multiple locales
 * concurrently in your server code.
 */
export let currentLocale: Locale = defaultLocale

if (!import.meta.env.SSR && typeof globalThis.document !== 'undefined') {
	const lang = globalThis.document.documentElement.lang as Locale
	if (lang && lang in localeNames) {
		currentLocale = lang as Locale
	}
}

const _checkLocale = (l: Locale) => {
	if (!localeNames[l]) throw new TypeError(`unknown locale ${l}`)
}

/**
 * Change the default locale. Use this in dev mode on the client if you can't
 * set the html lang attribute. In production builds this does nothing.
 */
export const setDefaultLocale = (locale: Locale) => {
	_checkLocale(locale)
	defaultLocale = locale
}
/**
 * The current locale getter. Change this via `setLocaleGetter`.
 *
 * This is not available in client code.
 */
export let getLocale = () => currentLocale
/**
 * Set the locale getter. It will be called for every translation during SSR. If
 * it doesn't return a locale, the default locale will be used
 *
 * This is not available in client code.
 */
export const setLocaleGetter = (fn: () => Locale | undefined) => {
	getLocale = () => {
		const l = fn() || defaultLocale
		_checkLocale(l)
		currentLocale = l
		return l
	}
}
