import type {Key} from 'vite-plugin-i18n'

export const makeKey = (tpl: string[]): Key =>
	tpl
		// We need the function notation so the $$ are not further replaced
		.map((s, i) => `${i}${s.replace(/\$/g, () => '$$')}`)
		.join('$')
		.slice(1)
