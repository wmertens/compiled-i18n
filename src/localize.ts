import {makeKey} from './makeKey'
import {getLocale} from '@i18n/__state'
import type {Locale} from '.'
import {_runtime} from './runtime'

/**
 * Translate template string using in-memory maps.
 *
 * `localize`Hi ${name}!` ` converts into a lookup of the I18nKey `"Hi $1"`. A
 * literal `$` will be converted to `$$`. Missing translations fall back to the
 * key.
 *
 * If you call this function with a string, it will be used as a key directly,
 * and the call will not be inlined during build. In this form it supports
 * plurals as well.
 *
 * Nesting is achieved by passing result strings into translations again.
 *
 * ```tsx
 * localize`There are ${plural`${boys} boys`} and ${plural`${girls} girls`}.`
 * ```
 */
export const localize = (strOrTemplate, ...params: unknown[]) => {
	const locale: Locale | undefined = getLocale()
	const key =
		typeof strOrTemplate === 'string' ? strOrTemplate : makeKey(strOrTemplate)
	return _runtime(locale, key, params)
}
/**
 * A shorthand for `localize()`. Translate template string using in-memory maps.
 *
 * `_`Hi ${name}!` ` converts into a lookup of the I18nKey `"Hi $1"`. A literal
 * `$` will be converted to `$$`. Missing translations fall back to the key.
 *
 * If you call this function with a string, it will be used as a key directly,
 * and the call will not be inlined during build. In this form it supports
 * plurals as well.
 *
 * Nesting is achieved by passing result strings into translations again.
 *
 * ```tsx
 * _`There are ${plural`${boys} boys`} and ${plural`${girls} girls`}.`
 * ```
 */
export const _ = localize

/**
 * Translate template string using in-memory maps but vary based on the first
 * interpolation. Translation is of the form
 *
 * ```json
 * {
 * 	"0": "There are none",
 * 	"1": "There are some",
 * 	"2": 1,
 * 	"3": 1,
 * 	"*": "There are many"
 * }
 * ```
 *
 * Any other value falls back to the `*` replacement.
 *
 * For runtime translations, use the `localize` function instead.
 */
export const plural = localize
