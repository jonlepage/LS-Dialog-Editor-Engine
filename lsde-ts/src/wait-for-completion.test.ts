// `waitForBlocks` waits for blocks that have FINISHED, not for blocks that have been reached.
//
// The distinction is invisible to a test whose handlers call `next()` straight away — dispatch and
// completion land in the same tick — which is precisely why the old rule survived so long. Every
// suite here therefore holds a block open on purpose and checks what the joining block does while
// it is held.
//
// The defect it fixes, from a real scene: DIALOG-009 forks into ACTION-003 and DIALOG-010 and then
// continues to DIALOG-011, which is marked as waiting for both. Both had been DISPATCHED a fraction
// of a millisecond earlier, so the wait lifted in the very tick it was registered and l2 spoke over
// l3, who was still musing behind a 2.5-second timeout. A designer who draws that join means
// "wait until l3 has finished", not "wait until l3 has been given the floor".

import { describe, it, expect } from 'vitest';
import { DialogueEngine } from './engine.js';
import type { Blueprints, Block, Card, Scene } from './types.js';
import {
	blueprint, scene as buildScene, dialog as buildDialog, link, card,
} from './test-builders.js';

/**
 * `start()` refuses a scene missing a handler for any block type, whatever the scene contains.
 * These suites are about the traversal, so the other three are stubs.
 */
function registerUnusedHandlers( engine: DialogueEngine ): void {
	engine.onChoice( ( { next } ) => next() );
	engine.onCondition( ( { next } ) => next() );
	engine.onAction( ( { context, next } ) => { context.resolve(); next(); } );
}

const CARDS: Card[] = [card( 'var1', 'kael' )];

interface DialogSpec {
	readonly async?: boolean;
	readonly waitFor?: string[];
	readonly next?: string[];
}

function dialog( id: string, spec: DialogSpec = {} ): Block {
	const props: Record<string, unknown> = {};
	if ( spec.async ) props.isAsync = true;
	if ( spec.waitFor ) props.waitForBlocks = spec.waitFor;

	return buildDialog( id, {
		next: ( spec.next ?? [] ).map( to => link( to ) ),
		props: Object.keys( props ).length > 0 ? props as never : undefined,
	} );
}

function sceneOf( blocks: Block[] ): Blueprints {
	return blueprint( [buildScene( blocks )], { cards: CARDS } );
}

/**
 * An engine playing one scene, where a named block refuses to finish.
 *
 * `heldBlockId` is dispatched like any other — its handler runs, the game sees it — but `next()` is
 * kept aside instead of being called. `finishHeldBlock()` calls it later. That is the only way to
 * tell "reached" from "finished" apart in a callback-driven engine.
 */
function playHolding( scene: Blueprints, heldBlockId: string ) {
	const played: string[] = [];
	let releaseHeld: ( () => void ) | null = null;

	const engine = new DialogueEngine();
	const report = engine.init( { data: scene } );
	expect( report.errors ).toEqual( [] );

	registerUnusedHandlers( engine );
	engine.onDialog( ( { block, next } ) => {
		played.push( block.id );
		if ( block.id === heldBlockId ) {
			releaseHeld = next;
			return () => { played.push( `${ block.id }:cleanup` ); };
		}
		next();
		return undefined;
	} );

	const handle = engine.scene( 's1' );
	handle.start();

	return {
		played,
		handle,
		finishHeldBlock(): void {
			const release = releaseHeld;
			releaseHeld = null;
			release?.();
		},
	};
}

// ─── One block held, one block joining ───────────────────────────────────────

describe( 'waitForBlocks — reached is not finished', () => {

	/**
	 * `start → [held (isAsync), joiner]`, and `joiner` waits for `held`.
	 *
	 * The fork rule puts `held` on its own track and keeps `joiner` as this track's continuation,
	 * which is the shape the defect was found in.
	 */
	function forkedScene(): Blueprints {
		return sceneOf( [
			dialog( 'start', { next: ['held', 'joiner'] } ),
			dialog( 'held', { async: true } ),
			dialog( 'joiner', { waitFor: ['held'] } ),
		] );
	}

	it( 'holds the joining block while the awaited one is still open', () => {
		// THE discriminating assertion. Under the old rule `held` was marked the moment it was
		// dispatched, so `joiner` played here — over a block that had not said a word yet.
		const { played } = playHolding( forkedScene(), 'held' );

		expect( played ).toContain( 'held' );
		expect( played ).not.toContain( 'joiner' );
	} );

	it( 'releases it as soon as the awaited one finishes', () => {
		const run = playHolding( forkedScene(), 'held' );

		run.finishHeldBlock();

		expect( run.played ).toContain( 'joiner' );
	} );

	it( 'runs the awaited block CLEANUP before the joining block is dispatched', () => {
		// The point of waiting: l3's bubble must be off the screen before l2 answers. Marking the
		// block finished before its cleanup ran would leave both on screen at once, which is the
		// symptom the rule was supposed to remove.
		const run = playHolding( forkedScene(), 'held' );

		run.finishHeldBlock();

		expect( run.played ).toEqual( ['start', 'held', 'held:cleanup', 'joiner'] );
	} );

	it( 'still reports the awaited block as VISITED while it is unfinished', () => {
		// Two sets, two questions. `getVisitedBlocks()` is "what has the player been shown", and a
		// block mid-sentence has been shown. Only the join reads the other one.
		const run = playHolding( forkedScene(), 'held' );

		expect( [...run.handle.getVisitedBlocks()] ).toContain( 'held' );
		expect( run.played ).not.toContain( 'joiner' );
	} );
} );

// ─── Several ids ─────────────────────────────────────────────────────────────

describe( 'waitForBlocks — every id must finish', () => {

	it( 'waits for the LAST of them, not the first', () => {
		// `start` forks to two held tracks and continues to a joiner waiting on both.
		const run = playHolding( sceneOf( [
			dialog( 'start', { next: ['heldA', 'heldB', 'joiner'] } ),
			dialog( 'heldA', { async: true } ),
			dialog( 'heldB', { async: true } ),
			dialog( 'joiner', { waitFor: ['heldA', 'heldB'] } ),
		] ), 'heldB' );

		// heldA finished on its own (its handler advanced); heldB is still held.
		expect( run.played ).toContain( 'heldA' );
		expect( run.played ).toContain( 'heldB' );
		expect( run.played ).not.toContain( 'joiner' );

		run.finishHeldBlock();
		expect( run.played ).toContain( 'joiner' );
	} );
} );

// ─── Already finished ────────────────────────────────────────────────────────

describe( 'waitForBlocks — already finished', () => {

	it( 'does not hold on a block this track already left', () => {
		// A join drawn onto a predecessor on the SAME track. It finished by definition — the track
		// left it to get here — so the wait must not cost a frame.
		const played: string[] = [];
		const engine = new DialogueEngine();
		engine.init( { data: sceneOf( [
			dialog( 'first', { next: ['second'] } ),
			dialog( 'second', { waitFor: ['first'] } ),
		] ) } );
		registerUnusedHandlers( engine );
		engine.onDialog( ( { block, next } ) => { played.push( block.id ); next(); } );
		engine.scene( 's1' ).start();

		expect( played ).toEqual( ['first', 'second'] );
	} );

	it( 'never dispatches a block waiting on one that cannot finish', () => {
		// A wait on a block the flow never reaches parks the track for good. The engine has no
		// timeout and invents none: an unsatisfiable join is the drawing, and the scene simply
		// stops there rather than guessing what the designer meant.
		const played: string[] = [];
		const engine = new DialogueEngine();
		engine.init( { data: sceneOf( [
			dialog( 'start', { next: ['joiner'] } ),
			dialog( 'joiner', { waitFor: ['nowhere'] } ),
			dialog( 'nowhere' ),
		] ) } );
		registerUnusedHandlers( engine );
		engine.onDialog( ( { block, next } ) => { played.push( block.id ); next(); } );
		const handle = engine.scene( 's1' );
		handle.start();

		expect( played ).toEqual( ['start'] );
		expect( handle.isRunning() ).toBe( true );
	} );
} );
