declare module 'vite-plugin-i18n'

export type Locale = string & {T?: 'Locale'}
export type Key = string & {T?: 'Key'}
/**
 * A string matching `RegExp('^([^$]|\$[1-9$])*)*$')`, in other words, `$` is
 * used to refer to parameters (max 9) or is escaped as `$$`
 */
export type Translation = string & {T?: 'Translation'}
/**
 * The value of the param used to pick the plural. Use '*' for the fallback
 * value
 */
export type Ordinal = string & {T?: 'Ordinal'}
type PluralTag = number | Ordinal
/**
 * When the value is a number, it means to take the value of the tag with that
 * number.
 *
 * Note that inlined Plural translations only work when used with the `plural`
 * function. Runtime translations will work with both `plural` and `_`.
 */
export type Plural = {
	'*': Translation | number
	[tag: PluralTag]: Translation | number
}
/** The locale JSON file format */
export type Data = {
	locale: Locale // the locale key, e.g. en_us or en
	fallback?: Locale // try this locale for missing keys
	name?: string // the name of the locale in the locale, e.g. "Nederlands"
	translations: {
		[key: Key]: Translation | Plural
	}
}
