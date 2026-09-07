// LSDE Dialog Engine — Condition evaluation
//
// The engine assembles answers, it never compares. Every test below therefore feeds a fake
// evaluator and checks how the answers are combined — which is the whole of what this module owns.

import { describe, it, expect, vi } from 'vitest';
import {
	evaluateConditionChain, evaluateConditionCases, evaluateEachCase,
	tagOptionVisibility, isChoiceTest,
} from './condition-evaluator.js';
import type { ConditionTest, ConditionCase, Option } from './types.js';

/** A test whose truth is written into its `entry`, so a case reads like what it asserts. */
function t( entry: 'T' | 'F', join?: 'and' | 'or' ): ConditionTest {
	return { dict: 'switches', entry, op: 'equals', value: true, ...( join ? { join } : {} ) };
}

/** Answers by what the test asks for, so the chain logic is what is under test. */
const answer = ( test: ConditionTest ): boolean => test.entry === 'T';

describe( 'chaining tests inside a case', () => {

	it( 'is true when there are no tests at all', () => {
		// This is how "always" is written in v2 — by the ABSENCE of `when`.
		expect( evaluateConditionChain( undefined, answer ) ).toBe( true );
	} );

	it( 'is true for an empty list too, though LSDE never writes one', () => {
		expect( evaluateConditionChain( [], answer ) ).toBe( true );
	} );

	it( 'returns the single test on its own', () => {
		expect( evaluateConditionChain( [t( 'T' )], answer ) ).toBe( true );
		expect( evaluateConditionChain( [t( 'F' )], answer ) ).toBe( false );
	} );

	it( 'joins with AND by default', () => {
		expect( evaluateConditionChain( [t( 'T' ), t( 'T' )], answer ) ).toBe( true );
		expect( evaluateConditionChain( [t( 'T' ), t( 'F' )], answer ) ).toBe( false );
		expect( evaluateConditionChain( [t( 'F' ), t( 'T' )], answer ) ).toBe( false );
	} );

	it( 'joins with AND when the join says so', () => {
		expect( evaluateConditionChain( [t( 'T' ), t( 'F', 'and' )], answer ) ).toBe( false );
	} );

	it( 'joins with OR when the join says so', () => {
		expect( evaluateConditionChain( [t( 'F' ), t( 'T', 'or' )], answer ) ).toBe( true );
		expect( evaluateConditionChain( [t( 'F' ), t( 'F', 'or' )], answer ) ).toBe( false );
	} );

	it( 'ignores a join on the FIRST test — it links to the one above, and there is none', () => {
		expect( evaluateConditionChain( [t( 'F', 'or' )], answer ) ).toBe( false );
		expect( evaluateConditionChain( [t( 'T', 'and' )], answer ) ).toBe( true );
	} );

	it( 'reads left to right with NO precedence', () => {
		// F AND T OR T  →  (F AND T) OR T = true.
		// With AND binding tighter it would be F AND (T OR T) = false. It does not.
		expect( evaluateConditionChain( [t( 'F' ), t( 'T', 'and' ), t( 'T', 'or' )], answer ) )
			.toBe( true );

		// T OR F AND F  →  (T OR F) AND F = false.
		// With precedence it would be T OR (F AND F) = true. It does not.
		expect( evaluateConditionChain( [t( 'T' ), t( 'F', 'or' ), t( 'F', 'and' )], answer ) )
			.toBe( false );
	} );

	it( 'evaluates every test, even once the answer is settled', () => {
		// No short-circuit: the game's evaluator is where a project logs and counts, and skipping
		// calls would make that log depend on the order the writer happened to use.
		const spy = vi.fn( answer );

		evaluateConditionChain( [t( 'F' ), t( 'T', 'and' ), t( 'T', 'and' )], spy );
		expect( spy ).toHaveBeenCalledTimes( 3 );

		spy.mockClear();
		evaluateConditionChain( [t( 'T' ), t( 'T', 'or' ), t( 'T', 'or' )], spy );
		expect( spy ).toHaveBeenCalledTimes( 3 );
	} );

	it( 'passes each test through untouched', () => {
		const seen: ConditionTest[] = [];
		const tests = [t( 'T' ), t( 'F', 'or' )];
		evaluateConditionChain( tests, test => { seen.push( test ); return true; } );
		expect( seen ).toEqual( tests );
	} );
} );

describe( 'picking a port — if mode (portPerCase absent)', () => {

	it( 'leaves by out when the single case holds', () => {
		const cases: ConditionCase[] = [{ port: 'out', when: [t( 'T' )] }];
		expect( evaluateConditionCases( cases, false, answer ) ).toBe( 'out' );
	} );

	it( 'leaves by default when it does not', () => {
		const cases: ConditionCase[] = [{ port: 'out', when: [t( 'F' )] }];
		expect( evaluateConditionCases( cases, false, answer ) ).toBe( 'default' );
	} );

	it( 'requires EVERY case to hold — the cases share one exit', () => {
		const all: ConditionCase[] = [
			{ port: 'out', when: [t( 'T' )] },
			{ port: 'out', when: [t( 'T' )] },
		];
		expect( evaluateConditionCases( all, false, answer ) ).toBe( 'out' );

		const one: ConditionCase[] = [
			{ port: 'out', when: [t( 'T' )] },
			{ port: 'out', when: [t( 'F' )] },
		];
		expect( evaluateConditionCases( one, false, answer ) ).toBe( 'default' );
	} );

	it( 'treats a case with no when as always true', () => {
		expect( evaluateConditionCases( [{ port: 'out' }], false, answer ) ).toBe( 'out' );
	} );

	it( 'leaves by out when there are no cases at all — nothing was asked', () => {
		expect( evaluateConditionCases( undefined, false, answer ) ).toBe( 'out' );
		expect( evaluateConditionCases( [], false, answer ) ).toBe( 'out' );
	} );

	it( 'ignores the port a case declares — in if mode they all share out', () => {
		const cases: ConditionCase[] = [{ port: 'K1', when: [t( 'T' )] }];
		expect( evaluateConditionCases( cases, false, answer ) ).toBe( 'out' );
	} );
} );

describe( 'picking a port — switch mode (portPerCase: true)', () => {

	const cases: ConditionCase[] = [
		{ port: 'K1', when: [t( 'F' )] },
		{ port: 'K2', when: [t( 'T' )] },
		{ port: 'K3', when: [t( 'T' )] },
	];

	it( 'takes the FIRST case that holds, in order', () => {
		expect( evaluateConditionCases( cases, true, answer ) ).toBe( 'K2' );
	} );

	it( 'takes default when none holds', () => {
		const none: ConditionCase[] = [
			{ port: 'K1', when: [t( 'F' )] },
			{ port: 'K2', when: [t( 'F' )] },
		];
		expect( evaluateConditionCases( none, true, answer ) ).toBe( 'default' );
	} );

	it( 'takes a case with no when, and everything below it is unreachable', () => {
		// The reference export does exactly this: COND-001 K3 has no comparison at all.
		const withCatchAll: ConditionCase[] = [
			{ port: 'K1', when: [t( 'F' )] },
			{ port: 'K2' },
			{ port: 'K3', when: [t( 'T' )] },
		];
		expect( evaluateConditionCases( withCatchAll, true, answer ) ).toBe( 'K2' );
	} );

	it( 'stops asking once a case holds', () => {
		// Unlike the chain inside a case, cases DO short-circuit: a later case is a different
		// question, and asking it would let a game log a branch that was never taken.
		const spy = vi.fn( answer );
		evaluateConditionCases( cases, true, spy );
		expect( spy ).toHaveBeenCalledTimes( 2 );
	} );

	it( 'returns whatever port the case names, not a K-shaped guess', () => {
		const odd: ConditionCase[] = [{ port: 'some_port', when: [t( 'T' )] }];
		expect( evaluateConditionCases( odd, true, answer ) ).toBe( 'some_port' );
	} );
} );

describe( 'the dispatcher is gone', () => {

	// v1 had a third mode: `enableDispatcher` fired EVERY matching case at once, in parallel, with
	// `default` as the main track. Nothing in v2 turns it on, and nothing here can produce it.

	it( 'never returns more than one port', () => {
		const allTrue: ConditionCase[] = [
			{ port: 'K1', when: [t( 'T' )] },
			{ port: 'K2', when: [t( 'T' )] },
			{ port: 'K3', when: [t( 'T' )] },
		];
		const port = evaluateConditionCases( allTrue, true, answer );

		expect( typeof port ).toBe( 'string' );
		expect( port ).toBe( 'K1' );
	} );

	it( 'still lets a game SEE every case that holds, without routing to them', () => {
		// The need the dispatcher served is covered: read the results, then use isAsync on the
		// blocks you want running in parallel — where a reader of the graph can see it.
		const cases: ConditionCase[] = [
			{ port: 'K1', when: [t( 'T' )] },
			{ port: 'K2', when: [t( 'F' )] },
			{ port: 'K3' },
		];
		expect( evaluateEachCase( cases, answer ) ).toEqual( [true, false, true] );
	} );
} );

describe( 'evaluating each case for the handler', () => {

	it( 'returns one result per case, in order', () => {
		const cases: ConditionCase[] = [
			{ port: 'K1', when: [t( 'T' )] },
			{ port: 'K2', when: [t( 'F' )] },
		];
		expect( evaluateEachCase( cases, answer ) ).toEqual( [true, false] );
	} );

	it( 'returns nothing when there are no cases', () => {
		expect( evaluateEachCase( undefined, answer ) ).toEqual( [] );
		expect( evaluateEachCase( [], answer ) ).toEqual( [] );
	} );

	it( 'asks about every case, unlike routing', () => {
		const spy = vi.fn( answer );
		evaluateEachCase( [{ port: 'K1', when: [t( 'T' )] }, { port: 'K2', when: [t( 'T' )] }], spy );
		expect( spy ).toHaveBeenCalledTimes( 2 );
	} );
} );

describe( 'tagging the options of a choice', () => {

	const options: Option[] = [
		{ id: 'C1', key: 'k1' },
		{ id: 'C2', key: 'k2', when: [t( 'T' )] },
		{ id: 'C3', key: 'k3', when: [t( 'F' )] },
	];

	it( 'hands back EVERY option, tagged — never a shortened list', () => {
		const tagged = tagOptionVisibility( options, answer );

		expect( tagged.map( o => o.id ) ).toEqual( ['C1', 'C2', 'C3'] );
		expect( tagged.map( o => o.visible ) ).toEqual( [true, true, false] );
	} );

	it( 'treats an option with no when as offered', () => {
		expect( tagOptionVisibility( [{ id: 'C1', key: 'k' }], answer )[0]!.visible ).toBe( true );
	} );

	it( 'leaves visible undefined when no resolver is installed — unknown, not hidden', () => {
		const tagged = tagOptionVisibility( options, undefined );

		expect( tagged ).toHaveLength( 3 );
		expect( tagged.every( o => o.visible === undefined ) ).toBe( true );
	} );

	it( 'does not mutate the options it was given', () => {
		const before = JSON.stringify( options );
		tagOptionVisibility( options, answer );
		expect( JSON.stringify( options ) ).toBe( before );
	} );

	it( 'keeps the key and the text of each option', () => {
		const withText: Option[] = [{ id: 'C1', key: 'k1', text: { en: 'Hello' } }];
		const tagged = tagOptionVisibility( withText, answer );

		expect( tagged[0]!.key ).toBe( 'k1' );
		expect( tagged[0]!.text ).toEqual( { en: 'Hello' } );
	} );

	it( 'returns nothing for a block with no options', () => {
		expect( tagOptionVisibility( undefined, answer ) ).toEqual( [] );
	} );
} );

describe( 'the reserved choice dictionary', () => {

	it( 'recognises a test that reads a past answer', () => {
		expect( isChoiceTest( { dict: 'choice', entry: 'CHOICE-001', op: 'equals', value: 'C1' } ) )
			.toBe( true );
	} );

	it( 'leaves every project dictionary alone', () => {
		expect( isChoiceTest( t( 'T' ) ) ).toBe( false );
		expect( isChoiceTest( { dict: 'choices', entry: 'x', op: 'equals', value: 1 } ) ).toBe( false );
		expect( isChoiceTest( { dict: 'Choice', entry: 'x', op: 'equals', value: 1 } ) ).toBe( false );
	} );
} );
