import {test, expect} from 'vitest'
import {Rollup, build} from 'vite'
import {i18nPlugin} from './vite'
import path from 'path'

const doBuild = async ({
	root,
	entry,
	locales,
}: {root: string; entry: string} & Parameters<typeof i18nPlugin>[0]) => {
	const result = (await build({
		root,
		plugins: [i18nPlugin({locales, localesDir: path.resolve(root, 'i18n')})],
		resolve: {
			alias: {
				'vite-plugin-i18n': path.resolve(root, '..'),
			},
		},
		build: {
			// minify: false,
			rollupOptions: {
				input: path.resolve(root, entry),
				output: {
					entryFileNames: '[name].js',
				},
			},
			// in-memory build
			write: false,
		},
	})) as Rollup.RollupOutput

	return result
}

test('build', async () => {
	const root = path.resolve(import.meta.url.slice(5), '../fixture')

	const result = await doBuild({root, entry: 'index.ts'})

	const index = result.output.find(
		o => o.fileName === 'index.js'
	) as Rollup.OutputChunk
	expect(index).toBeTruthy()
	expect(index.code).toMatchInlineSnapshot(`
		"const o=\\"world\\";console.log(__$LOCALIZE$__(\\"hello $1\\",o));
		"
	`)

	const enIndex = result.output.find(
		o => o.fileName === 'en/index.js'
	) as Rollup.OutputAsset
	expect(enIndex).toBeTruthy()
	expect(enIndex.source).toMatchInlineSnapshot(`
		"const o=\\"world\\";console.log(\`Hello \${o}!\`);
		"
	`)
})

test('plural', async () => {
	const root = path.resolve(import.meta.url.slice(5), '../fixture')

	const result = await doBuild({root, entry: 'multi.ts'})

	const multi = result.output.find(
		o => o.fileName === 'multi.js'
	) as Rollup.OutputChunk
	expect(multi).toBeTruthy()
	expect(multi.code).toMatchInlineSnapshot(`
		"const n=(e,$=[])=>{if(typeof e==\\"object\\"){let o=e[$[0]]??e[\\"*\\"];typeof o==\\"number\\"&&(o=e[o]),e=o}return e?e.replace(/\\\\$([\\\\d$])/g,(o,l)=>l===\\"$\\"?\\"$\\":String($[Number(l)-1]??\\"\\")):\\"\\"};console.log(__$LOCALIZE$__(\\"hello $1\\",n(__$LOCALIZE$__(\\"worlds $1\\"),1)));
		"
	`)

	const enMulti = result.output.find(
		o => o.fileName === 'en/multi.js'
	) as Rollup.OutputAsset
	expect(enMulti).toBeTruthy()
	expect(enMulti.source).toMatchInlineSnapshot(`
		"const n=(e,$=[])=>{if(typeof e==\\"object\\"){let o=e[$[0]]??e[\\"*\\"];typeof o==\\"number\\"&&(o=e[o]),e=o}return e?e.replace(/\\\\$([\\\\d$])/g,(o,l)=>l===\\"$\\"?\\"$\\":String($[Number(l)-1]??\\"\\")):\\"\\"};console.log(\`Hello \${n({\\"1\\":\\"world\\",\\"*\\":\\"worlds\\"},1)}!\`);
		"
	`)
})
