import type {Data} from 'compiled-i18n'
import * as store from '@i18n/__locales'
import {currentLocale} from '@i18n/__state'

export const loadTranslations = (
	translations: Data['translations'],
	locale = currentLocale
) => {
	if (!store[locale])
		throw new Error(`loadTranslations: Invalid locale ${locale}`)
	Object.assign(store[currentLocale].translations, translations)
}
