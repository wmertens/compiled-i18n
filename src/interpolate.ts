import type {Plural, Translation} from 'compiled-i18n'

/**
 * Interpolates a translation with the given parameters. Use this to interpolate
 * at runtime. You will need to provide the translation yourself.
 */
export const interpolate = (tr: string | Plural, params: unknown[] = []) => {
	// Resolve a plural
	if (typeof tr === 'object') {
		let resolved = tr[params[0] as string] ?? tr['*']
		// A number redirects to another translation with that number as a key
		if (typeof resolved === 'number') resolved = tr[resolved] as Translation
		tr = resolved
	}

	return tr
		? (tr as string).replace(/\$([\d$])/g, (_, i) =>
				i === '$' ? '$' : String(params[Number(i) - 1] ?? '')
			)
		: ''
}
