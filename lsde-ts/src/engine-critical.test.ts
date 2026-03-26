/**
 * Critical edge case tests for DialogueEngine.
 * Covers: missing handlers, double-init, double-start, handler throw,
 * 0 visible choices, two simultaneous scenes, re-init, scene after stop.
 */
import { describe, it, expect, vi } from 'vitest';
import { DialogueEngine } from './engine.js';
import type { BlueprintExport, BlueprintScene } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dialog( uuid: string, opts: { start?: boolean; text?: string } = {} ) {
	return {
		uuid, type: 'DIALOG' as const, properties: [],
		isStartBlock: opts.start,
		dialogueText: opts.text ? { en: opts.text } : undefined,
	};
}

function scene( uuid: string, overrides: Partial<BlueprintScene> = {} ): BlueprintScene {
	return {
		uuid, label: uuid, date: '2025-01-01',
		blocks: [dialog( `${ uuid }-b1`, { start: true } )],
		connections: [],
		...overrides,
	};
}

function makeExport( scenes: BlueprintScene[] ): BlueprintExport {
	return { version: '1.0.0', exportDate: '2025-01-01', locales: ['en'], scenes };
}

function registerAllHandlers( engine: DialogueEngine ) {
	engine.onDialog( ( { next } ) => { next(); } );
	engine.onChoice( ( { context, next } ) => {
		if ( context.choices.length > 0 ) context.selectChoice( context.choices[0]!.uuid );
		next();
	} );
	engine.onCondition( ( { context, next } ) => { context.resolve( true ); next(); } );
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
			calls.push( block.uuid );
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

	it( 'exception in onDialog ends scene gracefully', () => {
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [scene( 's1' )] ) } );
		registerAllHandlers( engine );
		engine.onDialog( () => {
			throw new Error( 'handler crashed' );
		} );

		const handle = engine.scene( 's1' );
		handle.start();
		// Handler exception is caught — scene ends without propagating
		expect( handle.isRunning() ).toBe( false );
	} );

	it( 'exception in cleanup propagates', () => {
		const s: BlueprintScene = {
			uuid: 's1', label: 's1', date: '2025-01-01',
			blocks: [dialog( 'b1', { start: true } ), dialog( 'b2' )],
			connections: [{ id: 'c1', fromId: 'b1', toId: 'b2', fromPort: 'out', toPort: 'in' }],
		};
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
		const s: BlueprintScene = {
			uuid: 's1', label: 's1', date: '2025-01-01',
			blocks: [
				dialog( 'b1', { start: true } ),
				{
					uuid: 'choice1', type: 'CHOICE' as const, properties: [],
					choices: [
						{ uuid: 'c1', structureKey: 'c1', dialogueText: { en: 'A' },
							visibilityConditions: [{ uuid: 'v1', key: 'x', operator: '=', value: 'y' }] },
						{ uuid: 'c2', structureKey: 'c2', dialogueText: { en: 'B' },
							visibilityConditions: [{ uuid: 'v2', key: 'x', operator: '=', value: 'y' }] },
					],
				},
			],
			connections: [{ id: 'c1', fromId: 'b1', toId: 'choice1', fromPort: 'out', toPort: 'in' }],
		};

		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [s] ) } );
		registerAllHandlers( engine );
		engine.setChoiceFilter( () => false );
		engine.onDialog( ( { next } ) => next() );
		engine.onChoice( ( { context, next } ) => {
			receivedChoices = [...context.choices.filter( c => c.visible )];
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
		const s1: BlueprintScene = {
			uuid: 'tavern', label: 'Tavern', date: '2025-01-01',
			blocks: [dialog( 'tavern-greet', { start: true, text: 'Welcome to tavern' } )],
			connections: [],
		};
		const s2: BlueprintScene = {
			uuid: 'forest', label: 'Forest', date: '2025-01-01',
			blocks: [dialog( 'forest-enter', { start: true, text: 'You enter the forest' } )],
			connections: [],
		};

		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [s1, s2] ) } );
		registerAllHandlers( engine );
		engine.onDialog( ( { block } ) => {
			calls.push( block.uuid );
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
			visited.push( block.uuid );
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
