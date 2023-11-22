import {getLocale, type RenderOptions} from '@builder.io/qwik'
import {defaultLocale, setLocaleGetter} from '@i18n/__state'

/**
 * This sets the base path for assets for a Qwik application. Pass it to the
 * `base` property of the render options.
 *
 * If running in development mode, the base path is simply /build. Otherwise,
 * it's /build/{locale}. We also account for the base path given to vite.
 */
export const extractBase = ({serverData}: RenderOptions): string => {
	const basePath = `${import.meta.env.BASE_URL}build${
		import.meta.env.DEV ? '' : `/${serverData!.locale}`
	}`
	return basePath
}

/**
 * Configure compiled-i18n to use the locale from Qwik during SSR.
 *
 * Call this in your entry.ssr file.
 */
export const setSsrLocaleGetter = () => {
	setLocaleGetter(() => getLocale(defaultLocale))
}
