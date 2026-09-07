/**
 * Critical edge case tests for DialogueEngine.
 * Covers: missing handlers, double-init, double-start, handler throw,
 * 0 visible choices, two simultaneous scenes, re-init, scene after stop.
 */
import { describe, it, expect, vi } from 'vitest';
import { DialogueEngine } from './engine.js';
import type { Blueprints, Scene, Block } from './types.js';
import { blueprint, dialog as buildDialog, choice, option, link } from './test-builders.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dialog( id: string, opts: { text?: string } = {} ): Block {
	return buildDialog( id, opts.text ? { text: { en: opts.text } } : {} );
}

/** A scene named by its PATH. Block ids repeat between scenes in v2, and that is normal. */
function scene( path: string, overrides: Partial<Scene> = {} ): Scene {
	const blocks = overrides.blocks ?? [dialog( `${ path }-b1` )];
	return {
		scene: path,
		id: `sc_${ path }`,
		start: blocks[0]?.id,
		...overrides,
		blocks,
	};
}

function makeExport( scenes: Scene[] ): Blueprints {
	return blueprint( scenes );
}

function registerAllHandlers( engine: DialogueEngine ) {
	engine.onDialog( ( { next } ) => { next(); } );
	engine.onChoice( ( { context, next } ) => {
		if ( context.options.length > 0 ) context.selectChoice( context.options[0]!.id );
		next();
	} );
	engine.onCondition( ( { next } ) => { next(); } );
	engine.onAction( ( { context, next } ) => { context.resolve(); next(); } );
}

// ─── Scene without handlers ──────────────────────────────────────────────────

describe( 'engine — scene without handlers', () => {

	it( 'start() throws when no handlers are registered', () => {
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [scene( 's1' )] ) } );

		expect( () => engine.scene( 's1' ).start() ).toThrow( 'missing required handler' );
	} );

	it( 'start() throws when only some handlers are registered', () => {
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [scene( 's1' )] ) } );
		engine.onDialog( ( { next } ) => next() );

		expect( () => engine.scene( 's1' ).start() ).toThrow( 'missing required handler' );
	} );

	it( 'start() succeeds when all 4 handlers are registered', () => {
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [scene( 's1' )] ) } );
		registerAllHandlers( engine );

		expect( () => engine.scene( 's1' ).start() ).not.toThrow();
	} );

} );

// ─── Double init ─────────────────────────────────────────────────────────────

describe( 'engine — double init', () => {

	it( 'second init replaces data cleanly', () => {
		const engine = new DialogueEngine();

		const report1 = engine.init( { data: makeExport( [scene( 's1' )] ) } );
		expect( report1.errors ).toHaveLength( 0 );

		// Re-init with different data
		const report2 = engine.init( { data: makeExport( [scene( 's2' )] ) } );
		expect( report2.errors ).toHaveLength( 0 );

		// Old scene should not be accessible
		expect( () => engine.scene( 's1' ) ).toThrow( 'not found' );
		// New scene works
		expect( () => engine.scene( 's2' ) ).not.toThrow();
	} );

	it( 'init after failed init recovers', () => {
		const engine = new DialogueEngine();

		// Bad data
		const bad = engine.init( { data: { ...makeExport( [] ), scenes: [] } } );
		expect( bad.errors.length ).toBeGreaterThan( 0 );

		// Good data
		const good = engine.init( { data: makeExport( [scene( 's1' )] ) } );
		expect( good.errors ).toHaveLength( 0 );
		expect( () => engine.scene( 's1' ) ).not.toThrow();
	} );

} );

// ─── Double start ────────────────────────────────────────────────────────────

describe( 'engine — double start', () => {

	it( 'start() called twice is a no-op', () => {
		const calls: string[] = [];
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [scene( 's1' )] ) } );
		registerAllHandlers( engine );
		engine.onDialog( ( { block } ) => {
			calls.push( block.id );
			// Don't call next — stay active
		} );

		const handle = engine.scene( 's1' );
		handle.start();
		handle.start(); // second call — should be no-op

		// Handler should fire only once
		expect( calls ).toEqual( ['s1-b1'] );
		expect( handle.isRunning() ).toBe( true );
	} );

} );

// ─── Cancel edge cases ──────────────────────────────────────────────────────

describe( 'engine — cancel edge cases', () => {

	it( 'cancel() before start() is a no-op', () => {
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [scene( 's1' )] ) } );
		const exitSpy = vi.fn();
		engine.onSceneExit( exitSpy );

		const handle = engine.scene( 's1' );
		handle.cancel(); // before start

		expect( handle.isRunning() ).toBe( false );
		expect( exitSpy ).not.toHaveBeenCalled(); // no exit since never started
	} );

	it( 'cancel() called twice does not double-fire exit', () => {
		const exitSpy = vi.fn();
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [scene( 's1' )] ) } );
		registerAllHandlers( engine );
		engine.onSceneExit( exitSpy );
		engine.onDialog( () => {} ); // stay active

		const handle = engine.scene( 's1' );
		handle.start();
		handle.cancel();
		handle.cancel(); // second cancel

		expect( exitSpy ).toHaveBeenCalledOnce();
	} );

} );

// ─── Handler that throws ─────────────────────────────────────────────────────

describe( 'engine — handler that throws', () => {

	it( 'exception in onDialog closes the scene AND reaches the caller', () => {
		// v1 swallowed this one, silently, while an exception from the cleanup that same handler
		// returned reached the caller. Same fault, two opposite behaviours. Now both surface —
		// and the scene is closed down first, so the game gets the error with the dialogue
		// already stopped properly.
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [scene( 's1' )] ) } );
		registerAllHandlers( engine );
		engine.onDialog( () => {
			throw new Error( 'handler crashed' );
		} );

		const handle = engine.scene( 's1' );

		expect( () => handle.start() ).toThrow( 'handler crashed' );
		expect( handle.isRunning() ).toBe( false );
	} );

	it( 'exception in cleanup propagates', () => {
		const b1 = dialog( 'b1' );
		b1.next = [link( 'b2' )];
		const s = scene( 's1', { blocks: [b1, dialog( 'b2' )] } );
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [s] ) } );
		registerAllHandlers( engine );

		let first = true;
		engine.onDialog( ( { next } ) => {
			next();
			if ( first ) {
				first = false;
				return () => { throw new Error( 'cleanup crashed' ); };
			}
		} );

		expect( () => engine.scene( 's1' ).start() ).toThrow( 'cleanup crashed' );
	} );

} );

// ─── Zero visible choices ────────────────────────────────────────────────────

describe( 'engine — zero visible choices', () => {

	it( 'handler receives empty choices array when all conditions fail', () => {
		let receivedChoices: unknown[] = [];
		const gate = [{ dict: 'switches', entry: 'x', op: 'equals', value: true }] as never;
		const b1 = dialog( 'b1' );
		b1.next = [link( 'choice1' )];
		const s = scene( 's1', {
			blocks: [
				b1,
				choice( 'choice1', [
					option( 'C1', { text: 'A' } ),
					option( 'C2', { text: 'B' } ),
				] ),
			],
		} );
		( s.blocks[1]!.options ?? [] ).forEach( o => { o.when = gate; } );

		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [s] ) } );
		registerAllHandlers( engine );
		engine.onResolveCondition( () => false );
		engine.onDialog( ( { next } ) => next() );
		engine.onChoice( ( { context, next } ) => {
			receivedChoices = [...context.options.filter( c => c.visible )];
			next(); // advance with no selection — dead end
		} );

		engine.scene( 's1' ).start();
		expect( receivedChoices ).toHaveLength( 0 );
	} );

} );

// ─── Two simultaneous scenes ─────────────────────────────────────────────────

describe( 'engine — two simultaneous scenes', () => {

	it( 'two scenes run in parallel with independent state', () => {
		const calls: string[] = [];
		const s1 = scene( 'tavern', { blocks: [dialog( 'tavern-greet', { text: 'Welcome to tavern' } )] } );
		const s2 = scene( 'forest', { blocks: [dialog( 'forest-enter', { text: 'You enter the forest' } )] } );

		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [s1, s2] ) } );
		registerAllHandlers( engine );
		engine.onDialog( ( { block } ) => {
			calls.push( block.id );
			// Don't call next — keep both alive
		} );

		const h1 = engine.scene( 'tavern' );
		const h2 = engine.scene( 'forest' );
		h1.start();
		h2.start();

		expect( engine.isRunning() ).toBe( true );
		expect( engine.getActiveScenes() ).toHaveLength( 2 );
		expect( engine.getCurrentBlocks() ).toHaveLength( 2 );
		expect( calls ).toContain( 'tavern-greet' );
		expect( calls ).toContain( 'forest-enter' );

		// Stop only one
		h1.cancel();
		expect( engine.getActiveScenes() ).toHaveLength( 1 );
		expect( engine.isRunning() ).toBe( true );

		// Stop the other
		h2.cancel();
		expect( engine.isRunning() ).toBe( false );
	} );

	it( 'stop() cancels both scenes', () => {
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [scene( 's1' ), scene( 's2' )] ) } );
		registerAllHandlers( engine );
		engine.onDialog( () => {} ); // stay active

		engine.scene( 's1' ).start();
		engine.scene( 's2' ).start();
		expect( engine.getActiveScenes() ).toHaveLength( 2 );

		engine.stop();
		expect( engine.isRunning() ).toBe( false );
		expect( engine.getActiveScenes() ).toHaveLength( 0 );
	} );

} );

// ─── Scene after stop ────────────────────────────────────────────────────────

describe( 'engine — scene after stop', () => {

	it( 'can create and start a new scene after stop()', () => {
		const visited: string[] = [];
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [scene( 's1' )] ) } );
		registerAllHandlers( engine );
		engine.onDialog( ( { block, next } ) => {
			visited.push( block.id );
			next();
		} );

		// First run
		engine.scene( 's1' ).start();
		expect( visited ).toEqual( ['s1-b1'] );

		// Second run after implicit stop (scene ended naturally)
		engine.scene( 's1' ).start();
		expect( visited ).toEqual( ['s1-b1', 's1-b1'] );
	} );

	it( 'can restart after explicit stop()', () => {
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [scene( 's1' )] ) } );
		registerAllHandlers( engine );
		engine.onDialog( () => {} ); // stay active

		const h1 = engine.scene( 's1' );
		h1.start();
		engine.stop();

		const h2 = engine.scene( 's1' );
		h2.start();
		expect( engine.isRunning() ).toBe( true );
	} );

} );
