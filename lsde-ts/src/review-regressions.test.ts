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
// The cross-runtime specs in `tests/*.json` cover the FORMAT. This file covers the ENGINE's own
// contract, which is why it lives in TypeScript only — the three ports carry the same fixes and
// their own equivalents.

import { it, expect } from 'vitest';
import { DialogueEngine } from './engine.js';
import { oneScene, dialog, condition, link, whenCase, test as t } from './test-builders.js';

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
	console.log( '#2 exits =', exits, '| running =', h.isRunning(), '| engine.isRunning =', e.isRunning() );
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
	console.log( '#3 errors =', r.errors.map( x => x.code ), '| warnings =', r.warnings.map( x => x.code ) );
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
		console.log( `#4 portPerCase=${portPerCase} calls =`, JSON.stringify( calls ) );
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
	console.log( '#4b seen =', JSON.stringify( seen ), '(attendu DIALOG-002)' );
	expect( seen ).toEqual( [ 'DIALOG-002' ] );
} );

it( '#7 — deux poignees sur la meme scene', () => {
	const e = eng();
	e.init( { data: oneScene( [ dialog( 'DIALOG-001' ) ] ) } );
	e.onDialog( () => { /* park */ } );
	const a = e.scene( 's1' ); const b = e.scene( 's1' );
	a.start(); b.start();
	a.cancel();
	console.log( '#7 b.isRunning =', b.isRunning(), '| engine.isRunning =', e.isRunning() );
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
	console.log( '#5 avant deblocage =', JSON.stringify( seen ) );
	expect( seen ).not.toContain( 'DIALOG-003' ); // parque
	parked[0]!();
	console.log( '#5 apres deblocage =', JSON.stringify( seen ) );
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
	console.log( '#6 dispatched =', JSON.stringify( seen ), '| validated =', JSON.stringify( validated ) );
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
	console.log( '#6b seen =', JSON.stringify( seen ), '| reason =', refused );
	expect( seen ).not.toContain( 'DIALOG-004' );
	expect( seen ).toContain( 'DIALOG-002' );
	expect( refused ).toBe( 'nope' );
} );
