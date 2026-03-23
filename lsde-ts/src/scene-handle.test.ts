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
			connections: [conn( 'act1', 'after' )],
		} );
		const bridge: StateBridge = {
			evaluateCondition: () => true,
			executeAction: ( action ) => { executedActions.push( action.actionId ); },
			resolveDictionary: () => '',
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
