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
	splitMode,
	keyIndexMap,
}: {
	id?: string
	code: string
	allKeys?: Set<string>
	pluralKeys?: Set<string>
	/** Transform for split mode: rewrite tagged templates to indexed array reads */
	splitMode?: boolean
	/** Key→index mapping for split mode (required when splitMode is true) */
	keyIndexMap?: Record<string, number>
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

	if (splitMode) {
		// Split mode: rewrite tagged templates to indexed array reads
		return transformSplitMode(
			code,
			templatesToTransform,
			importDecl,
			localizeNames,
			keyIndexMap!
		)
	}

	// Inline mode: rewrite tagged templates to __$LOCALIZE$__ calls
	const needsInterpolate = templatesToTransform.some(t => t.isPlural)
	return transformInlineMode(
		code,
		templatesToTransform,
		importDecl,
		needsInterpolate
	)
}

type TemplateInfo = {
	node: TaggedTemplateExpression
	key: string
	isPlural: boolean
}

// Shared helpers for position-aware replacements
const sortTemplates = (templates: TemplateInfo[]) => {
	templates.sort((a, b) => {
		const sizeA = a.node.end - a.node.start
		const sizeB = b.node.end - b.node.start
		if (sizeA !== sizeB) return sizeA - sizeB
		return b.node.start - a.node.start
	})
}

const makeAdjuster = () => {
	const replacements: Array<{
		origStart: number
		origEnd: number
		newLength: number
	}> = []
	return {
		adjust(origPos: number): number {
			let adjusted = origPos
			for (const repl of replacements) {
				if (repl.origStart < origPos && repl.origEnd <= origPos) {
					adjusted += repl.newLength - (repl.origEnd - repl.origStart)
				}
			}
			return adjusted
		},
		record(origStart: number, origEnd: number, newLength: number) {
			replacements.push({origStart, origEnd, newLength})
		},
	}
}

const getArgs = (
	node: TaggedTemplateExpression,
	transformedCode: string,
	adjuster: ReturnType<typeof makeAdjuster>
) =>
	node.quasi.expressions.map((expr: any) =>
		transformedCode.slice(
			adjuster.adjust(expr.start),
			adjuster.adjust(expr.end)
		)
	)

const applyReplacement = (
	transformedCode: string,
	node: TaggedTemplateExpression,
	replacement: string,
	adjuster: ReturnType<typeof makeAdjuster>
) => {
	const adjustedStart = adjuster.adjust(node.start)
	const adjustedEnd = adjuster.adjust(node.end)
	adjuster.record(node.start, node.end, replacement.length)
	return (
		transformedCode.slice(0, adjustedStart) +
		replacement +
		transformedCode.slice(adjustedEnd)
	)
}

function addInterpolateImport(
	transformedCode: string,
	importDecl: ImportDeclaration
) {
	const importEnd = importDecl.end
	const importStart = importDecl.start
	const importText = transformedCode.slice(importStart, importEnd)

	if (importText.includes('interpolate')) return transformedCode

	const fromIndex = importText.indexOf('from')
	if (fromIndex <= 0) return transformedCode

	const beforeFrom = importText.slice(0, fromIndex).trim()
	const afterFrom = importText.slice(fromIndex)

	if (!beforeFrom.endsWith('}')) return transformedCode

	const newImport =
		beforeFrom.slice(0, -1) + ', interpolate as __interpolate__ }' + afterFrom

	return (
		transformedCode.slice(0, importStart) +
		newImport +
		transformedCode.slice(importEnd)
	)
}

function transformSplitMode(
	code: string,
	templates: TemplateInfo[],
	importDecl: ImportDeclaration | null,
	localizeNames: Set<string>,
	keyIndexMap: Record<string, number>
): string {
	sortTemplates(templates)
	const adjuster = makeAdjuster()
	let transformedCode = code
	let needsInterpolate = false

	for (const {node, key} of templates) {
		const args = getArgs(node, transformedCode, adjuster)
		const idx = keyIndexMap[key]
		let replacement: string
		if (args.length > 0) {
			needsInterpolate = true
			replacement = `__interpolate__(__tr__[${idx}], [${args.join(', ')}])`
		} else {
			replacement = `__tr__[${idx}]`
		}
		transformedCode = applyReplacement(
			transformedCode,
			node,
			replacement,
			adjuster
		)
	}

	// Rewrite the compiled-i18n import: remove _/localize, add interpolate if needed
	if (importDecl) {
		if (needsInterpolate) {
			transformedCode = addInterpolateImport(transformedCode, importDecl)
		}

		// Remove _/localize specifiers from the import (they're replaced by __tr__)
		// Re-read the import text after potential interpolate addition
		const importStart = importDecl.start
		// Find the current import by searching from the original start
		const importLine = transformedCode.slice(importStart)
		const importEndRel = importLine.indexOf('\n')
		const importEnd =
			importEndRel === -1 ? transformedCode.length : importStart + importEndRel
		const importText = transformedCode.slice(importStart, importEnd)

		// Check if there are other specifiers besides _/localize/interpolate
		const otherSpecifiers = importText.includes('interpolate')
		if (!otherSpecifiers) {
			// Remove the entire compiled-i18n import
			transformedCode =
				transformedCode.slice(0, importStart) + transformedCode.slice(importEnd)
		} else {
			// Remove just the _/localize specifiers
			let newImport = importText
			for (const name of localizeNames) {
				// Remove patterns like "_ as something," or "localize," etc
				newImport = newImport
					.replace(new RegExp(`\\b\\w+\\s+as\\s+${name}\\s*,?\\s*`), '')
					.replace(new RegExp(`\\b${name}\\s*,\\s*`), '')
					.replace(new RegExp(`\\s*,\\s*${name}\\b`), '')
			}
			transformedCode =
				transformedCode.slice(0, importStart) +
				newImport +
				transformedCode.slice(importEnd)
		}
	}

	// Add the __tr__ import
	transformedCode =
		`import {tr as __tr__} from '@i18n/__tr'\n` + transformedCode

	return transformedCode
}

function transformInlineMode(
	code: string,
	templates: TemplateInfo[],
	importDecl: ImportDeclaration | null,
	needsInterpolateImport: boolean
): string {
	sortTemplates(templates)
	const adjuster = makeAdjuster()
	let transformedCode = code

	for (const {node, key, isPlural} of templates) {
		const args = getArgs(node, transformedCode, adjuster)
		let replacement: string
		if (isPlural) {
			replacement = `__interpolate__(__$LOCALIZE$__(${JSON.stringify(key)}), [${args.join(', ')}])`
		} else {
			replacement = `__$LOCALIZE$__(${JSON.stringify(key)}, [${args.join(', ')}])`
		}
		transformedCode = applyReplacement(
			transformedCode,
			node,
			replacement,
			adjuster
		)
	}

	if (needsInterpolateImport && importDecl) {
		transformedCode = addInterpolateImport(transformedCode, importDecl)
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
