import {
	type Node,
	type PluginItem,
	type PluginObj,
	types,
	transformSync,
} from '@babel/core'
import {makeKey} from './makeKey'
import {Data, Key, Locale} from 'compiled-i18n'
import {createRequire} from 'node:module'

const require = createRequire(import.meta.url)
const tsPluginPath = require.resolve('@babel/plugin-syntax-typescript')

const makePlugin = ({
	allKeys,
	pluralKeys,
}: {
	allKeys?: Set<string>
	pluralKeys?: Set<string>
}) => {
	const localizeNames = new Set<string>()
	let didAddImport = false
	let importNode: types.ImportDeclaration | null = null
	const plugin: PluginObj = {
		visitor: {
			ImportDeclaration(path) {
				const source = path.node.source.value
				const specifiers = path.node.specifiers
				if (source !== 'compiled-i18n') return
				for (const specifier of [...specifiers]) {
					// If importing named exports from 'compiled-i18n', store them.
					if (
						'imported' in specifier &&
						'name' in specifier.imported &&
						(specifier.imported.name === '_' ||
							specifier.imported.name === 'localize')
					) {
						localizeNames.add(specifier.local.name)
					}
				}
				importNode = path.node
			},
			TaggedTemplateExpression(path) {
				if ('name' in path.node.tag && localizeNames.has(path.node.tag.name)) {
					const {quasi} = path.node
					const strings = quasi.quasis.map(element => element.value.cooked!)

					const key = makeKey(strings)
					if (/[\r\n]/.test(key)) {
						throw new Error(
							`Keys cannot contain newlines. Please change this to a short, descriptive key and use translations instead: "${JSON.stringify(
								strings
							)}`
						)
					}
					allKeys?.add(key)
					const keyExpr: types.StringLiteral = {
						type: 'StringLiteral',
						value: key,
					}
					const args = quasi.expressions.map(arg => {
						// If it's a string, we make it a StringLiteral, else we leave it as is (probably a JavaScript expression)
						if (typeof arg === 'string') {
							return {
								type: 'StringLiteral',
								value: arg,
							} as types.StringLiteral
						}
						return arg
					})

					// Temporarily replace the tagged template with a function call.
					// Afterwards we'll convert it back to a translated tagged template.
					if (pluralKeys?.has(key)) {
						// This translation might have a plural, so we need to interpolate at runtime
						// Make sure we import the interpolate function
						if (!didAddImport) {
							importNode!.specifiers.push({
								type: 'ImportSpecifier',
								imported: {type: 'Identifier', name: 'interpolate'},
								local: {type: 'Identifier', name: '__interpolate__'},
							})
							// Only once per file
							didAddImport = true
						}
						path.replaceWith({
							type: 'CallExpression',
							callee: {
								type: 'Identifier',
								name: '__interpolate__',
							},
							arguments: [
								// We ask for the translation without parameters, which will keep it as-is
								// That way parameter markers are retained
								{
									type: 'CallExpression',
									callee: {type: 'Identifier', name: '__$LOCALIZE$__'},
									arguments: [keyExpr],
								} as types.CallExpression,
								// an array of the arguments
								{
									type: 'ArrayExpression',
									elements: args,
								} as types.ArrayExpression,
							],
						} as types.CallExpression)
					} else {
						path.replaceWith({
							type: 'CallExpression',
							callee: {
								type: 'Identifier',
								name: '__$LOCALIZE$__',
							},
							arguments: [
								keyExpr,
								{
									type: 'ArrayExpression',
									elements: args,
								} as types.ArrayExpression,
							],
						} as Node)
					}
				}
			},
		},
	}
	return plugin
}

export const transformLocalize = ({
	id,
	code,
	babelPlugins = [],
	allKeys,
	pluralKeys,
}: {
	id?: string
	code: string
	babelPlugins?: PluginItem[]
	allKeys?: Set<string>
	pluralKeys?: Set<string>
}) => {
	const begin = code.slice(0, 5000)
	if (!begin.includes('compiled-i18n') || begin.includes('__interpolate__'))
		return null

	const result = transformSync(code, {
		filename: id,
		// Ignore any existing babel configuration files
		configFile: false,
		plugins: [
			makePlugin({allKeys, pluralKeys}),
			[tsPluginPath, {isTSX: true}],
			...babelPlugins,
		],
		retainLines: true,
		// Babel isn't quite ESTree compatible, don't keep it
		// ast: true,
	})!
	// console.log(id, result.code)
	return result.code!
}

const getTr = (
	key: Key,
	locale: Locale,
	translations: Record<Locale, Data>
) => {
	while (locale) {
		const tr = translations[locale].translations[key]
		if (tr) return tr
		locale = translations[locale].fallback!
	}
	return key
}

/**
 * Convert translation + params back into template string
 *
 * @private
 */
export const makeTranslatedExpr = (tr: unknown, paramExprs: string[]) => {
	// This is a plural object and will not have parameters
	if (typeof tr !== 'string') return JSON.stringify(tr)
	const escaped = tr.replace(/`/g, '\\`')
	// If we don't have parameters, that either means the key has no parameter markers,
	// or we want the translation unchanged inside an interpolation call
	return paramExprs.length === 0
		? `\`${escaped}\``
		: `\`${escaped.replace(/\$(\d|\$)/g, (_, i) => {
				if (i === '$') return '$'
				const p = paramExprs[parseInt(i) - 1]
				// Translator error
				if (p == null) return ''
				return `\${${p}}`
			})}\``
}

const singleCharEscapes: Record<string, string> = {
	b: '\b',
	f: '\f',
	n: '\n',
	r: '\r',
	t: '\t',
	v: '\v',
	'0': '\0',
}

const parseHexDigits = (digits: string, expr: string, exactLength?: number) => {
	if (
		!digits ||
		(exactLength !== undefined && digits.length !== exactLength) ||
		!/^[\da-fA-F]+$/.test(digits)
	)
		throw new Error(`Invalid escape sequence in ${expr}`)
	return parseInt(digits, 16)
}

/**
 * Parse a JavaScript string literal into the string it denotes. Accepts all
 * three quote styles — double quotes, single quotes and backticks — and rejects
 * anything that is not exactly one literal.
 *
 * The transform emits the localize key as a double-quoted string, but
 * `replaceGlobals` reads it back out of the _bundled_ code, and the bundler has
 * re-printed the module by then. Which quote it chooses is a bundler detail:
 * esbuild keeps double quotes, while Rolldown's minifier (Oxc, the default from
 * Vite 6 on) normalises every string literal to a template literal, so the key
 * arrives back-quoted. `JSON.parse` accepts only the double-quoted form, so
 * parse the literal ourselves and stay bundler-agnostic.
 *
 * The escape handling is not padding. A key is whatever the author wrote
 * between the tag's backticks, so it can hold quotes, backslashes and non-ASCII
 * text — and a minifier emitting ASCII-only output re-encodes exactly those as
 * `\xNN` and `\uNNNN`. Getting one wrong would silently look up a key that does
 * not exist and ship the key itself as the translation, so anything malformed
 * throws instead: an unparseable escape, and the legacy octal forms, which no
 * bundler emits and which mean something different inside a template literal.
 *
 * A template literal with a substitution is an error rather than something to
 * interpolate: keys are static by construction, so a `${…}` means the transform
 * and the bundled code disagree, and guessing would emit a wrong translation.
 *
 * @private
 */
export const parseStringLiteral = (expr: string): string => {
	const source = expr.trim()
	const quote = source[0]
	if (quote !== '"' && quote !== "'" && quote !== '`')
		throw new Error(`Not a string literal: ${expr}`)

	let value = ''
	let i = 1
	for (; i < source.length; i++) {
		const char = source[i]
		if (char === quote) break
		if (quote === '`' && char === '$' && source[i + 1] === '{')
			throw new Error(`Not a static string literal: ${expr}`)
		if (char !== '\\') {
			value += char
			continue
		}
		const escaped = source[++i]
		if (escaped === undefined) break
		if (escaped >= '1' && escaped <= '7') {
			throw new Error(`Legacy octal escape in ${expr}`)
		} else if (
			escaped === '0' &&
			source[i + 1] >= '0' &&
			source[i + 1] <= '9'
		) {
			throw new Error(`Legacy octal escape in ${expr}`)
		} else if (escaped === 'x') {
			value += String.fromCharCode(
				parseHexDigits(source.slice(i + 1, i + 3), expr, 2)
			)
			i += 2
		} else if (escaped === 'u' && source[i + 1] === '{') {
			const end = source.indexOf('}', i)
			if (end === -1) throw new Error(`Invalid escape sequence in ${expr}`)
			value += String.fromCodePoint(
				parseHexDigits(source.slice(i + 2, end), expr)
			)
			i = end
		} else if (escaped === 'u') {
			value += String.fromCharCode(
				parseHexDigits(source.slice(i + 1, i + 5), expr, 4)
			)
			i += 4
		} else if (escaped === '\n') {
			// line continuation, contributes nothing
		} else {
			value += singleCharEscapes[escaped] ?? escaped
		}
	}
	// Anything after the closing quote means this was an expression that merely
	// begins and ends with a quote, e.g. `"a" + "b"`.
	if (i !== source.length - 1)
		throw new Error(`Not a single string literal: ${expr}`)

	return value
}

const marker = '__$LOCALIZE$__('
/**
 * Replace the localization functions in the final bundle code. To avoid parsing
 * all the code as JavaScript, we use a regex to find the function calls and a
 * rudimentary parser to extract the arguments.
 */
export const replaceGlobals = ({
	code,
	translations,
	locale,
}: {
	code: string
	translations: Record<Locale, Data>
	locale: Locale
}) => {
	let startIndex
	code = code.replaceAll('__$LOCALE$__', locale)
	while (code.length) {
		// We work backwards so that nesting works
		startIndex = code.lastIndexOf(marker, startIndex)
		if (startIndex === -1) {
			// No more occurrences
			return code
		}
		// Copying a chunk on the assumption that character indexing will be faster
		const chunk = code.slice(startIndex)

		const argExprs: string[] = []
		let inSingleQuote = false
		let inDoubleQuote = false
		let inTemplateString = false
		let argStart = marker.length
		let inEscapeSequence = false
		let parensBalance = 1
		let didReadParamArray = false

		// simple parser for the arguments
		// call will look like
		// __$LOCALIZE__('key', ['arg1', 'arg2'])
		// but no idea of types of quotes
		let i: number
		// Loop through the characters to find the end of the function call and extract the arguments
		for (i = argStart; i < chunk.length; i++) {
			const char = chunk[i]
			if (inEscapeSequence) {
				// Skip the current character if we're in an escape sequence
				inEscapeSequence = false
			} else if (char === '\\') {
				// Enter escape sequence if we encounter a backslash
				inEscapeSequence = true
			} else if (char === "'" && !inDoubleQuote && !inTemplateString) {
				inSingleQuote = !inSingleQuote
			} else if (char === '"' && !inSingleQuote && !inTemplateString) {
				inDoubleQuote = !inDoubleQuote
			} else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
				inTemplateString = !inTemplateString
			} else if (!inSingleQuote && !inDoubleQuote && !inTemplateString) {
				// If we're not inside a string, check the structural characters
				if ('([{'.includes(char)) {
					if (parensBalance === 1 && char === '[') {
						// We found the start of the first parameter
						argStart = i + 1
						didReadParamArray = true
					}
					parensBalance++
				} else if (')]}'.includes(char)) {
					// we know that the JS is valid, so we don't need to check types of parens
					if (parensBalance === 2 && char === ']') {
						// We found the parameters array close
						argExprs.push(chunk.slice(argStart, i).trim())
					}
					if (parensBalance === 1 && !didReadParamArray) {
						argExprs.push(chunk.slice(argStart, i).trim())
					}
					parensBalance--
					if (parensBalance === 0) {
						// We found the matching closing parenthesis
						break
					}
				} else if (
					// We found an argument boundary
					char === ',' &&
					(parensBalance === 1 || parensBalance === 2)
				) {
					argExprs.push(chunk.slice(argStart, i).trim())
					argStart = i + 1
				}
			}
		}
		if (parensBalance !== 0) {
			throw new Error('Unbalanced parenthesis')
		}
		if (!argExprs.length) {
			throw new Error(`No arguments found for __$LOCALIZE$__`)
		}
		// The first item is the key. We emitted it as a double-quoted string, but
		// the bundler has re-printed it since and may have changed the quoting.
		const keyExpr = argExprs.shift()!
		let key: Key
		try {
			key = parseStringLiteral(keyExpr)
		} catch (error) {
			throw new Error(
				`Invalid __$LOCALIZE$__ key: ${(error as Error).message}`,
				{
					cause: error,
				}
			)
		}
		const tr = getTr(key, locale, translations)
		code =
			code.slice(0, startIndex) +
			makeTranslatedExpr(tr, argExprs) +
			chunk.slice(i + 1)
	}

	return code
}
