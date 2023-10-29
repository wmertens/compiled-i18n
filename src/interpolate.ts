import type {Plural, Translation} from 'vite-plugin-static-i18n'

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
