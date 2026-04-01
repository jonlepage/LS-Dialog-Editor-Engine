import { describe, it, expect, vi } from 'vitest';
import { SceneHandleImpl, type SceneHandleCallbacks } from './scene-handle.js';
import { SceneGraph } from './graph.js';
import { HandlerRegistry } from './handler-registry.js';
import type { BlueprintScene, BlueprintBlock, BlockCharacter, ExportCondition } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScene( overrides: Partial<BlueprintScene> = {} ): BlueprintScene {
	return {
		uuid: 'scene-1', label: 'Test', date: '2025-01-01',
		blocks: [], connections: [],
		...overrides,
	};
}

function makeCallbacks( overrides?: Partial<SceneHandleCallbacks> ): SceneHandleCallbacks {
	return {
		onSceneStarted: vi.fn(),
		onSceneEnded: vi.fn(),
		getResolveCharacter: () => ( chars ) => chars[0],
		getChoiceFilter: () => null,
		getLocale: () => 'en',
		...overrides,
	};
}

function dialog( uuid: string, start = false ): BlueprintBlock {
	return { uuid, type: 'DIALOG', properties: [], isStartBlock: start } as BlueprintBlock;
}

function conn( fromId: string, toId: string, fromPort = 'out' ) {
	return { id: `${ fromId }-${ toId }`, fromId, toId, fromPort, toPort: 'in' };
}

/** Registers all 4 mandatory handlers with sensible defaults (next-only). Override individual handlers after calling. */
function registerBaseHandlers( registry: HandlerRegistry ): void {
	registry.dialogHandler = ( { next } ) => next();
	registry.choiceHandler = ( { next } ) => next();
	registry.conditionHandler = ( { next } ) => next();
	registry.actionHandler = ( { next } ) => next();
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
		registerBaseHandlers( global );
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
		registerBaseHandlers( global );
		global.sceneEnterHandler = enterSpy;
		global.sceneExitHandler = exitSpy;

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
		registerBaseHandlers( global );
		global.sceneEnterHandler = globalEnter;

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
		registerBaseHandlers( global );
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
		registerBaseHandlers( global );
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
		registerBaseHandlers( global );
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
		registerBaseHandlers( global );
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
		registerBaseHandlers( global );
		global.validateNextBlockHandler = ( { nextBlock } ) => {
			if ( nextBlock.uuid === 'b2' ) return { valid: false, reason: 'blocked' };
			return { valid: true };
		};
		global.invalidateBlockHandler = invalidateSpy;

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( invalidateSpy ).toHaveBeenCalledOnce();
		expect( invalidateSpy.mock.calls[0]![0].reason ).toBe( 'blocked' );
		// b2 should not be visited
		expect( handle.getVisitedBlocks().has( 'b2' ) ).toBe( false );
	} );

	it( 'onValidateNextBlock receives nextContext.character', () => {
		const charLia: BlockCharacter = { uuid: 'c1', id: 'a1', name: 'Lia' };
		const b1 = { uuid: 'b1', type: 'DIALOG', properties: [], isStartBlock: true,
			metadata: { characters: [charLia] } } as unknown as BlueprintBlock;
		const scene = makeScene( {
			blocks: [b1],
			connections: [],
		} );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		let receivedCharacter: BlockCharacter | undefined;
		global.validateNextBlockHandler = ( { nextContext } ) => {
			receivedCharacter = nextContext.character;
			return { valid: true };
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( receivedCharacter ).toEqual( charLia );
	} );

	it( 'onValidateNextBlock receives fromContext.character from previous block', () => {
		const charLia: BlockCharacter = { uuid: 'c1', id: 'a1', name: 'Lia' };
		const charBob: BlockCharacter = { uuid: 'c2', id: 'a2', name: 'Bob' };
		const b1 = { uuid: 'b1', type: 'DIALOG', properties: [], isStartBlock: true,
			metadata: { characters: [charLia] } } as unknown as BlueprintBlock;
		const b2 = { uuid: 'b2', type: 'DIALOG', properties: [],
			metadata: { characters: [charBob] } } as unknown as BlueprintBlock;
		const scene = makeScene( {
			blocks: [b1, b2],
			connections: [conn( 'b1', 'b2' )],
		} );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		let fromChar: BlockCharacter | undefined;
		let nextChar: BlockCharacter | undefined;
		global.validateNextBlockHandler = ( { nextBlock, nextContext, fromContext } ) => {
			if ( nextBlock.uuid === 'b2' ) {
				fromChar = fromContext?.character;
				nextChar = nextContext.character;
			}
			return { valid: true };
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( fromChar ).toEqual( charLia );
		expect( nextChar ).toEqual( charBob );
	} );

	it( 'onValidateNextBlock fromContext is null for the first block', () => {
		const scene = makeScene( {
			blocks: [dialog( 'b1', true )],
			connections: [],
		} );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		let receivedFromContext: unknown = 'not_called';
		global.validateNextBlockHandler = ( { fromContext } ) => {
			receivedFromContext = fromContext;
			return { valid: true };
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( receivedFromContext ).toBeNull();
	} );

	it( 'onValidateNextBlock nextContext.character is undefined when block has no characters', () => {
		const scene = makeScene( {
			blocks: [dialog( 'b1', true )],
			connections: [],
		} );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		let receivedCharacter: BlockCharacter | undefined = { uuid: 'placeholder', id: '', name: '' };
		global.validateNextBlockHandler = ( { nextContext } ) => {
			receivedCharacter = nextContext.character;
			return { valid: true };
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( receivedCharacter ).toBeUndefined();
	} );

	it( 'onValidateNextBlock can invalidate based on character', () => {
		const charLia: BlockCharacter = { uuid: 'c1', id: 'a1', name: 'Lia' };
		const b1 = { uuid: 'b1', type: 'DIALOG', properties: [], isStartBlock: true } as BlueprintBlock;
		const b2 = { uuid: 'b2', type: 'DIALOG', properties: [],
			metadata: { characters: [charLia] } } as unknown as BlueprintBlock;
		const scene = makeScene( {
			blocks: [b1, b2],
			connections: [conn( 'b1', 'b2' )],
		} );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		const invalidateSpy = vi.fn();
		global.validateNextBlockHandler = ( { nextContext } ) => {
			if ( nextContext.character?.name === 'Lia' ) return { valid: false, reason: 'lia_not_allowed' };
			return { valid: true };
		};
		global.invalidateBlockHandler = invalidateSpy;

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( invalidateSpy ).toHaveBeenCalledOnce();
		expect( invalidateSpy.mock.calls[0]![0].reason ).toBe( 'lia_not_allowed' );
		expect( handle.getVisitedBlocks().has( 'b2' ) ).toBe( false );
	} );

	it( 'onBeforeBlock delays handler execution until resolve()', () => {
		const order: string[] = [];
		const scene = makeScene( {
			blocks: [dialog( 'b1', true )],
			connections: [],
		} );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );

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

	it( 'start() throws if mandatory handlers missing', () => {
		const scene = makeScene( { blocks: [dialog( 'b1', true )] } );
		const global = new HandlerRegistry();
		// No handlers registered at all

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		expect( () => handle.start() ).toThrowError( /missing required handler/ );
	} );

	it( 'tagChoiceVisibility tags choices when filter installed', () => {
		const scene = makeScene( {
			blocks: [
				{
					uuid: 'ch1', type: 'CHOICE', properties: [], isStartBlock: true,
					choices: [
						{ uuid: 'c1', structureKey: 'c1' },
						{ uuid: 'c2', structureKey: 'c2', visibilityConditions: [{ uuid: 'v1', key: 'flag', operator: '==', value: 'true' }] },
					],
				} as BlueprintBlock,
				dialog( 'after' ),
			],
			connections: [
				{ id: 'ch1-c1', fromId: 'ch1', toId: 'after', fromPort: 'c1', toPort: 'in' },
			],
		} );
		const global = new HandlerRegistry();
		let capturedChoices: unknown[] = [];
		global.choiceHandler = ( { context, next } ) => {
			capturedChoices = context.choices;
			context.selectChoice( 'c1' );
			next();
		};
		global.dialogHandler = ( { next } ) => next();
		global.conditionHandler = ( { next } ) => next();
		global.actionHandler = ( { next } ) => next();

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks( {
			getChoiceFilter: () => () => false, // all external conditions fail
		} ) );
		handle.start();

		// c1 has no visibilityConditions → visible defaults to true
		// c2 has visibilityConditions that fail → visible = false
		expect( capturedChoices ).toHaveLength( 2 );
		expect( ( capturedChoices[0] as { uuid: string; visible?: boolean } ).visible ).toBe( true );
		expect( ( capturedChoices[1] as { uuid: string; visible?: boolean } ).visible ).toBe( false );
	} );

	it( 'preventGlobalHandler() prevents global handler from firing', () => {
		const globalSpy = vi.fn();
		const sceneSpy = vi.fn();
		const scene = makeScene( {
			blocks: [dialog( 'b1', true )],
			connections: [],
		} );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
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
		registerBaseHandlers( global );
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
		registerBaseHandlers( global );

		new SceneHandleImpl( new SceneGraph( scene ), global, cbs ).start();

		expect( cbs.onSceneStarted ).toHaveBeenCalledOnce();
		expect( cbs.onSceneEnded ).toHaveBeenCalledOnce();
	} );

	it( 'handles empty scene gracefully', () => {
		const cbs = makeCallbacks();
		const scene = makeScene( { blocks: [] } );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );

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
	return { uuid, type: 'CONDITION', properties: [], conditions: [conditions], isStartBlock: start } as BlueprintBlock;
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
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => {
			context.selectChoice( 'opt-a' );
			next();
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( handle.getChoiceHistory().size ).toBe( 1 );
		expect( handle.getChoice( 'ch1' ) ).toEqual( ['opt-a'] );
	} );

	it( 'getChoice returns undefined for non-choice blocks', () => {
		const scene = makeScene( { blocks: [dialog( 'b1', true )] } );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );

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
		registerBaseHandlers( global );
		let visit = 0;
		global.choiceHandler = ( { context, next } ) => {
			visit++;
			if ( visit === 1 ) context.selectChoice( 'opt-a' );
			else if ( visit === 2 ) context.selectChoice( 'opt-b' );
			// 3rd visit: don't select → ends flow
			next();
		};

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( handle.getChoice( 'ch1' ) ).toEqual( ['opt-a', 'opt-b'] );
	} );

	it( 'getChoiceHistory returns empty map when no choices', () => {
		const scene = makeScene( { blocks: [dialog( 'b1', true )] } );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );

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
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'opt-a' ); next(); };

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		expect( handle.isRunning() ).toBe( false );
		expect( handle.getChoice( 'ch1' ) ).toEqual( ['opt-a'] );
	} );

} );

// ─── Choice Condition Resolution ─────────────────────────────────────────────

describe( 'SceneHandleImpl — Choice Condition Resolution', () => {

	it( 'choice: condition resolves == match via handler', () => {
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
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'opt-a' ); next(); };
		global.conditionHandler = ( { scene: s, block, context, next } ) => {
			const groups = ( block as unknown as { conditions: ExportCondition[][] } ).conditions;
			const result = ( groups[0] ?? [] ).every( c => s.evaluateCondition( c ) );
			context.resolve( result );
			next();
		};
		global.dialogHandler = ( { block, next } ) => { visited.push( block.uuid ); next(); };

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();

		expect( visited ).toEqual( ['yes'] );
	} );

	it( 'choice: condition resolves == no match via handler', () => {
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
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'opt-a' ); next(); };
		global.conditionHandler = ( { scene: s, block, context, next } ) => {
			const groups = ( block as unknown as { conditions: ExportCondition[][] } ).conditions;
			const result = ( groups[0] ?? [] ).every( c => s.evaluateCondition( c ) );
			context.resolve( result );
			next();
		};
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
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'opt-a' ); next(); };
		global.conditionHandler = ( { scene: s, block, context, next } ) => {
			const groups = ( block as unknown as { conditions: ExportCondition[][] } ).conditions;
			const result = ( groups[0] ?? [] ).every( c => s.evaluateCondition( c ) );
			context.resolve( result );
			next();
		};
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
		registerBaseHandlers( global );
		global.conditionHandler = ( { scene: s, block, context, next } ) => {
			const groups = ( block as unknown as { conditions: ExportCondition[][] } ).conditions;
			const result = ( groups[0] ?? [] ).every( c => s.evaluateCondition( c ) );
			context.resolve( result );
			next();
		};
		global.dialogHandler = ( { block, next } ) => { visited.push( block.uuid ); next(); };

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();

		expect( visited ).toEqual( ['no'] );
	} );

	it( 'choice: condition works with internal choice history', () => {
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
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'opt-a' ); next(); };
		global.conditionHandler = ( { scene: s, block, context, next } ) => {
			const groups = ( block as unknown as { conditions: ExportCondition[][] } ).conditions;
			const result = ( groups[0] ?? [] ).every( c => s.evaluateCondition( c ) );
			context.resolve( result );
			next();
		};
		global.dialogHandler = ( { block, next } ) => { visited.push( block.uuid ); next(); };

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();

		expect( visited ).toEqual( ['yes'] );
	} );

	it( 'mixed choice: and external conditions chain correctly', () => {
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
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		global.choiceHandler = ( { context, next } ) => { context.selectChoice( 'opt-a' ); next(); };
		global.conditionHandler = ( { scene: s, block, context, next } ) => {
			const groups = ( block as unknown as { conditions: ExportCondition[][] } ).conditions;
			// Use scene.evaluateCondition for choice: keys, return true for external keys
			const result = ( groups[0] ?? [] ).every( c =>
				c.key.startsWith( 'choice:' ) ? s.evaluateCondition( c ) : true,
			);
			context.resolve( result );
			next();
		};
		global.dialogHandler = ( { block, next } ) => { visited.push( block.uuid ); next(); };

		new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() ).start();

		expect( visited ).toEqual( ['yes'] );
	} );

} );

// ─── Multi-track (AsyncTrack) ────────────────────────────────────────────────

function asyncDialog( uuid: string ): BlueprintBlock {
	return {
		uuid, type: 'DIALOG', properties: [],
		nativeProperties: { isAsync: true },
	} as BlueprintBlock;
}

describe( 'SceneHandleImpl — ValidateNextBlock cache safety', () => {

	it( 'async track does not consume main track pre-resolved character cache', () => {
		const charLia: BlockCharacter = { uuid: 'c1', id: 'a1', name: 'Lia' };
		const charBob: BlockCharacter = { uuid: 'c2', id: 'a2', name: 'Bob' };
		const b1 = { uuid: 'b1', type: 'DIALOG', properties: [], isStartBlock: true,
			metadata: { characters: [charLia] } } as unknown as BlueprintBlock;
		const asyncBlock = { uuid: 'async1', type: 'DIALOG', properties: [],
			nativeProperties: { isAsync: true },
			metadata: { characters: [charBob] } } as unknown as BlueprintBlock;
		const scene = makeScene( {
			blocks: [b1, asyncBlock],
			connections: [conn( 'b1', 'async1' )],
		} );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );

		const resolvedChars: Array<{ block: string; char: string | undefined }> = [];
		global.dialogHandler = ( { block, context, next } ) => {
			resolvedChars.push( { block: block.uuid, char: context.character?.name } );
			next();
		};

		// Validate handler sets the cache for each block
		global.validateNextBlockHandler = () => ( { valid: true } );

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		// b1 should get Lia, async1 should get Bob (not Lia from stale cache)
		const b1Char = resolvedChars.find( r => r.block === 'b1' );
		const asyncChar = resolvedChars.find( r => r.block === 'async1' );
		expect( b1Char?.char ).toBe( 'Lia' );
		expect( asyncChar?.char ).toBe( 'Bob' );
	} );

	it( 'pre-resolved character cache does not leak across blocks after invalidation', () => {
		const charLia: BlockCharacter = { uuid: 'c1', id: 'a1', name: 'Lia' };
		const charBob: BlockCharacter = { uuid: 'c2', id: 'a2', name: 'Bob' };
		const b1 = { uuid: 'b1', type: 'DIALOG', properties: [], isStartBlock: true } as BlueprintBlock;
		const b2 = { uuid: 'b2', type: 'DIALOG', properties: [],
			metadata: { characters: [charLia] } } as unknown as BlueprintBlock;
		const b3 = { uuid: 'b3', type: 'DIALOG', properties: [],
			metadata: { characters: [charBob] } } as unknown as BlueprintBlock;
		const scene = makeScene( {
			blocks: [b1, b2, b3],
			connections: [conn( 'b1', 'b2' ), conn( 'b2', 'b3' )],
		} );
		const global = new HandlerRegistry();
		registerBaseHandlers( global );
		const receivedNextChars: Array<{ block: string; char: string | undefined }> = [];
		global.validateNextBlockHandler = ( { nextBlock, nextContext } ) => {
			receivedNextChars.push( { block: nextBlock.uuid, char: nextContext.character?.name } );
			if ( nextBlock.uuid === 'b2' ) return { valid: false, reason: 'blocked' };
			return { valid: true };
		};
		global.invalidateBlockHandler = vi.fn();

		const handle = new SceneHandleImpl( new SceneGraph( scene ), global, makeCallbacks() );
		handle.start();

		// b1: no characters → undefined, b2: Lia (rejected)
		expect( receivedNextChars.find( r => r.block === 'b1' )?.char ).toBeUndefined();
		expect( receivedNextChars.find( r => r.block === 'b2' )?.char ).toBe( 'Lia' );
		// b3 is never reached because b2 invalidation stops the flow
		expect( handle.getVisitedBlocks().has( 'b2' ) ).toBe( false );
	} );
} );

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
		registerBaseHandlers( global );
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
		registerBaseHandlers( global );
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
		registerBaseHandlers( global );
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
		registerBaseHandlers( global );

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

} );
