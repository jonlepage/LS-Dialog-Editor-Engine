// LSDE Dialog Engine — the public facade, end to end
//
// Everything a game touches: init, locale, the two resolvers, the four handlers, the three handler
// tiers, and a scene played from start to finish.

import { describe, it, expect } from 'vitest';
import { DialogueEngine } from './engine.js';
import type { Blueprints, Scene, Block, Card } from './types.js';
import {
	blueprint, scene as buildScene, dialog, choice, condition, action, note,
	option, card, dictionary, fn, call, whenCase, test as t,
} from './test-builders.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface Wire { fromId: string; toId: string; fromPort: string }

function conn( fromId: string, toId: string, fromPort = 'out' ): Wire {
	return { fromId, toId, fromPort };
}

/** A scene written as blocks plus a wire list, which reads far better than `next` per block. */
function makeScene( spec: { blocks: Block[]; connections?: Wire[]; path?: string; start?: string } ): Scene {
	const byId = new Map( spec.blocks.map( b => [b.id, b] ) );
	for ( const wire of spec.connections ?? [] ) {
		const from = byId.get( wire.fromId );
		if ( !from ) continue;
		from.next = [...( from.next ?? [] ), { port: wire.fromPort, to: wire.toId, toPort: 'in' }];
	}
	return buildScene( spec.blocks, {
		...( spec.path ? { scene: spec.path, id: `sc_${ spec.path }` } : {} ),
		...( spec.start ? { start: spec.start } : {} ),
	} );
}

const CARDS: Card[] = [card( 'var1', 'kael' ), card( 'var2', 'nora' ), card( 'var7', 'afraid', 'emotions' )];

function linearScene(): Scene {
	return makeScene( {
		blocks: [
			dialog( 'b1', { text: { en: 'Hello' } } ),
			dialog( 'b2', { text: { en: 'World' } } ),
		],
		connections: [conn( 'b1', 'b2' )],
	} );
}

function makeExport( scenes: Scene[] = [linearScene()] ): Blueprints {
	return blueprint( scenes, {
		locales: ['en', 'fr'],
		cards: CARDS,
		dictionaries: [dictionary( 'switches', ['flag'] )],
		functions: [fn( 'do_thing', ['what'] )],
	} );
}

function registerAllHandlers( engine: DialogueEngine ): void {
	engine.onDialog( ( { next } ) => { next(); } );
	engine.onChoice( ( { context, next } ) => {
		if ( context.options.length > 0 ) context.selectChoice( context.options[0]!.id );
		next();
	} );
	engine.onCondition( ( { next } ) => { next(); } );
	engine.onAction( ( { context, next } ) => { context.resolve(); next(); } );
}

function ready( scenes: Scene[] = [linearScene()] ): DialogueEngine {
	const engine = new DialogueEngine();
	engine.init( { data: makeExport( scenes ) } );
	registerAllHandlers( engine );
	return engine;
}

// ─── init ────────────────────────────────────────────────────────────────────

describe( 'init', () => {

	it( 'accepts a valid payload', () => {
		const report = new DialogueEngine().init( { data: makeExport() } );

		expect( report.errors ).toHaveLength( 0 );
		expect( report.stats.sceneCount ).toBe( 1 );
		expect( report.stats.blockCount ).toBe( 2 );
	} );

	it( 'reports an empty payload', () => {
		const report = new DialogueEngine().init( { data: { ...makeExport(), scenes: [] } } );
		expect( report.errors.length ).toBeGreaterThan( 0 );
	} );

	it( 'refuses a payload it cannot read', () => {
		const report = new DialogueEngine().init( { data: { hello: 'world' } as unknown as Blueprints } );
		expect( report.errors[0]!.code ).toBe( 'INVALID_FORMAT' );
	} );

	it( 'does not initialize on a refused payload', () => {
		const engine = new DialogueEngine();
		engine.init( { data: { hello: 'world' } as unknown as Blueprints } );

		expect( () => engine.scene( 's1' ) ).toThrow( /not initialized/ );
	} );

	it( 'a second init replaces the data cleanly', () => {
		const engine = new DialogueEngine();
		engine.init( { data: makeExport() } );
		engine.init( { data: makeExport( [makeScene( { blocks: [dialog( 'x1' )], path: 'other' } )] ) } );

		expect( () => engine.scene( 'other' ) ).not.toThrow();
	} );

	it( 'recovers from a failed init', () => {
		const engine = new DialogueEngine();
		engine.init( { data: { hello: 'world' } as unknown as Blueprints } );
		const report = engine.init( { data: makeExport() } );

		expect( report.errors ).toHaveLength( 0 );
		expect( () => engine.scene( 's1' ) ).not.toThrow();
	} );
} );

// ─── scene() ─────────────────────────────────────────────────────────────────

describe( 'opening a scene', () => {

	it( 'finds it by path', () => {
		expect( () => ready().scene( 's1' ) ).not.toThrow();
	} );

	it( 'finds it by the id that survives a rename', () => {
		// This is the one to store in an asset, a save file or a database row: the path changes
		// the day someone renames the scene, and a serialized path then resolves to nothing.
		expect( () => ready().scene( 'sc_test0001' ) ).not.toThrow();
	} );

	it( 'throws for a scene that is not there, and names it', () => {
		expect( () => ready().scene( 'nope' ) ).toThrow( /"nope" not found/ );
	} );

	it( 'throws before init', () => {
		expect( () => new DialogueEngine().scene( 's1' ) ).toThrow( /not initialized/ );
	} );
} );

// ─── setLocale ───────────────────────────────────────────────────────────────

describe( 'setLocale', () => {

	it( 'accepts a locale the project declares', () => {
		expect( () => ready().setLocale( 'fr' ) ).not.toThrow();
	} );

	it( 'refuses one it does not, and lists the real ones', () => {
		expect( () => ready().setLocale( 'de' ) ).toThrow( /en, fr/ );
	} );
} );

// ─── Handlers ────────────────────────────────────────────────────────────────

describe( 'handlers', () => {

	it( 'throws when a mandatory handler is missing', () => {
		const engine = new DialogueEngine();
		engine.init( { data: makeExport() } );
		engine.onDialog( ( { next } ) => next() );

		expect( () => engine.scene( 's1' ).start() ).toThrow( /onChoice/ );
	} );

	it( 'the last registration wins', () => {
		const calls: string[] = [];
		const engine = ready();
		engine.onDialog( ( { next } ) => { calls.push( 'first' ); next(); } );
		engine.onDialog( ( { next } ) => { calls.push( 'second' ); next(); } );

		engine.scene( 's1' ).start();

		expect( calls ).toEqual( ['second', 'second'] );
	} );

	it( 'runs the scene handler then the global one', () => {
		const calls: string[] = [];
		const engine = ready();
		engine.onDialog( ( { next } ) => { calls.push( 'global' ); next(); } );

		const handle = engine.scene( 's1' );
		handle.onDialog( ( { next } ) => { calls.push( 'scene' ); next(); } );
		handle.start();

		expect( calls.slice( 0, 2 ) ).toEqual( ['scene', 'global'] );
	} );

	it( 'onBlock beats the scene type handler', () => {
		const calls: string[] = [];
		const engine = ready();
		const handle = engine.scene( 's1' );
		handle.onDialog( ( { next } ) => { calls.push( 'type' ); next(); } );
		handle.onBlock( 'b1', ( { context, next } ) => {
			context.preventGlobalHandler();
			calls.push( 'block' );
			next();
		} );
		handle.start();

		expect( calls[0] ).toBe( 'block' );
	} );

	it( 'onDialogId hands over a typed block and context', () => {
		let seen: { id: string; hasPort: boolean } | null = null;
		const engine = ready();
		const handle = engine.scene( 's1' );
		handle.onDialogId( 'b2', ( { block, context, next } ) => {
			seen = { id: block.id, hasPort: 'resolveCharacterPort' in context };
			next();
		} );
		handle.start();

		expect( seen ).toEqual( { id: 'b2', hasPort: true } );
	} );

	it( 'onActionId hands over the calls', () => {
		let seen: string[] = [];
		const scene = makeScene( {
			blocks: [action( 'a1', [call( 'do_thing', { what: 'x' } )] )],
		} );
		const engine = ready( [scene] );
		const handle = engine.scene( 's1' );
		handle.onActionId( 'a1', ( { context, next } ) => {
			seen = context.calls.map( c => c.fn );
			context.resolve();
			next();
		} );
		handle.start();

		expect( seen ).toEqual( ['do_thing'] );
	} );

	it( 'onChoiceId hands over the options', () => {
		let seen: string[] = [];
		const scene = makeScene( { blocks: [choice( 'c1', [option( 'C1' ), option( 'C2' )] )] } );
		const engine = ready( [scene] );
		const handle = engine.scene( 's1' );
		handle.onChoiceId( 'c1', ( { context, next } ) => {
			seen = context.options.map( o => o.id );
			next();
		} );
		handle.start();

		expect( seen ).toEqual( ['C1', 'C2'] );
	} );

	it( 'onConditionId hands over the cases', () => {
		let seen: string[] = [];
		const scene = makeScene( { blocks: [condition( 'k1', [whenCase( 'K1' ), whenCase( 'K2' )] )] } );
		const engine = ready( [scene] );
		const handle = engine.scene( 's1' );
		handle.onConditionId( 'k1', ( { context, next } ) => {
			seen = context.cases.map( c => c.port );
			next();
		} );
		handle.start();

		expect( seen ).toEqual( ['K1', 'K2'] );
	} );
} );

// ─── Playing a scene ─────────────────────────────────────────────────────────

describe( 'playing', () => {

	it( 'walks a linear scene in order', () => {
		const visited: string[] = [];
		const engine = ready();
		engine.onDialog( ( { block, next } ) => { visited.push( block.id ); next(); } );

		engine.scene( 's1' ).start();

		expect( visited ).toEqual( ['b1', 'b2'] );
	} );

	it( 'follows the option the player picked', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [
				choice( 'c1', [option( 'C1', { text: 'yes' } ), option( 'C2', { text: 'no' } )] ),
				dialog( 'said-yes' ),
				dialog( 'said-no' ),
			],
			connections: [conn( 'c1', 'said-yes', 'C1' ), conn( 'c1', 'said-no', 'C2' )],
		} );
		const engine = ready( [scene] );
		engine.onChoice( ( { context, next } ) => { context.selectChoice( 'C2' ); next(); } );
		engine.onDialog( ( { block, next } ) => { visited.push( block.id ); next(); } );

		engine.scene( 's1' ).start();

		expect( visited ).toEqual( ['said-no'] );
	} );

	it( 'follows the port named after the actor, and falls back to out', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [
				dialog( 'd1', { actors: ['var1', 'var2'], props: { portPerCharacter: true } } ),
				dialog( 'kael-said' ),
				dialog( 'anyone' ),
			],
			connections: [conn( 'd1', 'kael-said', 'var1' ), conn( 'd1', 'anyone', 'out' )],
		} );

		const engine = ready( [scene] );
		engine.onDialog( ( { block, context, next } ) => {
			visited.push( block.id );
			if ( block.id === 'd1' ) context.resolveCharacterPort( 'var1' );
			next();
		} );
		engine.scene( 's1' ).start();
		expect( visited ).toEqual( ['d1', 'kael-said'] );

		visited.length = 0;
		const engine2 = ready( [scene] );
		engine2.onDialog( ( { block, context, next } ) => {
			visited.push( block.id );
			if ( block.id === 'd1' ) context.resolveCharacterPort( 'var9' );
			next();
		} );
		engine2.scene( 's1' ).start();
		expect( visited ).toEqual( ['d1', 'anyone'] );
	} );

	it( 'lets the game pick which actor is speaking', () => {
		let seen: string | undefined;
		const scene = makeScene( { blocks: [dialog( 'd1', { actors: ['var1', 'var2'] } )] } );
		const engine = ready( [scene] );
		engine.onResolveCharacter( ( actors ) => actors[actors.length - 1] );
		engine.onDialog( ( { context, next } ) => { seen = context.character?.name; next(); } );

		engine.scene( 's1' ).start();

		expect( seen ).toBe( 'nora' );
	} );

	it( 'follows then on success and catch on failure', () => {
		const scene = makeScene( {
			blocks: [action( 'a1', [call( 'do_thing' )] ), dialog( 'ok' ), dialog( 'failed' )],
			connections: [conn( 'a1', 'ok', 'then' ), conn( 'a1', 'failed', 'catch' )],
		} );

		const okVisited: string[] = [];
		const okEngine = ready( [scene] );
		okEngine.onDialog( ( { block, next } ) => { okVisited.push( block.id ); next(); } );
		okEngine.scene( 's1' ).start();
		expect( okVisited ).toEqual( ['ok'] );

		const failVisited: string[] = [];
		const failEngine = ready( [scene] );
		failEngine.onAction( ( { context, next } ) => { context.reject( new Error( 'x' ) ); next(); } );
		failEngine.onDialog( ( { block, next } ) => { failVisited.push( block.id ); next(); } );
		failEngine.scene( 's1' ).start();
		expect( failVisited ).toEqual( ['failed'] );
	} );

	it( 'loops once, then leaves', () => {
		const visited: string[] = [];
		let pass = 0;
		const scene = makeScene( {
			blocks: [
				dialog( 'b1' ),
				choice( 'c1', [option( 'C1' ), option( 'C2' )] ),
				dialog( 'out' ),
			],
			connections: [
				conn( 'b1', 'c1' ),
				conn( 'c1', 'b1', 'C1' ),
				conn( 'c1', 'out', 'C2' ),
			],
		} );
		const engine = ready( [scene] );
		engine.onDialog( ( { block, next } ) => { visited.push( block.id ); next(); } );
		engine.onChoice( ( { context, next } ) => {
			pass++;
			context.selectChoice( pass === 1 ? 'C1' : 'C2' );
			next();
		} );

		engine.scene( 's1' ).start();

		expect( visited ).toEqual( ['b1', 'b1', 'out'] );
	} );

	it( 'walks every block type in one scene', () => {
		const seen: string[] = [];
		const scene = makeScene( {
			blocks: [
				dialog( 'd1' ),
				choice( 'c1', [option( 'C1' )] ),
				condition( 'k1', [whenCase( 'out', [t( 'switches', 'flag', true )] )] ),
				action( 'a1', [call( 'do_thing' )] ),
				note( 'n1' ),
				dialog( 'd2' ),
			],
			connections: [
				conn( 'd1', 'c1' ), conn( 'c1', 'k1', 'C1' ),
				conn( 'k1', 'a1', 'out' ), conn( 'a1', 'n1', 'then' ), conn( 'n1', 'd2' ),
			],
		} );
		const engine = ready( [scene] );
		engine.onResolveCondition( () => true );
		engine.onDialog( ( { block, next } ) => { seen.push( block.id ); next(); } );
		engine.onChoice( ( { context, next } ) => { seen.push( 'c1' ); context.selectChoice( 'C1' ); next(); } );
		engine.onCondition( ( { next } ) => { seen.push( 'k1' ); next(); } );
		engine.onAction( ( { context, next } ) => { seen.push( 'a1' ); context.resolve(); next(); } );

		engine.scene( 's1' ).start();

		// The note is stepped over, never dispatched.
		expect( seen ).toEqual( ['d1', 'c1', 'k1', 'a1', 'd2'] );
	} );
} );

// ─── Conditions ──────────────────────────────────────────────────────────────

describe( 'conditions', () => {

	const branching = () => makeScene( {
		blocks: [
			condition( 'k1', [whenCase( 'out', [t( 'switches', 'flag', true )] )] ),
			dialog( 'yes' ),
			dialog( 'no' ),
		],
		connections: [conn( 'k1', 'yes', 'out' ), conn( 'k1', 'no', 'default' )],
	} );

	function playWith( engine: DialogueEngine ): string[] {
		const visited: string[] = [];
		engine.onDialog( ( { block, next } ) => { visited.push( block.id ); next(); } );
		engine.scene( 's1' ).start();
		return visited;
	}

	it( 'does not need onCondition once a resolver is installed', () => {
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [branching()] ) } );
		engine.onDialog( ( { next } ) => next() );
		engine.onChoice( ( { next } ) => next() );
		engine.onAction( ( { context, next } ) => { context.resolve(); next(); } );
		engine.onResolveCondition( () => true );

		expect( () => engine.scene( 's1' ).start() ).not.toThrow();
	} );

	it( 'throws when neither onCondition nor onResolveCondition is there', () => {
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [branching()] ) } );
		engine.onDialog( ( { next } ) => next() );
		engine.onChoice( ( { next } ) => next() );
		engine.onAction( ( { context, next } ) => { context.resolve(); next(); } );

		expect( () => engine.scene( 's1' ).start() ).toThrow( /onCondition/ );
	} );

	it( 'routes on its own when the handler only calls next()', () => {
		const engine = ready( [branching()] );
		engine.onResolveCondition( () => true );

		expect( playWith( engine ) ).toEqual( ['yes'] );
	} );

	it( 'routes to default when the case does not hold', () => {
		const engine = ready( [branching()] );
		engine.onResolveCondition( () => false );

		expect( playWith( engine ) ).toEqual( ['no'] );
	} );

	it( 'routes with no onCondition handler at all', () => {
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [branching()] ) } );
		engine.onChoice( ( { next } ) => next() );
		engine.onAction( ( { context, next } ) => { context.resolve(); next(); } );
		engine.onResolveCondition( () => true );

		expect( playWith( engine ) ).toEqual( ['yes'] );
	} );

	it( 'hands the handler each case with its port and result', () => {
		let seen: Array<[string, boolean | undefined]> = [];
		const engine = ready( [branching()] );
		engine.onResolveCondition( () => true );
		engine.onCondition( ( { context, next } ) => {
			seen = context.cases.map( c => [c.port, c.result] );
			next();
		} );

		playWith( engine );

		expect( seen ).toEqual( [['out', true]] );
	} );

	it( 'lets the handler override the port it picked', () => {
		const engine = ready( [branching()] );
		engine.onResolveCondition( () => true );
		engine.onCondition( ( { context, next } ) => { context.resolve( 'default' ); next(); } );

		expect( playWith( engine ) ).toEqual( ['no'] );
	} );

	it( 'routes to the case port with portPerCase', () => {
		const scene = makeScene( {
			blocks: [
				condition( 'k1', [
					whenCase( 'K1', [t( 'switches', 'a', true )] ),
					whenCase( 'K2', [t( 'switches', 'b', true )] ),
				], { props: { portPerCase: true } } ),
				dialog( 'first' ), dialog( 'second' ), dialog( 'none' ),
			],
			connections: [
				conn( 'k1', 'first', 'K1' ), conn( 'k1', 'second', 'K2' ), conn( 'k1', 'none', 'default' ),
			],
		} );
		const engine = ready( [scene] );
		engine.onResolveCondition( ( test ) => test.entry === 'b' );

		expect( playWith( engine ) ).toEqual( ['second'] );
	} );

	it( 'routes to default with portPerCase when no case holds', () => {
		const scene = makeScene( {
			blocks: [
				condition( 'k1', [whenCase( 'K1', [t( 'switches', 'a', true )] )], { props: { portPerCase: true } } ),
				dialog( 'first' ), dialog( 'none' ),
			],
			connections: [conn( 'k1', 'first', 'K1' ), conn( 'k1', 'none', 'default' )],
		} );
		const engine = ready( [scene] );
		engine.onResolveCondition( () => false );

		expect( playWith( engine ) ).toEqual( ['none'] );
	} );

	it( 'tags option visibility from the same resolver', () => {
		let seen: Array<boolean | undefined> = [];
		const scene = makeScene( {
			blocks: [choice( 'c1', [
				option( 'C1' ),
				option( 'C2', { when: [t( 'switches', 'flag', true )] } ),
			] )],
		} );
		const engine = ready( [scene] );
		engine.onResolveCondition( () => false );
		engine.onChoice( ( { context, next } ) => { seen = context.options.map( o => o.visible ); next(); } );

		engine.scene( 's1' ).start();

		expect( seen ).toEqual( [true, false] );
	} );

	it( 'answers a test through the scene handle', () => {
		const engine = ready();
		engine.onResolveCondition( ( test ) => test.entry === 'flag' );
		const handle = engine.scene( 's1' );

		expect( handle.evaluateCondition( t( 'switches', 'flag', true ) ) ).toBe( true );
		expect( handle.evaluateCondition( t( 'switches', 'other', true ) ) ).toBe( false );
	} );

	it( 'answers false with no resolver installed', () => {
		expect( ready().scene( 's1' ).evaluateCondition( t( 'switches', 'flag', true ) ) ).toBe( false );
	} );
} );

// ─── Multiple scenes and tracks ──────────────────────────────────────────────

describe( 'scenes and tracks', () => {

	it( 'runs two scenes in parallel with independent state', () => {
		const calls: string[] = [];
		const engine = ready( [
			makeScene( { blocks: [dialog( 'tavern-greet' )], path: 'tavern' } ),
			makeScene( { blocks: [dialog( 'forest-enter' )], path: 'forest' } ),
		] );
		engine.onDialog( ( { block } ) => { calls.push( block.id ); } );

		engine.scene( 'tavern' ).start();
		engine.scene( 'forest' ).start();

		expect( calls ).toEqual( ['tavern-greet', 'forest-enter'] );
		expect( engine.getActiveScenes() ).toHaveLength( 2 );
		expect( engine.isRunning() ).toBe( true );
	} );

	it( 'stop() cancels every scene', () => {
		const engine = ready( [
			makeScene( { blocks: [dialog( 'a' )], path: 'one' } ),
			makeScene( { blocks: [dialog( 'b' )], path: 'two' } ),
		] );
		engine.onDialog( () => { /* parked */ } );

		engine.scene( 'one' ).start();
		engine.scene( 'two' ).start();
		engine.stop();

		expect( engine.isRunning() ).toBe( false );
	} );

	it( 'can start a scene again after stop()', () => {
		const calls: string[] = [];
		const engine = ready();
		engine.onDialog( ( { block, next } ) => { calls.push( block.id ); next(); } );

		engine.scene( 's1' ).start();
		engine.stop();
		engine.scene( 's1' ).start();

		expect( calls ).toEqual( ['b1', 'b2', 'b1', 'b2'] );
	} );

	it( 'lists the current block of every running scene', () => {
		const engine = ready();
		engine.onDialog( () => { /* parked on b1 */ } );

		engine.scene( 's1' ).start();

		expect( engine.getCurrentBlocks().map( b => b.id ) ).toEqual( ['b1'] );
	} );

	it( 'runs an async branch alongside the main flow, with lifecycle hooks around both', () => {
		const order: string[] = [];
		const scene = makeScene( {
			blocks: [
				dialog( 'main1' ),
				dialog( 'main2' ),
				dialog( 'bg', { props: { isAsync: true } } ),
			],
			connections: [conn( 'main1', 'main2' ), conn( 'main1', 'bg' )],
		} );
		const engine = ready( [scene] );
		engine.onSceneEnter( () => order.push( 'enter' ) );
		engine.onSceneExit( () => order.push( 'exit' ) );
		engine.onDialog( ( { block, next } ) => { order.push( block.id ); next(); } );

		engine.scene( 's1' ).start();

		expect( order[0] ).toBe( 'enter' );
		expect( order[order.length - 1] ).toBe( 'exit' );
		expect( order ).toContain( 'bg' );
		expect( order ).toContain( 'main2' );
	} );
} );

// ─── Graph inspection ────────────────────────────────────────────────────────

describe( 'getSceneConnections', () => {

	it( 'returns the wires INSIDE a scene, each with the block it leaves', () => {
		const wires = ready().getSceneConnections( 's1' );

		expect( wires ).toEqual( [{ from: 'b1', port: 'out', to: 'b2', toPort: 'in' }] );
	} );

	it( 'returns nothing for a scene that is not there', () => {
		expect( ready().getSceneConnections( 'nope' ) ).toEqual( [] );
	} );

	it( 'returns nothing before init', () => {
		expect( new DialogueEngine().getSceneConnections( 's1' ) ).toEqual( [] );
	} );
} );
