import {test, expect} from 'vitest'
import {Rollup, build} from 'vite'
import {i18nPlugin} from './vite'
import path from 'path'

const root = path.resolve(import.meta.url.slice(5), '../fixture')

const doBuild = async ({
	entry,
	locales = ['te_ST'],
	mode = 'production',
	ssr = false,
}: {entry: string; mode?: string; ssr?: boolean} & Parameters<
	typeof i18nPlugin
>[0]) => {
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
			ssr,
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
		"const s={te_ST:\\"Test :-)\\"};let a=\\"te_ST\\",l,r=()=>{if(l)return l;if(typeof document<\\"u\\"){const e=document.documentElement.lang;e&&e in s&&(l=e)}return l||(l=a),l};const i=(e,t=[])=>{if(typeof e==\\"object\\"){let o=e[t[0]]??e[\\"*\\"];typeof o==\\"number\\"&&(o=e[o]),e=o}return e?e.replace(/\\\\$([\\\\d$])/g,(o,n)=>n===\\"$\\"?\\"$\\":String(t[Number(n)-1]??\\"\\")):\\"\\"},u=e=>e.map((t,o)=>\`\${o}\${t.replace(/\\\\$/g,()=>\\"$$\\")}\`).join(\\"$\\").slice(1),f=\\"te_ST\\",d=\\"Test :-)\\",$={\\"hello $1\\":\\"Hello $1!\\",\\"worlds $1\\":{1:\\"world\\",\\"*\\":\\"worlds\\"}},_={locale:f,name:d,translations:$},g=Object.freeze(Object.defineProperty({__proto__:null,te_ST:_},Symbol.toStringTag,{value:\\"Module\\"})),m=(e,t,o)=>{let n,c;do n=g[e],c=n.translations[t];while(!c&&(e=n.fallback));return c||(c=t),i(c,o)},b=(e,...t)=>{const o=r(),n=typeof e==\\"string\\"?e:u(e);return m(o,n,t)},p=b,y=\\"world\\";console.log(p\`hello \${y}\`);
		"
	`)

	const testIndex = result.output.find(
		o => o.fileName === 'te_ST/index.js'
	) as Rollup.OutputAsset
	expect(testIndex).toBeFalsy()
})

test('noInline SSR', async () => {
	const result = await doBuild({
		entry: 'index.ts',
		mode: 'development',
		ssr: true,
	})

	const index = result.output.find(
		o => o.fileName === 'index.js'
	) as Rollup.OutputChunk
	expect(index).toBeTruthy()
	expect(index.code).not.toContain(`__$LOCALIZE$__`)
	expect(index.code).toContain('Test :-)')
	expect(index.code).toContain('worlds $1')
	expect.soft(index.code).toMatchInlineSnapshot(`
		"const localeNames = { \\"te_ST\\": \\"Test :-)\\" };
		let defaultLocale = \\"te_ST\\";
		let currentLocale;
		let getLocale = () => {
		  if (currentLocale)
		    return currentLocale;
		  if (typeof document !== \\"undefined\\") {
		    const lang = document.documentElement.lang;
		    if (lang && lang in localeNames)
		      currentLocale = lang;
		  }
		  if (!currentLocale)
		    currentLocale = defaultLocale;
		  return currentLocale;
		};
		const interpolate = (tr, params = []) => {
		  if (typeof tr === \\"object\\") {
		    let resolved = tr[params[0]] ?? tr[\\"*\\"];
		    if (typeof resolved === \\"number\\")
		      resolved = tr[resolved];
		    tr = resolved;
		  }
		  return tr ? tr.replace(
		    /\\\\$([\\\\d$])/g,
		    (_2, i) => i === \\"$\\" ? \\"$\\" : String(params[Number(i) - 1] ?? \\"\\")
		  ) : \\"\\";
		};
		const makeKey = (tpl) => tpl.map((s, i) => \`\${i}\${s.replace(/\\\\$/g, () => \\"$$\\")}\`).join(\\"$\\").slice(1);
		const locale = \\"te_ST\\";
		const name = \\"Test :-)\\";
		const translations = {
		  \\"hello $1\\": \\"Hello $1!\\",
		  \\"worlds $1\\": {
		    \\"1\\": \\"world\\",
		    \\"*\\": \\"worlds\\"
		  }
		};
		const te_ST = {
		  locale,
		  name,
		  translations
		};
		const store = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
		  __proto__: null,
		  te_ST
		}, Symbol.toStringTag, { value: \\"Module\\" }));
		const _runtime = (locale2, key, params) => {
		  let s, tr;
		  do {
		    s = store[locale2];
		    tr = s.translations[key];
		  } while (!tr && (locale2 = s.fallback));
		  if (!tr)
		    tr = key;
		  return interpolate(tr, params);
		};
		const localize = (strOrTemplate, ...params) => {
		  const locale2 = getLocale();
		  const key = typeof strOrTemplate === \\"string\\" ? strOrTemplate : makeKey(strOrTemplate);
		  return _runtime(locale2, key, params);
		};
		const _ = localize;
		const n = \\"world\\";
		console.log(_\`hello \${n}\`);
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

test('store', async () => {
	const result = await doBuild({entry: 'store.ts'})
	const testIndex = result.output.find(
		o => o.fileName === 'te_ST/store.js'
	) as Rollup.OutputAsset
	expect(testIndex).toBeTruthy()
	expect.soft(testIndex.source).toMatchInlineSnapshot(`
		"const l={translations:{}},o=Object.freeze(Object.defineProperty({__proto__:null,te_ST:l},Symbol.toStringTag,{value:\\"Module\\"}));let e=\\"te_ST\\";const r=(n,t=e)=>{if(!o[t])throw new Error(\`loadTranslations: Invalid locale \${t}\`);Object.assign(o[e].translations,n)};r({hi:\\"hello\\"},\\"te_ST\\");
		"
	`)
})
