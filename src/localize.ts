import {makeKey} from './makeKey'
import {getLocale} from '@i18n/__state'
import type {Locale} from '.'
import {_runtime} from './runtime'

/**
 * Translate template string using in-memory maps.
 *
 * `localize‵Hi ${name}!‵` converts into a lookup of the `I18nKey` `"Hi $1"`. A
 * literal `$` will be converted to `$$`. Missing translations fall back to the
 * key.
 *
 * If the translation is a Plural object, the first parameter will be used to
 * pick the translation. If no translation is found, the fallback is the value
 * of the `*` key. Number translation values are used to redirect to another
 * translation with that number as a key.
 *
 * If you call this as a function, the call will not be inlined during build.
 * This allows you to dynamically change translations.
 *
 * Nesting is achieved by passing result strings into translations again.
 *
 * ```tsx
 * localize`There are ${localize`${boys} boys`} and ${localize`${girls} girls`}.`
 * ```
 */
export const localize = (strOrTemplate, ...params: unknown[]) => {
	const locale: Locale | undefined = getLocale()
	const key =
		typeof strOrTemplate === 'string' ? strOrTemplate : makeKey(strOrTemplate)
	return _runtime(locale, key, params)
}
/**
 * A shorthand for `localize‵‵`. Translate template string using in-memory maps.
 *
 * `_‵Hi ${name}!‵` converts into a lookup of the `I18nKey` `"Hi $1"`. A literal
 * `$` will be converted to `$$`. Missing translations fall back to the key.
 *
 * If the translation is a Plural object, the first parameter will be used to
 * pick the translation. If no translation is found, the fallback is the value
 * of the `*` key. Number translation values are used to redirect to another
 * translation with that number as a key.
 *
 * If you call this as a function, the call will not be inlined during build.
 * This allows you to dynamically change translations.
 *
 * Nesting is achieved by passing result strings into translations again.
 *
 * ```tsx
 * _`There are ${_`${boys} boys`} and ${_`${girls} girls`}.`
 * ```
 */
export const _ = localize
