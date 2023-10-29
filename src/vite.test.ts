import {test, expect} from 'vitest'
import {Rollup, build} from 'vite'
import {i18nPlugin} from './vite'
import path from 'path'

const doBuild = async ({
	root,
	entry,
	locales,
	mode = 'production',
}: {root: string; entry: string; mode?: string} & Parameters<
	typeof i18nPlugin
>[0]) => {
	const result = (await build({
		root,
		plugins: [i18nPlugin({locales, localesDir: path.resolve(root, 'i18n')})],
		resolve: {
			alias: {
				'vite-plugin-i18n': path.resolve(root, '..'),
			},
		},
		mode,
		build: {
			ssr: false,
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

test('noInline', async () => {
	const root = path.resolve(import.meta.url.slice(5), '../fixture')

	const result = await doBuild({
		root,
		entry: 'index.ts',
		mode: 'development',
	})

	const index = result.output.find(
		o => o.fileName === 'index.js'
	) as Rollup.OutputChunk
	expect(index).toBeTruthy()
	expect(index.code).not.toContain(`__$LOCALIZE$__`)
	expect(index.code).toContain('English :-)')
	expect(index.code).toContain('worlds $1')
	expect(index.code).toMatchInlineSnapshot(`
		"let c=\\"en\\",s=()=>c;const a=(e,l=[])=>{if(typeof e==\\"object\\"){let o=e[l[0]]??e[\\"*\\"];typeof o==\\"number\\"&&(o=e[o]),e=o}return e?e.replace(/\\\\$([\\\\d$])/g,(o,n)=>n===\\"$\\"?\\"$\\":String(l[Number(n)-1]??\\"\\")):\\"\\"},r=e=>e.map((l,o)=>\`\${o}\${l.replace(/\\\\$/g,()=>\\"$$\\")}\`).join(\\"$\\").slice(1),i=\\"en\\",$=\\"English :-)\\",d={\\"hello $1\\":\\"Hello $1!\\",\\"worlds $1\\":{1:\\"world\\",\\"*\\":\\"worlds\\"}},f={locale:i,name:$,translations:d},u=Object.freeze(Object.defineProperty({__proto__:null,en:f},Symbol.toStringTag,{value:\\"Module\\"})),g=(e,l,o)=>{let n,t;do n=u[e],t=n.translations[l];while(!t&&(e=n.fallback));return t||(t=l),a(t,o)},b=(e,...l)=>{const o=s(),n=typeof e==\\"string\\"?e:r(e);return g(o,n,l)},_=b,p=\\"world\\";console.log(_\`hello \${p}\`);
		"
	`)

	const enIndex = result.output.find(
		o => o.fileName === 'en/index.js'
	) as Rollup.OutputAsset
	expect(enIndex).toBeFalsy()
})
