/**
 * Edge case tests across all modules.
 * Covers: next() double-call, NOTE-only scene, selectChoice invalid UUID,
 * resolve() double-call, onBeforeBlock no resolve,
 * entryBlockId → NOTE, condition long chain, handler overwrite.
 */
import { describe, it, expect, vi } from 'vitest';
import { DialogueEngine } from './engine.js';
import { SceneHandleImpl, type SceneHandleCallbacks } from './scene-handle.js';
import { SceneGraph } from './graph.js';
import { HandlerRegistry } from './handler-registry.js';
import type { Blueprints, Scene, Block, ConditionTest } from './types.js';
import { evaluateConditionChain } from './condition-evaluator.js';
import {
	blueprint, scene as buildScene, dialog, note, choice, condition, action,
	link, option, whenCase, test as t,
} from './test-builders.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface Wire { fromId: string; toId: string; fromPort: string }

/** One wire, seen from outside. `port` is a NAME: `out`, `then`, `C1`, `K1`, or a card id. */
function conn( fromId: string, toId: string, fromPort = 'out' ): Wire {
	return { fromId, toId, fromPort };
}

/**
 * A scene written as blocks plus a list of wires.
 *
 * A wire is carried by the block it leaves in the payload, which scatters the shape of a graph
 * across its blocks. Unreadable in a test, so these suites keep the list and this distributes it.
 */
function makeScene( spec: { blocks: Block[]; connections?: Wire[]; start?: string } ): Scene {
	const byId = new Map( spec.blocks.map( b => [b.id, b] ) );
	for ( const wire of spec.connections ?? [] ) {
		const from = byId.get( wire.fromId );
		if ( !from ) continue;
		from.next = [...( from.next ?? [] ), { port: wire.fromPort, to: wire.toId, toPort: 'in' }];
	}
	return buildScene( spec.blocks, spec.start !== undefined ? { start: spec.start } : {} );
}

function makeExport( scenes: Scene[] ): Blueprints {
	return blueprint( scenes );
}

function makeCallbacks(): SceneHandleCallbacks {
	return {
		onSceneStarted: vi.fn(),
		onSceneEnded: vi.fn(),
		getResolveCharacter: () => ( actors ) => actors[0],
		getConditionResolver: () => null,
		getCard: () => undefined,
	};
}

/** Populate a HandlerRegistry with the 4 mandatory handlers (for SceneHandleImpl direct tests). */
function fillRequiredHandlers( reg: HandlerRegistry ): void {
	reg.dialogHandler ??= ( { next } ) => { next(); };
	reg.choiceHandler ??= ( { context, next } ) => {
		if ( context.options.length > 0 ) context.selectChoice( context.options[0]!.id );
		next();
	};
	reg.conditionHandler ??= ( { next } ) => { next(); };
	reg.actionHandler ??= ( { context, next } ) => { context.resolve(); next(); };
}

/** Register all 4 mandatory handlers on a DialogueEngine (for engine-level tests). */
function registerAllHandlers( engine: DialogueEngine ): void {
	engine.onDialog( ( { next } ) => { next(); } );
	engine.onChoice( ( { context, next } ) => {
		if ( context.options.length > 0 ) context.selectChoice( context.options[0]!.id );
		next();
	} );
	engine.onCondition( ( { next } ) => { next(); } );
	engine.onAction( ( { context, next } ) => { context.resolve(); next(); } );
}

// ─── next() called twice ─────────────────────────────────────────────────────

describe( 'edge — next() called twice', () => {

	it( 'second next() is a no-op, block does not advance twice', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [dialog( 'b1' ), dialog( 'b2' ), dialog( 'b3' )],
			connections: [conn( 'b1', 'b2' ), conn( 'b2', 'b3' )],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			visited.push( block.id );
			next();
			next(); // second call — should be ignored
		};
		fillRequiredHandlers( global );

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();
		expect( visited ).toEqual( ['b1', 'b2', 'b3'] );
	} );

} );

// ─── Scene with only NOTE blocks ─────────────────────────────────────────────

describe( 'edge — NOTE-only scene', () => {

	it( 'scene with only NOTE blocks ends immediately', () => {
		const scene = makeScene( {
			blocks: [
				note( 'note1' ),
			],
			connections: [],
		} );
		const global = new HandlerRegistry();
		fillRequiredHandlers( global );
		const cbs = makeCallbacks();

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, cbs );
		handle.start();

		expect( handle.isRunning() ).toBe( false );
		expect( cbs.onSceneEnded ).toHaveBeenCalledOnce();
	} );

	it( 'NOTE chain leads to real block', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [
				note( 'note1' ),
				note( 'note2' ),
				dialog( 'real' ),
			],
			connections: [conn( 'note1', 'note2', 'any' ), conn( 'note2', 'real', 'any' )],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };
		fillRequiredHandlers( global );

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();
		expect( visited ).toEqual( ['real'] );
	} );

} );

// ─── selectChoice with invalid UUID ──────────────────────────────────────────

describe( 'edge — selectChoice with invalid UUID', () => {

	it( 'selecting a non-existent choice UUID leads to dead end', () => {
		const visited: string[] = [];
		const s = makeScene( {
			blocks: [
				dialog( 'b1' ),
				choice( 'choice1', [option( 'C1', { text: 'A' } )] ),
				dialog( 'after' ),
			],
			connections: [
				conn( 'b1', 'choice1' ),
				conn( 'choice1', 'after', 'C1' ),
			],
		} );

		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [s] ) } );
		registerAllHandlers( engine );
		engine.onDialog( ( { block, next } ) => { visited.push( block.id ); next(); } );
		engine.onChoice( ( { context, next } ) => {
			context.selectChoice( 'C9' ); // matches no wire on the block
			next();
		} );

		engine.scene( 's1' ).start();
		// Dead end after choice — scene ends without visiting 'after'
		expect( visited ).toEqual( ['b1'] );
	} );

} );

// ─── resolve() called twice (condition) ──────────────────────────────────────

describe( 'edge — condition resolve() called twice', () => {

	it( 'second resolve() overwrites first — last value wins', () => {
		const visited: string[] = [];
		const s = makeScene( {
			blocks: [
				condition( 'cond1', [whenCase( 'out', [t( 'switches', 'x', true )] )] ),
				dialog( 'yes' ),
				dialog( 'no' ),
			],
			connections: [
				conn( 'cond1', 'yes', 'out' ),
				conn( 'cond1', 'no', 'default' ),
			],
		} );

		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [s] ) } );
		registerAllHandlers( engine );
		engine.onCondition( ( { context, next } ) => {
			context.resolve( 'out' );
			context.resolve( 'default' ); // override — should follow the false branch
			next();
		} );
		engine.onDialog( ( { block, next } ) => { visited.push( block.id ); next(); } );

		engine.scene( 's1' ).start();
		expect( visited ).toEqual( ['no'] );
	} );

} );

// ─── onBeforeBlock that never calls resolve() ───────────────────────────────

describe( 'edge — onBeforeBlock without resolve', () => {

	it( 'flow stays blocked, handler never fires', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [dialog( 'b1' ), dialog( 'b2' )],
			connections: [conn( 'b1', 'b2' )],
		} );

		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [scene] ) } );
		registerAllHandlers( engine );
		engine.onBeforeBlock( ( { } ) => {
			// Intentionally never call resolve()
		} );
		engine.onDialog( ( { block, next } ) => { visited.push( block.id ); next(); } );

		const handle = engine.scene( 's1' );
		handle.start();

		// Flow is stuck — handler never fires
		expect( visited ).toHaveLength( 0 );
		expect( handle.isRunning() ).toBe( true ); // still running, waiting for resolve
	} );

} );

// ─── entryBlockId pointing to a NOTE ─────────────────────────────────────────

describe( 'edge — entryBlockId is a NOTE', () => {

	it( 'NOTE as start block is skipped, follows to next block', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			start: 'note1',
			blocks: [
				note( 'note1' ),
				dialog( 'real' ),
			],
			connections: [conn( 'note1', 'real', 'any' )],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => { visited.push( block.id ); next(); };
		fillRequiredHandlers( global );

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();
		expect( visited ).toEqual( ['real'] );
	} );

} );

// ─── Long condition chains ───────────────────────────────────────────────────

describe( 'edge — long condition chains', () => {

	function cond( entry: string, join?: 'or' | 'and' ): ConditionTest {
		return t( 'switches', entry, true, 'equals', join );
	}

	const eval_ = ( c: ConditionTest ) => c.entry.startsWith( 't' );

	it( '4 conditions: t & t & f | t = true', () => {
		// (((true AND true) AND false) OR true) = true
		const result = evaluateConditionChain(
			[cond( 'true1' ), cond( 'true2', 'and' ), cond( 'false1', 'and' ), cond( 'true3', 'or' )],
			eval_,
		);
		expect( result ).toBe( true );
	} );

	it( '5 conditions: f | f | f | f | t = true', () => {
		const result = evaluateConditionChain(
			[cond( 'f1' ), cond( 'f2', 'or' ), cond( 'f3', 'or' ), cond( 'f4', 'or' ), cond( 'true1', 'or' )],
			eval_,
		);
		expect( result ).toBe( true );
	} );

	it( '5 conditions: t & t & t & t & f = false', () => {
		const result = evaluateConditionChain(
			[cond( 'true1' ), cond( 'true2', 'and' ), cond( 'true3', 'and' ), cond( 'true4', 'and' ), cond( 'false1', 'and' )],
			eval_,
		);
		expect( result ).toBe( false );
	} );

} );

// ─── Handler overwrite ───────────────────────────────────────────────────────

describe( 'edge — handler overwrite', () => {

	it( 'last registered handler wins (overwrites previous)', () => {
		const calls: string[] = [];
		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [makeScene( {
			blocks: [dialog( 'b1' )],
		} )] ) } );

		registerAllHandlers( engine );
		engine.onDialog( ( { next } ) => { calls.push( 'first' ); next(); } );
		engine.onDialog( ( { next } ) => { calls.push( 'second' ); next(); } ); // overwrite

		engine.scene( 's1' ).start();
		expect( calls ).toEqual( ['second'] );
	} );

} );
