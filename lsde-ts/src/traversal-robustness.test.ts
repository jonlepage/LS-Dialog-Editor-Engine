// LSDE Dialog Engine — a scene must never be left open with nothing able to move it
//
// Found during a Unity integration, and every one of them reproduced on this engine before a line
// was changed:
//
//   1. an exception on an `isAsync` track, or on a track a join released, escaped through the track
//      that opened it — which was left running on a block it had already left
//   2. every synchronous `next()` added three frames to the stack: a condition ↔ action loop died
//      on a RangeError after 694 passes, and in C# a StackOverflowException kills Unity
//   3. only the type handler sat inside the try: a throwing validation, `onBeforeBlock`, resolver,
//      `onSceneEnter` or `onSceneExit` froze the scene — the last one beyond `engine.stop()`
//   4. a deadlock was only noticed when a track ENDED, never when the last one PARKED
//   5. nothing told `onSceneExit` why the scene ended
//
// The rule these tests hold is the one problem 11 of MIGRATION-V2.md decided and the lifecycle guide
// has always published: a fault closes the WHOLE scene — cleanups run, tracks cancelled,
// `onSceneExit` fired — and only then reaches whoever called `start()`, `next()` or `resolve()`.

import { describe, it, expect } from 'vitest';
import { DialogueEngine } from './engine.js';
import type { Blueprints, Block, SceneContext } from './types.js';
import {
	blueprint, scene, dialog, choice, option, condition, router, action,
	link, whenCase, test as cond, card,
} from './test-builders.js';

// ─── Harness ─────────────────────────────────────────────────────────────────

/** What `onSceneExit` is told. Read loosely: the fields arrive with the fix. */
type ExitContext = SceneContext & { reason?: string; waitingFor?: readonly string[]; error?: unknown };

interface Played {
	engine: DialogueEngine;
	handle: ReturnType<DialogueEngine['scene']>;
	exits: ExitContext[];
	cleaned: string[];
	/** The `next()` of every block whose handler kept it, by block id. */
	held: Map<string, () => void>;
}

/**
 * A scene whose handlers advance at once, except the blocks listed in `hold`: those keep their
 * `next()` for the test to call — the player clicking.
 */
function setup(
	blocks: Block[],
	opts: {
		hold?: string[];
		throwAt?: string;
		data?: ( blocks: Block[] ) => Blueprints;
		configure?: ( engine: DialogueEngine ) => void;
	} = {},
): Played {
	const engine = new DialogueEngine();
	const data = opts.data ? opts.data( blocks ) : blueprint( [scene( blocks )] );
	expect( engine.init( { data } ).errors ).toEqual( [] );

	const exits: ExitContext[] = [];
	const cleaned: string[] = [];
	const held = new Map<string, () => void>();

	const dispatch = ( { block, context, next }: { block: Block; context: { resolve?: () => void }; next: () => void } ) => {
		if ( block.id === opts.throwAt ) throw new Error( `boom in ${ block.id }` );
		if ( block.type === 'action' ) context.resolve!();
		if ( opts.hold?.includes( block.id ) ) held.set( block.id, next );
		else next();
		return () => { cleaned.push( block.id ); };
	};
	engine.onDialog( dispatch as never );
	engine.onChoice( dispatch as never );
	engine.onAction( dispatch as never );
	engine.onResolveCondition( () => true );
	engine.onSceneExit( ( { context } ) => { exits.push( context as ExitContext ); } );
	opts.configure?.( engine );

	return { engine, handle: engine.scene( 's1' ), exits, cleaned, held };
}

/** The whole contract of a fault, in one place. */
function expectClosedByFault( p: Played, run: () => void, message: string ): void {
	expect( run ).toThrow( message );
	expect( p.handle.isRunning() ).toBe( false );
	expect( p.engine.isRunning() ).toBe( false );
	expect( p.exits ).toHaveLength( 1 );
	expect( p.exits[0]!.reason ).toBe( 'faulted' );
}

// ─── 1. A fault on another track ─────────────────────────────────────────────

describe( 'a fault on a track other than the one advancing', () => {

	it( 'an isAsync child that throws closes the scene, and the parent leaves its block', () => {
		const p = setup(
			[dialog( 'D1', { next: [link( 'D2' ), link( 'BG' )] } ), dialog( 'D2' ), dialog( 'BG', { props: { isAsync: true } } )],
			{ hold: ['D1'], throwAt: 'BG' },
		);
		p.handle.start();

		expectClosedByFault( p, () => p.held.get( 'D1' )!(), 'boom in BG' );
		expect( p.cleaned ).toContain( 'D1' );
	} );

	it( 'a track released by a join that throws closes the scene', () => {
		// J waits for BG. BG is held; releasing it releases J, and J throws.
		const p = setup(
			[
				dialog( 'D1', { next: [link( 'J' ), link( 'BG' )] } ),
				dialog( 'J', { props: { waitForBlocks: ['BG'] } } ),
				dialog( 'BG', { props: { isAsync: true } } ),
			],
			{ hold: ['BG'], throwAt: 'J' },
		);
		p.handle.start();
		expect( p.handle.isRunning() ).toBe( true );

		expectClosedByFault( p, () => p.held.get( 'BG' )!(), 'boom in J' );
		expect( p.cleaned ).toContain( 'BG' );
	} );

	it( 'a parallel track that throws while the main flow waits for a click closes the scene', () => {
		const p = setup(
			[
				dialog( 'D1', { next: [link( 'M' ), link( 'BG' )] } ),
				dialog( 'M' ),
				dialog( 'BG', { props: { isAsync: true }, next: [link( 'BG2' )] } ),
				dialog( 'BG2' ),
			],
			{ hold: ['M', 'BG'], throwAt: 'BG2' },
		);
		p.handle.start();

		expectClosedByFault( p, () => p.held.get( 'BG' )!(), 'boom in BG2' );
		// The main flow's bubble is released too: the scene is gone, not just the branch.
		expect( p.cleaned ).toContain( 'M' );
	} );

	it( 'a cleanup that throws while a parallel track is alive closes the scene', () => {
		const p = setup(
			[dialog( 'D1', { next: [link( 'D2' ), link( 'BG' )] } ), dialog( 'D2' ), dialog( 'BG', { props: { isAsync: true } } )],
			{ hold: ['D1', 'BG'] },
		);
		p.handle.onDialogId( 'D1', ( { next } ) => {
			p.held.set( 'D1', next );
			return () => { throw new Error( 'cleanup boom' ); };
		} );
		p.handle.start();

		expectClosedByFault( p, () => p.held.get( 'D1' )!(), 'cleanup boom' );
		expect( p.cleaned ).toContain( 'BG' );
	} );

} );

// ─── 3. Every callback of the game, not only the type handler ───────────────

describe( 'a fault in a callback other than the type handler', () => {

	const twoBlocks = () => [dialog( 'D1', { next: [link( 'D2' )] } ), dialog( 'D2' )];

	it( 'onValidateNextBlock', () => {
		const p = setup( twoBlocks(), {
			hold: ['D1'],
			configure: e => e.onValidateNextBlock( ( { nextBlock } ) => {
				if ( nextBlock.id === 'D2' ) throw new Error( 'validate boom' );
				return { valid: true };
			} ),
		} );
		p.handle.start();

		expectClosedByFault( p, () => p.held.get( 'D1' )!(), 'validate boom' );
		expect( p.cleaned ).toContain( 'D1' );
	} );

	it( 'onInvalidateBlock', () => {
		const p = setup( twoBlocks(), {
			hold: ['D1'],
			configure: e => {
				e.onValidateNextBlock( ( { nextBlock } ) => ( { valid: nextBlock.id !== 'D2' } ) );
				e.onInvalidateBlock( () => { throw new Error( 'invalidate boom' ); } );
			},
		} );
		p.handle.start();

		expectClosedByFault( p, () => p.held.get( 'D1' )!(), 'invalidate boom' );
	} );

	it( 'onBeforeBlock, before it resolves', () => {
		const p = setup( twoBlocks(), {
			hold: ['D1'],
			configure: e => e.onBeforeBlock( ( { block, resolve } ) => {
				if ( block.id === 'D2' ) throw new Error( 'before boom' );
				resolve();
			} ),
		} );
		p.handle.start();

		expectClosedByFault( p, () => p.held.get( 'D1' )!(), 'before boom' );
	} );

	it( 'onBeforeBlock, after a synchronous resolve()', () => {
		const p = setup( twoBlocks(), {
			hold: ['D1'],
			configure: e => e.onBeforeBlock( ( { resolve } ) => {
				resolve();
				throw new Error( 'before boom' );
			} ),
		} );

		expectClosedByFault( p, () => p.handle.start(), 'before boom' );
		// Whatever the handler opened, the closing released it.
		for ( const id of p.cleaned ) expect( ['D1', 'D2'] ).toContain( id );
	} );

	it( 'onResolveCondition, on a condition', () => {
		const p = setup( [
			dialog( 'D1', { next: [link( 'C' )] } ),
			condition( 'C', [whenCase( 'out', [cond( 'game', 'flag', true )] )], { next: [link( 'D2', 'out' )] } ),
			dialog( 'D2' ),
		], {
			hold: ['D1'],
			configure: e => e.onResolveCondition( () => { throw new Error( 'resolver boom' ); } ),
		} );
		p.handle.start();

		expectClosedByFault( p, () => p.held.get( 'D1' )!(), 'resolver boom' );
	} );

	it( 'onResolveCondition, on a router', () => {
		const p = setup( [
			dialog( 'D1', { next: [link( 'R' )] } ),
			router( 'R', [whenCase( 'K1', [cond( 'game', 'flag', true )] )], { next: [link( 'D2', 'K1' )] } ),
			dialog( 'D2' ),
		], {
			hold: ['D1'],
			configure: e => e.onResolveCondition( () => { throw new Error( 'resolver boom' ); } ),
		} );
		p.handle.start();

		expectClosedByFault( p, () => p.held.get( 'D1' )!(), 'resolver boom' );
	} );

	it( 'onResolveCondition, tagging the options of a choice', () => {
		const p = setup( [
			dialog( 'D1', { next: [link( 'CH' )] } ),
			choice( 'CH', [option( 'C1', { when: [cond( 'game', 'flag', true )] } )], { next: [link( 'D2', 'C1' )] } ),
			dialog( 'D2' ),
		], {
			hold: ['D1'],
			configure: e => e.onResolveCondition( () => { throw new Error( 'resolver boom' ); } ),
		} );
		p.handle.start();

		expectClosedByFault( p, () => p.held.get( 'D1' )!(), 'resolver boom' );
	} );

	it( 'onResolveCharacter', () => {
		// The resolver is asked for EVERY block, cast or not, so the first block already throws.
		const p = setup( [dialog( 'D1', { actors: ['var1'] } )], {
			data: blocks => blueprint( [scene( blocks )], { cards: [card( 'var1', 'kael' )] } ),
			configure: e => e.onResolveCharacter( () => { throw new Error( 'character boom' ); } ),
		} );

		expectClosedByFault( p, () => p.handle.start(), 'character boom' );
	} );

	it( 'onSceneEnter', () => {
		const p = setup( twoBlocks(), {
			configure: e => e.onSceneEnter( () => { throw new Error( 'enter boom' ); } ),
		} );

		expectClosedByFault( p, () => p.handle.start(), 'enter boom' );
	} );

	it( 'onSceneExit — the engine does not keep the scene forever', () => {
		const p = setup( [dialog( 'D1' )], {
			configure: e => e.onSceneExit( () => { throw new Error( 'exit boom' ); } ),
		} );

		expect( () => p.handle.start() ).toThrow( 'exit boom' );
		expect( p.handle.isRunning() ).toBe( false );
		expect( p.engine.isRunning() ).toBe( false );
		expect( p.engine.getActiveScenes() ).toHaveLength( 0 );
		expect( () => p.engine.stop() ).not.toThrow();
	} );

} );

// ─── Closing is not re-entrant ───────────────────────────────────────────────

describe( 'closing a scene from inside its own closing', () => {

	it( 'a cleanup that cancels the scene does not fire onSceneExit twice', () => {
		const p = setup( [dialog( 'D1' )], { hold: ['D1'] } );
		p.handle.onDialogId( 'D1', ( { scene: s } ) => () => { s.cancel(); } );
		p.handle.start();

		p.handle.cancel();

		expect( p.exits ).toHaveLength( 1 );
		expect( p.engine.isRunning() ).toBe( false );
	} );

	it( 'a cleanup that stops the engine does not fire onSceneExit twice', () => {
		const p = setup( [dialog( 'D1' )], { hold: ['D1'] } );
		p.handle.onDialogId( 'D1', () => () => { p.engine.stop(); } );
		p.handle.start();

		p.engine.stop();

		expect( p.exits ).toHaveLength( 1 );
		expect( p.engine.isRunning() ).toBe( false );
	} );

} );

// ─── 2. The stack does not grow with the graph ──────────────────────────────

describe( 'the stack does not grow with the number of blocks walked without waiting', () => {

	const PASSES = 10_000;

	function conditionLoop( withBeforeBlock: boolean ) {
		let counter = 0;
		const p = setup( [
			condition( 'C', [whenCase( 'out', [cond( 'game', 'counter', PASSES )] )], {
				next: [link( 'A', 'out' ), link( 'END', 'default' )],
			} ),
			action( 'A', [], { next: [link( 'C', 'then' )] } ),
			dialog( 'END' ),
		], {
			configure: e => {
				e.onResolveCondition( () => counter < PASSES );
				e.onAction( ( { context, next } ) => { counter++; context.resolve(); next(); } );
				if ( withBeforeBlock ) e.onBeforeBlock( ( { resolve } ) => resolve() );
			},
		} );
		p.handle.start();
		return { p, counter: () => counter };
	}

	it( `a condition ↔ action loop of ${ PASSES } passes`, () => {
		const { p, counter } = conditionLoop( false );
		expect( counter() ).toBe( PASSES );
		expect( p.exits ).toHaveLength( 1 );
	} );

	it( `the same loop with an onBeforeBlock that resolves at once`, () => {
		const { p, counter } = conditionLoop( true );
		expect( counter() ).toBe( PASSES );
		expect( p.exits ).toHaveLength( 1 );
	} );

	it( `a queue of ${ PASSES } wires walked in turn`, () => {
		const targets = Array.from( { length: PASSES }, ( _, i ) => dialog( `Q${ i }` ) );
		const p = setup( [dialog( 'A', { next: targets.map( t => link( t.id ) ) } ), ...targets] );
		p.handle.start();

		expect( p.cleaned ).toHaveLength( PASSES + 1 );
		expect( p.exits ).toHaveLength( 1 );
	} );

	it( `a router loop of ${ PASSES } passes`, () => {
		let counter = 0;
		const p = setup( [
			router( 'R', [whenCase( 'K1', [cond( 'game', 'counter', PASSES )] )], {
				next: [link( 'A', 'K1' ), link( 'END', 'catch' )],
			} ),
			action( 'A', [], { next: [link( 'R', 'then' )] } ),
			dialog( 'END' ),
		], {
			configure: e => {
				e.onResolveCondition( () => counter < PASSES );
				e.onAction( ( { context, next } ) => { counter++; context.resolve(); next(); } );
			},
		} );
		p.handle.start();

		expect( counter ).toBe( PASSES );
		expect( p.exits ).toHaveLength( 1 );
	} );

} );

// ─── 4. A deadlock closes the scene, whichever track parks last ─────────────

describe( 'a scene where every track is parked closes', () => {

	it( 'a single track parked on a block that exists but is never reached', () => {
		const p = setup( [
			dialog( 'D1', { next: [link( 'D2' )] } ),
			dialog( 'D2', { props: { waitForBlocks: ['NEVER'] } } ),
			dialog( 'NEVER' ),
		] );
		p.handle.start();

		expect( p.handle.isRunning() ).toBe( false );
		expect( p.engine.isRunning() ).toBe( false );
		expect( p.exits ).toHaveLength( 1 );
		expect( p.exits[0]!.reason ).toBe( 'deadlocked' );
		expect( p.exits[0]!.waitingFor ).toEqual( ['NEVER'] );
	} );

	it( 'two tracks waiting for each other, the main flow parking last', () => {
		const p = setup( [
			dialog( 'D1', { next: [link( 'A' ), link( 'M' )] } ),
			dialog( 'A', { props: { isAsync: true, waitForBlocks: ['M'] } } ),
			dialog( 'M', { props: { waitForBlocks: ['A'] } } ),
		] );
		p.handle.start();

		expect( p.handle.isRunning() ).toBe( false );
		expect( p.exits ).toHaveLength( 1 );
		expect( p.exits[0]!.reason ).toBe( 'deadlocked' );
		expect( [...( p.exits[0]!.waitingFor ?? [] )].sort() ).toEqual( ['A', 'M'] );
	} );

	it( 'a track parked while another still runs is NOT a deadlock', () => {
		const p = setup( [
			dialog( 'D1', { next: [link( 'J' ), link( 'BG' )] } ),
			dialog( 'J', { props: { waitForBlocks: ['BG'] } } ),
			dialog( 'BG', { props: { isAsync: true } } ),
		], { hold: ['BG'] } );
		p.handle.start();

		expect( p.handle.isRunning() ).toBe( true );
		expect( p.exits ).toHaveLength( 0 );
	} );

} );

// ─── 5. Why the scene ended ──────────────────────────────────────────────────

describe( 'onSceneExit is told why the scene ended', () => {

	it( 'completed', () => {
		const p = setup( [dialog( 'D1' )] );
		p.handle.start();
		expect( p.exits.map( e => e.reason ) ).toEqual( ['completed'] );
	} );

	it( 'cancelled, by the handle', () => {
		const p = setup( [dialog( 'D1' )], { hold: ['D1'] } );
		p.handle.start();
		p.handle.cancel();
		expect( p.exits.map( e => e.reason ) ).toEqual( ['cancelled'] );
	} );

	it( 'cancelled, by engine.stop()', () => {
		const p = setup( [dialog( 'D1' )], { hold: ['D1'] } );
		p.handle.start();
		p.engine.stop();
		expect( p.exits.map( e => e.reason ) ).toEqual( ['cancelled'] );
	} );

	it( 'invalidated, when the game refuses the next block', () => {
		const p = setup( [dialog( 'D1', { next: [link( 'D2' )] } ), dialog( 'D2' )], {
			configure: e => e.onValidateNextBlock( ( { nextBlock } ) => ( { valid: nextBlock.id !== 'D2' } ) ),
		} );
		p.handle.start();
		expect( p.exits.map( e => e.reason ) ).toEqual( ['invalidated'] );
	} );

	it( 'onSceneEnter is not told a reason', () => {
		const entered: ExitContext[] = [];
		const p = setup( [dialog( 'D1' )], {
			hold: ['D1'],
			configure: e => e.onSceneEnter( ( { context } ) => { entered.push( context as ExitContext ); } ),
		} );
		p.handle.start();
		expect( entered[0]!.reason ).toBeUndefined();
	} );

} );

// ─── The cause of a faulted end ──────────────────────────────────────────────
//
// A fault is re-thrown to whoever entered the walk. In a game that is a click or a timer calling
// next() — never the code awaiting the end of the scene, which only learned `faulted`. So the error
// that closed the scene is handed to onSceneExit too. It is STILL re-thrown: problem 11 decided that
// nothing is swallowed.

describe( 'onSceneExit is handed the error that closed the scene', () => {

	it( 'the very error that was re-thrown, alongside faulted', () => {
		const p = setup(
			[dialog( 'D1', { next: [link( 'D2' ), link( 'BG' )] } ), dialog( 'D2' ), dialog( 'BG', { props: { isAsync: true } } )],
			{ hold: ['D1'], throwAt: 'BG' },
		);
		p.handle.start();

		let thrown: unknown = undefined;
		try {
			p.held.get( 'D1' )!();
		} catch ( err ) {
			thrown = err;
		}

		expect( thrown ).toBeInstanceOf( Error );
		expect( p.exits[0]!.reason ).toBe( 'faulted' );
		expect( p.exits[0]!.error ).toBe( thrown );
	} );

	it( 'the fault that closed the scene, not a cleanup that failed while it closed', () => {
		const p = setup(
			[
				dialog( 'D1', { next: [link( 'M' ), link( 'BG' )] } ),
				dialog( 'M' ),
				dialog( 'BG', { props: { isAsync: true }, next: [link( 'BG2' )] } ),
				dialog( 'BG2' ),
			],
			// M is held by BOTH tiers: the scene handler below keeps its next(), and the global one must
			// not call it either — otherwise M is left during start() and its cleanup throws there.
			{ hold: ['BG', 'M'], throwAt: 'BG2' },
		);
		p.handle.onDialogId( 'M', ( { next } ) => {
			p.held.set( 'M', next );
			return () => { throw new Error( 'cleanup boom' ); };
		} );
		p.handle.start();

		expect( () => p.held.get( 'BG' )!() ).toThrow( 'boom in BG2' );
		expect( ( p.exits[0]!.error as Error ).message ).toBe( 'boom in BG2' );
	} );

	it( 'the error of a throwing onSceneEnter', () => {
		const p = setup( [dialog( 'D1' )], {
			configure: e => e.onSceneEnter( () => { throw new Error( 'enter boom' ); } ),
		} );

		expect( () => p.handle.start() ).toThrow( 'enter boom' );
		expect( ( p.exits[0]!.error as Error ).message ).toBe( 'enter boom' );
	} );

	it( 'no error when the scene did not fault', () => {
		const p = setup( [dialog( 'D1' )] );
		p.handle.start();

		expect( p.exits[0]!.reason ).toBe( 'completed' );
		expect( p.exits[0]!.error ).toBeUndefined();
	} );

} );

// ─── Which scene ended ───────────────────────────────────────────────────────

/** The handle, read through the two names it gains. */
type NamedHandle = { getSceneId(): string; getScenePath(): string };

describe( 'the handle names its scene', () => {

	it( 'getSceneId() is the stable id, getScenePath() the path a writer reads', () => {
		const p = setup( [dialog( 'D1' )], { hold: ['D1'] } );
		const named = p.handle as unknown as NamedHandle;

		expect( named.getSceneId() ).toBe( 'sc_test0001' );
		expect( named.getScenePath() ).toBe( 's1' );
	} );

	it( 'so a global onSceneExit can tell two scenes apart', () => {
		const engine = new DialogueEngine();
		expect( engine.init( { data: blueprint( [
			scene( [dialog( 'A1' )], { scene: 'first', id: 'sc_first' } ),
			scene( [dialog( 'B1' )], { scene: 'second', id: 'sc_second' } ),
		] ) } ).errors ).toEqual( [] );

		engine.onDialog( () => {} );
		engine.onChoice( ( { next } ) => { next(); } );
		engine.onAction( ( { next } ) => { next(); } );
		engine.onResolveCondition( () => true );

		const ended: string[] = [];
		engine.onSceneExit( ( { scene: s } ) => { ended.push( ( s as unknown as NamedHandle ).getSceneId() ); } );

		engine.scene( 'first' ).start();
		engine.scene( 'second' ).start();
		engine.stop();

		expect( ended ).toEqual( ['sc_first', 'sc_second'] );
	} );

} );
