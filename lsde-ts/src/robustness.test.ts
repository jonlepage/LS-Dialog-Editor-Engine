/**
 * Robustness tests — what the engine does when the game's callbacks misbehave.
 *
 * Every case here is something an integration does by accident: a timer that fires twice, a
 * `resolve()` kept in a closure and called after the scene ended, a NOTE block a designer wired
 * back on itself, a handler that throws.
 *
 * The engine cannot prevent any of these. It can only refuse to make them worse — and, since the
 * v2 work, refuse to hide them: an exception now reaches the game instead of vanishing.
 *
 * Nothing here tests port resolution; that is port-resolver.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { SceneHandleImpl, type SceneHandleCallbacks } from './scene-handle.js';
import { SceneGraph } from './graph.js';
import { HandlerRegistry } from './handler-registry.js';
import { scene as makeScene, dialog, note, link } from './test-builders.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCallbacks(): SceneHandleCallbacks {
	return {
		onSceneStarted: vi.fn(),
		onSceneEnded: vi.fn(),
		getResolveCharacter: () => ( actors ) => actors[0],
		getConditionResolver: () => null,
		getCard: () => undefined,
	};
}

function fillRequiredHandlers( reg: HandlerRegistry ): void {
	reg.dialogHandler ??= ( { next } ) => { next(); };
	reg.choiceHandler ??= ( { context, next } ) => {
		if ( context.options.length > 0 ) context.selectChoice( context.options[0]!.id );
		next();
	};
	reg.conditionHandler ??= ( { next } ) => { next(); };
	reg.actionHandler ??= ( { context, next } ) => { context.resolve(); next(); };
}

// ─── onBeforeBlock resolve() called twice ────────────────────────────────────

describe( 'robustness — onBeforeBlock resolve() called twice', () => {

	it( 'second resolve() does not run the block handler a second time', () => {
		const dispatched: string[] = [];
		const scene = makeScene( [dialog( 'b1', { next: [link( 'b2' )] } ), dialog( 'b2' )] );
		const global = new HandlerRegistry();
		global.beforeBlockHandler = ( { resolve } ) => {
			resolve();
			resolve(); // a double-fired timer, or a retry — must be ignored
		};
		global.dialogHandler = ( { block, next } ) => {
			dispatched.push( block.id );
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
		const scene = makeScene( [dialog( 'b1' )] );
		const global = new HandlerRegistry();
		global.beforeBlockHandler = ( { resolve } ) => {
			staleResolvers.push( resolve );
			resolve();
		};
		global.dialogHandler = ( { block, next } ) => {
			dispatched.push( block.id );
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
		const scene = makeScene( [dialog( 'b1', { next: [link( 'b2' )] } ), dialog( 'b2' )] );
		const global = new HandlerRegistry();
		global.beforeBlockHandler = ( { resolve } ) => {
			staleResolvers.push( resolve );
		};
		global.dialogHandler = ( { block, next } ) => {
			dispatched.push( block.id );
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

	// Before the walk kept a `seen` set, following a self-wired NOTE recursed until the stack
	// gave out. In C# that is a StackOverflowException, which .NET cannot catch: a designer's
	// stray wire did not fail a scene, it killed the whole Unity process.

	it( 'a NOTE wired to itself ends the scene instead of overflowing the stack', () => {
		const scene = makeScene( [note( 'n1', { next: [link( 'n1' )] } )] );
		const global = new HandlerRegistry();
		fillRequiredHandlers( global );

		const callbacks = makeCallbacks();
		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, callbacks );

		expect( () => handle.start() ).not.toThrow();
		expect( handle.isRunning() ).toBe( false );
		expect( callbacks.onSceneEnded ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'two NOTEs wired in a loop end the scene', () => {
		const scene = makeScene( [
			note( 'n1', { next: [link( 'n2' )] } ),
			note( 'n2', { next: [link( 'n1' )] } ),
		] );
		const global = new HandlerRegistry();
		fillRequiredHandlers( global );

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );

		expect( () => handle.start() ).not.toThrow();
		expect( handle.isRunning() ).toBe( false );
	} );

	it( 'a NOTE chain that eventually reaches a real block still reaches it', () => {
		const dispatched: string[] = [];
		const scene = makeScene( [
			note( 'n1', { next: [link( 'n2' )] } ),
			note( 'n2', { next: [link( 'b1' )] } ),
			dialog( 'b1' ),
		] );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			dispatched.push( block.id );
			next();
		};
		fillRequiredHandlers( global );

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();

		expect( dispatched ).toEqual( ['b1'] );
	} );

} );

// ─── A handler that throws ───────────────────────────────────────────────────

describe( 'robustness — an exception in game code', () => {

	// v1 swallowed an exception thrown by a handler — silently, not even logged — while an
	// exception from the cleanup that same handler returned reached the caller. One fault, two
	// opposite behaviours. Now everything reaches the game.

	it( 'an exception in a handler reaches the caller', () => {
		const scene = makeScene( [dialog( 'b1' )] );
		const global = new HandlerRegistry();
		global.dialogHandler = () => { throw new Error( 'game blew up' ); };
		fillRequiredHandlers( global );

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );

		expect( () => handle.start() ).toThrow( 'game blew up' );
	} );

	it( 'closes the scene down BEFORE the error surfaces', () => {
		// The order is what makes it usable: by the time the game sees the error, the cleanups
		// have run and onSceneExit has fired. The dialogue stopped properly.
		const events: string[] = [];
		const scene = makeScene( [dialog( 'b1' )] );
		const global = new HandlerRegistry();
		global.sceneExitHandler = () => events.push( 'exit' );
		global.dialogHandler = () => { throw new Error( 'game blew up' ); };
		fillRequiredHandlers( global );

		const callbacks = makeCallbacks();
		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, callbacks );

		expect( () => handle.start() ).toThrow();
		expect( events ).toEqual( ['exit'] );
		expect( handle.isRunning() ).toBe( false );
		expect( callbacks.onSceneEnded ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'an exception in a cleanup reaches the caller too', () => {
		const scene = makeScene( [dialog( 'b1' )] );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { next } ) => {
			next();
			return () => { throw new Error( 'cleanup blew up' ); };
		};
		fillRequiredHandlers( global );

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );

		expect( () => handle.start() ).toThrow( 'cleanup blew up' );
	} );

	it( 'does not leave the scene running after an exception', () => {
		const scene = makeScene( [dialog( 'b1', { next: [link( 'b2' )] } ), dialog( 'b2' )] );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			if ( block.id === 'b2' ) throw new Error( 'boom' );
			next();
		};
		fillRequiredHandlers( global );

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );

		expect( () => handle.start() ).toThrow( 'boom' );
		expect( handle.isRunning() ).toBe( false );
	} );

	// ─── next() kept for later ───────────────────────────────────────────
	//
	// The normal way a game drives this engine: the handler shows the line, returns, and next() is
	// called a frame later when the player presses a key. Nothing covered it in any of the four
	// runtimes — and the C++ port was broken, because its next() read its guards off a stack frame
	// that was already gone.

	it( 'advances when next() is kept and called after the handler returned', () => {
		const scene = makeScene( [
			dialog( 'b1', { next: [link( 'b2' )] } ),
			dialog( 'b2', { next: [link( 'b3' )] } ),
			dialog( 'b3' ),
		] );
		const seen: string[] = [];
		let deferred: ( () => void ) | null = null;

		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			seen.push( block.id );
			if ( block.id === 'b1' ) {
				deferred = next;   // the game waits for the player
				return;
			}
			next();
		};
		fillRequiredHandlers( global );

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( seen ).toEqual( ['b1'] );
		expect( handle.isRunning() ).toBe( true );

		deferred!();

		expect( seen ).toEqual( ['b1', 'b2', 'b3'] );
		expect( handle.isRunning() ).toBe( false );
	} );

	it( 'ignores a kept next() called twice', () => {
		const scene = makeScene( [
			dialog( 'b1', { next: [link( 'b2' )] } ),
			dialog( 'b2', { next: [link( 'b3' )] } ),
			dialog( 'b3' ),
		] );
		const seen: string[] = [];
		let deferred: ( () => void ) | null = null;

		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			seen.push( block.id );
			if ( block.id === 'b1' ) {
				deferred = next;
				return;
			}
			next();
		};
		fillRequiredHandlers( global );

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();
		deferred!();
		deferred!();   // a double-fired input event

		expect( seen ).toEqual( ['b1', 'b2', 'b3'] );
	} );

} );
