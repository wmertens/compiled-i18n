import {type LibraryFormats, defineConfig} from 'vite'
import {configDefaults} from 'vitest/config'
import pkg from './package.json'
import dts from 'vite-plugin-dts'

const {dependencies = {}, peerDependencies = {}} = pkg as any
const makeRegex = (dep: string) => new RegExp(`^${dep}(/.*)?$`)
const excludeAll = (obj: {[pkg: string]: string}) =>
	Object.keys(obj).map(dep => makeRegex(dep))

export default defineConfig(() => {
	return {
		build: {
			// keep debugging readable
			minify: false,
			target: 'es2020',
			lib: {
				entry: ['./src', './src/vite.ts'],
				formats: ['es', 'cjs'] as LibraryFormats[],
				fileName: (format, entryName) =>
					`${entryName}.${format === 'es' ? 'mjs' : 'cjs'}`,
			},
			rollupOptions: {
				output: {
					preserveModules: true,
				},
				// externalize deps that shouldn't be bundled into the library
				external: [
					/^node:.*/,
					...excludeAll(dependencies),
					...excludeAll(peerDependencies),
				],
			},
		},
		plugins: [
			dts({
				exclude: ['**/fixture/**/*', '/**/*.test.*'],
			}),
		],
		test: {
			globals: true,
			testTimeout: 20_000,
			exclude: [...configDefaults.exclude, 'dist/**'],
		},
	}
})
