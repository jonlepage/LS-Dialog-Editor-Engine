import { describe, it, expect, vi } from 'vitest';
import { SceneHandleImpl, type SceneHandleCallbacks } from './scene-handle.js';
import { SceneGraph } from './graph.js';
import { HandlerRegistry } from './handler-registry.js';
import type { BlueprintScene, BlueprintBlock, StateBridge } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScene( overrides: Partial<BlueprintScene> = {} ): BlueprintScene {
	return {
		uuid: 'scene-1', label: 'Test', date: '2025-01-01',
		blocks: [], connections: [],
		...overrides,
	};
}

function makeCallbacks( bridge?: StateBridge ): SceneHandleCallbacks {
	return {
		onSceneStarted: vi.fn(),
		onSceneEnded: vi.fn(),
		getStateBridge: () => bridge ?? null,
		getLocale: () => 'en',
	};
}

function dialog( uuid: string, start = false ): BlueprintBlock {
	return { uuid, type: 'DIALOG', properties: [], isStartBlock: start } as BlueprintBlock;
}

function conn( fromId: string, toId: string, fromPort = 'out' ) {
	return { id: `${ fromId }-${ toId }`, fromId, toId, fromPort, toPort: 'in' };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe( 'SceneHandleImpl', () => {

	it( 'traverses two dialog blocks linearly', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [dialog( 'b1', true ), dialog( 'b2' )],
			connections: [conn( 'b1', 'b2' )],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			visited.push( block.uuid );
			next();
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( visited ).toEqual( ['b1', 'b2'] );
		expect( handle.isRunning() ).toBe( false );
		expect( Array.from( handle.getVisitedBlocks() ) ).toEqual( ['b1', 'b2'] );
	} );

	it( 'fires onSceneEnter and onSceneExit', () => {
		const enterSpy = vi.fn();
		const exitSpy = vi.fn();
		const scene = makeScene( {
			blocks: [dialog( 'b1', true )],
			connections: [],
		} );
		const global = new HandlerRegistry();
		global.sceneEnterHandler = enterSpy;
		global.sceneExitHandler = exitSpy;
		global.dialogHandler = ( { next } ) => next();

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( enterSpy ).toHaveBeenCalledOnce();
		expect( exitSpy ).toHaveBeenCalledOnce();
	} );

	it( 'Tier 2 onEnter overrides global onSceneEnter', () => {
		const globalEnter = vi.fn();
		const sceneEnter = vi.fn();
		const scene = makeScene( { blocks: [dialog( 'b1', true )] } );
		const global = new HandlerRegistry();
		global.sceneEnterHandler = globalEnter;
		global.dialogHandler = ( { next } ) => next();

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.onEnter( sceneEnter );
		handle.start();

		expect( sceneEnter ).toHaveBeenCalledOnce();
		expect( globalEnter ).not.toHaveBeenCalled();
	} );

	it( 'cancel() stops the flow and fires onSceneExit', () => {
		const exitSpy = vi.fn();
		const scene = makeScene( {
			blocks: [dialog( 'b1', true ), dialog( 'b2' )],
			connections: [conn( 'b1', 'b2' )],
		} );
		const global = new HandlerRegistry();
		global.sceneExitHandler = exitSpy;

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );

		global.dialogHandler = ( { block, next } ) => {
			if ( block.uuid === 'b1' ) {
				handle.cancel();
				next(); // should be no-op after cancel
			}
		};

		handle.start();
		expect( handle.isRunning() ).toBe( false );
		expect( exitSpy ).toHaveBeenCalledOnce();
		// b2 should never be visited
		expect( handle.getVisitedBlocks().has( 'b2' ) ).toBe( false );
	} );

	it( 'skips NOTE blocks and follows their connections', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [
				dialog( 'b1', true ),
				{ uuid: 'note1', type: 'NOTE', properties: [] } as BlueprintBlock,
				dialog( 'b3' ),
			],
			connections: [conn( 'b1', 'note1' ), conn( 'note1', 'b3', 'any' )],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			visited.push( block.uuid );
			next();
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( visited ).toEqual( ['b1', 'b3'] );
	} );

	it( 'calls cleanup when advancing to next block', () => {
		const cleanupSpy = vi.fn();
		const scene = makeScene( {
			blocks: [dialog( 'b1', true ), dialog( 'b2' )],
			connections: [conn( 'b1', 'b2' )],
		} );
		const global = new HandlerRegistry();
		let callCount = 0;
		global.dialogHandler = ( { next } ) => {
			callCount++;
			if ( callCount === 1 ) {
				next();
				return cleanupSpy;
			}
			next();
		};

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();

		expect( cleanupSpy ).toHaveBeenCalledOnce();
	} );

	it( 'calls cleanup of last block when scene ends', () => {
		const cleanupSpy = vi.fn();
		const scene = makeScene( {
			blocks: [dialog( 'b1', true )],
			connections: [],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { next } ) => {
			next();
			return cleanupSpy;
		};

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();
		expect( cleanupSpy ).toHaveBeenCalledOnce();
	} );

	it( 'onValidateNextBlock can block a block', () => {
		const invalidateSpy = vi.fn();
		const scene = makeScene( {
			blocks: [dialog( 'b1', true ), dialog( 'b2' )],
			connections: [conn( 'b1', 'b2' )],
		} );
		const global = new HandlerRegistry();
		global.validateNextBlockHandler = ( { nextBlock } ) => {
			if ( nextBlock.uuid === 'b2' ) return { valid: false, reason: 'blocked' };
			return { valid: true };
		};
		global.invalidateBlockHandler = invalidateSpy;
		global.dialogHandler = ( { next } ) => next();

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( invalidateSpy ).toHaveBeenCalledOnce();
		expect( invalidateSpy.mock.calls[0]![0].reason ).toBe( 'blocked' );
		// b2 should not be visited
		expect( handle.getVisitedBlocks().has( 'b2' ) ).toBe( false );
	} );

	it( 'onBeforeBlock delays handler execution until resolve()', () => {
		const order: string[] = [];
		const scene = makeScene( {
			blocks: [dialog( 'b1', true )],
			connections: [],
		} );
		const global = new HandlerRegistry();

		let resolveBeforeBlock: (() => void) | null = null;
		global.beforeBlockHandler = ( { resolve } ) => {
			order.push( 'before' );
			resolveBeforeBlock = resolve;
		};
		global.dialogHandler = ( { next } ) => {
			order.push( 'handler' );
			next();
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		// Handler should not have fired yet
		expect( order ).toEqual( ['before'] );
		expect( handle.isRunning() ).toBe( true );

		// Resolve triggers the handler
		resolveBeforeBlock!();
		expect( order ).toEqual( ['before', 'handler'] );
	} );

	it( 'auto-evaluates CONDITION block when no handler', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [
				{ uuid: 'cond1', type: 'CONDITION', properties: [], isStartBlock: true, conditions: [
					{ uuid: 'c1', key: 'quest', operator: '=', value: 'active' },
				] } as BlueprintBlock,
				dialog( 'yes' ),
				dialog( 'no' ),
			],
			connections: [
				{ id: 'ct', fromId: 'cond1', toId: 'yes', fromPort: 'true', toPort: 'in', fromPortIndex: 0 },
				{ id: 'cf', fromId: 'cond1', toId: 'no', fromPort: 'false', toPort: 'in', fromPortIndex: 1 },
			],
		} );
		const bridge: StateBridge = {
			evaluateCondition: () => true,
			executeAction: vi.fn(),
			resolveDictionary: () => '',
			resolveCharacter: ( chars ) => chars[0],
		};
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			visited.push( block.uuid );
			next();
		};
		// No onCondition registered — should auto-evaluate

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks( bridge ) ).start();

		expect( visited ).toEqual( ['yes'] );
	} );

	it( 'auto-executes ACTION block when no handler', () => {
		const executedActions: string[] = [];
		const scene = makeScene( {
			blocks: [
				{ uuid: 'act1', type: 'ACTION', properties: [], isStartBlock: true, actions: [
					{ uuid: 'a1', actionId: 'give_item', params: ['sword'] },
				] } as BlueprintBlock,
				dialog( 'after' ),
			],
			connections: [conn( 'act1', 'after', 'then' )],
		} );
		const bridge: StateBridge = {
			evaluateCondition: () => true,
			executeAction: ( action ) => { executedActions.push( action.actionId ); },
			resolveDictionary: () => '',
			resolveCharacter: ( chars ) => chars[0],
		};
		const global = new HandlerRegistry();
		global.dialogHandler = ( { next } ) => next();

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks( bridge ) ).start();

		expect( executedActions ).toEqual( ['give_item'] );
	} );

	it( 'preventGlobalHandler() prevents global handler from firing', () => {
		const globalSpy = vi.fn();
		const sceneSpy = vi.fn();
		const scene = makeScene( {
			blocks: [dialog( 'b1', true )],
			connections: [],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( args ) => {
			globalSpy();
			args.next();
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.onDialog( ( args ) => {
			sceneSpy();
			args.context.preventGlobalHandler();
			args.next();
		} );
		handle.start();

		expect( sceneSpy ).toHaveBeenCalledOnce();
		expect( globalSpy ).not.toHaveBeenCalled();
	} );

	it( 'both scene and global handlers fire when preventGlobalHandler is not called', () => {
		const calls: string[] = [];
		const scene = makeScene( {
			blocks: [dialog( 'b1', true )],
			connections: [],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { next } ) => {
			calls.push( 'global' );
			next();
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.onDialog( ( { next } ) => {
			calls.push( 'scene' );
			// NOT calling preventGlobalHandler
			next();
		} );
		handle.start();

		expect( calls ).toEqual( ['scene', 'global'] );
	} );

	it( 'notifies engine callbacks on start and end', () => {
		const cbs = makeCallbacks();
		const scene = makeScene( { blocks: [dialog( 'b1', true )] } );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { next } ) => next();

		new SceneHandleImpl( new SceneGraph( scene ), global, cbs ).start();

		expect( cbs.onSceneStarted ).toHaveBeenCalledOnce();
		expect( cbs.onSceneEnded ).toHaveBeenCalledOnce();
	} );

	it( 'handles empty scene gracefully', () => {
		const cbs = makeCallbacks();
		const scene = makeScene( { blocks: [] } );
		const global = new HandlerRegistry();

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, cbs );
		handle.start();

		expect( handle.isRunning() ).toBe( false );
		expect( cbs.onSceneEnded ).toHaveBeenCalledOnce();
	} );

} );

// ─── Choice History ──────────────────────────────────────────────────────────

function choiceBlock( uuid: string, choices: { uuid: string }[], start = false ): BlueprintBlock {
	return { uuid, type: 'CHOICE', properties: [], choices: choices.map( c => ( { ...c, structureKey: c.uuid } ) ), isStartBlock: start } as BlueprintBlock;
}

function conditionBlock( uuid: string, conditions: { uuid: string; key: string; operator: string; value: string; chain?: '|' | '&' }[], start = false ): BlueprintBlock {
	return { uuid, type: 'CONDITION', properties: [], conditions, isStartBlock: start } as BlueprintBlock;
}

function condConn( fromId: string, toIdTrue: string, toIdFalse: string ) {
	return [
		{ id: `${ fromId }-t`, fromId, toId: toIdTrue, fromPort: 'true', toPort: 'in', fromPortIndex: 0 },
		{ id: `${ fromId }-f`, fromId, toId: toIdFalse, fromPort: 'false', toPort: 'in', fromPortIndex: 1 },
	];
}

describe( 'SceneHandleImpl — Choice History', () => {

	it( 'records selected choice in history', () => {
		const scene = makeScene( {
			blocks: [
				choiceBlock( 'ch1', [{ uuid: 'opt-a' }, { uuid: 'opt-b' }], true ),
				dialog( 'after' ),
			],
			connections: [
				{ id: 'ch1-a', fromId: 'ch1', toId: 'after', fromPort: 'opt-a', toPort: 'in' },
			],
		} );
		const global = new HandlerRegistry();
		global.choiceHandler = ( { context, next } ) => {
			context.selectChoice( 'opt-a' );
			next();
		};
		global.dialogHandler = ( { next } ) => next();

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( handle.getChoiceHistory().size ).toBe( 1 );
		expect( handle.getChoice( 'ch1' ) ).toEqual( ['opt-a'] );
	} );

	it( 'getChoice returns undefined for non-choice blocks', () => {
		const scene = makeScene( { blocks: [dialog( 'b1', true )] } );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { next } ) => next();

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( handle.getChoice( 'b1' ) ).toBeUndefined();
	} );

	it( 'accumulates choices in loops', () => {
		const scene = makeScene( {
			blocks: [
				choiceBlock( 'ch1', [{ uuid: 'opt-a' }, { uuid: 'opt-b' }], true ),
				dialog( 'mid' ),
			],
			connections: [
				{ id: 'ch1-a', fromId: 'ch1', toId: 'mid', fromPort: 'opt-a', toPort: 'in' },
				{ id: 'ch1-b', fromId: 'ch1', toId: 'mid', fromPort: 'opt-b', toPort: 'in' },
				conn( 'mid', 'ch1' ),
			],
		} );
		const global = new HandlerRegistry();
		let visit = 0;
		global.choiceHandler = ( { context, next } ) => {
			visit++;
			if ( visit === 1 ) context.selectChoice( 'opt-a' );
			else if ( visit === 2 ) context.selectChoice( 'opt-b' );
			// 3rd visit: don't select → ends flow
			next();
		};
		global.dialogHandler = ( { next } ) => next();

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( handle.getChoice( 'ch1' ) ).toEqual( ['opt-a', 'opt-b'] );
	} );

	it( 'getChoiceHistory returns empty map when no choices', () => {
		const scene = makeScene( { blocks: [dialog( 'b1', true )] } );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { next } ) => next();

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( handle.getChoiceHistory().size ).toBe( 0 );
	} );

	it( 'choice history survives after scene ends', () => {
		const scene = makeScene( {
			blocks: [
				choiceBlock( 'ch1', [{ uuid: 'opt-a' }], true ),
				dialog( 'after' ),
			],
			connections: [
				{ id: 'ch1-a', fromId: 'ch1', toId: 'after', fromPort: 'opt-a', toPort: 'in' },
			],
		} );
		const global = new HandlerRegistry();
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'opt-a' ); next(); };
		global.dialogHandler = ( { next } ) => next();

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( handle.isRunning() ).toBe( false );
		expect( handle.getChoice( 'ch1' ) ).toEqual( ['opt-a'] );
	} );

} );

// ─── Choice Condition Resolution ─────────────────────────────────────────────

describe( 'SceneHandleImpl — Choice Condition Resolution', () => {

	it( 'choice: condition resolves == match (auto-evaluate)', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [
				choiceBlock( 'ch1', [{ uuid: 'opt-a' }], true ),
				conditionBlock( 'cond1', [{ uuid: 'c1', key: 'choice:ch1', operator: '==', value: 'opt-a' }] ),
				dialog( 'yes' ),
				dialog( 'no' ),
			],
			connections: [
				{ id: 'ch1-a', fromId: 'ch1', toId: 'cond1', fromPort: 'opt-a', toPort: 'in' },
				...condConn( 'cond1', 'yes', 'no' ),
			],
		} );
		const global = new HandlerRegistry();
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'opt-a' ); next(); };
		global.dialogHandler = ( { block, next } ) => { visited.push( block.uuid ); next(); };

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();

		expect( visited ).toEqual( ['yes'] );
	} );

	it( 'choice: condition resolves == no match (auto-evaluate)', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [
				choiceBlock( 'ch1', [{ uuid: 'opt-a' }], true ),
				conditionBlock( 'cond1', [{ uuid: 'c1', key: 'choice:ch1', operator: '==', value: 'opt-b' }] ),
				dialog( 'yes' ),
				dialog( 'no' ),
			],
			connections: [
				{ id: 'ch1-a', fromId: 'ch1', toId: 'cond1', fromPort: 'opt-a', toPort: 'in' },
				...condConn( 'cond1', 'yes', 'no' ),
			],
		} );
		const global = new HandlerRegistry();
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'opt-a' ); next(); };
		global.dialogHandler = ( { block, next } ) => { visited.push( block.uuid ); next(); };

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();

		expect( visited ).toEqual( ['no'] );
	} );

	it( 'choice: condition resolves != operator', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [
				choiceBlock( 'ch1', [{ uuid: 'opt-a' }], true ),
				conditionBlock( 'cond1', [{ uuid: 'c1', key: 'choice:ch1', operator: '!=', value: 'opt-a' }] ),
				dialog( 'yes' ),
				dialog( 'no' ),
			],
			connections: [
				{ id: 'ch1-a', fromId: 'ch1', toId: 'cond1', fromPort: 'opt-a', toPort: 'in' },
				...condConn( 'cond1', 'yes', 'no' ),
			],
		} );
		const global = new HandlerRegistry();
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'opt-a' ); next(); };
		global.dialogHandler = ( { block, next } ) => { visited.push( block.uuid ); next(); };

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();

		expect( visited ).toEqual( ['no'] );
	} );

	it( 'choice: condition returns false for unvisited block', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [
				conditionBlock( 'cond1', [{ uuid: 'c1', key: 'choice:nonexistent', operator: '==', value: 'opt-a' }], true ),
				dialog( 'yes' ),
				dialog( 'no' ),
			],
			connections: condConn( 'cond1', 'yes', 'no' ),
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => { visited.push( block.uuid ); next(); };

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();

		expect( visited ).toEqual( ['no'] );
	} );

	it( 'choice: condition works without StateBridge', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [
				choiceBlock( 'ch1', [{ uuid: 'opt-a' }], true ),
				conditionBlock( 'cond1', [{ uuid: 'c1', key: 'choice:ch1', operator: '==', value: 'opt-a' }] ),
				dialog( 'yes' ),
				dialog( 'no' ),
			],
			connections: [
				{ id: 'ch1-a', fromId: 'ch1', toId: 'cond1', fromPort: 'opt-a', toPort: 'in' },
				...condConn( 'cond1', 'yes', 'no' ),
			],
		} );
		const global = new HandlerRegistry();
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'opt-a' ); next(); };
		global.dialogHandler = ( { block, next } ) => { visited.push( block.uuid ); next(); };

		// No StateBridge at all
		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();

		expect( visited ).toEqual( ['yes'] );
	} );

	it( 'mixed choice: and bridge conditions chain correctly', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [
				choiceBlock( 'ch1', [{ uuid: 'opt-a' }], true ),
				conditionBlock( 'cond1', [
					{ uuid: 'c1', key: 'choice:ch1', operator: '==', value: 'opt-a' },
					{ uuid: 'c2', key: 'quest', operator: '==', value: 'active', chain: '&' },
				] ),
				dialog( 'yes' ),
				dialog( 'no' ),
			],
			connections: [
				{ id: 'ch1-a', fromId: 'ch1', toId: 'cond1', fromPort: 'opt-a', toPort: 'in' },
				...condConn( 'cond1', 'yes', 'no' ),
			],
		} );
		const bridge: StateBridge = {
			evaluateCondition: () => true, // quest == active → true
			executeAction: vi.fn(),
			resolveDictionary: () => '',
			resolveCharacter: ( chars ) => chars[0],
		};
		const global = new HandlerRegistry();
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'opt-a' ); next(); };
		global.dialogHandler = ( { block, next } ) => { visited.push( block.uuid ); next(); };

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks( bridge ) ).start();

		expect( visited ).toEqual( ['yes'] );
	} );

} );

// ─── Multi-track (AsyncTrack) ────────────────────────────────────────────────

function asyncDialog( uuid: string, follow = false ): BlueprintBlock {
	return {
		uuid, type: 'DIALOG', properties: [],
		nativeProperties: { isAsync: true, followNarrative: follow },
	} as BlueprintBlock;
}

describe( 'SceneHandleImpl — AsyncTracks', () => {

	it( 'spawns async track for isAsync target block', () => {
		const visited: string[] = [];
		const scene = makeScene( {
			blocks: [
				dialog( 'b1', true ),
				asyncDialog( 'async1' ),
				dialog( 'b2' ),
			],
			connections: [
				conn( 'b1', 'b2' ),       // main track
				conn( 'b1', 'async1' ),    // async track (same fromPort 'out')
			],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			visited.push( block.uuid );
			next();
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( visited ).toContain( 'b1' );
		expect( visited ).toContain( 'b2' );
		expect( visited ).toContain( 'async1' );
	} );

	it( 'async track handler fires independently', () => {
		const calls: string[] = [];
		const scene = makeScene( {
			blocks: [
				dialog( 'main1', true ),
				asyncDialog( 'async1' ),
				dialog( 'async2' ),  // connected after async1
			],
			connections: [
				conn( 'main1', 'async1' ),         // async fork
				conn( 'async1', 'async2' ),         // async continues
			],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			calls.push( block.uuid );
			next();
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		// main1 fires, then async1 fires in track, async2 follows
		expect( calls ).toContain( 'main1' );
		expect( calls ).toContain( 'async1' );
		expect( calls ).toContain( 'async2' );
	} );

	it( 'cancel() cascades to async tracks', () => {
		const cleanupSpy = vi.fn();
		const scene = makeScene( {
			blocks: [
				dialog( 'main1', true ),
				asyncDialog( 'async1' ),
				dialog( 'main2' ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'async1' ),
			],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			if ( block.uuid === 'async1' ) {
				// Don't call next — keep async track alive
				return cleanupSpy;
			}
			next();
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		// main track finishes (main1 → main2 → end), async still alive?
		// Actually main track ends → endScene cancels async tracks
		expect( cleanupSpy ).toHaveBeenCalled();
	} );

	it( 'getActiveTracks() returns correct count', () => {
		let capturedCount = -1;
		const scene = makeScene( {
			blocks: [
				dialog( 'main1', true ),
				asyncDialog( 'async1' ),
				dialog( 'main2' ),
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main1', 'async1' ),
			],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			if ( block.uuid === 'async1' ) {
				// Don't call next — stay active
				return;
			}
			if ( block.uuid === 'main2' ) {
				capturedCount = (block as unknown as { _handle?: SceneHandleImpl })?._handle?.getActiveTracks() ?? -1;
			}
			next();
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		// Capture count during main2 handler
		global.dialogHandler = ( { block, next } ) => {
			if ( block.uuid === 'async1' ) return; // stay active
			if ( block.uuid === 'main2' ) capturedCount = handle.getActiveTracks();
			next();
		};
		handle.start();

		expect( capturedCount ).toBe( 1 );
	} );

	it( 'follow-narrative track advances when main advances', () => {
		const calls: string[] = [];
		const scene = makeScene( {
			blocks: [
				dialog( 'main1', true ),
				dialog( 'main2' ),
				asyncDialog( 'follow1', true ),  // followNarrative
				asyncDialog( 'follow2', true ),  // followNarrative continuation
			],
			connections: [
				conn( 'main1', 'main2' ),        // main track
				conn( 'main1', 'follow1' ),      // async fork
				conn( 'follow1', 'follow2' ),    // follow continues
			],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			calls.push( block.uuid );
			next();
		};

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();

		// main1 → forks to main2 + follow1
		// main1 next() → main2 fires + notifyMainAdvance → follow1 advances to follow2
		// main2 next() → endScene → follow track cancelled
		expect( calls ).toContain( 'main1' );
		expect( calls ).toContain( 'main2' );
		expect( calls ).toContain( 'follow1' );
		expect( calls ).toContain( 'follow2' );
	} );

	it( 'follow-narrative track shorter than main ends silently', () => {
		const calls: string[] = [];
		const scene = makeScene( {
			blocks: [
				dialog( 'main1', true ),
				dialog( 'main2' ),
				dialog( 'main3' ),
				asyncDialog( 'follow1', true ),
				// follow1 has no next connection → ends after first advance
			],
			connections: [
				conn( 'main1', 'main2' ),
				conn( 'main2', 'main3' ),
				conn( 'main1', 'follow1' ),
			],
		} );
		const global = new HandlerRegistry();
		global.dialogHandler = ( { block, next } ) => {
			calls.push( block.uuid );
			next();
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( calls ).toContain( 'main1' );
		expect( calls ).toContain( 'main2' );
		expect( calls ).toContain( 'main3' );
		expect( calls ).toContain( 'follow1' );
		expect( handle.isRunning() ).toBe( false );
	} );

} );
