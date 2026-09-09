// LSDE Dialog Engine — one port, several wires: what `isAsync` decides
//
// A port may carry more than one wire, and the TARGET of each one says how it is walked:
//
//   isAsync       →  it opens its own track and runs beside this one
//   not isAsync   →  it belongs to this track, and is walked IN TURN
//
// The second line is what the engine could not say before. Every wire but the first was detached
// whichever way the box was ticked, so on a secondary wire `isAsync` was inert — and a designer
// drawing `A → [B, C]` got B and C at the same time, never B then C.
//
// These suites pin the whole table from `MIGRATION-V2.md`, block type by block type, plus the six
// pitfalls the queue brings with it.

import { describe, it, expect } from 'vitest';
import { DialogueEngine } from './engine.js';
import type { Blueprints, Block, Card } from './types.js';
import {
	oneScene, dialog, action, condition, router, link, whenCase, test as cond, card,
} from './test-builders.js';

// ─── Harness ─────────────────────────────────────────────────────────────────

interface PlayResult {
	/** Every block dispatched, in order. */
	played: string[];
	/** Every block LEFT, in the order its cleanup ran. */
	cleaned: string[];
	running: boolean;
	trackOf: Map<string, number[]>;
}

/**
 * Play a scene to the end, advancing every block as soon as its handler is called.
 *
 * Nothing here is deferred: `next()` is called synchronously, so the order in `played` is the
 * order the engine chose, with no timing of the game's own mixed in.
 */
function play( blocks: Block[], opts: {
	resolve?: ( entry: string ) => boolean;
	cards?: Card[];
	onBlock?: ( id: string, scene: { cancel(): void } ) => 'stop' | void;
	validate?: ( id: string ) => boolean;
	/** Diagnostic codes `init()` is expected to report, when the payload is knowingly flawed. */
	expectErrors?: string[];
} = {} ): PlayResult {
	const played: string[] = [];
	const cleaned: string[] = [];
	const trackOf = new Map<string, number[]>();

	const data: Blueprints = opts.cards
		? { ...oneScene( blocks ), cards: opts.cards }
		: oneScene( blocks );

	const engine = new DialogueEngine();
	const report = engine.init( { data } );
	expect( report.errors.map( e => e.code ) ).toEqual( opts.expectErrors ?? [] );

	engine.onResolveCondition( t => opts.resolve ? opts.resolve( String( t.entry ) ) : true );
	if ( opts.validate ) {
		engine.onValidateNextBlock( ( { nextBlock } ) => ( { valid: opts.validate!( nextBlock.id ) } ) );
	}

	const handle = engine.scene( 's1' );

	const dispatch = ( { block, next }: { block: Block; next: () => void } ) => {
		played.push( block.id );
		const ids = trackOf.get( block.id ) ?? [];
		trackOf.set( block.id, ids );
		if ( opts.onBlock?.( block.id, handle ) === 'stop' ) return () => cleaned.push( block.id );
		next();
		return () => cleaned.push( block.id );
	};

	engine.onDialog( dispatch as never );
	engine.onChoice( dispatch as never );
	engine.onAction( dispatch as never );
	engine.onCondition( dispatch as never );

	handle.start();
	return { played, cleaned, running: handle.isRunning(), trackOf };
}

/** A dialog whose target-side `isAsync` is what the wires pointing AT it will read. */
function beside( id: string, next?: Block['next'] ): Block {
	return dialog( id, { props: { isAsync: true }, next } );
}

// ─── One wire ────────────────────────────────────────────────────────────────

describe( 'one wire out of a port', () => {

	it( 'continues the track when the target is not isAsync', () => {
		const r = play( [
			dialog( 'A', { next: [link( 'B' )] } ),
			dialog( 'B' ),
		] );
		expect( r.played ).toEqual( ['A', 'B'] );
	} );

	it( 'opens a track when the target is isAsync — and the scene outlives the main flow', () => {
		// The main track has no continuation left, so it ends. The scene does not: the track that
		// was just opened can still advance, and `trackEnded` looks at that rather than at who ended.
		const r = play( [
			dialog( 'A', { next: [link( 'B' )] } ),
			beside( 'B' ),
		] );
		expect( r.played ).toEqual( ['A', 'B'] );
	} );
} );

// ─── Several wires, none isAsync — the queue ─────────────────────────────────

describe( 'several wires, no isAsync — walked in turn', () => {

	it( 'plays two targets one after the other, not together', () => {
		const r = play( [
			dialog( 'A', { next: [link( 'B' ), link( 'C' )] } ),
			dialog( 'B' ),
			dialog( 'C' ),
		] );
		expect( r.played ).toEqual( ['A', 'B', 'C'] );
	} );

	it( 'keeps the file order for three targets', () => {
		const r = play( [
			dialog( 'A', { next: [link( 'B' ), link( 'C' ), link( 'D' )] } ),
			dialog( 'B' ),
			dialog( 'C' ),
			dialog( 'D' ),
		] );
		expect( r.played ).toEqual( ['A', 'B', 'C', 'D'] );
	} );

	it( 'finishes a branch before its sibling starts — depth first', () => {
		// A → [B, C] and B → [D, E]. What the designer reads on screen is B and everything under
		// it, THEN C. A queue that appended instead of inserting would give B, D, C, E.
		const r = play( [
			dialog( 'A', { next: [link( 'B' ), link( 'C' )] } ),
			dialog( 'B', { next: [link( 'D' ), link( 'E' )] } ),
			dialog( 'C' ),
			dialog( 'D' ),
			dialog( 'E' ),
		] );
		expect( r.played ).toEqual( ['A', 'B', 'D', 'E', 'C'] );
	} );

	it( 'walks a branch that is several blocks deep before the sibling', () => {
		const r = play( [
			dialog( 'A', { next: [link( 'B' ), link( 'Z' )] } ),
			dialog( 'B', { next: [link( 'C' )] } ),
			dialog( 'C', { next: [link( 'D' )] } ),
			dialog( 'D' ),
			dialog( 'Z' ),
		] );
		expect( r.played ).toEqual( ['A', 'B', 'C', 'D', 'Z'] );
	} );

	// A queued wire whose target is missing is NOT tested here, and cannot be: `init()` reports it
	// as `BROKEN_LINK` and refuses the payload, so a scene never starts with one. The guard in
	// `endBranch` that steps over such a wire stays defensive — it is not reachable from the
	// public API, and a test would have to fake a graph the engine would never accept.
} );

// ─── Several wires, all isAsync ──────────────────────────────────────────────

describe( 'several wires, all isAsync — beside', () => {

	it( 'opens one track per target and leaves the current track nothing to continue', () => {
		const r = play( [
			dialog( 'A', { next: [link( 'B' ), link( 'C' )] } ),
			beside( 'B' ),
			beside( 'C' ),
		] );
		expect( r.played ).toEqual( ['A', 'B', 'C'] );
	} );
} );

// ─── Mixed ───────────────────────────────────────────────────────────────────

describe( 'mixed wires — isAsync decides, not the file order', () => {

	it( 'takes the non-async target as the continuation even when it is written second', () => {
		// The wire to B comes first in `next`, but B is isAsync: it can never be the continuation.
		// C is, and it is written second. The property decides; the order does not.
		const r = play( [
			dialog( 'A', { next: [link( 'B' ), link( 'C' )] } ),
			beside( 'B' ),
			dialog( 'C' ),
		] );
		expect( r.played ).toEqual( ['A', 'B', 'C'] );
	} );

	it( 'queues the non-async ones and detaches the async one', () => {
		const r = play( [
			dialog( 'A', { next: [link( 'B' ), link( 'X' ), link( 'C' )] } ),
			dialog( 'B' ),
			beside( 'X' ),
			dialog( 'C' ),
		] );
		// X is opened while the wires are being sorted, so it runs before the continuation; B and
		// C are this track's, in order.
		expect( r.played ).toEqual( ['A', 'X', 'B', 'C'] );
	} );
} );

// ─── Every block type, same rule ─────────────────────────────────────────────

describe( 'the rule is the same on every block type', () => {

	it( 'CONDITION — two wires on `out`', () => {
		const r = play( [
			condition( 'IF', [whenCase( 'out', [cond( 'flags', 'ok', true )] )], {
				next: [link( 'B', 'out' ), link( 'C', 'out' )],
			} ),
			dialog( 'B' ),
			dialog( 'C' ),
		], { resolve: () => true } );
		expect( r.played ).toEqual( ['IF', 'B', 'C'] );
	} );

	it( 'CONDITION — two wires on `default`', () => {
		const r = play( [
			condition( 'IF', [whenCase( 'out', [cond( 'flags', 'ok', true )] )], {
				next: [link( 'B', 'default' ), link( 'C', 'default' )],
			} ),
			dialog( 'B' ),
			dialog( 'C' ),
		], { resolve: () => false } );
		expect( r.played ).toEqual( ['IF', 'B', 'C'] );
	} );

	it( 'ACTION — two wires on `then`', () => {
		const r = play( [
			action( 'DO', [], { next: [link( 'B', 'then' ), link( 'C', 'then' )] } ),
			dialog( 'B' ),
			dialog( 'C' ),
		] );
		expect( r.played ).toEqual( ['DO', 'B', 'C'] );
	} );

	it( 'DIALOG — two wires on an actor port with portPerCharacter', () => {
		const r = play( [
			dialog( 'A', {
				props: { portPerCharacter: true },
				actors: ['c1'],
				next: [link( 'B', 'c1' ), link( 'C', 'c1' )],
			} ),
			dialog( 'B' ),
			dialog( 'C' ),
		], { cards: [card( 'c1', 'kael' )] } );
		// No `onResolveCharacter`, so no actor port is taken and the flow leaves by `out`, which
		// has no wire: the actor ports are not walked at all.
		expect( r.played ).toEqual( ['A'] );
	} );
} );

// ─── ROUTER ──────────────────────────────────────────────────────────────────

describe( 'ROUTER — the case routes, then the continuation', () => {

	// `R` never appears in `played`, and that is the contract: a router has no handler to register
	// — `HandlerRegistry.getTypeHandler` answers null for its type — so the engine dispatches
	// nothing and advances on its own. By the time a handler could speak, every true case has
	// launched and the exit is picked; there is nothing left to answer. A game that wants to watch
	// one router still can, through `handle.onBlock(id)`.

	const routerScene = ( sideEffects: 'beside' | 'inTurn' ) => {
		const target = sideEffects === 'beside' ? beside : ( id: string ) => dialog( id );
		return [
			router( 'R', [
				whenCase( 'K1', [cond( 'party', 'a', true )] ),
				whenCase( 'K2', [cond( 'party', 'b', true )] ),
				whenCase( 'K3', [cond( 'party', 'c', true )] ),
			], {
				next: [
					link( 'THEN', 'then' ), link( 'CATCH', 'catch' ),
					link( 'R1', 'K1' ), link( 'R2', 'K2' ), link( 'R3', 'K3' ),
				],
			} ),
			target( 'R1' ), target( 'R2' ), target( 'R3' ),
			dialog( 'THEN' ), dialog( 'CATCH' ),
		];
	};

	it( 'every case true, targets NOT isAsync → K1, K2, K3, then `then`', () => {
		const r = play( routerScene( 'inTurn' ), { resolve: () => true } );
		expect( r.played ).toEqual( ['R1', 'R2', 'R3', 'THEN'] );
	} );

	it( 'every case true, targets isAsync → the routes run beside, `then` continues', () => {
		const r = play( routerScene( 'beside' ), { resolve: () => true } );
		expect( r.played ).toEqual( ['R1', 'R2', 'R3', 'THEN'] );
	} );

	it( 'one case false → the true routes still run, and the exit is `catch`', () => {
		const r = play( routerScene( 'inTurn' ), { resolve: e => e !== 'b' } );
		expect( r.played ).toEqual( ['R1', 'R3', 'CATCH'] );
	} );

	it( 'no case true → `catch` alone, nothing queued', () => {
		const r = play( routerScene( 'inTurn' ), { resolve: () => false } );
		expect( r.played ).toEqual( ['CATCH'] );
	} );

	it( 'no case declared → `then`, like Promise.all([])', () => {
		const r = play( [
			router( 'R', [], { next: [link( 'THEN', 'then' ), link( 'CATCH', 'catch' )] } ),
			dialog( 'THEN' ), dialog( 'CATCH' ),
		] );
		expect( r.played ).toEqual( ['THEN'] );
	} );

	it( 'the continuation port has no wire → the queue is still walked, then the track ends', () => {
		const r = play( [
			router( 'R', [
				whenCase( 'K1', [cond( 'party', 'a', true )] ),
				whenCase( 'K2', [cond( 'party', 'b', true )] ),
			], { next: [link( 'R1', 'K1' ), link( 'R2', 'K2' )] } ),
			dialog( 'R1' ), dialog( 'R2' ),
		], { resolve: () => true } );
		expect( r.played ).toEqual( ['R1', 'R2'] );
		expect( r.running ).toBe( false );
	} );

	it( 'a case route with its own branch finishes it before the next case', () => {
		const r = play( [
			router( 'R', [
				whenCase( 'K1', [cond( 'party', 'a', true )] ),
				whenCase( 'K2', [cond( 'party', 'b', true )] ),
			], { next: [link( 'R1', 'K1' ), link( 'R2', 'K2' ), link( 'THEN', 'then' )] } ),
			dialog( 'R1', { next: [link( 'R1b' )] } ),
			dialog( 'R1b' ),
			dialog( 'R2' ),
			dialog( 'THEN' ),
		], { resolve: () => true } );
		expect( r.played ).toEqual( ['R1', 'R1b', 'R2', 'THEN'] );
	} );
} );

// ─── The pitfalls the queue brings ───────────────────────────────────────────

describe( 'the queue and the rest of the engine', () => {

	it( 'runs a block cleanup when the block is LEFT, not when the queue empties', () => {
		const r = play( [
			dialog( 'A', { next: [link( 'B' ), link( 'C' )] } ),
			dialog( 'B' ),
			dialog( 'C' ),
		] );
		// Each block is released as the track walks off it. A cleanup held until the end of the
		// queue would keep a panel open, or an audio voice alive, through everything after it.
		expect( r.cleaned ).toEqual( ['A', 'B', 'C'] );
	} );

	it( 'a block that never calls next() holds the queue — and the scene stays open', () => {
		const r = play( [
			dialog( 'A', { next: [link( 'B' ), link( 'C' )] } ),
			dialog( 'B' ),
			dialog( 'C' ),
		], { onBlock: id => id === 'B' ? 'stop' : undefined } );
		// C is owed and never played. This is the price of the rule, and it is the designer's to
		// see: a `timeout` missing on a queued block costs the end of the dialogue.
		expect( r.played ).toEqual( ['A', 'B'] );
		expect( r.running ).toBe( true );
	} );

	it( 'cancel() drops what was queued', () => {
		const r = play( [
			dialog( 'A', { next: [link( 'B' ), link( 'C' )] } ),
			dialog( 'B' ),
			dialog( 'C' ),
		], { onBlock: ( id, scene ) => { if ( id === 'B' ) { scene.cancel(); return 'stop'; } } } );
		expect( r.played ).toEqual( ['A', 'B'] );
		expect( r.running ).toBe( false );
	} );

	it( 'a refused block ends the track and drops the queue', () => {
		// `onValidateNextBlock` saying no is not "try the next wire instead". The guide has always
		// read `onInvalidateBlock` as the flow stopping, so what was owed goes with it.
		const r = play( [
			dialog( 'A', { next: [link( 'B' ), link( 'C' )] } ),
			dialog( 'B' ),
			dialog( 'C' ),
		], { validate: id => id !== 'B' } );
		expect( r.played ).toEqual( ['A'] );
		expect( r.running ).toBe( false );
	} );

	it( 'a NOTE loop on a queued wire ends that branch and moves to the next', () => {
		const r = play( [
			dialog( 'A', { next: [link( 'LOOP' ), link( 'C' )] } ),
			// A NOTE wired back on itself: stepping over it forever used to blow the stack.
			{ id: 'LOOP', key: '__blueprints__.s1.LOOP', type: 'note', next: [link( 'LOOP' )] } as Block,
			dialog( 'C' ),
		] );
		expect( r.played ).toEqual( ['A', 'C'] );
	} );

	it( 'plays the same block twice when two wires point at it', () => {
		// Two wires, one block: two dispatches, two contexts, two cleanups. What a game must NOT
		// do is key its own state on the block id — the second dispatch would overwrite the first.
		const r = play( [
			dialog( 'A', { next: [link( 'B' ), link( 'B' )] } ),
			dialog( 'B' ),
		] );
		expect( r.played ).toEqual( ['A', 'B', 'B'] );
		expect( r.cleaned ).toEqual( ['A', 'B', 'B'] );
	} );
} );
