import {test, expect} from 'vitest'
import path from 'path'
import {extractKeys, scanUsageKeys} from './scan-usage'

const names = new Set(['_', 'localize'])

test('extracts static keys', () => {
	expect(extractKeys('_`hello`', names)).toEqual(['hello'])
	expect(extractKeys('localize`a_b_c`', names)).toEqual(['a_b_c'])
})

test('extracts interpolated keys with $N placeholders', () => {
	expect(extractKeys('_`title ${x}`', names)).toEqual(['title $1'])
	expect(extractKeys('_`${a} and ${b}!`', names)).toEqual(['$1 and $2!'])
})

test('escapes literal $ like makeKey', () => {
	expect(extractKeys('_`5$ off`', names)).toEqual(['5$$ off'])
})

test('ignores member access and lookalikes', () => {
	expect(extractKeys('obj._`x`', names)).toEqual([])
	expect(extractKeys('not_`x`', names)).toEqual([])
	expect(extractKeys('`plain template`', names)).toEqual([])
})

test('respects aliased import names', () => {
	const code = `import {localize as t} from 'compiled-i18n'\nconst s = t\`aliased_key\``
	// Caller passes the resolved names; here simulate the alias resolution.
	expect(extractKeys(code, new Set(['t']))).toContain('aliased_key')
})

test('handles nested template in expression', () => {
	expect(extractKeys('_`a ${cond ? `x` : `y`} b`', names)).toEqual(['a $1 b'])
})

test('extracts call form _("key") / _(\'key\')', () => {
	expect(extractKeys('_("call_key")', names)).toEqual(['call_key'])
	expect(extractKeys("localize('call_key2')", names)).toEqual(['call_key2'])
	expect(extractKeys('_( "spaced" )', names)).toEqual(['spaced'])
})

test('extracts call form with template arg', () => {
	expect(extractKeys('_(`tpl ${x}`)', names)).toEqual(['tpl $1'])
})

test('call form ignores non-static first arg', () => {
	expect(extractKeys('_(dynamicVar)', names)).toEqual([])
	expect(extractKeys('_(cond ? "a" : "b")', names)).toEqual([])
})

test('scanUsageKeys reads .astro fixture from disk', () => {
	const root = path.resolve(import.meta.url.slice(5), '../fixture')
	const keys = scanUsageKeys(['uses-in-astro.astro'], root)
	expect(keys.has('astro_only_key')).toBe(true)
	expect(keys.has('astro_attr_key')).toBe(true)
	expect(keys.has('astro_count $1')).toBe(true)
	expect(keys.has('astro_call_key')).toBe(true)
})
