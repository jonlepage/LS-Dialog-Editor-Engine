/**
 * Robustness tests — engine behaviour when the developer's callbacks misbehave.
 *
 * Every case here is something a game integration does by accident: a timer that fires
 * twice, a `resolve()` kept in a closure and called after the scene ended, a NOTE block
 * wired back on itself by a designer, a handler that throws.
 *
 * The engine cannot prevent any of these; it can only refuse to make them worse than
 * they are. Nothing in this file tests the port resolution algorithm — see
 * port-resolver.test.ts for that.
 */
import { describe, it, expect, vi } from 'vitest';
import { SceneHandleImpl, type SceneHandleCallbacks } from './scene-handle.js';
import { SceneGraph } from './graph.js';
import { HandlerRegistry } from './handler-registry.js';
import type { BlueprintScene, BlueprintBlock } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dialog( uuid: string, opts: { start?: boolean } = {} ): BlueprintBlock {
	return { uuid, type: 'DIALOG', properties: [], isStartBlock: opts.start } as BlueprintBlock;
}

function note( uuid: string, opts: { start?: boolean } = {} ): BlueprintBlock {
	return { uuid, type: 'NOTE', properties: [], isStartBlock: opts.start } as BlueprintBlock;
}

function conn( fromId: string, toId: string, fromPort = 'out' ) {
	return { id: `${ fromId }-${ toId }`, fromId, toId, fromPort, toPort: 'in' };
}

function makeScene( overrides: Partial<BlueprintScene> = {} ): BlueprintScene {
	return { uuid: 's1', label: 'S1', date: '2025-01-01', blocks: [], connections: [], ...overrides };
}

function makeCallbacks(): SceneHandleCallbacks {
	return {
		onSceneStarted: vi.fn(),
		onSceneEnded: vi.fn(),
		getResolveCharacter: () => ( chars ) => chars[0],
		getConditionResolver: () => null,
		getLocale: () => 'en',
	};
}

function fillRequiredHandlers( reg: HandlerRegistry ): void {
	reg.dialogHandler ??= ( { next } ) => { next(); };
	reg.choiceHandler ??= ( { context, next } ) => {
		if ( context.choices.length > 0 ) context.selectChoice( context.choices[0]!.uuid );
		next();
	};
	reg.conditionHandler ??= ( { context, next } ) => { context.resolve( true ); next(); };
	reg.actionHandler ??= ( { context, next } ) => { context.resolve(); next(); };
}

// ─── onBeforeBlock resolve() called twice ────────────────────────────────────

describe( 'robustness — onBeforeBlock resolve() called twice', () => {

	it( 'second resolve() does not run the block handler a second time', () => {
		const dispatched: string[] = [];
		const scene = makeScene( {
			blocks: [dialog( 'b1', { start: true } ), dialog( 'b2' )],
			connections: [conn( 'b1', 'b2' )],
		} );
		const global = new HandlerRegistry();
		global.beforeBlockHandler = ( { resolve } ) => {
			resolve();
			resolve(); // a double-fired timer, or a retry — must be ignored
		};
		global.dialogHandler = ( { block, next } ) => {
			dispatched.push( block.uuid );
			next();
		};
		fillRequiredHandlers( global );

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();

		expect( dispatched ).toEqual( ['b1', 'b2'] );
	} );

} );

// ─── A stale resolve() must not restart a finished scene ─────────────────────

describe( 'robustness — callback held past the end of the scene', () => {

	it( 'a resolve() called after the scene ended does not revive it', () => {
		const dispatched: string[] = [];
		const staleResolvers: Array<() => void> = [];
		const scene = makeScene( {
			blocks: [dialog( 'b1', { start: true } )],
			connections: [],
		} );
		const global = new HandlerRegistry();
		global.beforeBlockHandler = ( { resolve } ) => {
			staleResolvers.push( resolve );
			resolve();
		};
		global.dialogHandler = ( { block, next } ) => {
			dispatched.push( block.uuid );
			next();
		};
		fillRequiredHandlers( global );

		const callbacks = makeCallbacks();
		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, callbacks );
		handle.start();

		expect( handle.isRunning() ).toBe( false );
		expect( dispatched ).toEqual( ['b1'] );

		// The game's UI kept the resolve() from a delay it never cancelled.
		for ( const resolve of staleResolvers ) resolve();

		expect( dispatched ).toEqual( ['b1'] );
		expect( callbacks.onSceneEnded ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'a resolve() called after cancel() does not dispatch', () => {
		const dispatched: string[] = [];
		const staleResolvers: Array<() => void> = [];
		const scene = makeScene( {
			blocks: [dialog( 'b1', { start: true } ), dialog( 'b2' )],
			connections: [conn( 'b1', 'b2' )],
		} );
		const global = new HandlerRegistry();
		global.beforeBlockHandler = ( { resolve } ) => {
			staleResolvers.push( resolve );
		};
		global.dialogHandler = ( { block, next } ) => {
			dispatched.push( block.uuid );
			next();
		};
		fillRequiredHandlers( global );

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();
		handle.cancel();

		for ( const resolve of staleResolvers ) resolve();

		expect( dispatched ).toEqual( [] );
	} );

} );

// ─── A NOTE wired back on itself ─────────────────────────────────────────────

describe( 'robustness — NOTE blocks forming a cycle', () => {

	it( 'a NOTE wired to itself ends the scene instead of overflowing the stack', () => {
		const scene = makeScene( {
			blocks: [note( 'n1', { start: true } )],
			connections: [conn( 'n1', 'n1' )],
		} );
		const global = new HandlerRegistry();
		fillRequiredHandlers( global );

		const callbacks = makeCallbacks();
		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, callbacks );

		expect( () => handle.start() ).not.toThrow();
		expect( handle.isRunning() ).toBe( false );
		expect( callbacks.onSceneEnded ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'two NOTEs wired in a loop end the scene', () => {
		const scene = makeScene( {
			blocks: [note( 'n1', { start: true } ), note( 'n2' )],
			connections: [conn( 'n1', 'n2' ), conn( 'n2', 'n1' )],
		} );
		const global = new HandlerRegistry();
		fillRequiredHandlers( global );

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );

		expect( () => handle.start() ).not.toThrow();
		expect( handle.isRunning() ).toBe( false );
	} );

	it( 'a NOTE loop that eventually reaches a real block still reaches it', () => {
		const dispatched: string[] = [];
		const scene = makeScene( {
			blocks: [note( 'n1', { start: true } ), note( 'n2' ), dialog( 'b1' )],
			connections: [conn( 'n1', 'n2' ), conn( 'n2', 'b1' )],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			dispatched.push( block.uuid );
			next();
		};
		fillRequiredHandlers( global );

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();

		expect( dispatched ).toEqual( ['b1'] );
	} );

} );

// ─── A handler that throws ───────────────────────────────────────────────────

/**
 * The two halves of this describe encode a documented ASYMMETRY, not an intention:
 * an exception thrown by a handler is swallowed, while an exception thrown by the cleanup
 * function that same handler returned reaches the caller. Both are the same kind of fault
 * in the same game code. Pinned here so that changing either one is a deliberate act.
 */
describe( 'robustness — a handler that throws', () => {

	it( 'a handler exception is swallowed and the scene ends (documented)', () => {
		const scene = makeScene( {
			blocks: [dialog( 'b1', { start: true } )],
			connections: [],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = () => {
			throw new Error( 'handler exploded' );
		};
		fillRequiredHandlers( global );

		const callbacks = makeCallbacks();
		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, callbacks );

		expect( () => handle.start() ).not.toThrow();
		expect( handle.isRunning() ).toBe( false );
		expect( callbacks.onSceneEnded ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'a cleanup exception is NOT swallowed — the asymmetry', () => {
		const scene = makeScene( {
			blocks: [dialog( 'b1', { start: true } )],
			connections: [],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { next } ) => {
			next();
			return () => { throw new Error( 'cleanup exploded' ); };
		};
		fillRequiredHandlers( global );

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );

		expect( () => handle.start() ).toThrow( 'cleanup exploded' );
	} );

} );
