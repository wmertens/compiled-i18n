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

	test('repeated', () => expect(interpolate('hi $1 $1', [1])).toBe('hi 1 1'))
	test('null', () => expect(interpolate('hi $1', [null])).toBe('hi '))
	test('undefined', () => expect(interpolate('hi $1', [undefined])).toBe('hi '))
	test('empty', () => expect(interpolate('hi $1', [''])).toBe('hi '))
	test('0', () => expect(interpolate('hi $1', [0])).toBe('hi 0'))
	test('false', () => expect(interpolate('hi $1', [false])).toBe('hi false'))
	test('true', () => expect(interpolate('hi $1', [true])).toBe('hi true'))
})

describe('interpolate plural', () => {
	const pl = {'*': 'hi', 0: 'zero', 1: 'one'}

	test('missing *', () =>
		expect(interpolate({0: 'zero', 1: 'one'} as any)).toBe(''))
	test('no params', () => expect(interpolate(pl)).toBe('hi'))
	test('number', () => expect(interpolate(pl, [1])).toBe('one'))
	test('fallback', () => expect(interpolate(pl, [2])).toBe('hi'))
	test('string', () => expect(interpolate(pl, ['1'])).toBe('one'))
	test('object', () =>
		expect(interpolate(pl, [{toString: () => '1'}])).toBe('one'))
	test('multiple', () =>
		expect(
			interpolate({'*': 'hi $2', 0: 'zero $2', 1: 'one $$ $2'}, [1, 'hello', 1])
		).toBe('one $ hello'))

	describe('recursive', () => {
		const recursive = {
			'*': 'hi $1 $2',
			0: {0: 'no things', 1: 'one thing', '*': '$2 things'},
			1: 'one $1',
		}
		test('simple', () =>
			expect(interpolate(recursive, [3, 'hello'])).toBe('hi 3 hello'))
		test('nested', () =>
			expect(interpolate(recursive, [0, 3])).toBe('3 things'))
	})
})
