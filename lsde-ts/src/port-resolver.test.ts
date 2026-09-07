// LSDE Dialog Engine — Port resolution
//
// The one algorithm that must behave identically in all four runtimes. A divergence here does not
// throw: it sends a player down a branch the writer did not draw, and nothing says so. So this
// suite is exhaustive on purpose, and it is the reference the C#, C++ and GDScript ports copy.
//
// The v1 resolver routed on `fromPortIndex` — a position in a list. v2 routes on port names, and
// the difference is not cosmetic: an index is silently valid for the wrong wire, a name is not.

import { describe, it, expect } from 'vitest';
import { resolvePort } from './port-resolver.js';
import type { BlueprintBlock, Link } from './types.js';

function block( type: string ): BlueprintBlock {
	return { id: 'B-001', key: 'k', type } as BlueprintBlock;
}

function link( port: string, to: string ): Link {
	return { port, to, toPort: 'in' };
}

/** Where the resolved wires point, in order. */
function targets( result: { links: Link[] } ): string[] {
	return result.links.map( l => l.to );
}

describe( 'dialog', () => {

	const links = [link( 'out', 'NEXT' )];

	it( 'leaves by out', () => {
		expect( targets( resolvePort( { block: block( 'dialog' ), links } ) ) ).toEqual( ['NEXT'] );
	} );

	it( 'follows every wire on out, not just the first', () => {
		const forked = [link( 'out', 'A' ), link( 'out', 'B' )];
		expect( targets( resolvePort( { block: block( 'dialog' ), links: forked } ) ) )
			.toEqual( ['A', 'B'] );
	} );

	it( 'goes nowhere when out is unwired', () => {
		expect( resolvePort( { block: block( 'dialog' ), links: [] } ).links ).toEqual( [] );
	} );

	it( 'ignores wires on other ports', () => {
		const mixed = [link( 'then', 'WRONG' ), link( 'out', 'RIGHT' ), link( 'C1', 'WRONG' )];
		expect( targets( resolvePort( { block: block( 'dialog' ), links: mixed } ) ) )
			.toEqual( ['RIGHT'] );
	} );
} );

describe( 'dialog with portPerCharacter', () => {

	// The port is the actor's CARD ID — `var1`, `var2` — the same id `block.actors` lists.
	// Never an index: that is exactly what v1 got wrong.
	const links = [
		link( 'var1', 'KAEL_SPOKE' ),
		link( 'var2', 'NORA_SPOKE' ),
		link( 'out', 'ANYONE_ELSE' ),
	];

	it( 'follows the port named after the speaking actor', () => {
		expect( targets( resolvePort( { block: block( 'dialog' ), links, actorPort: 'var1' } ) ) )
			.toEqual( ['KAEL_SPOKE'] );
		expect( targets( resolvePort( { block: block( 'dialog' ), links, actorPort: 'var2' } ) ) )
			.toEqual( ['NORA_SPOKE'] );
	} );

	it( 'falls back to out for an actor with no port of its own', () => {
		expect( targets( resolvePort( { block: block( 'dialog' ), links, actorPort: 'var9' } ) ) )
			.toEqual( ['ANYONE_ELSE'] );
	} );

	it( 'goes nowhere when neither the actor port nor out is wired', () => {
		const only = [link( 'var1', 'KAEL' )];
		expect( resolvePort( { block: block( 'dialog' ), links: only, actorPort: 'var2' } ).links )
			.toEqual( [] );
	} );

	it( 'uses out when no actor was resolved at all', () => {
		expect( targets( resolvePort( { block: block( 'dialog' ), links } ) ) )
			.toEqual( ['ANYONE_ELSE'] );
	} );

	it( 'does not mistake an actor id for a look-alike port name', () => {
		const tricky = [link( 'var1', 'RIGHT' ), link( 'var10', 'WRONG' )];
		expect( targets( resolvePort( { block: block( 'dialog' ), links: tricky, actorPort: 'var1' } ) ) )
			.toEqual( ['RIGHT'] );
	} );
} );

describe( 'choice', () => {

	// An option's id IS its port. There is no `out` on a choice block.
	const links = [link( 'C1', 'ASKED' ), link( 'C2', 'REFUSED' ), link( 'C3', 'HAGGLED' )];

	it( 'leaves by the id of the option the player picked', () => {
		expect( targets( resolvePort( { block: block( 'choice' ), links, selectedOptionId: 'C2' } ) ) )
			.toEqual( ['REFUSED'] );
	} );

	it( 'goes nowhere until an option is picked', () => {
		expect( resolvePort( { block: block( 'choice' ), links } ).links ).toEqual( [] );
	} );

	it( 'goes nowhere for an option the designer left unwired', () => {
		expect( resolvePort( { block: block( 'choice' ), links, selectedOptionId: 'C4' } ).links )
			.toEqual( [] );
	} );

	it( 'never falls back to out — a choice has no such port', () => {
		const withOut = [...links, link( 'out', 'MUST_NOT_BE_TAKEN' )];
		expect( resolvePort( { block: block( 'choice' ), links: withOut, selectedOptionId: 'C9' } ).links )
			.toEqual( [] );
	} );

	it( 'follows every wire on the picked option', () => {
		const forked = [link( 'C1', 'A' ), link( 'C1', 'B' )];
		expect( targets( resolvePort( { block: block( 'choice' ), links: forked, selectedOptionId: 'C1' } ) ) )
			.toEqual( ['A', 'B'] );
	} );
} );

describe( 'condition', () => {

	// Which port the cases picked was decided by the evaluator. This function only finds it.
	const ifMode = [link( 'out', 'TRUE_BRANCH' ), link( 'default', 'FALSE_BRANCH' )];
	const switchMode = [
		link( 'K1', 'CASE_1' ), link( 'K2', 'CASE_2' ), link( 'default', 'NO_CASE' ),
	];

	it( 'takes out as the true exit in if mode', () => {
		expect( targets( resolvePort( { block: block( 'condition' ), links: ifMode, conditionPort: 'out' } ) ) )
			.toEqual( ['TRUE_BRANCH'] );
	} );

	it( 'takes default as the false exit in if mode', () => {
		expect( targets( resolvePort( { block: block( 'condition' ), links: ifMode, conditionPort: 'default' } ) ) )
			.toEqual( ['FALSE_BRANCH'] );
	} );

	it( 'takes the case port with portPerCase', () => {
		expect( targets( resolvePort( { block: block( 'condition' ), links: switchMode, conditionPort: 'K2' } ) ) )
			.toEqual( ['CASE_2'] );
	} );

	it( 'takes default when no case matched', () => {
		expect( targets( resolvePort( { block: block( 'condition' ), links: switchMode, conditionPort: 'default' } ) ) )
			.toEqual( ['NO_CASE'] );
	} );

	it( 'goes nowhere when nothing decided a port', () => {
		expect( resolvePort( { block: block( 'condition' ), links: ifMode } ).links ).toEqual( [] );
	} );

	it( 'does NOT fall back to default for a case port left unwired', () => {
		// `default` means "no case matched". A case that matched but was never wired ends the
		// flow, like any other unwired exit — sending it to default would play a branch the
		// writer explicitly did not draw.
		expect( resolvePort( { block: block( 'condition' ), links: switchMode, conditionPort: 'K3' } ).links )
			.toEqual( [] );
	} );

	it( 'has no true/false ports left', () => {
		// v1 named them `true` and `false`. A payload still carrying those resolves to nothing.
		const v1 = [link( 'true', 'OLD_TRUE' ), link( 'false', 'OLD_FALSE' )];
		expect( resolvePort( { block: block( 'condition' ), links: v1, conditionPort: 'out' } ).links )
			.toEqual( [] );
	} );
} );

describe( 'action', () => {

	const both = [link( 'then', 'SUCCEEDED' ), link( 'catch', 'FAILED' )];

	it( 'leaves by then when the calls went through', () => {
		expect( targets( resolvePort( { block: block( 'action' ), links: both } ) ) )
			.toEqual( ['SUCCEEDED'] );
	} );

	it( 'leaves by catch when a call failed', () => {
		expect( targets( resolvePort( { block: block( 'action' ), links: both, actionRejected: true } ) ) )
			.toEqual( ['FAILED'] );
	} );

	it( 'falls back to then on failure when no catch is wired', () => {
		// The writer who drew no error branch meant the flow to carry on. Stopping the scene on
		// an unhandled failure would strand the player mid-dialogue.
		const noCatch = [link( 'then', 'CARRY_ON' )];
		expect( targets( resolvePort( { block: block( 'action' ), links: noCatch, actionRejected: true } ) ) )
			.toEqual( ['CARRY_ON'] );
	} );

	it( 'goes nowhere on failure when neither port is wired', () => {
		expect( resolvePort( { block: block( 'action' ), links: [], actionRejected: true } ).links )
			.toEqual( [] );
	} );

	it( 'ignores catch on success', () => {
		expect( targets( resolvePort( { block: block( 'action' ), links: both, actionRejected: false } ) ) )
			.toEqual( ['SUCCEEDED'] );
	} );

	it( 'has no out port', () => {
		const wrong = [link( 'out', 'MUST_NOT_BE_TAKEN' )];
		expect( resolvePort( { block: block( 'action' ), links: wrong } ).links ).toEqual( [] );
	} );
} );

describe( 'note', () => {

	it( 'hands back every wire — the traversal steps over the note itself', () => {
		const links = [link( 'out', 'A' ), link( 'anything', 'B' )];
		expect( targets( resolvePort( { block: block( 'note' ), links } ) ) ).toEqual( ['A', 'B'] );
	} );
} );

describe( 'shape of the result', () => {

	it( 'never returns a wire that was not given to it', () => {
		const links = [link( 'out', 'A' )];
		const result = resolvePort( { block: block( 'dialog' ), links } );
		expect( result.links.every( l => links.includes( l ) ) ).toBe( true );
	} );

	it( 'does not mutate the links it was given', () => {
		const links = [link( 'out', 'A' ), link( 'C1', 'B' )];
		const before = JSON.stringify( links );
		resolvePort( { block: block( 'dialog' ), links } );
		expect( JSON.stringify( links ) ).toBe( before );
	} );

	it( 'returns nothing for a block type it does not know', () => {
		expect( resolvePort( { block: block( 'sometype' ), links: [link( 'out', 'A' )] } ).links )
			.toEqual( [] );
	} );
} );
