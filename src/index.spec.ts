import {test, expect, describe} from 'vitest'
import {makeKey} from './makeKey'
import {interpolate} from './interpolate'

describe('makeKey', () => {
	test('single', () => expect(makeKey(['hi'])).toBe('hi'))
	test('multi', () => expect(makeKey(['hi', 'there'])).toBe('hi$1there'))
	test('escaping', () =>
		expect(makeKey(['h$i', 't$$$here'])).toBe('h$$i$1t$$$$$$here'))
})

describe('interpolate string', () => {
	test('no params', () => expect(interpolate('hi')).toBe('hi'))
	test('number', () => expect(interpolate('hi $1', [1])).toBe('hi 1'))
	test('string', () => expect(interpolate('hi $1', ['there'])).toBe('hi there'))
	test('object', () =>
		expect(interpolate('hi $1', [{toString: () => 'there'}])).toBe('hi there'))
	test('multiple', () =>
		expect(interpolate('hi $1 $2', ['there', 1])).toBe('hi there 1'))
	test('escape', () => expect(interpolate('hi $$1', [1])).toBe('hi $1'))
	test('escape all multiple', () =>
		expect(interpolate('hi $$ $$$$1 $1', [1])).toBe('hi $ $$1 1'))
})

describe('interpolate plural', () => {
	test('missing *', () =>
		expect(interpolate({0: 'zero', 1: 'one'} as any)).toBe(''))
	test('no params', () =>
		expect(interpolate({'*': 'hi', 0: 'zero', 1: 'one'})).toBe('hi'))
	test('number', () =>
		expect(interpolate({'*': 'hi', 0: 'zero', 1: 'one'}, [1])).toBe('one'))
	test('fallback', () =>
		expect(interpolate({'*': 'hi', 0: 'zero', 1: 'one'}, [2])).toBe('hi'))
	test('string', () =>
		expect(interpolate({'*': 'hi', 0: 'zero', 1: 'one'}, ['1'])).toBe('one'))
	test('object', () =>
		expect(
			interpolate({'*': 'hi', 0: 'zero', 1: 'one'}, [{toString: () => '1'}])
		).toBe('one'))
	test('multiple', () =>
		expect(
			interpolate({'*': 'hi $2', 0: 'zero $2', 1: 'one $$ $2'}, [1, 'hello', 1])
		).toBe('one $ hello'))
})
