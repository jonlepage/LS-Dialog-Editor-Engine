// LSDE Dialog Engine — Public utilities
//
// Static helpers a game calls, never hooks the engine calls. Two things they now cover that v1
// could not: reading a line out of a separate locale file, and sorting a `props` bag into what the
// engine acts on and what belongs to the game.

import { describe, it, expect, beforeEach } from 'vitest';
import { LsdeUtils, type LocaleTable } from './lsde-utils.js';
import { dialog, choice, option, choiceTest, test as t } from './test-builders.js';

beforeEach( () => { LsdeUtils.locale = null; } );

describe( 'naming a block', () => {

	it( 'uses the label when an export carries one', () => {
		expect( LsdeUtils.getBlockLabel( dialog( 'DIALOG-007', { label: 'Vesk speaks' } ) ) )
			.toBe( 'Vesk speaks' );
	} );

	it( 'falls back to the designer note, which says more than a name would', () => {
		const note = 'Vesk se cache derrière le réservoir.';
		expect( LsdeUtils.getBlockLabel( dialog( 'DIALOG-007', { note } ) ) ).toBe( note );
	} );

	it( 'falls back to the id, which is already readable', () => {
		// This is why v2 needs no mandatory block name: DIALOG-007 beats a3f7c2e1-9b04-…
		expect( LsdeUtils.getBlockLabel( dialog( 'DIALOG-007' ) ) ).toBe( 'DIALOG-007' );
	} );
} );

describe( 'inline texts', () => {

	it( 'picks the locale the engine was set to', () => {
		LsdeUtils.locale = 'fr';
		const block = dialog( 'DIALOG-001', { text: { en: 'No sound.', fr: 'Pas de son.' } } );
		expect( LsdeUtils.getLocalizedText( block.text ) ).toBe( 'Pas de son.' );
	} );

	it( 'takes a locale override', () => {
		LsdeUtils.locale = 'fr';
		const block = dialog( 'DIALOG-001', { text: { en: 'No sound.', fr: 'Pas de son.' } } );
		expect( LsdeUtils.getLocalizedText( block.text, 'en' ) ).toBe( 'No sound.' );
	} );

	it( 'returns nothing for a locale the text does not carry', () => {
		LsdeUtils.locale = 'es';
		expect( LsdeUtils.getLocalizedText( { en: 'No sound.' } ) ).toBeUndefined();
	} );

	it( 'returns nothing when the block carries no text at all', () => {
		// The separate export mode: blocks hold structure only.
		LsdeUtils.locale = 'fr';
		expect( LsdeUtils.getLocalizedText( dialog( 'DIALOG-001' ).text ) ).toBeUndefined();
	} );

	it( 'throws when no locale was ever set', () => {
		expect( () => LsdeUtils.getLocalizedText( { en: 'x' } ) ).toThrow( /No locale set/ );
	} );

	it( 'hands the string over untouched, markers and all', () => {
		// `{{@a1}}`, `{:a2}`, `{|}`, `{{#ui.hud.label}}` are the GAME's markers in the GAME's keys.
		// The engine does not parse them, does not validate them, does not even see them.
		const raw = 'Ferme le {{#ui.hud.airlock_label}}, {{@a1}}.{|}{:a2}';
		expect( LsdeUtils.getLocalizedText( { en: raw }, 'en' ) ).toBe( raw );
	} );
} );

describe( 'texts kept in a separate locale file', () => {

	// The shape of `localization/<locale>/__blueprints__.json`. The game loads the file — the
	// engine does no IO, ever.
	const table: LocaleTable = {
		reactor_breach: {
			'DIALOG-001': 'Pas de son.',
			'CHOICE-001': { C1: 'Ton prix.', C2: 'Je ne descends pas.' },
		},
	};

	it( 'reads a line by scene and block', () => {
		expect( LsdeUtils.getTextFromTable( table, 'reactor_breach', 'DIALOG-001' ) )
			.toBe( 'Pas de son.' );
	} );

	it( 'reads one option of a choice', () => {
		expect( LsdeUtils.getTextFromTable( table, 'reactor_breach', 'CHOICE-001', 'C2' ) )
			.toBe( 'Je ne descends pas.' );
	} );

	it( 'returns nothing for a scene, block or option that is not there', () => {
		expect( LsdeUtils.getTextFromTable( table, 'docking_ring_brief', 'DIALOG-001' ) ).toBeUndefined();
		expect( LsdeUtils.getTextFromTable( table, 'reactor_breach', 'DIALOG-999' ) ).toBeUndefined();
		expect( LsdeUtils.getTextFromTable( table, 'reactor_breach', 'CHOICE-001', 'C9' ) ).toBeUndefined();
	} );

	it( 'does not hand back the block line when an option was asked for', () => {
		expect( LsdeUtils.getTextFromTable( table, 'reactor_breach', 'DIALOG-001', 'C1' ) ).toBeUndefined();
	} );

	it( 'does not hand back an option map when the line was asked for', () => {
		expect( LsdeUtils.getTextFromTable( table, 'reactor_breach', 'CHOICE-001' ) ).toBeUndefined();
	} );

	it( 'survives a table that was never loaded', () => {
		expect( LsdeUtils.getTextFromTable( undefined, 'reactor_breach', 'DIALOG-001' ) ).toBeUndefined();
	} );

	it( 'builds the key of a block and of one of its options', () => {
		const block = choice( 'CHOICE-001', [option( 'C1' )] );
		expect( LsdeUtils.getTextKey( block ) ).toBe( '__blueprints__.s1.CHOICE-001' );
		expect( LsdeUtils.getTextKey( block, 'C1' ) ).toBe( '__blueprints__.s1.CHOICE-001.C1' );
	} );
} );

describe( 'sorting the props bag', () => {

	// v2 puts natives and the designer's own properties in ONE bag, keyed by bare id. Ids cannot
	// collide: LSDE refuses a project property that takes a native name.
	const block = dialog( 'DIALOG-001', {
		props: {
			isAsync: true, delay: 1000, timeout: 5000, debug: true,
			portraitSide: 'left', typewriterSpeed: 60, journalEntry: 'note de scène',
		},
	} );

	it( 'pulls out what the engine acts on', () => {
		expect( LsdeUtils.getNativeProperties( block ) )
			.toEqual( { isAsync: true, delay: 1000, timeout: 5000, debug: true } );
	} );

	it( 'leaves the designer their own properties', () => {
		expect( LsdeUtils.getCustomProperties( block ) )
			.toEqual( { portraitSide: 'left', typewriterSpeed: 60, journalEntry: 'note de scène' } );
	} );

	it( 'reads delay and timeout as MILLISECONDS', () => {
		// They were SECONDS in v1, and nothing reports the change at runtime: a migrated project
		// turns a 3-second pause into 3 milliseconds.
		const natives = LsdeUtils.getNativeProperties( block );
		expect( natives.delay ).toBe( 1000 );
		expect( natives.timeout ).toBe( 5000 );
	} );

	it( 'handles a block with no props at all', () => {
		expect( LsdeUtils.getNativeProperties( dialog( 'DIALOG-002' ) ) ).toEqual( {} );
		expect( LsdeUtils.getCustomProperties( dialog( 'DIALOG-002' ) ) ).toEqual( {} );
	} );

	it( 'knows waitForBlocks is a native even though it holds a list', () => {
		const waiting = dialog( 'DIALOG-003', { props: { waitForBlocks: ['DIALOG-012'] as never } } );
		expect( LsdeUtils.getNativeProperties( waiting ).waitForBlocks ).toEqual( ['DIALOG-012'] );
		expect( LsdeUtils.getCustomProperties( waiting ) ).toEqual( {} );
	} );

	it( 'knows the nine natives and nothing else', () => {
		const all = dialog( 'DIALOG-004', {
			props: {
				isAsync: true, delay: 1, timeout: 2, waitInput: true, debug: true,
				portPerCharacter: true, skipIfMissingActor: true, portPerCase: true,
				waitForBlocks: ['X'] as never,
				somethingElse: 'mine',
			},
		} );
		expect( Object.keys( LsdeUtils.getNativeProperties( all ) ) ).toHaveLength( 9 );
		expect( LsdeUtils.getCustomProperties( all ) ).toEqual( { somethingElse: 'mine' } );
	} );
} );

describe( 'condition helpers', () => {

	it( 'recognises a test that reads a past answer', () => {
		expect( LsdeUtils.isChoiceCondition( choiceTest( 'CHOICE-001', 'C1' ) ) ).toBe( true );
		expect( LsdeUtils.isChoiceCondition( t( 'switches', 'door_unlocked', true ) ) ).toBe( false );
	} );

	it( 'names the CHOICE block a choice test reads', () => {
		expect( LsdeUtils.getChoiceConditionBlockId( choiceTest( 'CHOICE-001', 'C1' ) ) )
			.toBe( 'CHOICE-001' );
		expect( LsdeUtils.getChoiceConditionBlockId( t( 'switches', 'x', true ) ) ).toBeUndefined();
	} );

	it( 're-exposes the evaluation helpers', () => {
		const always = () => true;
		expect( LsdeUtils.evaluateConditionChain( undefined, always ) ).toBe( true );
		expect( LsdeUtils.evaluateConditionCases( [{ port: 'K1' }], true, always ) ).toBe( 'K1' );
		expect( LsdeUtils.evaluateEachCase( [{ port: 'K1' }], always ) ).toEqual( [true] );
		expect( LsdeUtils.tagOptionVisibility( [option( 'C1' )], always )[0]!.visible ).toBe( true );
	} );
} );

describe( 'type guards', () => {

	it( 'are re-exposed on the utility class', () => {
		expect( LsdeUtils.isDialogBlock( dialog( 'DIALOG-001' ) ) ).toBe( true );
		expect( LsdeUtils.isChoiceBlock( choice( 'CHOICE-001', [] ) ) ).toBe( true );
		expect( LsdeUtils.isDialogBlock( choice( 'CHOICE-001', [] ) ) ).toBe( false );
	} );
} );
