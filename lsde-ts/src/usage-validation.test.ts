// LSDE Dialog Engine — init() checks what the BLOCKS use, not only the tables the header declares
//
// An export carries two kinds of facts: the tables it declares (functions, dictionaries, cards) and
// what its blocks actually use (calls, arguments, condition tests). init() compared the first kind
// against the game, when the game asked it to, and never read the second at all. A call to a
// function the export does not declare — a v1 id left behind in the project — loaded without a word
// and failed in game.
//
// These warnings are ALWAYS on. No `check` is needed: the export contradicts itself, whatever the
// game knows. They are warnings and not errors because the scene still plays; only the call or the
// test that names nothing goes wrong.
//
// The codes say UNDECLARED, not UNKNOWN, on purpose: UNKNOWN_FUNCTION and UNKNOWN_DICTIONARY* already
// exist and mean "the GAME does not know it". These mean "the EXPORT does not declare it".

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateBlueprint } from './validator.js';
import type { Blueprints, Block, FunctionDefinition, DiagnosticEntry } from './types.js';
import {
	blueprint, scene, dialog, choice, option, condition, router, action,
	whenCase, test as cond, choiceTest, dictionary, call,
} from './test-builders.js';

// ─── Harness ─────────────────────────────────────────────────────────────────

const FUNCTIONS = [
	{ id: 'play_music', params: [{ name: 'track', type: 'string' }, { name: 'loop', type: 'boolean' }] },
	{ id: 'add_item', params: [{ name: 'item', type: 'dictionaryKey', dictionary: 'items' }, { name: 'count', type: 'number' }] },
	// A parameter picked in a dictionary the export does not declare at all.
	{ id: 'set_flag', params: [{ name: 'flag', type: 'dictionaryKey', dictionary: 'flags' }] },
] as FunctionDefinition[];

function exportOf( ...scenes: Array<{ blocks: Block[]; path?: string }> ): Blueprints {
	return blueprint(
		scenes.map( ( s, i ) => scene( s.blocks, { scene: s.path ?? 's1', id: `sc_test000${ i + 1 }` } ) ),
		{
			functions: FUNCTIONS,
			dictionaries: [
				dictionary( 'switches', ['door_unlocked'] ),
				dictionary( 'items', ['keycard', 'ration'], 'number' ),
			],
		},
	);
}

/** The warnings init() reports for one scene. A payload in these suites never has an error. */
function warningsOf( blocks: Block[] ): DiagnosticEntry[] {
	const report = validateBlueprint( { data: exportOf( { blocks } ) } );
	expect( report.errors ).toEqual( [] );
	return report.warnings;
}

function codesOf( blocks: Block[] ): string[] {
	return warningsOf( blocks ).map( w => w.code );
}

// ─── What an action calls ────────────────────────────────────────────────────

describe( 'init() reads what an action calls', () => {

	it( 'declared functions with declared arguments warn about nothing', () => {
		expect( codesOf( [action( 'ACTION-001', [
			call( 'play_music', { track: 'theme', loop: true } ),
			call( 'add_item', { item: 'keycard', count: 1 } ),
		] )] ) ).toEqual( [] );
	} );

	it( 'EMPTY_FUNCTION — a call nobody picked a function for', () => {
		expect( codesOf( [action( 'ACTION-001', [call( '' )] )] ) ).toEqual( ['EMPTY_FUNCTION'] );
	} );

	it( 'UNDECLARED_FUNCTION — a call to a function the export does not declare, named and located', () => {
		const warnings = warningsOf( [action( 'ACTION-001', [call( 'f3b1c2d4-v1-uuid', { track: 'x' } )] )] );

		expect( warnings.map( w => w.code ) ).toEqual( ['UNDECLARED_FUNCTION'] );
		expect( warnings[0]!.sceneId ).toBe( 'sc_test0001' );
		expect( warnings[0]!.scenePath ).toBe( 's1' );
		expect( warnings[0]!.blockId ).toBe( 'ACTION-001' );
		expect( warnings[0]!.message ).toContain( 'f3b1c2d4-v1-uuid' );
	} );

	it( 'an undeclared function says nothing about its arguments — nobody knows what they should be', () => {
		expect( codesOf( [action( 'ACTION-001', [call( 'missing', { a: 1, b: 2 } )] )] ) ).toEqual( ['UNDECLARED_FUNCTION'] );
	} );

	it( 'UNDECLARED_ARGUMENT — an argument the function does not have, named', () => {
		const warnings = warningsOf( [action( 'ACTION-001', [call( 'play_music', { track: 'theme', volume: 3 } )] )] );

		expect( warnings.map( w => w.code ) ).toEqual( ['UNDECLARED_ARGUMENT'] );
		expect( warnings[0]!.message ).toContain( 'volume' );
	} );

	it( 'UNDECLARED_DICTIONARY_KEY — a dictionaryKey argument that is not an entry of its dictionary', () => {
		const warnings = warningsOf( [action( 'ACTION-001', [call( 'add_item', { item: 'plasma_cell', count: 1 } )] )] );

		expect( warnings.map( w => w.code ) ).toEqual( ['UNDECLARED_DICTIONARY_KEY'] );
		expect( warnings[0]!.message ).toContain( 'plasma_cell' );
	} );

	it( 'UNDECLARED_DICTIONARY_KEY — a dictionaryKey argument whose dictionary is not declared', () => {
		expect( codesOf( [action( 'ACTION-001', [call( 'set_flag', { flag: 'faction' } )] )] ) ).toEqual( ['UNDECLARED_DICTIONARY_KEY'] );
	} );

	it( 'one warning per occurrence', () => {
		expect( codesOf( [action( 'ACTION-001', [
			call( 'missing_one' ),
			call( 'missing_two' ),
		] )] ) ).toEqual( ['UNDECLARED_FUNCTION', 'UNDECLARED_FUNCTION'] );
	} );

} );

// ─── What a condition tests ──────────────────────────────────────────────────

describe( 'init() reads what a condition tests', () => {

	it( 'a declared dictionary and entry warn about nothing', () => {
		expect( codesOf( [condition( 'COND-001', [whenCase( 'out', [cond( 'switches', 'door_unlocked', true )] )] )] ) ).toEqual( [] );
	} );

	it( 'UNDECLARED_DICTIONARY — a test on a dictionary the export does not declare, named and located', () => {
		const warnings = warningsOf( [condition( 'COND-001', [whenCase( 'out', [cond( 'party', 'size', 3 )] )] )] );

		expect( warnings.map( w => w.code ) ).toEqual( ['UNDECLARED_DICTIONARY'] );
		expect( warnings[0]!.blockId ).toBe( 'COND-001' );
		expect( warnings[0]!.message ).toContain( 'party' );
	} );

	it( 'UNDECLARED_ENTRY — a test on an entry its dictionary does not declare', () => {
		const warnings = warningsOf( [condition( 'COND-001', [whenCase( 'out', [cond( 'switches', 'door_open', true )] )] )] );

		expect( warnings.map( w => w.code ) ).toEqual( ['UNDECLARED_ENTRY'] );
		expect( warnings[0]!.message ).toContain( 'door_open' );
	} );

	it( 'reads the cases of a router too', () => {
		expect( codesOf( [router( 'ROUTER-001', [whenCase( 'K1', [cond( 'party', 'size', 3 )] )] )] ) ).toEqual( ['UNDECLARED_DICTIONARY'] );
	} );

	it( 'reads the conditions of a choice option too', () => {
		expect( codesOf( [choice( 'CHOICE-001', [option( 'C1', { when: [cond( 'switches', 'door_open', true )] } )] )] ) )
			.toEqual( ['UNDECLARED_ENTRY'] );
	} );

} );

// ─── The reserved `choice` dictionary ────────────────────────────────────────

describe( 'init() reads a test on the reserved choice dictionary', () => {

	const theChoice = () => choice( 'CHOICE-001', [option( 'C1' ), option( 'C2' )] );

	it( 'a CHOICE block of this scene and one of its options warn about nothing', () => {
		expect( codesOf( [
			theChoice(),
			condition( 'COND-001', [whenCase( 'out', [choiceTest( 'CHOICE-001', 'C2' )] )] ),
		] ) ).toEqual( [] );
	} );

	it( 'UNKNOWN_CHOICE_BLOCK — the entry is not a block of this scene', () => {
		expect( codesOf( [condition( 'COND-001', [whenCase( 'out', [choiceTest( 'CHOICE-404', 'C1' )] )] )] ) )
			.toEqual( ['UNKNOWN_CHOICE_BLOCK'] );
	} );

	it( 'UNKNOWN_CHOICE_BLOCK — the entry is a block, but not a CHOICE', () => {
		expect( codesOf( [
			dialog( 'DIALOG-001' ),
			condition( 'COND-001', [whenCase( 'out', [choiceTest( 'DIALOG-001', 'C1' )] )] ),
		] ) ).toEqual( ['UNKNOWN_CHOICE_BLOCK'] );
	} );

	it( 'UNKNOWN_CHOICE_BLOCK — a CHOICE of ANOTHER scene: the memory starts and ends with the scene', () => {
		const report = validateBlueprint( { data: exportOf(
			{ path: 'first', blocks: [theChoice()] },
			{ path: 'second', blocks: [condition( 'COND-001', [whenCase( 'out', [choiceTest( 'CHOICE-001', 'C1' )] )] )] },
		) } );

		expect( report.warnings.map( w => w.code ) ).toEqual( ['UNKNOWN_CHOICE_BLOCK'] );
		expect( report.warnings[0]!.sceneId ).toBe( 'sc_test0002' );
		expect( report.warnings[0]!.scenePath ).toBe( 'second' );
	} );

	it( 'UNKNOWN_CHOICE_OPTION — an option that block does not have', () => {
		expect( codesOf( [
			theChoice(),
			condition( 'COND-001', [whenCase( 'out', [choiceTest( 'CHOICE-001', 'C9' )] )] ),
		] ) ).toEqual( ['UNKNOWN_CHOICE_OPTION'] );
	} );

} );

// ─── A real export ───────────────────────────────────────────────────────────

describe( 'init() on the reference export', () => {

	const repoRoot = resolve( dirname( fileURLToPath( import.meta.url ) ), '../..' );
	const load = ( relative: string ) => JSON.parse( readFileSync( resolve( repoRoot, relative ), 'utf-8' ) ) as Blueprints;

	it( 'the single-file export warns about nothing — the rules make no noise on what LSDE writes', () => {
		const report = validateBlueprint( { data: load( 'mock/blueprints/Engine-Conformance-Scene.blueprints.json' ) } );

		expect( report.errors ).toEqual( [] );
		expect( report.warnings ).toEqual( [] );
	} );

	it( 'the per-scene files warn about nothing either', () => {
		const report = validateBlueprint( { data: [
			load( 'mock/all/blueprints/Engine-Conformance-Scene.blueprints.reactor_breach.json' ),
			load( 'mock/all/blueprints/Engine-Conformance-Scene.blueprints.docking_ring_brief.json' ),
		] } );

		expect( report.errors ).toEqual( [] );
		expect( report.warnings ).toEqual( [] );
	} );

} );
