import {describe, test, expect} from 'vitest'
import {
	makeTranslatedExpr,
	replaceGlobals,
	transformLocalize,
} from './transform-localize'

describe('transform', () => {
	test.only('works', () => {
		const result = transformLocalize({
			code: `
			import {_, localize as meep} from 'compiled-i18n'
			const Foo = component$<{t: number}>((p) =>
				<div title={meep\`plural \${t}\`}>{_\`Hello \${t} lol \${t+1}\`}</div>
			)
		`,
			pluralKeys: new Set(['plural $1']),
		})

		expect(result).toMatchInlineSnapshot(`
			"
			import { _, localize as meep, interpolate as __interpolate__ } from 'compiled-i18n';
			const Foo = component$<{t: number;}>((p) =>
			<div title={__interpolate__(__$LOCALIZE$__("plural $1"), [t])}>{__$LOCALIZE$__("Hello $1 lol $2", [t, t + 1])}</div>
			);"
		`)

		// only run once
		expect(transformLocalize({code: result!})).toBe(null)
	})
	test('disallows newlines', () => {
		expect(() =>
			transformLocalize({
				code: `
				import {_} from 'compiled-i18n'
				_\`new
				line\`
			`,
				pluralKeys: new Set(),
			})
		).throws()
	})
})
describe('makeTransExpr', () => {
	test('plural', () =>
		expect(makeTranslatedExpr({0: 'foo', '*': 'bar $1'}, [])).toBe(
			`{"0":"foo","*":"bar $1"}`
		))

	test('exprs', () =>
		expect(makeTranslatedExpr('foo $2 b$$r $1', ['"a"', 'b'])).toBe(
			`\`foo \${b} b$r \${"a"}\``
		))
	test('no params', () =>
		expect(makeTranslatedExpr('foo $1 b$$r $2', [])).toBe('`foo $1 b$$r $2`'))
	test('backticks', () =>
		expect(makeTranslatedExpr('``` hello``', ['0'])).toBe(
			'`\\`\\`\\` hello\\`\\``'
		))
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
