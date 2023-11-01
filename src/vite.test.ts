import {test, expect} from 'vitest'
import {Rollup, build} from 'vite'
import {i18nPlugin} from './vite'
import path from 'path'

const root = path.resolve(import.meta.url.slice(5), '../fixture')

const doBuild = async ({
	entry,
	locales = ['te_ST'],
	mode = 'production',
}: {entry: string; mode?: string} & Parameters<typeof i18nPlugin>[0]) => {
	const result = (await build({
		root,
		plugins: [i18nPlugin({locales, localesDir: path.resolve(root, 'i18n')})],
		resolve: {
			alias: {
				'vite-plugin-static-i18n': path.resolve(root, '..'),
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
	const result = await doBuild({entry: 'index.ts'})

	const index = result.output.find(
		o => o.fileName === 'index.js'
	) as Rollup.OutputChunk
	expect(index).toBeTruthy()
	expect.soft(index.code).toMatchInlineSnapshot(`
		"const o=\\"world\\";console.log(__$LOCALIZE$__(\\"hello $1\\",o));
		"
	`)

	const testIndex = result.output.find(
		o => o.fileName === 'te_ST/index.js'
	) as Rollup.OutputAsset
	expect(testIndex).toBeTruthy()
	expect.soft(testIndex.source).toMatchInlineSnapshot(`
		"const o=\\"world\\";console.log(\`Hello \${o}!\`);
		"
	`)
})

test('plural', async () => {
	const result = await doBuild({entry: 'multi.ts'})

	const multi = result.output.find(
		o => o.fileName === 'multi.js'
	) as Rollup.OutputChunk
	expect(multi).toBeTruthy()
	expect.soft(multi.code).toMatchInlineSnapshot(`
		"const n=(e,$=[])=>{if(typeof e==\\"object\\"){let o=e[$[0]]??e[\\"*\\"];typeof o==\\"number\\"&&(o=e[o]),e=o}return e?e.replace(/\\\\$([\\\\d$])/g,(o,l)=>l===\\"$\\"?\\"$\\":String($[Number(l)-1]??\\"\\")):\\"\\"};console.log(__$LOCALIZE$__(\\"hello $1\\",n(__$LOCALIZE$__(\\"worlds $1\\"),1)));
		"
	`)

	const enMulti = result.output.find(
		o => o.fileName === 'te_ST/multi.js'
	) as Rollup.OutputAsset
	expect(enMulti).toBeTruthy()
	expect.soft(enMulti.source).toMatchInlineSnapshot(`
		"const n=(e,$=[])=>{if(typeof e==\\"object\\"){let o=e[$[0]]??e[\\"*\\"];typeof o==\\"number\\"&&(o=e[o]),e=o}return e?e.replace(/\\\\$([\\\\d$])/g,(o,l)=>l===\\"$\\"?\\"$\\":String($[Number(l)-1]??\\"\\")):\\"\\"};console.log(\`Hello \${n({\\"1\\":\\"world\\",\\"*\\":\\"worlds\\"},1)}!\`);
		"
	`)
})

test('noInline', async () => {
	const result = await doBuild({
		entry: 'index.ts',
		mode: 'development',
	})

	const index = result.output.find(
		o => o.fileName === 'index.js'
	) as Rollup.OutputChunk
	expect(index).toBeTruthy()
	expect(index.code).not.toContain(`__$LOCALIZE$__`)
	expect(index.code).toContain('Test :-)')
	expect(index.code).toContain('worlds $1')
	expect.soft(index.code).toMatchInlineSnapshot(`
		"let c=\\"te_ST\\",s=c,a=()=>s;const r=(e,l=[])=>{if(typeof e==\\"object\\"){let o=e[l[0]]??e[\\"*\\"];typeof o==\\"number\\"&&(o=e[o]),e=o}return e?e.replace(/\\\\$([\\\\d$])/g,(o,t)=>t===\\"$\\"?\\"$\\":String(l[Number(t)-1]??\\"\\")):\\"\\"},i=e=>e.map((l,o)=>\`\${o}\${l.replace(/\\\\$/g,()=>\\"$$\\")}\`).join(\\"$\\").slice(1),$=\\"te_ST\\",u=\\"Test :-)\\",d={\\"hello $1\\":\\"Hello $1!\\",\\"worlds $1\\":{1:\\"world\\",\\"*\\":\\"worlds\\"}},f={locale:$,name:u,translations:d},_=Object.freeze(Object.defineProperty({__proto__:null,te_ST:f},Symbol.toStringTag,{value:\\"Module\\"})),g=(e,l,o)=>{let t,n;do t=_[e],n=t.translations[l];while(!n&&(e=t.fallback));return n||(n=l),r(n,o)},b=(e,...l)=>{const o=a(),t=typeof e==\\"string\\"?e:i(e);return g(o,t,l)},p=b,y=\\"world\\";console.log(p\`hello \${y}\`);
		"
	`)

	const testIndex = result.output.find(
		o => o.fileName === 'te_ST/index.js'
	) as Rollup.OutputAsset
	expect(testIndex).toBeFalsy()
})

test('exports', async () => {
	const result = await doBuild({entry: 'exports.ts'})
	const index = result.output.find(
		o => o.fileName === 'exports.js'
	) as Rollup.OutputChunk
	expect(index).toBeTruthy()
	expect.soft(index.code).toMatchInlineSnapshot(`
		"const e={te_ST:\\"Test :-)\\"};let l=\\"te_ST\\",t=\\"__$LOCALE$__\\";console.log(l,t,e);
		"
	`)
	const testIndex = result.output.find(
		o => o.fileName === 'te_ST/exports.js'
	) as Rollup.OutputAsset
	expect(testIndex).toBeTruthy()
	expect.soft(testIndex.source).toMatchInlineSnapshot(`
		"const e={te_ST:\\"Test :-)\\"};let l=\\"te_ST\\",t=\\"te_ST\\";console.log(l,t,e);
		"
	`)
})
