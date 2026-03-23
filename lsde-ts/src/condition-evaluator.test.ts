import { describe, it, expect } from 'vitest';
import { evaluateConditionChain, filterVisibleChoices } from './condition-evaluator.js';
import type { ExportCondition, ChoiceItem } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cond( key: string, chain?: '|' | '&' ): ExportCondition {
	return { uuid: key, key, operator: '=', value: 'true', chain };
}

/** Evaluator that returns true if key starts with 't', false otherwise. */
function evaluator( c: ExportCondition ): boolean {
	return c.key.startsWith( 't' );
}

// ─── evaluateConditionChain ──────────────────────────────────────────────────

describe( 'evaluateConditionChain', () => {

	it( 'returns true for empty conditions', () => {
		expect( evaluateConditionChain( [], evaluator ) ).toBe( true );
	} );

	it( 'returns evaluator result for single condition', () => {
		expect( evaluateConditionChain( [cond( 'true1' )], evaluator ) ).toBe( true );
		expect( evaluateConditionChain( [cond( 'false1' )], evaluator ) ).toBe( false );
	} );

	it( 'AND: true & true = true', () => {
		expect( evaluateConditionChain(
			[cond( 'true1' ), cond( 'true2', '&' )],
			evaluator,
		) ).toBe( true );
	} );

	it( 'AND: true & false = false', () => {
		expect( evaluateConditionChain(
			[cond( 'true1' ), cond( 'false1', '&' )],
			evaluator,
		) ).toBe( false );
	} );

	it( 'OR: false | true = true', () => {
		expect( evaluateConditionChain(
			[cond( 'false1' ), cond( 'true1', '|' )],
			evaluator,
		) ).toBe( true );
	} );

	it( 'OR: false | false = false', () => {
		expect( evaluateConditionChain(
			[cond( 'false1' ), cond( 'false2', '|' )],
			evaluator,
		) ).toBe( false );
	} );

	it( 'left-to-right: true & false | true = (true AND false) OR true = true', () => {
		expect( evaluateConditionChain(
			[cond( 'true1' ), cond( 'false1', '&' ), cond( 'true2', '|' )],
			evaluator,
		) ).toBe( true );
	} );

	it( 'left-to-right: true | false & false = (true OR false) AND false = false', () => {
		expect( evaluateConditionChain(
			[cond( 'true1' ), cond( 'false1', '|' ), cond( 'false2', '&' )],
			evaluator,
		) ).toBe( false );
	} );

	it( 'defaults to AND when chain is undefined on non-first condition', () => {
		expect( evaluateConditionChain(
			[cond( 'true1' ), cond( 'false1' )], // no chain on 2nd
			evaluator,
		) ).toBe( false );
	} );

} );

// ─── filterVisibleChoices ────────────────────────────────────────────────────

describe( 'filterVisibleChoices', () => {

	const baseChoice: ChoiceItem = { uuid: 'c1', structureKey: 'c1' };

	it( 'keeps choices with no visibilityConditions', () => {
		const choices = [baseChoice, { ...baseChoice, uuid: 'c2', structureKey: 'c2' }];
		expect( filterVisibleChoices( choices, evaluator ) ).toHaveLength( 2 );
	} );

	it( 'keeps choices with empty visibilityConditions', () => {
		const choices: ChoiceItem[] = [{ ...baseChoice, visibilityConditions: [] }];
		expect( filterVisibleChoices( choices, evaluator ) ).toHaveLength( 1 );
	} );

	it( 'filters out choices with failing conditions', () => {
		const choices: ChoiceItem[] = [
			{ ...baseChoice, uuid: 'visible', structureKey: 'v', visibilityConditions: [cond( 'true1' )] },
			{ ...baseChoice, uuid: 'hidden', structureKey: 'h', visibilityConditions: [cond( 'false1' )] },
		];
		const visible = filterVisibleChoices( choices, evaluator );
		expect( visible ).toHaveLength( 1 );
		expect( visible[0]!.uuid ).toBe( 'visible' );
	} );

	it( 'evaluates chained conditions on choices', () => {
		const choices: ChoiceItem[] = [
			{
				...baseChoice,
				visibilityConditions: [cond( 'false1' ), cond( 'true1', '|' )], // false OR true = true
			},
		];
		expect( filterVisibleChoices( choices, evaluator ) ).toHaveLength( 1 );
	} );

} );
