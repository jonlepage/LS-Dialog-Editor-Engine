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
import type { BlueprintExport, BlueprintScene, BlueprintBlock } from './types.js';
import { evaluateConditionChain } from './condition-evaluator.js';
import type { ExportCondition } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dialog( uuid: string, opts: { start?: boolean } = {} ): BlueprintBlock {
	return { uuid, type: 'DIALOG', properties: [], isStartBlock: opts.start } as BlueprintBlock;
}

function conn( fromId: string, toId: string, fromPort = 'out' ) {
	return { id: `${ fromId }-${ toId }`, fromId, toId, fromPort, toPort: 'in' };
}

function makeScene( overrides: Partial<BlueprintScene> = {} ): BlueprintScene {
	return { uuid: 's1', label: 'S1', date: '2025-01-01', blocks: [], connections: [], ...overrides };
}

function makeExport( scenes: BlueprintScene[] ): BlueprintExport {
	return { version: '1.0.0', exportDate: '2025-01-01', locales: ['en'], scenes };
}

function makeCallbacks(): SceneHandleCallbacks {
	return {
		onSceneStarted: vi.fn(),
		onSceneEnded: vi.fn(),
		getResolveCharacter: () => ( chars ) => chars[0],
		getChoiceFilter: () => null,
		getLocale: () => 'en',
	};
}

/** Populate a HandlerRegistry with the 4 mandatory handlers (for SceneHandleImpl direct tests). */
function fillRequiredHandlers( reg: HandlerRegistry ): void {
	reg.dialogHandler ??= ( { next } ) => { next(); };
	reg.choiceHandler ??= ( { context, next } ) => {
		if ( context.choices.length > 0 ) context.selectChoice( context.choices[0]!.uuid );
		next();
	};
	reg.conditionHandler ??= ( { context, next } ) => { context.resolve( true ); next(); };
	reg.actionHandler ??= ( { context, next } ) => { context.resolve(); next(); };
}

/** Register all 4 mandatory handlers on a DialogueEngine (for engine-level tests). */
function registerAllHandlers( engine: DialogueEngine ): void {
	engine.onDialog( ( { next } ) => { next(); } );
	engine.onChoice( ( { context, next } ) => {
		if ( context.choices.length > 0 ) context.selectChoice( context.choices[0]!.uuid );
		next();
	} );
	engine.onCondition( ( { context, next } ) => { context.resolve( true ); next(); } );
	engine.onAction( ( { context, next } ) => { context.resolve(); next(); } );
}

// ─── next() called twice ─────────────────────────────────────────────────────

describe( 'edge — next() called twice', () => {

	it( 'second next() is a no-op, block does not advance twice', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [dialog( 'b1', { start: true } ), dialog( 'b2' ), dialog( 'b3' )],
			connections: [conn( 'b1', 'b2' ), conn( 'b2', 'b3' )],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			visited.push( block.uuid );
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
				{ uuid: 'note1', type: 'NOTE', properties: [], isStartBlock: true } as BlueprintBlock,
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
				{ uuid: 'note1', type: 'NOTE', properties: [], isStartBlock: true } as BlueprintBlock,
				{ uuid: 'note2', type: 'NOTE', properties: [] } as BlueprintBlock,
				dialog( 'real' ),
			],
			connections: [conn( 'note1', 'note2', 'any' ), conn( 'note2', 'real', 'any' )],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => { visited.push( block.uuid ); next(); };
		fillRequiredHandlers( global );

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();
		expect( visited ).toEqual( ['real'] );
	} );

} );

// ─── selectChoice with invalid UUID ──────────────────────────────────────────

describe( 'edge — selectChoice with invalid UUID', () => {

	it( 'selecting a non-existent choice UUID leads to dead end', () => {
		const visited: string[] = [];
		const s: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				dialog( 'b1', { start: true } ),
				{
					uuid: 'choice1', type: 'CHOICE' as const, properties: [],
					choices: [
						{ uuid: 'opt-a', structureKey: 'a', dialogueText: { en: 'A' } },
					],
				},
				dialog( 'after' ),
			],
			connections: [
				conn( 'b1', 'choice1' ),
				{ id: 'c2', fromId: 'choice1', toId: 'after', fromPort: 'opt-a', toPort: 'in' },
			],
		};

		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [s] ) } );
		registerAllHandlers( engine );
		engine.onDialog( ( { block, next } ) => { visited.push( block.uuid ); next(); } );
		engine.onChoice( ( { context, next } ) => {
			context.selectChoice( 'INVALID-UUID' ); // doesn't match any connection
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
		const s: BlueprintScene = {
			uuid: 's1', label: 'S1', date: '2025-01-01',
			blocks: [
				{ uuid: 'cond1', type: 'CONDITION' as const, properties: [], isStartBlock: true,
					conditions: [{ uuid: 'c1', key: 'x', operator: '=', value: 'y' }] },
				dialog( 'yes' ),
				dialog( 'no' ),
			],
			connections: [
				{ id: 'ct', fromId: 'cond1', toId: 'yes', fromPort: 'true', toPort: 'in', fromPortIndex: 0 },
				{ id: 'cf', fromId: 'cond1', toId: 'no', fromPort: 'false', toPort: 'in', fromPortIndex: 1 },
			],
		};

		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [s] ) } );
		registerAllHandlers( engine );
		engine.onCondition( ( { context, next } ) => {
			context.resolve( true );
			context.resolve( false ); // override — should follow false branch
			next();
		} );
		engine.onDialog( ( { block, next } ) => { visited.push( block.uuid ); next(); } );

		engine.scene( 's1' ).start();
		expect( visited ).toEqual( ['no'] );
	} );

} );

// ─── onBeforeBlock that never calls resolve() ───────────────────────────────

describe( 'edge — onBeforeBlock without resolve', () => {

	it( 'flow stays blocked, handler never fires', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [dialog( 'b1', { start: true } ), dialog( 'b2' )],
			connections: [conn( 'b1', 'b2' )],
		} );

		const engine = new DialogueEngine();
		engine.init( { data: makeExport( [scene] ) } );
		registerAllHandlers( engine );
		engine.onBeforeBlock( ( { } ) => {
			// Intentionally never call resolve()
		} );
		engine.onDialog( ( { block, next } ) => { visited.push( block.uuid ); next(); } );

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
			entryBlockId: 'note1',
			blocks: [
				{ uuid: 'note1', type: 'NOTE', properties: [], isStartBlock: true } as BlueprintBlock,
				dialog( 'real' ),
			],
			connections: [conn( 'note1', 'real', 'any' )],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => { visited.push( block.uuid ); next(); };
		fillRequiredHandlers( global );

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();
		expect( visited ).toEqual( ['real'] );
	} );

} );

// ─── Long condition chains ───────────────────────────────────────────────────

describe( 'edge — long condition chains', () => {

	function cond( key: string, chain?: '|' | '&' ): ExportCondition {
		return { uuid: key, key, operator: '=', value: 'true', chain };
	}

	const eval_ = ( c: ExportCondition ) => c.key.startsWith( 't' );

	it( '4 conditions: t & t & f | t = true', () => {
		// (((true AND true) AND false) OR true) = true
		const result = evaluateConditionChain(
			[cond( 'true1' ), cond( 'true2', '&' ), cond( 'false1', '&' ), cond( 'true3', '|' )],
			eval_,
		);
		expect( result ).toBe( true );
	} );

	it( '5 conditions: f | f | f | f | t = true', () => {
		const result = evaluateConditionChain(
			[cond( 'f1' ), cond( 'f2', '|' ), cond( 'f3', '|' ), cond( 'f4', '|' ), cond( 'true1', '|' )],
			eval_,
		);
		expect( result ).toBe( true );
	} );

	it( '5 conditions: t & t & t & t & f = false', () => {
		const result = evaluateConditionChain(
			[cond( 'true1' ), cond( 'true2', '&' ), cond( 'true3', '&' ), cond( 'true4', '&' ), cond( 'false1', '&' )],
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
			blocks: [dialog( 'b1', { start: true } )],
		} )] ) } );

		registerAllHandlers( engine );
		engine.onDialog( ( { next } ) => { calls.push( 'first' ); next(); } );
		engine.onDialog( ( { next } ) => { calls.push( 'second' ); next(); } ); // overwrite

		engine.scene( 's1' ).start();
		expect( calls ).toEqual( ['second'] );
	} );

} );
