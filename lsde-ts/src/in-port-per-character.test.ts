import { describe, it, expect } from 'vitest';
import { DialogueEngine } from './engine.js';
import type { Blueprints, Block, Card } from './types.js';
import { blueprint, scene as buildScene, dialog, card, whenCase, test as cond } from './test-builders.js';

const CARDS: Card[] = [card( 'l1', 'bran' ), card( 'l2', 'ada' )];

function payload(): Blueprints {
	const router: Block = {
		id: 'ROUTER-001', type: 'router', label: 'R',
		cases: [whenCase( 'K1', [cond( 'party', 'l1', true )] ), whenCase( 'K2', [cond( 'party', 'l2', true )] )],
		next: [
			{ port: 'K1', to: 'DIALOG-009', toPort: 'l1' },
			{ port: 'K2', to: 'DIALOG-009', toPort: 'l2' },
		],
	} as unknown as Block;

	const line = dialog( 'DIALOG-009', {
		actors: ['l1', 'l2'],
		props: { isAsync: true, inPortPerCharacter: true } as never,
	} );

	return blueprint( [buildScene( [router, line], { start: 'ROUTER-001' } )], { cards: CARDS } );
}

// The wire names the actor, and BOTH places that ask the game about a character must be told
// which one: the handler's context, and the `onValidateNextBlock` gate. Passing the entry port to
// only one of them is not a cosmetic slip — a game gating on "is this character here?" was
// answered about whichever actor the whole cast produced, which for a resolver written as
// `actors => actors[0]` is the FIRST one, every single pass.

describe( 'inPortPerCharacter — the entry port names the speaker', () => {
	it( 'offers the wired actor to onValidateNextBlock AND to the handler', () => {
		const gate: ( string | undefined )[] = [];
		const spoke: ( string | undefined )[] = [];

		const engine = new DialogueEngine();
		engine.init( { data: payload() } );
		engine.onResolveCondition( () => true );
		engine.onResolveCharacter( actors => actors[0] );
		engine.onValidateNextBlock( ( { nextBlock, nextContext } ) => {
			if ( nextBlock.id === 'DIALOG-009' ) gate.push( nextContext.character?.id );
			return { valid: true };
		} );
		engine.onChoice( ( { next } ) => next() );
		engine.onAction( ( { next } ) => next() );
		engine.onDialog( ( { context, next } ) => {
			spoke.push( context.character?.id );
			next();
		} );

		engine.scene( 's1' ).start();

		expect( spoke ).toEqual( ['l1', 'l2'] );
		expect( gate ).toEqual( ['l1', 'l2'] );
	} );
} );
