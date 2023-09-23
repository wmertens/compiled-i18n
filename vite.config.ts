import {type LibraryFormats, defineConfig} from 'vite'
import {configDefaults} from 'vitest/config'
import pkg from './package.json'

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
				entry: ['./src'],
				formats: ['es', 'cjs'] as LibraryFormats[],
			},
			rollupOptions: {
				output: {
					preserveModules: true,
					preserveModulesRoot: 'src',
				},
				// externalize deps that shouldn't be bundled into the library
				external: [
					/^node:.*/,
					...excludeAll(dependencies),
					...excludeAll(peerDependencies),
				],
			},
		},
		test: {
			globals: true,
			testTimeout: 20_000,
			exclude: [...configDefaults.exclude, 'dist/**', 'dist-types/**'],
		},
	}
})
