import type {Locale} from '.'
import {localeNames} from '@i18n/__data'
import {defaultLocale} from '@i18n/__state'

/**
 * Guess the locale from the Accept-Language header. This can also be used for
 * other strings, but you need to ensure that the string is a valid locale.
 */
export const guessLocale = (
	acceptsLanguage: string | null | undefined
): Locale => {
	if (!acceptsLanguage) return defaultLocale
	const locales = acceptsLanguage.split(',').map(l => l.split(';')[0])
	const locale = locales.find(l => l in localeNames)
	return locale || defaultLocale
}
