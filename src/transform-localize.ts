import {parseSync} from 'oxc-parser'
import type {
	ImportDeclaration,
	TaggedTemplateExpression,
} from '@oxc-project/types'
import {makeKey} from './makeKey'
import {Data, Key, Locale} from 'compiled-i18n'

// Manual AST walker since oxc-parser's Visitor has ESM/CJS issues
function walkAST(
	node: any,
	visitors: {
		ImportDeclaration?: (n: ImportDeclaration) => void
		TaggedTemplateExpression?: (n: TaggedTemplateExpression) => void
	}
) {
	if (!node || typeof node !== 'object') return

	// Call visitor for this node type
	if (node.type && visitors[node.type as keyof typeof visitors]) {
		visitors[node.type as keyof typeof visitors]?.(node)
	}

	// Recursively walk children
	for (const key in node) {
		if (key === 'start' || key === 'end' || key === 'type') continue
		const value = node[key]
		if (Array.isArray(value)) {
			value.forEach(child => walkAST(child, visitors))
		} else if (value && typeof value === 'object') {
			walkAST(value, visitors)
		}
	}
}

export const transformLocalize = ({
	id,
	code,
	allKeys,
	pluralKeys,
}: {
	id?: string
	code: string
	allKeys?: Set<string>
	pluralKeys?: Set<string>
}) => {
	const begin = code.slice(0, 5000)
	if (!begin.includes('compiled-i18n') || begin.includes('__interpolate__'))
		return null

	// Parse the code with oxc-parser
	// Check if the code contains JSX syntax
	const hasJsx = /<[a-zA-Z]/.test(code)
	const lang =
		id?.endsWith('.tsx') || id?.endsWith('.jsx') || hasJsx ? 'tsx' : 'ts'
	const result = parseSync(id || 'file.ts', code, {lang})

	if (result.errors.length > 0) {
		throw new Error(
			`Parse errors: ${result.errors.map(e => e.message).join(', ')}`
		)
	}

	const localizeNames = new Set<string>()
	let importDecl: ImportDeclaration | null = null
	let needsInterpolateImport = false

	// First pass: collect localize function names from imports and find templates
	const templatesToTransform: Array<{
		node: TaggedTemplateExpression
		key: string
		isPlural: boolean
	}> = []

	walkAST(result.program, {
		ImportDeclaration(node: ImportDeclaration) {
			if (node.source.value !== 'compiled-i18n') return

			for (const specifier of node.specifiers) {
				if (
					specifier.type === 'ImportSpecifier' &&
					specifier.imported.type === 'Identifier' &&
					(specifier.imported.name === '_' ||
						specifier.imported.name === 'localize')
				) {
					localizeNames.add(specifier.local.name)
				}
			}
			importDecl = node
		},
		TaggedTemplateExpression(node: TaggedTemplateExpression) {
			if (node.tag.type !== 'Identifier' || !localizeNames.has(node.tag.name)) {
				return
			}

			const {quasi} = node
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

			templatesToTransform.push({
				node,
				key,
				isPlural: pluralKeys?.has(key) || false,
			})
		},
	})

	if (templatesToTransform.length === 0) {
		// No transformations needed
		return null
	}

	// Second pass: transform templates from innermost to outermost
	// Sort by span size (smallest = innermost first), then by position (right to left for same size)
	templatesToTransform.sort((a, b) => {
		const sizeA = a.node.end - a.node.start
		const sizeB = b.node.end - b.node.start
		if (sizeA !== sizeB) return sizeA - sizeB
		return b.node.start - a.node.start
	})

	// Track all replacements made so we can adjust positions
	const replacements: Array<{
		origStart: number
		origEnd: number
		newLength: number
	}> = []

	// Helper to calculate adjusted position based on all prior replacements
	const adjustPosition = (origPos: number): number => {
		let adjusted = origPos
		for (const repl of replacements) {
			if (repl.origStart < origPos) {
				// This replacement happened before our position
				if (repl.origEnd <= origPos) {
					// Replacement is completely before our position, apply the full shift
					adjusted += repl.newLength - (repl.origEnd - repl.origStart)
				}
				// If replacement overlaps our position, we don't adjust (shouldn't happen with proper nesting)
			}
		}
		return adjusted
	}

	let transformedCode = code

	for (const {node, key, isPlural} of templatesToTransform) {
		// Extract the expression arguments from the template using adjusted positions
		const args = node.quasi.expressions.map((expr: any) => {
			const adjustedStart = adjustPosition(expr.start)
			const adjustedEnd = adjustPosition(expr.end)
			return transformedCode.slice(adjustedStart, adjustedEnd)
		})

		let replacement: string
		if (isPlural) {
			// This translation might have a plural, so we need to interpolate at runtime
			needsInterpolateImport = true
			replacement = `__interpolate__(__$LOCALIZE$__(${JSON.stringify(key)}), [${args.join(', ')}])`
		} else {
			replacement = `__$LOCALIZE$__(${JSON.stringify(key)}, [${args.join(', ')}])`
		}

		// Apply the replacement at the adjusted position
		const adjustedStart = adjustPosition(node.start)
		const adjustedEnd = adjustPosition(node.end)
		transformedCode =
			transformedCode.slice(0, adjustedStart) +
			replacement +
			transformedCode.slice(adjustedEnd)

		// Record this replacement
		replacements.push({
			origStart: node.start,
			origEnd: node.end,
			newLength: replacement.length,
		})
	}

	// Add interpolate import if needed
	if (needsInterpolateImport && importDecl) {
		// Find the position to insert the import specifier
		// We'll add ", interpolate as __interpolate__" before the closing brace
		const importEnd = (importDecl as ImportDeclaration).end
		const importStart = (importDecl as ImportDeclaration).start
		const importText = transformedCode.slice(importStart, importEnd)

		// Check if interpolate is already imported
		if (!importText.includes('interpolate')) {
			// Find the position right before the closing brace of the import statement
			const fromIndex = importText.indexOf('from')
			if (fromIndex > 0) {
				const beforeFrom = importText.slice(0, fromIndex).trim()
				const afterFrom = importText.slice(fromIndex)

				// Add the import specifier
				let newImport: string
				if (beforeFrom.endsWith('}')) {
					// Insert before the closing brace
					newImport =
						beforeFrom.slice(0, -1) +
						', interpolate as __interpolate__ }' +
						afterFrom
				} else {
					// Handle other import formats if needed
					newImport = importText
				}

				transformedCode =
					transformedCode.slice(0, importStart) +
					newImport +
					transformedCode.slice(importEnd)
			}
		}
	}

	return transformedCode
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
		let templateStringDepth = 0
		let argStart = marker.length
		let inEscapeSequence = false
		let parensBalance = 1
		let didReadParamArray = false
		let hasArrayFormat = false // Track if we're using array format

		// simple parser for the arguments
		// call will look like
		// __$LOCALIZE__('key', ['arg1', 'arg2']) for array format
		// or __$LOCALIZE__('key', arg1, arg2) for direct args format
		let i: number
		// Loop through the characters to find the end of the function call and extract the arguments
		for (i = argStart; i < chunk.length; i++) {
			const char = chunk[i]
			const prevChar = i > 0 ? chunk[i - 1] : ''

			if (inEscapeSequence) {
				// Skip the current character if we're in an escape sequence
				inEscapeSequence = false
			} else if (char === '\\') {
				// Enter escape sequence if we encounter a backslash
				inEscapeSequence = true
			} else if (char === "'" && !inDoubleQuote && templateStringDepth === 0) {
				inSingleQuote = !inSingleQuote
			} else if (char === '"' && !inSingleQuote && templateStringDepth === 0) {
				inDoubleQuote = !inDoubleQuote
			} else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
				// Template strings can be nested via ${...}
				// A backtick either starts a template (depth 0->1) or ends the outermost template (depth 1->0)
				if (templateStringDepth === 0) {
					templateStringDepth = 1
				} else if (templateStringDepth === 1) {
					templateStringDepth = 0
				}
				// If depth > 1, we're inside a ${...} expression with a nested template, ignore the backtick
			} else if (
				char === '{' &&
				prevChar === '$' &&
				templateStringDepth >= 1 &&
				!inSingleQuote &&
				!inDoubleQuote
			) {
				// Entering a template expression ${ - increase depth
				templateStringDepth++
			} else if (
				char === '}' &&
				templateStringDepth > 1 &&
				!inSingleQuote &&
				!inDoubleQuote
			) {
				// Exiting a template expression - decrease depth
				templateStringDepth--
			} else if (
				!inSingleQuote &&
				!inDoubleQuote &&
				templateStringDepth === 0
			) {
				// If we're not inside a string, check the structural characters
				if ('([{'.includes(char)) {
					if (parensBalance === 1 && char === '[') {
						// We found the start of the array parameter format
						hasArrayFormat = true
						argStart = i + 1
						didReadParamArray = true
					}
					parensBalance++
				} else if (')]}'.includes(char)) {
					// we know that the JS is valid, so we don't need to check types of parens
					if (hasArrayFormat && parensBalance === 2 && char === ']') {
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
				} else if (char === ',') {
					// We found a comma - check if it's an argument separator
					const isArraySeparator = hasArrayFormat && parensBalance === 2
					const isDirectArgSeparator = !hasArrayFormat && parensBalance === 1

					if (isArraySeparator || isDirectArgSeparator) {
						argExprs.push(chunk.slice(argStart, i).trim())
						argStart = i + 1
					}
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
			makeTranslatedExpr(tr, argExprs) +
			chunk.slice(i + 1)
	}

	return code
}
