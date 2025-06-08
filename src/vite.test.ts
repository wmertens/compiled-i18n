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
				'compiled-i18n': path.resolve(root, '..'),
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
		"const o="world";console.log(__$LOCALIZE$__("hello $1",[o]));
		"
	`)

	const testIndex = result.output.find(
		o => o.fileName === 'te_ST/index.js'
	) as Rollup.OutputAsset
	expect(testIndex).toBeTruthy()
	expect.soft(testIndex.source).toMatchInlineSnapshot(`
		"const o="world";console.log(\`Hello \${o}!\`);
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
		"const $=(e,n=[])=>{for(let l=0;typeof e=="object";l++){let o=e[n[l]]??e["*"];typeof o=="number"&&(o=e[o]),e=o}return typeof e=="string"?e.replace(/\\$([\\d$])/g,(l,o)=>o==="$"?"$":String(n[Number(o)-1]??"")):""};console.log(__$LOCALIZE$__("hello $1",[$(__$LOCALIZE$__("worlds $1"),[1])]));
		"
	`)

	const enMulti = result.output.find(
		o => o.fileName === 'te_ST/multi.js'
	) as Rollup.OutputAsset
	expect(enMulti).toBeTruthy()
	expect.soft(enMulti.source).toMatchInlineSnapshot(`
		"const $=(e,n=[])=>{for(let l=0;typeof e=="object";l++){let o=e[n[l]]??e["*"];typeof o=="number"&&(o=e[o]),e=o}return typeof e=="string"?e.replace(/\\$([\\d$])/g,(l,o)=>o==="$"?"$":String(n[Number(o)-1]??"")):""};console.log(\`Hello \${$({"1":"world","*":"worlds"},[1])}!\`);
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
		"const s={te_ST:"Test :-)"};let r="te_ST",l,a=()=>{if(l)return l;if(typeof document<"u"){const e=document.documentElement.lang;e&&e in s&&(l=e)}return l||(l=r),l};const i=(e,t=[])=>{for(let n=0;typeof e=="object";n++){let o=e[t[n]]??e["*"];typeof o=="number"&&(o=e[o]),e=o}return typeof e=="string"?e.replace(/\\$([\\d$])/g,(n,o)=>o==="$"?"$":String(t[Number(o)-1]??"")):""},f=e=>e.map((t,n)=>\`\${n}\${t.replace(/\\$/g,()=>"$$")}\`).join("$").slice(1),u="te_ST",$="Test :-)",d={"hello $1":"Hello $1!","worlds $1":{1:"world","*":"worlds"}},g={locale:u,name:$,translations:d},m={te_ST:g},_=(e,t,n)=>{let o,c;do o=m[e],c=o.translations[t];while(!c&&(e=o.fallback));return c||(c=t),i(c,n)},p=(e,...t)=>{const n=a(),o=typeof e=="string"?e:f(e);return _(n,o,t)},y=p,w="world";console.log(y\`hello \${w}\`);
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
		"const localeNames = { "te_ST": "Test :-)" };
		let defaultLocale = "te_ST";
		let currentLocale;
		let getLocale = () => {
		  if (currentLocale) return currentLocale;
		  if (typeof document !== "undefined") {
		    const lang = document.documentElement.lang;
		    if (lang && lang in localeNames) currentLocale = lang;
		  }
		  if (!currentLocale) currentLocale = defaultLocale;
		  return currentLocale;
		};
		const interpolate = (tr, params = []) => {
		  for (let param = 0; typeof tr === "object"; param++) {
		    let resolved = tr[params[param]] ?? tr["*"];
		    if (typeof resolved === "number") resolved = tr[resolved];
		    tr = resolved;
		  }
		  return typeof tr === "string" ? tr.replace(
		    /\\$([\\d$])/g,
		    (_2, i) => i === "$" ? "$" : String(params[Number(i) - 1] ?? "")
		  ) : "";
		};
		const makeKey = (tpl) => tpl.map((s, i) => \`\${i}\${s.replace(/\\$/g, () => "$$")}\`).join("$").slice(1);
		const locale = "te_ST";
		const name = "Test :-)";
		const translations = { "hello $1": "Hello $1!", "worlds $1": { "1": "world", "*": "worlds" } };
		const _0 = {
		  locale,
		  name,
		  translations
		};
		const store = {
		  "te_ST": _0
		};
		const _runtime = (locale2, key, params) => {
		  let s, tr;
		  do {
		    s = store[locale2];
		    tr = s.translations[key];
		  } while (!tr && (locale2 = s.fallback));
		  if (!tr) tr = key;
		  return interpolate(tr, params);
		};
		const localize = (strOrTemplate, ...params) => {
		  const locale2 = getLocale();
		  const key = typeof strOrTemplate === "string" ? strOrTemplate : makeKey(strOrTemplate);
		  return _runtime(locale2, key, params);
		};
		const _ = localize;
		const n = "world";
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
		"const e={te_ST:"Test :-)"};let l="te_ST",t="__$LOCALE$__";console.log(l,t,e);
		"
	`)
	const testIndex = result.output.find(
		o => o.fileName === 'te_ST/exports.js'
	) as Rollup.OutputAsset
	expect(testIndex).toBeTruthy()
	expect.soft(testIndex.source).toMatchInlineSnapshot(`
		"const e={te_ST:"Test :-)"};let l="te_ST",t="te_ST";console.log(l,t,e);
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
		"const t={te_ST:{translations:{}}};let a="te_ST";const s=(o,n=a)=>{if(!t[n])throw new Error(\`loadTranslations: Invalid locale \${n}\`);Object.assign(t[a].translations,o)};s({hi:"hello"},"te_ST");
		"
	`)
})
