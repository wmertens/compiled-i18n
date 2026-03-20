import {interpolate} from './interpolate'
import store from '@i18n/__locales'
// @ts-ignore — keyIndex and fallbacks only exist in split mode
import {keyIndex, fallbacks} from '@i18n/__data'
import type {Data, Key, Locale, Plural, Translation} from '.'

// const c = (...args) => console.log('i18n runtime', ...args) || args[0]

/**
 * Used at runtime for non-templated strings or during development
 *
 * @private
 */
export const _runtime = (locale: Locale, key: Key, params: unknown[]) => {
	let tr: Translation | Plural

	if (keyIndex) {
		// Split mode: array-based lookup with separate fallback map
		const idx = keyIndex[key]
		do {
			tr = store[locale]?.[idx]
		} while (!tr && (locale = fallbacks[locale]))
	} else {
		// Dev/SSR/inline mode: key-value lookup
		let s: Data
		do {
			s = store[locale]
			tr = s.translations[key]
		} while (!tr && (locale = s.fallback as Locale))
	}
	if (!tr) tr = key as Translation

	return interpolate(tr, params)
}
