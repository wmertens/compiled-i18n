import {describe, test, expect} from 'vitest'
import {
	makeTranslatedExpr,
	parseStringLiteral,
	replaceGlobals,
	transformLocalize,
} from './transform-localize'

describe('transform', () => {
	test('works', () => {
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

describe('parseStringLiteral', () => {
	test('double quotes', () =>
		expect(parseStringLiteral('"a key"')).toBe('a key'))
	test('single quotes', () =>
		expect(parseStringLiteral("'a key'")).toBe('a key'))
	test('backticks', () => expect(parseStringLiteral('`a key`')).toBe('a key'))
	test('surrounding whitespace', () =>
		expect(parseStringLiteral(' \n\t"a key" ')).toBe('a key'))
	test('escapes', () =>
		expect(parseStringLiteral('"a\\tb\\\\c\\"d\\u00e9e\\x41f"')).toBe(
			'a\tb\\c"d\u00e9eAf'
		))
	test('unicode code point escapes', () =>
		expect(parseStringLiteral('"\\u{1f600}"')).toBe('\u{1f600}'))
	test('quotes of other kinds are literal', () =>
		expect(parseStringLiteral('`a "b" \'c\'`')).toBe(`a "b" 'c'`))
	test('escaped quote of its own kind', () =>
		expect(parseStringLiteral('`a \\` b`')).toBe('a ` b'))
	test('escaped dollar-brace is literal', () =>
		expect(parseStringLiteral('`a \\${b}`')).toBe('a ${b}'))
	test('rejects a template with a substitution', () =>
		expect(() => parseStringLiteral('`a ${b}`')).throws(/static/))
	test('rejects a non-literal expression', () =>
		expect(() => parseStringLiteral('someVariable')).throws(/string literal/))
	test('rejects concatenation that merely looks like one literal', () =>
		expect(() => parseStringLiteral('"a" + "b"')).throws(/string literal/))
	test('rejects an unterminated literal', () =>
		expect(() => parseStringLiteral('"a')).throws(/string literal/))
	test('rejects malformed hex escapes rather than decoding them to NUL', () => {
		expect(() => parseStringLiteral('"\\xZZ"')).throws(/escape/)
		expect(() => parseStringLiteral('"\\x4"')).throws(/escape/)
		expect(() => parseStringLiteral('"\\u00e"')).throws(/escape/)
		expect(() => parseStringLiteral('"\\u{}"')).throws(/escape/)
		expect(() => parseStringLiteral('"\\u{1f600"')).throws(/escape/)
	})
	test('rejects legacy octal escapes rather than yielding the digit', () => {
		expect(() => parseStringLiteral('"\\101"')).throws(/octal/)
		expect(() => parseStringLiteral('"\\7"')).throws(/octal/)
		expect(() => parseStringLiteral('"\\01"')).throws(/octal/)
	})
	test('a lone \\0 is NUL, and \\8 \\9 are the digits', () => {
		expect(parseStringLiteral('"a\\0b"')).toBe('a\0b')
		expect(parseStringLiteral('"\\8\\9"')).toBe('89')
	})
})

test('replaceGlobals accepts every quote style a minifier may emit', () => {
	const translations = {
		en: {
			locale: 'en',
			translations: {greeting: 'Hello', 'with $1': 'Value $1'},
		},
	}
	// Rolldown's minifier (Oxc, used from Vite 6 on) rewrites every string
	// literal to a template literal, so the key arrives back-quoted rather than
	// double-quoted as the transform emitted it.
	expect(
		replaceGlobals({
			code: 'console.log(__$LOCALIZE$__(`greeting`),__$LOCALIZE$__(\'greeting\'),__$LOCALIZE$__("with $1",[x]),"__$LOCALE$__")',
			locale: 'en',
			translations,
		})
	).toBe('console.log(`Hello`,`Hello`,`Value ${x}`,"en")')
})
