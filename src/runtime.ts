import {interpolate} from './interpolate'
import * as store from '@i18n/__locales'
import type {Data, Key, Locale, Plural, Translation} from '.'

// const c = (...args) => console.log('i18n runtime', ...args) || args[0]

/**
 * Used at runtime for non-templated strings or during development
 *
 * @private
 */
export const _runtime = (locale: Locale, key: Key, params: unknown[]) => {
	let s: Data, tr: Translation | Plural

	// Find a translation
	do {
		s = store[locale]
		tr = s.translations[key]
	} while (!tr && (locale = s.fallback as Locale))
	if (!tr) tr = key as Translation

	return interpolate(tr, params)
}
