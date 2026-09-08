// LSDE Dialog Engine — SceneHandle and the traversal loop
//
// The scene walks: skip notes, validate, fire onBeforeBlock, run the handler, resolve the port,
// follow it. Everything a game can say back to the engine goes through here.

import { describe, it, expect, vi } from 'vitest';
import { SceneHandleImpl, type SceneHandleCallbacks } from './scene-handle.js';
import { SceneGraph } from './graph.js';
import { HandlerRegistry } from './handler-registry.js';
import type { Scene, Card, ConditionTest } from './types.js';
import {
	scene as makeScene, dialog, choice, condition, action, note,
	link, option, card, whenCase, choiceTest, test as t,
} from './test-builders.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CARDS: Record<string, Card> = {
	var1: card( 'var1', 'kael' ),
	var2: card( 'var2', 'nora' ),
	var7: card( 'var7', 'afraid', 'emotions' ),
};

function makeCallbacks( overrides?: Partial<SceneHandleCallbacks> ): SceneHandleCallbacks {
	return {
		onSceneStarted: vi.fn(),
		onSceneEnded: vi.fn(),
		getResolveCharacter: () => ( actors ) => actors[0],
		getConditionResolver: () => null,
		getCard: ( id ) => CARDS[id],
		...overrides,
	};
}

/** All four mandatory handlers, next-only. Override the one under test afterwards. */
function registerBaseHandlers( registry: HandlerRegistry ): void {
	registry.dialogHandler = ( { next } ) => next();
	registry.choiceHandler = ( { next } ) => next();
	registry.conditionHandler = ( { next } ) => next();
	registry.actionHandler = ( { next } ) => next();
}

function handleFor( scene: Scene, registry: HandlerRegistry, cb?: Partial<SceneHandleCallbacks> ) {
	return new SceneHandleImpl( new SceneGraph( scene ), registry, makeCallbacks( cb ) );
}

// ─── Traversal ───────────────────────────────────────────────────────────────

describe( 'traversal', () => {

	it( 'traverses two dialog blocks linearly', () => {
		const visited: string[] = [];
		const scene = makeScene( [
			dialog( 'b1', { next: [link( 'b2' )] } ),
			dialog( 'b2' ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };

		handleFor( scene, global ).start();

		expect( visited ).toEqual( ['b1', 'b2'] );
	} );

	it( 'starts on the block the SCENE names, not on a per-block flag', () => {
		const visited: string[] = [];
		const scene = makeScene(
			[dialog( 'b1', { next: [link( 'b2' )] } ), dialog( 'b2' )],
			{ start: 'b2' },
		);
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };

		handleFor( scene, global ).start();

		expect( visited ).toEqual( ['b2'] );
	} );

	it( 'ends immediately when the scene names no start block', () => {
		const scene = makeScene( [dialog( 'b1' )], { start: undefined } );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		const handle = handleFor( scene, global );

		handle.start();

		expect( handle.isRunning() ).toBe( false );
	} );

	it( 'handles an empty scene gracefully', () => {
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		const handle = handleFor( makeScene( [] ), global );

		expect( () => handle.start() ).not.toThrow();
		expect( handle.isRunning() ).toBe( false );
	} );

	it( 'skips NOTE blocks and follows their links', () => {
		const visited: string[] = [];
		const scene = makeScene( [
			dialog( 'b1', { next: [link( 'n1' )] } ),
			note( 'n1', { next: [link( 'b2' )] } ),
			dialog( 'b2' ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };

		handleFor( scene, global ).start();

		expect( visited ).toEqual( ['b1', 'b2'] );
	} );

	it( 'follows a link by port name, never by position', () => {
		const visited: string[] = [];
		const scene = makeScene( [
			action( 'a1', [], { next: [link( 'wrong', 'catch' ), link( 'right', 'then' )] } ),
			dialog( 'wrong' ),
			dialog( 'right' ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };
		global.actionHandler = ( { context, next } ) => { context.resolve(); next(); };

		handleFor( scene, global ).start();

		expect( visited ).toEqual( ['right'] );
	} );
} );

// ─── Lifecycle ───────────────────────────────────────────────────────────────

describe( 'lifecycle', () => {

	it( 'fires onSceneEnter and onSceneExit', () => {
		const events: string[] = [];
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.sceneEnterHandler = () => events.push( 'enter' );
		global.sceneExitHandler = () => events.push( 'exit' );

		handleFor( makeScene( [dialog( 'b1' )] ), global ).start();

		expect( events ).toEqual( ['enter', 'exit'] );
	} );

	it( 'Tier 2 onEnter overrides the global onSceneEnter', () => {
		const events: string[] = [];
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.sceneEnterHandler = () => events.push( 'global' );

		const handle = handleFor( makeScene( [dialog( 'b1' )] ), global );
		handle.onEnter( () => events.push( 'scene' ) );
		handle.start();

		expect( events ).toEqual( ['scene'] );
	} );

	it( 'cancel() stops the flow and fires onSceneExit', () => {
		const events: string[] = [];
		const scene = makeScene( [dialog( 'b1', { next: [link( 'b2' )] } ), dialog( 'b2' )] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.sceneExitHandler = () => events.push( 'exit' );

		let handle!: SceneHandleImpl;
		global.dialogHandler = ( { block, next } ) => {
			events.push( block.id );
			if ( block.id === 'b1' ) handle.cancel();
			next();
		};
		handle = handleFor( scene, global );
		handle.start();

		expect( events ).toEqual( ['b1', 'exit'] );
	} );

	it( 'notifies the engine on start and on end', () => {
		const onSceneStarted = vi.fn();
		const onSceneEnded = vi.fn();
		const global = new HandlerRegistry();
		registerBaseHandlers( global );

		handleFor( makeScene( [dialog( 'b1' )] ), global, { onSceneStarted, onSceneEnded } ).start();

		expect( onSceneStarted ).toHaveBeenCalledTimes( 1 );
		expect( onSceneEnded ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'throws when a mandatory handler is missing, and names it', () => {
		const global = new HandlerRegistry();
		global.dialogHandler = ( { next } ) => next();

		expect( () => handleFor( makeScene( [dialog( 'b1' )] ), global ).start() )
			.toThrow( /onChoice/ );
	} );

	it( 'does not need onCondition once a resolver is installed', () => {
		const global = new HandlerRegistry();
		global.dialogHandler = ( { next } ) => next();
		global.choiceHandler = ( { next } ) => next();
		global.actionHandler = ( { next } ) => next();

		const handle = handleFor( makeScene( [dialog( 'b1' )] ), global, {
			getConditionResolver: () => () => true,
		} );

		expect( () => handle.start() ).not.toThrow();
	} );
} );

// ─── Cleanups ────────────────────────────────────────────────────────────────

describe( 'cleanups', () => {

	it( 'runs the cleanup when leaving a block', () => {
		const events: string[] = [];
		const scene = makeScene( [dialog( 'b1', { next: [link( 'b2' )] } ), dialog( 'b2' )] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block, next } ) => {
			events.push( `run:${ block.id }` );
			next();
			return () => events.push( `clean:${ block.id }` );
		};

		handleFor( scene, global ).start();

		expect( events ).toEqual( ['run:b1', 'clean:b1', 'run:b2', 'clean:b2'] );
	} );

	it( 'runs the last cleanup when the scene ends', () => {
		const events: string[] = [];
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { next } ) => { next(); return () => events.push( 'clean' ); };

		handleFor( makeScene( [dialog( 'b1' )] ), global ).start();

		expect( events ).toEqual( ['clean'] );
	} );
} );

// ─── Validation ──────────────────────────────────────────────────────────────

describe( 'onValidateNextBlock', () => {

	it( 'can stop a block', () => {
		const visited: string[] = [];
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };
		global.validateNextBlockHandler = () => ( { valid: false, reason: 'nope' } );

		handleFor( makeScene( [dialog( 'b1' )] ), global ).start();

		expect( visited ).toEqual( [] );
	} );

	it( 'routes to onInvalidateBlock with the reason', () => {
		const reasons: string[] = [];
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.validateNextBlockHandler = () => ( { valid: false, reason: 'character_stunned' } );
		global.invalidateBlockHandler = ( { reason } ) => reasons.push( reason );

		handleFor( makeScene( [dialog( 'b1' )] ), global ).start();

		expect( reasons ).toEqual( ['character_stunned'] );
	} );

	it( 'receives the resolved character of the next block', () => {
		let seen: Card | undefined;
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.validateNextBlockHandler = ( { nextContext } ) => {
			seen = nextContext.character;
			return { valid: true };
		};

		handleFor( makeScene( [dialog( 'b1', { actors: ['var1'] } )] ), global ).start();

		expect( seen?.name ).toBe( 'kael' );
	} );

	it( 'has no character when the block cites no actor', () => {
		let seen: Card | undefined = CARDS.var1;
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.validateNextBlockHandler = ( { nextContext } ) => {
			seen = nextContext.character;
			return { valid: true };
		};

		handleFor( makeScene( [dialog( 'b1' )] ), global ).start();

		expect( seen ).toBeUndefined();
	} );

	it( 'fromContext is null on the first block', () => {
		const seen: Array<unknown> = [];
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.validateNextBlockHandler = ( { fromContext } ) => {
			seen.push( fromContext );
			return { valid: true };
		};

		handleFor( makeScene( [dialog( 'b1' )] ), global ).start();

		expect( seen ).toEqual( [null] );
	} );

	it( 'fromContext carries the character of the block just left', () => {
		const seen: Array<string | undefined> = [];
		const scene = makeScene( [
			dialog( 'b1', { actors: ['var1'], next: [link( 'b2' )] } ),
			dialog( 'b2', { actors: ['var2'] } ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.validateNextBlockHandler = ( { fromContext } ) => {
			seen.push( fromContext?.character?.name );
			return { valid: true };
		};

		handleFor( scene, global ).start();

		expect( seen ).toEqual( [undefined, 'kael'] );
	} );

	it( 'can invalidate on the character', () => {
		const visited: string[] = [];
		const scene = makeScene( [
			dialog( 'b1', { actors: ['var1'], next: [link( 'b2' )] } ),
			dialog( 'b2', { actors: ['var2'] } ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };
		global.validateNextBlockHandler = ( { nextContext } ) =>
			nextContext.character?.name === 'nora' ? { valid: false } : { valid: true };

		handleFor( scene, global ).start();

		expect( visited ).toEqual( ['b1'] );
	} );
} );

// ─── onBeforeBlock ───────────────────────────────────────────────────────────

describe( 'onBeforeBlock', () => {

	it( 'holds the handler back until resolve()', () => {
		const events: string[] = [];
		let release: ( () => void ) | null = null;
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.beforeBlockHandler = ( { resolve } ) => { events.push( 'before' ); release = resolve; };
		global.dialogHandler = ( { next } ) => { events.push( 'dialog' ); next(); };

		handleFor( makeScene( [dialog( 'b1' )] ), global ).start();

		expect( events ).toEqual( ['before'] );
		release!();
		expect( events ).toEqual( ['before', 'dialog'] );
	} );

	it( 'hands over the native properties read out of props', () => {
		let seen: unknown;
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.beforeBlockHandler = ( { context, resolve } ) => {
			seen = context.nativeProperties;
			resolve();
		};

		handleFor( makeScene( [dialog( 'b1', { props: { delay: 1000, debug: true } } )] ), global ).start();

		expect( seen ).toEqual( { delay: 1000, debug: true } );
	} );
} );

// ─── Handler tiers ───────────────────────────────────────────────────────────

describe( 'handler tiers', () => {

	it( 'runs the scene handler then the global one', () => {
		const events: string[] = [];
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { next } ) => { events.push( 'global' ); next(); };

		const handle = handleFor( makeScene( [dialog( 'b1' )] ), global );
		handle.onDialog( ( { next } ) => { events.push( 'scene' ); next(); } );
		handle.start();

		expect( events ).toEqual( ['scene', 'global'] );
	} );

	it( 'preventGlobalHandler() stops the global one', () => {
		const events: string[] = [];
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { next } ) => { events.push( 'global' ); next(); };

		const handle = handleFor( makeScene( [dialog( 'b1' )] ), global );
		handle.onDialog( ( { context, next } ) => {
			context.preventGlobalHandler();
			events.push( 'scene' );
			next();
		} );
		handle.start();

		expect( events ).toEqual( ['scene'] );
	} );

	it( 'onDialogId targets one block by id', () => {
		const events: string[] = [];
		const scene = makeScene( [dialog( 'b1', { next: [link( 'b2' )] } ), dialog( 'b2' )] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );

		const handle = handleFor( scene, global );
		handle.onDialogId( 'b2', ( { next } ) => { events.push( 'targeted' ); next(); } );
		handle.start();

		expect( events ).toEqual( ['targeted'] );
	} );
} );

// ─── Choices ─────────────────────────────────────────────────────────────────

describe( 'choices', () => {

	const choiceScene = () => makeScene( [
		choice( 'c1', [option( 'C1' ), option( 'C2' )], { next: [link( 'b2', 'C1' ), link( 'b3', 'C2' )] } ),
		dialog( 'b2' ),
		dialog( 'b3' ),
	] );

	it( 'follows the port named after the picked option', () => {
		const visited: string[] = [];
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'C2' ); next(); };
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };

		handleFor( choiceScene(), global ).start();

		expect( visited ).toEqual( ['b3'] );
	} );

	it( 'records the pick in the scene history', () => {
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'C1' ); next(); };

		const handle = handleFor( choiceScene(), global );
		handle.start();

		expect( handle.getChoice( 'c1' ) ).toEqual( ['C1'] );
	} );

	it( 'returns nothing for a block that is not a choice', () => {
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		const handle = handleFor( choiceScene(), global );
		handle.start();

		expect( handle.getChoice( 'b2' ) ).toBeUndefined();
	} );

	it( 'accumulates every pass through a choice in a loop', () => {
		let passes = 0;
		const scene = makeScene( [
			choice( 'c1', [option( 'C1' ), option( 'C2' )], { next: [link( 'c1', 'C1' ), link( 'b2', 'C2' )] } ),
			dialog( 'b2' ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => {
			passes++;
			context.selectChoice( passes < 3 ? 'C1' : 'C2' );
			next();
		};

		const handle = handleFor( scene, global );
		handle.start();

		expect( handle.getChoice( 'c1' ) ).toEqual( ['C1', 'C1', 'C2'] );
	} );

	it( 'has an empty history when nothing was picked', () => {
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		const handle = handleFor( makeScene( [dialog( 'b1' )] ), global );
		handle.start();

		expect( handle.getChoiceHistory().size ).toBe( 0 );
	} );

	it( 'keeps the history readable after the scene ends', () => {
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'C1' ); next(); };

		const handle = handleFor( choiceScene(), global );
		handle.start();

		expect( handle.isRunning() ).toBe( false );
		expect( handle.getChoiceHistory().get( 'c1' ) ).toEqual( ['C1'] );
	} );

	it( 'tags option visibility when a resolver is installed', () => {
		let seen: Array<boolean | undefined> = [];
		const scene = makeScene( [
			choice( 'c1', [
				option( 'C1' ),
				option( 'C2', { when: [t( 'variables', 'credits', 50, 'greaterOrEqual' )] } ),
			] ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => {
			seen = context.options.map( o => o.visible );
			next();
		};

		handleFor( scene, global, { getConditionResolver: () => () => false } ).start();

		expect( seen ).toEqual( [true, false] );
	} );

	it( 'leaves visibility unknown when no resolver is installed', () => {
		let seen: Array<boolean | undefined> = [];
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => {
			seen = context.options.map( o => o.visible );
			next();
		};

		handleFor( choiceScene(), global ).start();

		expect( seen ).toEqual( [undefined, undefined] );
	} );
} );

// ─── The reserved `choice` dictionary ────────────────────────────────────────

describe( 'conditions that read a past answer', () => {

	/** A scene that picks an option, then asks a condition about it. */
	function askAbout( when: ConditionTest[], resolver?: ( t: ConditionTest ) => boolean ) {
		const visited: string[] = [];
		const scene = makeScene( [
			choice( 'c1', [option( 'C1' ), option( 'C2' )], { next: [link( 'k1', 'C1' ), link( 'k1', 'C2' )] } ),
			condition( 'k1', [whenCase( 'out', when )], {
				next: [link( 'yes' ), link( 'no', 'default' )],
			} ),
			dialog( 'yes' ),
			dialog( 'no' ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'C1' ); next(); };
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };

		handleFor( scene, global, { getConditionResolver: () => resolver ?? ( () => false ) } ).start();
		return visited;
	}

	it( 'is answered from the scene history, never by the game', () => {
		const asked: ConditionTest[] = [];
		const visited = askAbout( [choiceTest( 'c1', 'C1' )], ( test ) => { asked.push( test ); return false; } );

		expect( visited ).toEqual( ['yes'] );
		expect( asked ).toEqual( [] );
	} );

	it( 'is false when the player picked something else', () => {
		expect( askAbout( [choiceTest( 'c1', 'C2' )] ) ).toEqual( ['no'] );
	} );

	it( 'handles notEquals', () => {
		expect( askAbout( [choiceTest( 'c1', 'C2', 'notEquals' )] ) ).toEqual( ['yes'] );
		expect( askAbout( [choiceTest( 'c1', 'C1', 'notEquals' )] ) ).toEqual( ['no'] );
	} );

	it( 'is false for a CHOICE block that was never reached', () => {
		expect( askAbout( [choiceTest( 'never-visited', 'C1' )] ) ).toEqual( ['no'] );
	} );

	it( 'is TRUE with notEquals for a block that was never reached', () => {
		// Nothing was picked there, so "not C1" holds.
		expect( askAbout( [choiceTest( 'never-visited', 'C1', 'notEquals' )] ) ).toEqual( ['yes'] );
	} );

	it( 'chains with a game-state test in the same case', () => {
		const visited = askAbout(
			[choiceTest( 'c1', 'C1' ), t( 'switches', 'door_unlocked', true, 'equals', 'and' )],
			( test ) => test.entry === 'door_unlocked',
		);
		expect( visited ).toEqual( ['yes'] );
	} );

	it( 'answers a choice test even with no game resolver installed', () => {
		const visited: string[] = [];
		const scene = makeScene( [
			choice( 'c1', [option( 'C1' )], { next: [link( 'k1', 'C1' )] } ),
			condition( 'k1', [whenCase( 'out', [choiceTest( 'c1', 'C1' )] )], {
				next: [link( 'yes' ), link( 'no', 'default' )],
			} ),
			dialog( 'yes' ),
			dialog( 'no' ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'C1' ); next(); };
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };
		global.conditionHandler = ( { next } ) => next();

		handleFor( scene, global ).start();

		expect( visited ).toEqual( ['yes'] );
	} );

	it( 'exposes the history and a single test through the handle', () => {
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'C1' ); next(); };

		const handle = handleFor(
			makeScene( [choice( 'c1', [option( 'C1' )] )] ),
			global,
		);
		handle.start();

		expect( handle.evaluateCondition( choiceTest( 'c1', 'C1' ) ) ).toBe( true );
		expect( handle.evaluateCondition( choiceTest( 'c1', 'C9' ) ) ).toBe( false );
	} );
} );

// ─── Conditions ──────────────────────────────────────────────────────────────

describe( 'conditions', () => {

	it( 'routes by itself once a resolver is installed', () => {
		const visited: string[] = [];
		const scene = makeScene( [
			condition( 'k1', [whenCase( 'out', [t( 'switches', 'x', true )] )], {
				next: [link( 'yes' ), link( 'no', 'default' )],
			} ),
			dialog( 'yes' ),
			dialog( 'no' ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };

		handleFor( scene, global, { getConditionResolver: () => () => true } ).start();

		expect( visited ).toEqual( ['yes'] );
	} );

	it( 'takes the case port with portPerCase', () => {
		const visited: string[] = [];
		const scene = makeScene( [
			condition( 'k1', [
				whenCase( 'K1', [t( 'switches', 'a', true )] ),
				whenCase( 'K2', [t( 'switches', 'b', true )] ),
			], {
				props: { portPerCase: true },
				next: [link( 'first', 'K1' ), link( 'second', 'K2' ), link( 'none', 'default' )],
			} ),
			dialog( 'first' ), dialog( 'second' ), dialog( 'none' ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };

		handleFor( scene, global, { getConditionResolver: () => ( test ) => test.entry === 'b' } ).start();

		expect( visited ).toEqual( ['second'] );
	} );

	it( 'lets the handler override the port', () => {
		const visited: string[] = [];
		const scene = makeScene( [
			condition( 'k1', [whenCase( 'out', [t( 'switches', 'x', true )] )], {
				next: [link( 'yes' ), link( 'no', 'default' )],
			} ),
			dialog( 'yes' ), dialog( 'no' ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };
		global.conditionHandler = ( { context, next } ) => { context.resolve( 'default' ); next(); };

		handleFor( scene, global, { getConditionResolver: () => () => true } ).start();

		expect( visited ).toEqual( ['no'] );
	} );

	it( 'hands the handler each case with its port and result', () => {
		let seen: Array<[string, boolean | undefined]> = [];
		const scene = makeScene( [
			condition( 'k1', [
				whenCase( 'K1', [t( 'switches', 'a', true )] ),
				whenCase( 'K2' ),
			], { props: { portPerCase: true } } ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.conditionHandler = ( { context, next } ) => {
			seen = context.cases.map( c => [c.port, c.result] );
			next();
		};

		handleFor( scene, global, { getConditionResolver: () => () => false } ).start();

		expect( seen ).toEqual( [['K1', false], ['K2', true]] );
	} );
} );

// ─── Actors and emotion ──────────────────────────────────────────────────────

describe( 'actors and emotion', () => {

	it( 'resolves the cast through the export card table', () => {
		let names: string[] = [];
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { context, next } ) => {
			names = context.actors.map( c => c.name );
			next();
		};

		handleFor( makeScene( [dialog( 'b1', { actors: ['var1', 'var2'] } )] ), global ).start();

		expect( names ).toEqual( ['kael', 'nora'] );
	} );

	it( 'carries the block emotion, one line one tone', () => {
		let seen: string | undefined;
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { context, next } ) => { seen = context.emotion?.name; next(); };

		handleFor(
			makeScene( [dialog( 'b1', { actors: ['var1', 'var2'], emotion: 'var7', intensity: 60 } )] ),
			global,
		).start();

		expect( seen ).toBe( 'afraid' );
	} );

	it( 'follows the port named after the actor with portPerCharacter', () => {
		const visited: string[] = [];
		const scene = makeScene( [
			dialog( 'b1', {
				actors: ['var1', 'var2'],
				props: { portPerCharacter: true },
				next: [link( 'kaelSaid', 'var1' ), link( 'noraSaid', 'var2' ), link( 'anyone' )],
			} ),
			dialog( 'kaelSaid' ), dialog( 'noraSaid' ), dialog( 'anyone' ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block, context, next } ) => {
			visited.push( block.id );
			if ( block.id === 'b1' ) context.resolveCharacterPort( 'var2' );
			next();
		};

		handleFor( scene, global ).start();

		expect( visited ).toEqual( ['b1', 'noraSaid'] );
	} );

	it( 'falls back to out when no actor port was picked', () => {
		const visited: string[] = [];
		const scene = makeScene( [
			dialog( 'b1', {
				actors: ['var1'],
				next: [link( 'kaelSaid', 'var1' ), link( 'anyone' )],
			} ),
			dialog( 'kaelSaid' ), dialog( 'anyone' ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };

		handleFor( scene, global ).start();

		expect( visited ).toEqual( ['b1', 'anyone'] );
	} );

	it( 'resolves the cast fresh for every block', () => {
		// No caching: this runs for the main track and for async tracks alike, and a cache would
		// leak one track's actor into another released later by waitForBlocks.
		const seen: Array<string | undefined> = [];
		const scene = makeScene( [
			dialog( 'b1', { actors: ['var1'], next: [link( 'b2' )] } ),
			dialog( 'b2', { actors: ['var2'] } ),
		] );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { context, next } ) => { seen.push( context.character?.name ); next(); };

		handleFor( scene, global ).start();

		expect( seen ).toEqual( ['kael', 'nora'] );
	} );
} );

// ─── Async tracks ────────────────────────────────────────────────────────────

describe( 'async tracks', () => {

	const forked = () => makeScene( [
		dialog( 'b1', { next: [link( 'main' ), link( 'side' )] } ),
		dialog( 'main' ),
		dialog( 'side', { props: { isAsync: true } } ),
	] );

	it( 'spawns a track for an isAsync target', () => {
		const visited: string[] = [];
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };

		handleFor( forked(), global ).start();

		expect( visited ).toContain( 'main' );
		expect( visited ).toContain( 'side' );
	} );

	it( 'counts the running tracks while the scene is still going', () => {
		// Both handlers hold on to next(), so nothing finishes: the main flow is parked on `main`
		// and the side track is parked on `side`. Let the main flow end and endScene() cancels
		// every live track, which is the point of the next test.
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block } ) => { if ( block.id === 'b1' ) return; };

		const handle = handleFor( forked(), global );
		global.dialogHandler = ( { block, next } ) => { if ( block.id === 'b1' ) next(); };
		handle.start();

		expect( handle.getActiveTracks() ).toBe( 1 );
		expect( handle.getTrackInfos()[0]?.startBlockId ).toBe( 'side' );
	} );

	it( 'stays open while a side track is still holding its next()', () => {
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		// The main flow runs to the end; the side track stays parked on next().
		global.dialogHandler = ( { block, next } ) => { if ( block.id !== 'side' ) next(); };

		const handle = handleFor( forked(), global );
		handle.start();

		// The main flow reaching its end retires the main flow, not the scene. The side track is
		// waiting on the game, and cancelling it here is how a branch on a delay lost its turn.
		expect( handle.isRunning() ).toBe( true );
		expect( handle.getActiveTracks() ).toBe( 1 );

		handle.cancel();
		expect( handle.isRunning() ).toBe( false );
		expect( handle.getActiveTracks() ).toBe( 0 );
	} );

	it( 'cancel() cascades to the tracks', () => {
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.dialogHandler = ( { block, next } ) => { if ( block.id === 'b1' ) next(); };

		const handle = handleFor( forked(), global );
		handle.start();
		expect( handle.getActiveTracks() ).toBe( 1 );

		handle.cancel();
		expect( handle.getActiveTracks() ).toBe( 0 );
	} );
} );
