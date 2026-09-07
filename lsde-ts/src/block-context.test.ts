// LSDE Dialog Engine — Block contexts
//
// A context is what a handler is handed alongside its block. Two v2 changes live here and both
// are load-bearing: actors are card IDS resolved through the export's table, and the emotion
// belongs to the BLOCK rather than to each speaker.

import { describe, it, expect } from 'vitest';
import {
	createDialogContext, createChoiceContext, createConditionContext, createActionContext,
	resolveCards,
} from './block-context.js';
import type { Card, RuntimeChoiceItem, RuntimeConditionCase } from './types.js';
import { dialog, choice, condition, action, option, card, call, whenCase, test as t } from './test-builders.js';

const CARDS: Record<string, Card> = {
	var1: card( 'var1', 'kael' ),
	var2: card( 'var2', 'nora' ),
	var7: card( 'var7', 'afraid', 'emotions' ),
};
const lookup = ( id: string ): Card | undefined => CARDS[id];
const firstActor = ( actors: Card[] ): Card | undefined => actors[0];

describe( 'resolving the cards a block cites', () => {

	it( 'turns actor ids into cards, in file order', () => {
		const block = dialog( 'DIALOG-001', { actors: ['var2', 'var1'] } );
		expect( resolveCards( block, lookup, undefined ).actors.map( c => c.name ) )
			.toEqual( ['nora', 'kael'] );
	} );

	it( 'resolves the emotion of the BLOCK, not of a speaker', () => {
		// In v1 each character carried its own emotion, so two actors saying one sentence meant
		// writing the same feeling twice — free to drift apart by accident. One line, one tone.
		const block = dialog( 'DIALOG-003', { actors: ['var1', 'var2'], emotion: 'var7', intensity: 60 } );
		const cards = resolveCards( block, lookup, undefined );

		expect( cards.actors.map( c => c.name ) ).toEqual( ['kael', 'nora'] );
		expect( cards.emotion?.name ).toBe( 'afraid' );
	} );

	it( 'has no emotion when the writer set none', () => {
		expect( resolveCards( dialog( 'DIALOG-001' ), lookup, undefined ).emotion ).toBeUndefined();
	} );

	it( 'drops an id with no card rather than reporting it', () => {
		// A payload citing a card outside its own tables is an exporter bug, and mid-traversal is
		// not where a game should hear about it. init() is.
		const block = dialog( 'DIALOG-001', { actors: ['var1', 'var99'] } );
		expect( resolveCards( block, lookup, undefined ).actors.map( c => c.id ) ).toEqual( ['var1'] );
	} );

	it( 'lets the game pick which actor is speaking', () => {
		const block = dialog( 'DIALOG-001', { actors: ['var1', 'var2'] } );
		const pickLast = ( actors: Card[] ): Card | undefined => actors[actors.length - 1];

		expect( resolveCards( block, lookup, pickLast ).character?.name ).toBe( 'nora' );
	} );

	it( 'has no character when no resolver is installed', () => {
		const block = dialog( 'DIALOG-001', { actors: ['var1'] } );
		expect( resolveCards( block, lookup, undefined ).character ).toBeUndefined();
	} );

	it( 'lets the game answer that nobody can carry the line', () => {
		const block = dialog( 'DIALOG-001', { actors: ['var1'] } );
		expect( resolveCards( block, lookup, () => undefined ).character ).toBeUndefined();
	} );
} );

describe( 'dialog context', () => {

	const block = dialog( 'DIALOG-001', { actors: ['var1', 'var2'], emotion: 'var7', intensity: 60 } );
	const cards = resolveCards( block, lookup, firstActor );

	it( 'carries the whole cast, not just the one who speaks', () => {
		const ctx = createDialogContext( block, cards );

		expect( ctx.actors.map( c => c.name ) ).toEqual( ['kael', 'nora'] );
		expect( ctx.character?.name ).toBe( 'kael' );
	} );

	it( 'carries the emotion and its intensity', () => {
		const ctx = createDialogContext( block, cards );

		expect( ctx.emotion?.name ).toBe( 'afraid' );
		expect( ctx.intensity ).toBe( 60 );
	} );

	it( 'takes a CARD ID for the actor port, never an index', () => {
		const ctx = createDialogContext( block, cards );
		ctx.resolveCharacterPort( 'var2' );
		expect( ctx._actorPort ).toBe( 'var2' );
	} );

	it( 'ignores a card the block does not cite', () => {
		const ctx = createDialogContext( block, cards );
		ctx.resolveCharacterPort( 'var9' );
		expect( ctx._actorPort ).toBeUndefined();
	} );

	it( 'starts with no actor port, so the flow leaves by out', () => {
		expect( createDialogContext( block, cards )._actorPort ).toBeUndefined();
	} );

	it( 'preventGlobalHandler sets the flag', () => {
		const ctx = createDialogContext( block, cards );
		expect( ctx._globalPrevented ).toBe( false );
		ctx.preventGlobalHandler();
		expect( ctx._globalPrevented ).toBe( true );
	} );
} );

describe( 'choice context', () => {

	const block = choice( 'CHOICE-001', [option( 'C1' ), option( 'C2' )], { actors: ['var1'] } );
	const cards = resolveCards( block, lookup, firstActor );
	const tagged: RuntimeChoiceItem[] = [
		{ id: 'C1', key: 'k1', visible: true },
		{ id: 'C2', key: 'k2', visible: false },
	];

	it( 'exposes every option, tagged, in order', () => {
		const ctx = createChoiceContext( block, cards, tagged, undefined );

		expect( ctx.options.map( o => o.id ) ).toEqual( ['C1', 'C2'] );
		expect( ctx.options.map( o => o.visible ) ).toEqual( [true, false] );
	} );

	it( 'records the option id, which is also its exit port', () => {
		const ctx = createChoiceContext( block, cards, tagged, undefined );
		ctx.selectChoice( 'C2' );
		expect( ctx._selectedOptionId ).toBe( 'C2' );
	} );

	it( 'reports the pick to the scene, with the block id', () => {
		const seen: Array<[string, string]> = [];
		const ctx = createChoiceContext( block, cards, tagged, ( b, o ) => { seen.push( [b, o] ); } );
		ctx.selectChoice( 'C1' );

		expect( seen ).toEqual( [['CHOICE-001', 'C1']] );
	} );

	it( 'records a pick even for an option that does not exist', () => {
		// The history is what the reserved `choice` dictionary reads back. Dropping an answer here
		// would make a later condition lie about what the player did.
		const seen: Array<[string, string]> = [];
		const ctx = createChoiceContext( block, cards, tagged, ( b, o ) => { seen.push( [b, o] ); } );
		ctx.selectChoice( 'C9' );

		expect( seen ).toEqual( [['CHOICE-001', 'C9']] );
		expect( ctx._selectedOptionId ).toBe( 'C9' );
	} );

	it( 'starts with nothing picked', () => {
		expect( createChoiceContext( block, cards, tagged, undefined )._selectedOptionId )
			.toBeUndefined();
	} );

	it( 'carries the cast and the emotion like every other block', () => {
		const ctx = createChoiceContext( block, cards, tagged, undefined );
		expect( ctx.actors.map( c => c.name ) ).toEqual( ['kael'] );
	} );
} );

describe( 'condition context', () => {

	const block = condition( 'COND-001', [whenCase( 'K1', [t( 'switches', 'x', true )] ), whenCase( 'K2' )] );
	const cards = resolveCards( block, lookup, firstActor );
	const cases: RuntimeConditionCase[] = [
		{ port: 'K1', result: false },
		{ port: 'K2', result: true },
	];

	it( 'exposes the cases with their ports and results', () => {
		const ctx = createConditionContext( block, cards, cases );

		expect( ctx.cases.map( c => c.port ) ).toEqual( ['K1', 'K2'] );
		expect( ctx.cases.map( c => c.result ) ).toEqual( [false, true] );
	} );

	it( 'takes a PORT NAME to override the routing', () => {
		// v1 took boolean | number | number[] — three shapes for one method, the third being the
		// dispatcher. A condition picks one path, so it takes one port.
		const ctx = createConditionContext( block, cards, cases );
		ctx.resolve( 'K2' );
		expect( ctx._conditionPort ).toBe( 'K2' );
	} );

	it( 'starts with no override, so what the cases said stands', () => {
		expect( createConditionContext( block, cards, cases )._conditionPort ).toBeUndefined();
	} );

	it( 'accepts default as an override like any other port', () => {
		const ctx = createConditionContext( block, cards, cases );
		ctx.resolve( 'default' );
		expect( ctx._conditionPort ).toBe( 'default' );
	} );
} );

describe( 'action context', () => {

	const block = action( 'ACTION-001', [call( 'play_music', { track: 'reactor_theme' } )] );
	const cards = resolveCards( block, lookup, firstActor );

	it( 'exposes the calls with their arguments BY NAME', () => {
		const ctx = createActionContext( block, cards );

		expect( ctx.calls ).toHaveLength( 1 );
		expect( ctx.calls[0]!.fn ).toBe( 'play_music' );
		expect( ctx.calls[0]!.args ).toEqual( { track: 'reactor_theme' } );
	} );

	it( 'exposes an empty list for a block with no calls', () => {
		expect( createActionContext( action( 'ACTION-002' ), cards ).calls ).toEqual( [] );
	} );

	it( 'starts as succeeded, so the flow leaves by then', () => {
		expect( createActionContext( block, cards )._actionRejected ).toBe( false );
	} );

	it( 'reject marks the failure, so the flow leaves by catch', () => {
		const ctx = createActionContext( block, cards );
		ctx.reject( new Error( 'boom' ) );
		expect( ctx._actionRejected ).toBe( true );
	} );

	it( 'resolve after reject puts it back to succeeded', () => {
		const ctx = createActionContext( block, cards );
		ctx.reject( new Error( 'boom' ) );
		ctx.resolve();
		expect( ctx._actionRejected ).toBe( false );
	} );
} );
