import {
	type Node,
	type PluginItem,
	type PluginObj,
	types,
	transformSync,
} from '@babel/core'
import {makeKey} from './makeKey'
import {Data, Key, Locale} from 'vite-plugin-i18n'

const makePlugin = ({pluralKeys}: {pluralKeys: Set<string>}) => {
	const localizeNames = new Set<string>()
	const plugin: PluginObj = {
		visitor: {
			ImportDeclaration(path) {
				const source = path.node.source.value
				const specifiers = path.node.specifiers

				if (source === 'vite-plugin-i18n') {
					for (const specifier of specifiers) {
						// If importing named exports from 'vite-plugin-i18n', store them.
						if (
							'imported' in specifier &&
							'name' in specifier.imported &&
							(specifier.imported.name === '_' ||
								specifier.imported.name === 'localize')
						) {
							localizeNames.add(specifier.local.name)
						}
					}
				}
				// Make sure we import the interpolate function
				specifiers.push({
					type: 'ImportSpecifier',
					imported: {type: 'Identifier', name: 'interpolate'},
					local: {type: 'Identifier', name: '__interpolate__'},
				})
			},
			TaggedTemplateExpression(path) {
				if ('name' in path.node.tag && localizeNames.has(path.node.tag.name)) {
					const {quasi} = path.node
					const strings = quasi.quasis.map(element => element.value.cooked!)

					const key = makeKey(strings)
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
					if (pluralKeys.has(key)) {
						// This translation might have a plural, so we need to interpolate at runtime
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
								...args,
							],
						} as types.CallExpression)
					} else {
						path.replaceWith({
							type: 'CallExpression',
							callee: {
								type: 'Identifier',
								name: '__$LOCALIZE$__',
							},
							arguments: [keyExpr, ...args],
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
	pluralKeys = new Set(),
}: {
	id?: string
	code: string
	babelPlugins?: PluginItem[]
	pluralKeys?: Set<string>
}) => {
	if (!code.slice(0, 5000).includes('vite-plugin-i18n')) return null

	return transformSync(code, {
		filename: id,
		configFile: false, // Ignore any existing babel configuration files
		plugins: [
			makePlugin({pluralKeys}),
			[require.resolve('@babel/plugin-syntax-typescript'), {isTSX: true}],
			...babelPlugins,
		],
		retainLines: true,
		// Babel isn't quite ESTree compatible, don't keep it
		// ast: true,
	})!.code!
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
export const makeTransExpr = (tr: unknown, paramExprs: string[]) => {
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
				if (char === '(') {
					parensBalance++
				} else if (char === ')') {
					parensBalance--
					if (parensBalance === 0) {
						// We found the matching closing parenthesis
						argExprs.push(chunk.slice(argStart, i).trim())
						break
					}
				} else if (char === ',' && parensBalance === 1) {
					// We found an argument boundary
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
		// first item is the key and it's a double quoted string because we made it
		const key = JSON.parse(argExprs.shift()!)
		const tr = getTr(key, locale, translations)
		code =
			code.slice(0, startIndex) +
			makeTransExpr(tr, argExprs) +
			chunk.slice(i + 1)
	}

	return code
}
