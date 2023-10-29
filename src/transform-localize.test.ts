import {describe, test, expect} from 'vitest'
import {
	makeTransExpr,
	replaceGlobals,
	transformLocalize,
} from './transform-localize'

test('transform', () => {
	expect(
		transformLocalize({
			code: `
				import {_, localize as meep} from 'vite-plugin-i18n'
				const Foo = component$<{t: number}>((p) =>
					<div title={meep\`plural \${t}\`}>{_\`Hello \${t} lol \${t+1}\`}</div>
				)
			`,
			pluralKeys: new Set(['plural $1']),
		})
	).toMatchInlineSnapshot(`
		"
		import { _, localize as meep, interpolate as __interpolate__ } from 'vite-plugin-i18n';
		const Foo = component$<{t: number;}>((p) =>
		<div title={__interpolate__(__$LOCALIZE$__(\\"plural $1\\"), t)}>{__$LOCALIZE$__(\\"Hello $1 lol $2\\", t, t + 1)}</div>
		);"
	`)
})

describe('makeTransExpr', () => {
	test('plural', () =>
		expect(makeTransExpr({0: 'foo', '*': 'bar $1'}, [])).toBe(
			`{"0":"foo","*":"bar $1"}`
		))

	test('exprs', () =>
		expect(makeTransExpr('foo $2 b$$r $1', ['"a"', 'b'])).toBe(
			`\`foo \${b} b$r \${"a"}\``
		))
	test('no params', () =>
		expect(makeTransExpr('foo $1 b$$r $2', [])).toBe('`foo $1 b$$r $2`'))
	test('backticks', () =>
		expect(makeTransExpr('``` hello``', ['0'])).toBe('`\\`\\`\\` hello\\`\\``'))
})

test('replaceGlobals', () => {
	expect(
		replaceGlobals({
			code: `
	console.log(__$LOCALIZE$__("a key$$ $1 $2: $3-$4$5", 'string argument', someVariable, "string with a , comma", (1 + 2 * 3 / 4), __$LOCALIZE$__("hello")), __$LOCALIZE$__("noTranslation"), "__$LOCALE$__");
	`,
			locale: 'en',
			translations: {
				en: {
					locale: 'en',
					fallback: 'fr',
					translations: {
						'a key$$ $1 $2: $3-$4$5': 'A k$0e$9y!! $a $$ $2 $1: $3-$4-$5',
					},
				},
				fr: {
					locale: 'fr',
					translations: {hello: 'bonjour'},
				},
			},
		})
	).toBe(
		'\n\tconsole.log(`A key!! $a $ ${someVariable} ${\'string argument\'}: ${"string with a , comma"}-${(1 + 2 * 3 / 4)}-${`bonjour`}`, `noTranslation`, "en");\n\t'
	)
})
