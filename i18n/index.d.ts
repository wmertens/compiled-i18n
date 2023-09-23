declare module './__locales' {
	import type {Locale, Data} from '../src/index.js'

	declare const locales: Record<Locale, Data>
	export default locales
}
