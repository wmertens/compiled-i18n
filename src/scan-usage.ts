import fs from 'node:fs'
import {globSync} from 'tinyglobby'
import {makeKey} from './makeKey'
import type {Key} from 'compiled-i18n'

/**
 * Find the local names that `_` / `localize` are imported as from
 * `compiled-i18n`, e.g. `import {_, localize as t} from 'compiled-i18n'` yields
 * `["_", "t"]`.
 */
const findLocalizeNames = (code: string): Set<string> => {
	const names = new Set<string>()
	const importRe =
		/import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]compiled-i18n['"]/g
	let m: RegExpExecArray | null
	while ((m = importRe.exec(code))) {
		for (const raw of m[1].split(',')) {
			const seg = raw.trim()
			if (!seg) continue
			const asMatch = /^(\w+)\s+as\s+(\w+)$/.exec(seg)
			if (asMatch) {
				if (asMatch[1] === '_' || asMatch[1] === 'localize')
					names.add(asMatch[2])
			} else if (seg === '_' || seg === 'localize') {
				names.add(seg)
			}
		}
	}
	return names
}

/**
 * Read a template literal starting at `code[start] === '\`'`, returning the
 * static quasi parts (with `${…}` expressions removed) and the index just past
 * the closing backtick. Returns null if the template is unterminated.
 */
const readTemplate = (
	code: string,
	start: number
): {quasis: string[]; end: number} | null => {
	const len = code.length
	let i = start + 1
	let cur = ''
	const quasis: string[] = []
	while (i < len) {
		const c = code[i]
		if (c === '\\') {
			// Keep escaped char verbatim; keys rarely contain escapes.
			cur += c + (code[i + 1] ?? '')
			i += 2
			continue
		}
		if (c === '`') {
			quasis.push(cur)
			return {quasis, end: i + 1}
		}
		if (c === '$' && code[i + 1] === '{') {
			quasis.push(cur)
			cur = ''
			i += 2
			// Skip the balanced expression, tolerating nested braces and templates.
			let depth = 1
			while (i < len && depth > 0) {
				const d = code[i]
				if (d === '{') depth++
				else if (d === '}') {
					depth--
					if (depth === 0) {
						i++
						break
					}
				} else if (d === '`') {
					const nested = readTemplate(code, i)
					if (!nested) return null
					i = nested.end
					continue
				}
				i++
			}
			continue
		}
		cur += c
		i++
	}
	return null
}

/**
 * Read a single- or double-quoted string literal starting at the quote at
 * `code[start]`, returning its (minimally unescaped) value and the index just
 * past the closing quote, or null if unterminated.
 */
const readStringLiteral = (
	code: string,
	start: number
): {value: string; end: number} | null => {
	const quote = code[start]
	const len = code.length
	let i = start + 1
	let value = ''
	while (i < len) {
		const c = code[i]
		if (c === '\\') {
			const next = code[i + 1]
			// Keys are plain text; resolve the few escapes that could appear.
			value += next === 'n' ? '\n' : next === 't' ? '\t' : (next ?? '')
			i += 2
			continue
		}
		if (c === quote) return {value, end: i + 1}
		value += c
		i++
	}
	return null
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Extract translation keys from `code` for the given localize tag names.
 *
 * Recognizes both call forms compiled-i18n supports:
 *
 * - Tagged template: `_`some key ${x}`` → `makeKey` (with `$N` placeholders)
 * - Function call with a static string/template arg: `_("some key")`
 *
 * This is a deliberately loose textual scan (no full JS/HTML parse) so it can
 * read keys out of files the bundler transform never sees — most importantly
 * Astro/Vue/Svelte components, where usage lives in template expressions. A
 * match inside a comment or string would count as "used"; that is the safe
 * direction (it never causes a used key to be deleted/reported unused).
 */
export const extractKeys = (code: string, names: Set<string>): Key[] => {
	if (!names.size) return []
	const keys: Key[] = []
	const len = code.length
	// Match any localize name as a standalone identifier (not `obj._`, not
	// `foo_`), followed by optional whitespace.
	const nameAlt = [...names].map(escapeRegExp).join('|')
	const re = new RegExp(`(?<![\\w$.])(?:${nameAlt})[ \\t]*`, 'g')
	let m: RegExpExecArray | null
	const pushTemplate = (at: number): number | null => {
		const parsed = readTemplate(code, at)
		if (!parsed) return null
		const key = makeKey(parsed.quasis)
		if (!/[\r\n]/.test(key)) keys.push(key)
		return parsed.end
	}
	while ((m = re.exec(code))) {
		const pos = m.index + m[0].length
		const ch = code[pos]
		if (ch === '`') {
			const end = pushTemplate(pos)
			if (end != null) re.lastIndex = end
		} else if (ch === '(') {
			let p = pos + 1
			while (p < len && (code[p] === ' ' || code[p] === '\t')) p++
			const q = code[p]
			if (q === '"' || q === "'") {
				const str = readStringLiteral(code, p)
				if (str && !/[\r\n]/.test(str.value)) {
					keys.push(str.value)
					re.lastIndex = str.end
				}
			} else if (q === '`') {
				const end = pushTemplate(p)
				if (end != null) re.lastIndex = end
			}
		}
	}
	return keys
}

/**
 * Scan the files matched by `globs` (relative to `root`) for translation-key
 * usages and return the set of keys found. Files that don't import
 * `compiled-i18n` are skipped cheaply.
 */
export const scanUsageKeys = (globs: string[], root: string): Set<Key> => {
	const used = new Set<Key>()
	const files = globSync(globs, {cwd: root, absolute: true})
	for (const file of files) {
		let code: string
		try {
			code = fs.readFileSync(file, 'utf8')
		} catch {
			continue
		}
		if (!code.includes('compiled-i18n')) continue
		const names = findLocalizeNames(code)
		for (const key of extractKeys(code, names)) used.add(key)
	}
	return used
}
