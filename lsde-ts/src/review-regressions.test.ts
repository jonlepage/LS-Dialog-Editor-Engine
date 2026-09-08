// LSDE Dialog Engine — the defects the v2 review turned up, each pinned by a test
//
// Seven things were found by reading the four runtimes side by side after the migration, and every
// one of them is here so it cannot come back quietly. They share a shape: the engine did something
// reasonable on ONE path and something else on another, and nothing at runtime said so.
//
//   #2  a cleanup that threw escaped mid-teardown, leaving a scene `running` with no onSceneExit
//   #3  a scene with no block list crashed init() instead of being refused with a reason
//   #4  every condition test reached the game's evaluator twice, a different number of times
//       depending on the mode and on which case matched
//   #5  waitForBlocks was read only by parallel tracks, so the property was inert on the main flow
//   #6  onValidateNextBlock never fired for a block reached by a parallel track
//   #7  two handles on one scene ref: the first to end dropped the live one from the registry
//
// A second pass, before the commit, found three more of exactly the same shape — a teardown that
// promised to finish and did not:
//
//   #8  `fault ?? cancel()` short-circuits, so cancelling a scene stopped at the first cleanup
//       that threw and left every track after it alive, its own cleanup never run
//   #9  engine.stop() had the same hole one level up: a scene left running after stop()
//   #10 two handles on one scene ref again — the SET half this time: the second start evicted the
//       first, which then ran for the rest of the process with nothing able to reach it
//
// A third pass found the same shape once more, this time on the one dead end that was not treated
// as one:
//
//   #11 a block refused by onValidateNextBlock stopped its track WITHOUT ending it — the scene
//       hung open for good, and a refused parallel branch was counted active forever
//   #12 a handler that closed the flow from inside itself and returned a cleanup: the cleanup was
//       stored on a block nobody would ever leave again, so it never ran
//
// The cross-runtime specs in `tests/*.json` cover the FORMAT. This file covers the ENGINE's own
// contract, which is why it lives in TypeScript only — the three ports carry the same fixes and
// their own equivalents.

import { it, expect } from 'vitest';
import { DialogueEngine } from './engine.js';
import {
	oneScene, blueprint, scene as makeScene, dialog, condition, link, whenCase, test as t,
} from './test-builders.js';

function eng() {
	const e = new DialogueEngine();
	e.onDialog( ( { next } ) => next() );
	e.onChoice( ( { next } ) => next() );
	e.onCondition( ( { next } ) => next() );
	e.onAction( ( { next } ) => next() );
	return e;
}

it( '#2 — cleanup qui leve : scene fermee proprement', () => {
	const e = new DialogueEngine();
	let exits = 0;
	e.onSceneExit( () => exits++ );
	e.onDialog( ( { next } ) => { next(); return () => { throw new Error( 'cleanup boom' ); }; } );
	e.onChoice( ( { next } ) => next() ); e.onCondition( ( { next } ) => next() ); e.onAction( ( { next } ) => next() );
	e.init( { data: oneScene( [ dialog( 'DIALOG-001', { next: [ link( 'DIALOG-002' ) ] } ), dialog( 'DIALOG-002' ) ] ) } );
	const h = e.scene( 's1' );
	expect( () => h.start() ).toThrow( 'cleanup boom' );
	expect( exits ).toBe( 1 );
	expect( h.isRunning() ).toBe( false );
	expect( e.isRunning() ).toBe( false );
} );

it( '#3 — une scene sans blocks est diagnostiquee, jamais levee', () => {
	// Elle levait un TypeError depuis init() — depuis la seule fonction dont le travail est de
	// REFUSER un payload illisible en disant pourquoi. Normalisee, pas signalee par un code a
	// elle : « absent » et « vide » sont indiscernables en C# et en C++, et une scene sans blocs
	// dit deja ce qui compte — elle n'a pas d'entree, donc elle ne peut pas jouer.
	const e = eng();
	const r = e.init( { data: { format: 'lsde-blueprints', version: 1, project: 'X', exportedAt: 'z',
		scenes: [ { scene: 's1', id: 'sc_1' } as never ] } as never } );
	expect( r.errors ).toEqual( [] );
	expect( r.warnings.map( x => x.code ) ).toContain( 'NO_START_BLOCK' );
	expect( r.stats ).toEqual( { sceneCount: 1, blockCount: 0, connectionCount: 0 } );
} );

it( '#4 — chaque test envoye une seule fois', () => {
	for ( const portPerCase of [ true, false ] ) {
		const e = eng();
		const calls: string[] = [];
		e.onResolveCondition( ( test ) => { calls.push( `${test.dict}.${test.entry}` ); return true; } );
		e.init( { data: oneScene( [
			condition( 'COND-001', [ whenCase( 'K1', [ t( 'flags', 'a', true ) ] ), whenCase( 'K2', [ t( 'flags', 'b', true ) ] ) ],
				{ props: portPerCase ? { portPerCase: true } : {}, next: [ link( 'DIALOG-001', portPerCase ? 'K1' : 'out' ) ] } ),
			dialog( 'DIALOG-001' ),
		] ) } );
		e.scene( 's1' ).start();
		expect( calls ).toEqual( [ 'flags.a', 'flags.b' ] );
	}
} );

it( '#4b — le port choisi est inchange', () => {
	const seen: string[] = [];
	const e = eng();
	e.onDialog( ( { block, next } ) => { seen.push( block.id ); next(); } );
	e.onResolveCondition( ( test ) => test.entry === 'b' ); // a=false, b=true
	e.init( { data: oneScene( [
		condition( 'COND-001', [ whenCase( 'K1', [ t( 'flags', 'a', true ) ] ), whenCase( 'K2', [ t( 'flags', 'b', true ) ] ) ],
			{ props: { portPerCase: true }, next: [ link( 'DIALOG-001', 'K1' ), link( 'DIALOG-002', 'K2' ) ] } ),
		dialog( 'DIALOG-001' ), dialog( 'DIALOG-002' ),
	] ) } );
	e.scene( 's1' ).start();
	expect( seen ).toEqual( [ 'DIALOG-002' ] );
} );

it( '#7 — deux poignees sur la meme scene', () => {
	const e = eng();
	e.init( { data: oneScene( [ dialog( 'DIALOG-001' ) ] ) } );
	e.onDialog( () => { /* park */ } );
	const a = e.scene( 's1' ); const b = e.scene( 's1' );
	a.start(); b.start();
	a.cancel();
	expect( b.isRunning() ).toBe( true );
	expect( e.isRunning() ).toBe( true );
} );

it( '#5 — waitForBlocks honore sur la piste principale (join)', () => {
	const e = eng();
	const seen: string[] = [];
	const parked: Array<() => void> = [];
	e.onDialog( ( { block, next } ) => {
		seen.push( block.id );
		if ( block.id === 'DIALOG-004' ) { parked.push( next ); return; } // la branche async attend le jeu
		next();
	} );
	e.init( { data: oneScene( [
		// D1 forke : D4 async (parquee par le jeu), D2 principal qui attend D5
		dialog( 'DIALOG-001', { next: [ { port: 'out', to: 'DIALOG-002', toPort: 'in' }, { port: 'out', to: 'DIALOG-004', toPort: 'in' } ] } ),
		dialog( 'DIALOG-002', { props: { waitForBlocks: [ 'DIALOG-005' ] }, next: [ link( 'DIALOG-003' ) ] } ),
		dialog( 'DIALOG-003' ),
		dialog( 'DIALOG-004', { props: { isAsync: true }, next: [ link( 'DIALOG-005' ) ] } ),
		dialog( 'DIALOG-005' ),
	] ) } );
	e.scene( 's1' ).start();
	expect( seen ).not.toContain( 'DIALOG-003' ); // parque
	parked[0]!();
	expect( seen ).toContain( 'DIALOG-003' );
} );

it( '#6 — onValidateNextBlock se declenche sur les pistes async', () => {
	const e = eng();
	const seen: string[] = []; const validated: string[] = [];
	e.onDialog( ( { block, next } ) => { seen.push( block.id ); next(); } );
	e.onValidateNextBlock( ( { nextBlock } ) => { validated.push( nextBlock.id ); return { valid: true }; } );
	e.init( { data: oneScene( [
		dialog( 'DIALOG-001', { next: [ { port: 'out', to: 'DIALOG-002', toPort: 'in' }, { port: 'out', to: 'DIALOG-003', toPort: 'in' } ] } ),
		dialog( 'DIALOG-002' ),
		dialog( 'DIALOG-003', { props: { isAsync: true }, next: [ link( 'DIALOG-004' ) ] } ),
		dialog( 'DIALOG-004' ),
	] ) } );
	e.scene( 's1' ).start();
	expect( validated.sort() ).toEqual( seen.sort() );
} );

it( '#6b — un refus arrete la piste async, pas la scene', () => {
	const e = eng();
	const seen: string[] = []; let refused = '';
	e.onDialog( ( { block, next } ) => { seen.push( block.id ); next(); } );
	e.onValidateNextBlock( ( { nextBlock } ) => nextBlock.id === 'DIALOG-004' ? { valid: false, reason: 'nope' } : { valid: true } );
	e.onInvalidateBlock( ( { reason } ) => { refused = reason; } );
	e.init( { data: oneScene( [
		dialog( 'DIALOG-001', { next: [ { port: 'out', to: 'DIALOG-002', toPort: 'in' }, { port: 'out', to: 'DIALOG-003', toPort: 'in' } ] } ),
		dialog( 'DIALOG-002' ),
		dialog( 'DIALOG-003', { props: { isAsync: true }, next: [ link( 'DIALOG-004' ) ] } ),
		dialog( 'DIALOG-004' ),
	] ) } );
	e.scene( 's1' ).start();
	expect( seen ).not.toContain( 'DIALOG-004' );
	expect( seen ).toContain( 'DIALOG-002' );
	expect( refused ).toBe( 'nope' );
} );

// ─── #8 — a cleanup that throws must not strand the tracks after it ──────────
//
// `fault = fault ?? track.cancel()` reads like an accumulator and is not one: `??` does not
// evaluate its right side once the left is set. So the FIRST cleanup that threw ended the loop,
// and every track after it stayed alive with its cleanup unrun — a UI panel, an audio voice, an
// effect the game had spawned, leaked for the rest of the process.
//
// The comment above that loop promised the opposite, word for word. C++ and GDScript had it right;
// TypeScript and C# did not.

it( '#8 cancelling a scene runs every track cleanup, even after one throws', () => {
	const cleaned: string[] = [];
	const e = eng();
	e.onDialog( ( { block, next } ) => {
		if ( block.id === 'FORK' ) { next(); return undefined; }
		return () => {
			cleaned.push( block.id );
			if ( block.id === 'MAIN' ) throw new Error( 'boom' );
		};
	} );
	e.init( { data: oneScene( [
		dialog( 'FORK', { next: [link( 'MAIN' ), link( 'SIDE-1' ), link( 'SIDE-2' )] } ),
		dialog( 'MAIN' ),
		dialog( 'SIDE-1', { props: { isAsync: true } } ),
		dialog( 'SIDE-2', { props: { isAsync: true } } ),
	] ) } );

	const h = e.scene( 's1' );
	h.start();
	expect( h.getActiveTracks() ).toBe( 2 );

	expect( () => h.cancel() ).toThrow( 'boom' );

	expect( cleaned.sort() ).toEqual( ['MAIN', 'SIDE-1', 'SIDE-2'] );
} );

// ─── #9 — engine.stop() must reach every scene ───────────────────────────────

it( '#9 engine.stop() cancels every scene, even after one cleanup throws', () => {
	const e = eng();
	e.onDialog( ( { block } ) => {
		if ( block.id === 'A' ) return () => { throw new Error( 'boom' ); };
		return undefined;   // park, holding nothing
	} );
	e.init( { data: blueprint( [
		makeScene( [dialog( 'A' )], { scene: 'sA', id: 'sc_a' } ),
		makeScene( [dialog( 'B' )], { scene: 'sB', id: 'sc_b' } ),
	] ) } );

	const a = e.scene( 'sA' );
	const b = e.scene( 'sB' );
	a.start();
	b.start();

	expect( () => e.stop() ).toThrow( 'boom' );

	expect( a.isRunning() ).toBe( false );
	expect( b.isRunning() ).toBe( false );
	expect( e.isRunning() ).toBe( false );
} );

// ─── #10 — the same scene opened twice, both ends tracked ────────────────────
//
// #7 fixed the DELETE half: an ending handle no longer evicts a live namesake. The SET half had
// the same hole — the second start overwrote the first in a map keyed by the scene reference, and
// the first handle then played on with nothing able to see or stop it. The registry is a set of
// handles now; a name cannot collide with itself.

it( '#10 the same scene opened twice is tracked and stopped twice', () => {
	const e = eng();
	e.onDialog( () => undefined );   // both runs park on their first block
	e.init( { data: oneScene( [dialog( 'DIALOG-001' )] ) } );

	const first = e.scene( 's1' );
	const second = e.scene( 's1' );
	first.start();
	second.start();

	expect( e.getActiveScenes().length ).toBe( 2 );

	e.stop();

	expect( first.isRunning() ).toBe( false );
	expect( second.isRunning() ).toBe( false );
	expect( e.isRunning() ).toBe( false );
} );

// ─── #11 — a refused block is a dead end, and dead ends end the flow ─────────
//
// `onValidateNextBlock` returning `{ valid: false }` made the track return silently, still marked
// running. Nothing can restart it: there is no goto, no retry, and `start()` refuses a running
// scene. So the main flow hung the whole scene open — no `onSceneExit`, `isRunning()` true for
// ever, the handle still in the engine's registry — and a refused branch stayed in the pool as a
// track `getActiveTracks()` kept counting.
//
// The guide has always described the engine's own flow as "onInvalidateBlock → scene stops". Every
// other dead end here already did it: a NOTE loop, a port with no wire, a target that is missing.

it( '#11 a block refused on the main flow closes the scene', () => {
	const e = eng();
	const seen: string[] = [];
	let exits = 0;
	let refused: string | undefined;

	e.onDialog( ( { block, next } ) => { seen.push( block.id ); next(); } );
	e.onSceneExit( () => { exits++; } );
	e.onInvalidateBlock( ( { reason } ) => { refused = reason; } );
	e.onValidateNextBlock( ( { nextBlock } ) =>
		nextBlock.id === 'DIALOG-002' ? { valid: false, reason: 'no_keycard' } : { valid: true } );
	e.init( { data: oneScene( [
		dialog( 'DIALOG-001', { next: [link( 'DIALOG-002' )] } ),
		dialog( 'DIALOG-002' ),
	] ) } );

	const h = e.scene( 's1' );
	h.start();

	expect( seen ).toEqual( ['DIALOG-001'] );
	expect( refused ).toBe( 'no_keycard' );
	expect( h.isRunning() ).toBe( false );
	expect( exits ).toBe( 1 );
	expect( e.isRunning() ).toBe( false );
} );

it( '#11b a refused parallel branch stops being counted as a track', () => {
	const e = eng();
	e.onDialog( ( { block, next } ) => {
		if ( block.id === 'MAIN' ) return;   // the main flow parks, so the scene stays open
		next();
	} );
	e.onValidateNextBlock( ( { nextBlock } ) =>
		nextBlock.id === 'SIDE' ? { valid: false, reason: 'nope' } : { valid: true } );
	e.init( { data: oneScene( [
		dialog( 'FORK', { next: [link( 'MAIN' ), link( 'SIDE' )] } ),
		dialog( 'MAIN' ),
		dialog( 'SIDE', { props: { isAsync: true } } ),
	] ) } );

	const h = e.scene( 's1' );
	h.start();

	expect( h.isRunning() ).toBe( true );
	expect( h.getActiveTracks() ).toBe( 0 );
	expect( h.getTrackInfos() ).toEqual( [] );
} );

// ─── #12 — a cleanup returned after the flow was closed still runs ───────────
//
// `scene.cancel()` and `engine.stop()` are callable from inside a handler — the guide shows it.
// The handler then returns its cleanup as usual, and the engine stored it for a departure that had
// already happened: the block was never left again, so the panel it opened stayed open and the
// voice it started kept playing, for the rest of the process.

it( '#12 a handler that cancels its own scene still gets its cleanup run', () => {
	const cleaned: string[] = [];
	const e = eng();
	e.onDialog( ( { block, scene } ) => {
		if ( block.id === 'DIALOG-001' ) scene.cancel();
		return () => { cleaned.push( block.id ); };
	} );
	e.init( { data: oneScene( [
		dialog( 'DIALOG-001', { next: [link( 'DIALOG-002' )] } ),
		dialog( 'DIALOG-002' ),
	] ) } );

	const h = e.scene( 's1' );
	h.start();

	expect( h.isRunning() ).toBe( false );
	expect( cleaned ).toEqual( ['DIALOG-001'] );
} );

it( '#12b the same through engine.stop()', () => {
	const cleaned: string[] = [];
	const e = eng();
	e.onDialog( ( { block } ) => {
		if ( block.id === 'DIALOG-001' ) e.stop();
		return () => { cleaned.push( block.id ); };
	} );
	e.init( { data: oneScene( [
		dialog( 'DIALOG-001', { next: [link( 'DIALOG-002' )] } ),
		dialog( 'DIALOG-002' ),
	] ) } );

	e.scene( 's1' ).start();

	expect( cleaned ).toEqual( ['DIALOG-001'] );
	expect( e.isRunning() ).toBe( false );
} );
