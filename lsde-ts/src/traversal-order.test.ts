// LSDE Dialog Engine — the ORDER the engine calls the game in, pinned before the traversal changes
//
// The traversal is about to stop recursing: every step that used to call the next one will hand
// it back to a loop instead. That is only safe if nothing the game can observe moves, so this file
// records the full sequence of callbacks — `onBeforeBlock`, the type handlers, the cleanups,
// `onSceneExit` — on the reference export and on a synthetic graph that mixes every shape the walk
// knows: a queue, nested async tracks, a router, a join.
//
// The snapshots were written by the recursive traversal. The loop must reproduce them byte for byte.
//
// ONE change is expected and kept apart on purpose, in its own snapshot: a `resolve()` called
// synchronously inside `onBeforeBlock` is deferred to the return of `onBeforeBlock`, the way
// `next()` already is inside a handler. Anything else that moves is a regression.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DialogueEngine } from './engine.js';
import type { Blueprints, Block, ChoiceContext, ActionContext } from './types.js';
import { oneScene, dialog, router, link, whenCase } from './test-builders.js';

const repoRoot = resolve( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const REFERENCE = JSON.parse( readFileSync(
	resolve( repoRoot, 'mock/blueprints/Engine-Conformance-Scene.blueprints.json' ), 'utf-8',
) ) as Blueprints;

type Mode = 'sync' | 'deferred';

/**
 * How the game answers. The reference export only reaches its async branches and its joins on some
 * answers, so it is played twice: everything true and the first option, everything false and the
 * last one.
 */
interface Game {
	answer?: boolean;
	pick?: 'first' | 'last';
}

const GAMES: Required<Game>[] = [
	{ answer: true, pick: 'first' },
	{ answer: false, pick: 'last' },
];

/**
 * Play a scene and write down every call the engine makes into the game.
 *
 * `sync` advances inside every callback. `deferred` keeps every `next()` and `resolve()` and
 * fires them later, first kept first fired — the way a game driven by clicks and timers does.
 */
function trace( data: Blueprints, sceneRef: string, mode: Mode, opts: Game & { markResolve?: boolean } = {} ): string[] {
	const log: string[] = [];
	const pending: Array<() => void> = [];
	const later = ( fn: () => void ) => mode === 'sync' ? fn() : pending.push( fn );

	const engine = new DialogueEngine();
	expect( engine.init( { data } ).errors ).toEqual( [] );

	const yes = opts.answer ?? true;
	engine.onResolveCondition( t => t.op === 'notEquals' ? !yes : yes );
	engine.onBeforeBlock( ( { block, resolve: go } ) => {
		log.push( `before ${ block.id }` );
		later( go );
		if ( opts.markResolve ) log.push( `after-resolve ${ block.id }` );
	} );

	// The reference export has a loop a player can take forever: answer false, pick the last option.
	// Played synchronously it overflowed the recursive traversal — the very defect this file guards
	// the fix of — and once the loop is flat it would simply never end. So the game stops advancing
	// after a fixed number of blocks, low enough for the recursive walk to survive, and the trace
	// stays comparable on both sides of the change.
	let dispatched = 0;
	const DISPATCH_CAP = 150;

	const dispatch = ( kind: string ) => ( { block, context, next }: {
		block: Block; context: { character?: { id: string } }; next: () => void;
	} ) => {
		log.push( `${ kind } ${ block.id } char=${ context.character?.id ?? '-' }` );
		if ( ++dispatched > DISPATCH_CAP ) {
			log.push( 'cap' );
			return () => { log.push( `cleanup ${ block.id }` ); };
		}
		if ( kind === 'choice' ) {
			const choice = context as unknown as ChoiceContext;
			const offered = choice.options.filter( o => o.visible !== false );
			const picked = opts.pick === 'last' ? offered[offered.length - 1] : offered[0];
			if ( picked ) choice.selectChoice( picked.id );
		}
		if ( kind === 'action' ) ( context as unknown as ActionContext ).resolve();
		later( next );
		return () => { log.push( `cleanup ${ block.id }` ); };
	};
	engine.onDialog( dispatch( 'dialog' ) as never );
	engine.onChoice( dispatch( 'choice' ) as never );
	engine.onCondition( dispatch( 'condition' ) as never );
	engine.onAction( dispatch( 'action' ) as never );
	engine.onSceneExit( () => { log.push( 'exit' ); } );

	const handle = engine.scene( sceneRef );
	handle.start();

	// Bounded: a graph that loops must fail this test, not hang it.
	for ( let fired = 0; pending.length > 0 && fired < 5000; fired++ ) pending.shift()!();

	log.push( `running=${ handle.isRunning() } tracks=${ handle.getActiveTracks() }` );
	return log;
}

/** Every shape the walk knows, in one graph. */
function everyShape(): Blueprints {
	const blocks: Block[] = [
		// A queue (B then D), and an async branch (C) beside it.
		dialog( 'A', { next: [link( 'B' ), link( 'C' ), link( 'D' )] } ),
		dialog( 'B', { next: [link( 'E' ), link( 'F' )] } ),
		dialog( 'C', { props: { isAsync: true }, next: [link( 'G' )] } ),
		dialog( 'D' ),
		dialog( 'E', { next: [link( 'R' )] } ),
		dialog( 'F', { props: { isAsync: true } } ),
		dialog( 'G' ),
		// A router: both cases hold, K2 opens a track, `then` comes last.
		router( 'R', [whenCase( 'K1' ), whenCase( 'K2' )], {
			next: [link( 'H', 'K1' ), link( 'I', 'K2' ), link( 'J', 'then' )],
		} ),
		dialog( 'H' ),
		dialog( 'I', { props: { isAsync: true } } ),
		// A join on a block of another track and one of this one.
		dialog( 'J', { props: { waitForBlocks: ['G', 'H'] } } ),
	];
	return oneScene( blocks );
}

describe( 'traversal order — the reference export', () => {
	for ( const scene of REFERENCE.scenes ) {
		for ( const mode of ['sync', 'deferred'] as const ) {
			for ( const game of GAMES ) {
				it( `${ scene.scene } — ${ mode } — answers ${ game.answer }, picks ${ game.pick }`, () => {
					expect( trace( REFERENCE, scene.scene, mode, game ) ).toMatchSnapshot();
				} );
			}
		}
	}
} );

describe( 'traversal order — every shape in one graph', () => {
	for ( const mode of ['sync', 'deferred'] as const ) {
		it( mode, () => {
			expect( trace( everyShape(), 's1', mode ) ).toMatchSnapshot();
		} );
	}
} );

describe( 'traversal order — the one documented change', () => {
	it( 'code after a synchronous resolve() in onBeforeBlock', () => {
		const data = oneScene( [
			dialog( 'A', { next: [link( 'B' )] } ),
			dialog( 'B', { next: [link( 'C' )] } ),
			dialog( 'C' ),
		] );
		expect( trace( data, 's1', 'sync', { markResolve: true } ) ).toMatchSnapshot();
	} );
} );
