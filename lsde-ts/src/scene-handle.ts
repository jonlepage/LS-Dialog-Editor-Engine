// LSDE Dialog Engine — SceneHandle (Tier 2) + traversal loop

import type {
	BlueprintBlock, SceneHandle,
	BlockHandler, BaseBlockContext,
	DialogHandler, ChoiceHandler, ConditionHandler, ActionHandler,
	SceneLifecycleHandler, CleanupFn,
	ExportCondition, BlockCharacter, ChoiceItem, RuntimeChoiceItem,
} from './types.js';
import { SceneGraph } from './graph.js';
import { HandlerRegistry, SceneHandlerRegistry, resolveHandler } from './handler-registry.js';
import { resolvePort } from './port-resolver.js';
import {
	createDialogContext, createChoiceContext, createConditionContext, createActionContext,
	type InternalDialogContext, type InternalChoiceContext, type InternalConditionContext, type InternalActionContext,
} from './block-context.js';
import { isDialogBlock, isChoiceBlock, isConditionBlock, isActionBlock } from './utils.js';
import { evaluateConditionChain } from './condition-evaluator.js';

type InternalContext = InternalDialogContext | InternalChoiceContext | InternalConditionContext | InternalActionContext;

export interface SceneHandleCallbacks {
	onSceneStarted: ( handle: SceneHandleImpl ) => void;
	onSceneEnded: ( handle: SceneHandleImpl ) => void;
	getResolveCharacter: () => ( characters: BlockCharacter[] ) => BlockCharacter | undefined;
	getChoiceFilter: () => ( ( condition: ExportCondition ) => boolean ) | null;
	getLocale: () => string;
}

// ─── AsyncTrack — parallel execution branch ──────────────────────────────────

class AsyncTrack {

	private running = true;
	private currentBlock: BlueprintBlock | null = null;
	private previousCleanup: CleanupFn | null = null;
	private readonly followNarrative: boolean;
	private pendingAdvance: ( () => void ) | null = null;

	constructor(
		private readonly sceneGraph: SceneGraph,
		private readonly parentHandle: SceneHandleImpl,
		startBlock: BlueprintBlock,
	) {
		this.followNarrative = startBlock.nativeProperties?.followNarrative ?? false;
		this.processBlock( startBlock );
	}

	cancel(): void {
		if ( !this.running ) return;
		this.running = false;
		if ( this.previousCleanup ) {
			this.previousCleanup();
			this.previousCleanup = null;
		}
		this.currentBlock = null;
		this.pendingAdvance = null;
	}

	isRunning(): boolean {
		return this.running;
	}

	isFollowNarrative(): boolean {
		return this.followNarrative;
	}

	/** Called by the main track when it advances. Triggers pending follow-narrative advance. */
	notifyMainAdvance(): void {
		if ( !this.running || !this.followNarrative ) return;

		if ( this.pendingAdvance ) {
			const advance = this.pendingAdvance;
			this.pendingAdvance = null;
			advance();
		} else {
			this.forceAdvance();
		}
	}

	// ─── Traversal (mirrors SceneHandleImpl logic) ───────────────────

	private processBlock( block: BlueprintBlock ): void {
		if ( !this.running ) return;

		if ( block.type === 'NOTE' ) {
			const connections = this.sceneGraph.getOutgoingConnections( block.uuid );
			if ( connections.length > 0 ) {
				const nextBlock = this.sceneGraph.getBlock( connections[0]!.toId );
				if ( nextBlock ) {
					this.processBlock( nextBlock );
					return;
				}
			}
			this.endTrack();
			return;
		}

		this.currentBlock = block;
		this.parentHandle.addVisited( block.uuid );
		this.executeBlockHandler( block );
	}

	private executeBlockHandler( block: BlueprintBlock ): void {
		if ( !this.running ) return;

		const { sceneHandler, globalHandler } = resolveHandler(
			block.type, block.uuid,
			this.parentHandle.getSceneRegistry(),
			this.parentHandle.getGlobalRegistry(),
		);

		const context = this.parentHandle.createBlockContext( block );
		if ( !context ) {
			this.advanceToNextBlock( block, null );
			return;
		}

		// No handler → advance silently (handlers are validated at start())
		if ( !sceneHandler && !globalHandler ) {
			this.advanceToNextBlock( block, context );
			return;
		}

		let nextCalled = false;
		let syncPhase = true;
		let sceneCleanup: CleanupFn | void = undefined;
		let globalCleanup: CleanupFn | void = undefined;

		const next = () => {
			if ( nextCalled ) return;
			nextCalled = true;

			if ( this.followNarrative ) {
				this.pendingAdvance = () => this.advanceToNextBlock( block, context );
				return;
			}

			if ( syncPhase ) return;
			this.advanceToNextBlock( block, context );
		};

		const handlerArgs = { scene: this.parentHandle as SceneHandle, block, context, next };

		try {
			if ( sceneHandler ) {
				sceneCleanup = sceneHandler( handlerArgs );
				if ( !context._globalPrevented && globalHandler ) {
					globalCleanup = globalHandler( handlerArgs );
				}
			} else if ( globalHandler ) {
				globalCleanup = globalHandler( handlerArgs );
			}
		} catch ( _err ) {
			this.endTrack();
			return;
		}

		this.previousCleanup = this.combineCleanups( sceneCleanup, globalCleanup );

		syncPhase = false;
		if ( nextCalled && !this.followNarrative ) {
			this.advanceToNextBlock( block, context );
		}
	}

	private advanceToNextBlock( block: BlueprintBlock, context: InternalContext | null ): void {
		if ( !this.running ) return;

		const connections = this.sceneGraph.getOutgoingConnections( block.uuid );
		const resolution = resolvePort( {
			block,
			connections,
			selectedChoiceUuid: context && '_selectedChoiceUuid' in context ? context._selectedChoiceUuid : undefined,
			conditionResult: context && '_conditionResult' in context ? context._conditionResult : undefined,
			actionRejected: context && '_actionRejected' in context ? context._actionRejected : undefined,
			characterPortIndex: context && '_characterPortIndex' in context ? context._characterPortIndex : undefined,
		} );

		const conn = resolution.connections[0];
		if ( conn ) {
			const nextBlock = this.sceneGraph.getBlock( conn.toId );
			if ( nextBlock ) {
				const cleanupToRun = this.previousCleanup;
				this.previousCleanup = null;
				if ( cleanupToRun ) cleanupToRun();
				this.processBlock( nextBlock );
				return;
			}
		}

		this.endTrack();
	}

	private forceAdvance(): void {
		if ( !this.running || !this.currentBlock ) return;
		const block = this.currentBlock;
		if ( this.previousCleanup ) {
			this.previousCleanup();
			this.previousCleanup = null;
		}
		this.advanceToNextBlock( block, null );
	}

	private endTrack(): void {
		if ( this.previousCleanup ) {
			this.previousCleanup();
			this.previousCleanup = null;
		}
		this.running = false;
		this.currentBlock = null;
		this.parentHandle.removeTrack( this );
	}

	private combineCleanups( a: CleanupFn | void, b: CleanupFn | void ): CleanupFn | null {
		if ( a && b ) return () => { a(); b(); };
		if ( a ) return a;
		if ( b ) return b;
		return null;
	}
}

// ─── SceneHandleImpl ─────────────────────────────────────────────────────────

/** Concrete implementation of SceneHandle. */
export class SceneHandleImpl implements SceneHandle {

	private readonly sceneGraph: SceneGraph;
	private readonly globalRegistry: HandlerRegistry;
	private readonly sceneRegistry = new SceneHandlerRegistry();
	private readonly callbacks: SceneHandleCallbacks;

	private running = false;
	private cancelled = false;
	private currentBlock: BlueprintBlock | null = null;
	private previousBlock: BlueprintBlock | null = null;
	private readonly visited = new Set<string>();
	private readonly choiceHistory = new Map<string, string[]>();
	private previousCleanup: CleanupFn | null = null;
	private readonly asyncTracks: AsyncTrack[] = [];
	private _resolveCharacter: ( ( characters: BlockCharacter[] ) => BlockCharacter | undefined ) | null = null;

	constructor(
		sceneGraph: SceneGraph,
		globalRegistry: HandlerRegistry,
		callbacks: SceneHandleCallbacks,
	) {
		this.sceneGraph = sceneGraph;
		this.globalRegistry = globalRegistry;
		this.callbacks = callbacks;
	}

	// ─── Public API ──────────────────────────────────────────────────────

	start(): void {
		if ( this.running ) return;

		const missing: string[] = [];
		if ( !this.sceneRegistry.dialogHandler && !this.globalRegistry.dialogHandler ) missing.push( 'onDialog' );
		if ( !this.sceneRegistry.choiceHandler && !this.globalRegistry.choiceHandler ) missing.push( 'onChoice' );
		if ( !this.sceneRegistry.conditionHandler && !this.globalRegistry.conditionHandler ) missing.push( 'onCondition' );
		if ( !this.sceneRegistry.actionHandler && !this.globalRegistry.actionHandler ) missing.push( 'onAction' );
		if ( missing.length > 0 ) {
			throw new Error(
				`Cannot start scene — missing required handler(s): ${ missing.join( ', ' ) }.\n` +
				'Register all 4 handlers before starting:\n' +
				'  engine.onDialog(handler)\n  engine.onChoice(handler)\n  engine.onCondition(handler)\n  engine.onAction(handler)',
			);
		}

		this.running = true;
		this.cancelled = false;
		this.callbacks.onSceneStarted( this );

		this.fireSceneEnter();

		const startBlock = this.sceneGraph.getStartBlock();
		if ( startBlock ) {
			this.processBlock( startBlock );
		} else {
			this.endScene();
		}
	}

	cancel(): void {
		if ( !this.running ) return;
		this.cancelled = true;
		for ( const track of this.asyncTracks ) {
			track.cancel();
		}
		this.asyncTracks.length = 0;
		if ( this.previousCleanup ) {
			this.previousCleanup();
			this.previousCleanup = null;
		}
		this.running = false;
		this.currentBlock = null;
		this.fireSceneExit();
		this.callbacks.onSceneEnded( this );
	}

	onEnter( handler: SceneLifecycleHandler ): void {
		this.sceneRegistry.enterHandler = handler;
	}

	onExit( handler: SceneLifecycleHandler ): void {
		this.sceneRegistry.exitHandler = handler;
	}

	onBlock( blockUuid: string, handler: BlockHandler<BlueprintBlock, BaseBlockContext> ): void {
		this.sceneRegistry.setBlockHandler( blockUuid, handler );
	}

	onDialog( handler: DialogHandler ): void {
		this.sceneRegistry.dialogHandler = handler;
	}

	onChoice( handler: ChoiceHandler ): void {
		this.sceneRegistry.choiceHandler = handler;
	}

	onCondition( handler: ConditionHandler ): void {
		this.sceneRegistry.conditionHandler = handler;
	}

	onAction( handler: ActionHandler ): void {
		this.sceneRegistry.actionHandler = handler;
	}

	getCurrentBlock(): BlueprintBlock | null {
		return this.currentBlock;
	}

	getVisitedBlocks(): ReadonlySet<string> {
		return this.visited;
	}

	isRunning(): boolean {
		return this.running;
	}

	getActiveTracks(): number {
		return this.asyncTracks.filter( t => t.isRunning() ).length;
	}

	getSceneGraph(): SceneGraph {
		return this.sceneGraph;
	}

	getChoiceHistory(): ReadonlyMap<string, readonly string[]> {
		return this.choiceHistory;
	}

	getChoice( blockUuid: string ): readonly string[] | undefined {
		return this.choiceHistory.get( blockUuid );
	}

	evaluateCondition( condition: ExportCondition ): boolean {
		return this.evaluateConditionWithHistory( condition, () => false );
	}

	onResolveCharacter( fn: ( characters: BlockCharacter[] ) => BlockCharacter | undefined ): void {
		this._resolveCharacter = fn;
	}

	// ─── Internal API (used by AsyncTrack) ───────────────────────────────

	/** @internal */ getSceneRegistry(): SceneHandlerRegistry { return this.sceneRegistry; }
	/** @internal */ getGlobalRegistry(): HandlerRegistry { return this.globalRegistry; }
	/** @internal */ addVisited( uuid: string ): void { this.visited.add( uuid ); }

	/** @internal */ recordChoice( blockUuid: string, choiceUuid: string ): void {
		const existing = this.choiceHistory.get( blockUuid );
		if ( existing ) {
			existing.push( choiceUuid );
		} else {
			this.choiceHistory.set( blockUuid, [choiceUuid] );
		}
	}

	/** @internal */ evaluateConditionForBlock(
		condition: ExportCondition,
		fallbackEvaluator: ( condition: ExportCondition ) => boolean,
	): boolean {
		return this.evaluateConditionWithHistory( condition, fallbackEvaluator );
	}

	/** @internal */ removeTrack( track: AsyncTrack ): void {
		const idx = this.asyncTracks.indexOf( track );
		if ( idx >= 0 ) this.asyncTracks.splice( idx, 1 );
	}

	/** @internal */ createBlockContext( block: BlueprintBlock ): InternalContext | null {
		return this.createContext( block );
	}

	// ─── Traversal loop ─────────────────────────────────────────────────

	private processBlock( block: BlueprintBlock ): void {
		if ( this.cancelled ) return;

		// Step 1: Skip NOTE blocks
		if ( block.type === 'NOTE' ) {
			const connections = this.sceneGraph.getOutgoingConnections( block.uuid );
			if ( connections.length > 0 ) {
				const nextBlock = this.sceneGraph.getBlock( connections[0]!.toId );
				if ( nextBlock ) {
					this.processBlock( nextBlock );
					return;
				}
			}
			this.endScene();
			return;
		}

		// Step 2: Validate
		if ( this.globalRegistry.validateNextBlockHandler ) {
			const result = this.globalRegistry.validateNextBlockHandler( {
				nextBlock: block,
				fromBlock: this.previousBlock,
				port: null,
				context: {},
			} );
			if ( !result.valid ) {
				if ( this.globalRegistry.invalidateBlockHandler ) {
					this.globalRegistry.invalidateBlockHandler( {
						scene: this,
						reason: result.reason ?? 'validation_failed',
					} );
				}
				return;
			}
		}

		if ( this.cancelled ) return;

		// Step 3: Mark as current and visited
		this.currentBlock = block;
		this.visited.add( block.uuid );

		// Step 3b: onBeforeBlock
		if ( this.globalRegistry.beforeBlockHandler ) {
			this.globalRegistry.beforeBlockHandler( {
				block,
				scene: this,
				context: { nativeProperties: block.nativeProperties },
				resolve: () => this.executeBlockHandler( block ),
			} );
		} else {
			this.executeBlockHandler( block );
		}
	}

	private executeBlockHandler( block: BlueprintBlock ): void {
		if ( this.cancelled ) return;

		// Step 4: Resolve handler
		const { sceneHandler, globalHandler } = resolveHandler(
			block.type, block.uuid, this.sceneRegistry, this.globalRegistry,
		);

		// Create context
		const context = this.createContext( block );
		if ( !context ) {
			this.advanceToNextBlock( block, null );
			return;
		}

		// No handler → advance silently (handlers are validated at start())
		if ( !sceneHandler && !globalHandler ) {
			this.advanceToNextBlock( block, context );
			return;
		}

		let nextCalled = false;
		let syncPhase = true;
		let sceneCleanup: CleanupFn | void = undefined;
		let globalCleanup: CleanupFn | void = undefined;

		const next = () => {
			if ( nextCalled ) return;
			nextCalled = true;
			if ( syncPhase ) return;
			this.advanceToNextBlock( block, context );
		};

		const handlerArgs = { scene: this as SceneHandle, block, context, next };

		try {
			if ( sceneHandler ) {
				sceneCleanup = sceneHandler( handlerArgs );
				if ( !context._globalPrevented && globalHandler ) {
					globalCleanup = globalHandler( handlerArgs );
				}
			} else if ( globalHandler ) {
				globalCleanup = globalHandler( handlerArgs );
			}
		} catch ( err ) {
			this.endScene();
			return;
		}

		// Store combined cleanup BEFORE any advance runs
		this.previousCleanup = this.combineCleanups( sceneCleanup, globalCleanup );

		// End sync phase — if next() was already called, advance now
		syncPhase = false;
		if ( nextCalled ) {
			this.advanceToNextBlock( block, context );
		}
	}

	private advanceToNextBlock( block: BlueprintBlock, context: InternalContext | null ): void {
		if ( this.cancelled ) return;

		this.previousBlock = block;

		const connections = this.sceneGraph.getOutgoingConnections( block.uuid );
		const resolution = resolvePort( {
			block,
			connections,
			selectedChoiceUuid: context && '_selectedChoiceUuid' in context ? context._selectedChoiceUuid : undefined,
			conditionResult: context && '_conditionResult' in context ? context._conditionResult : undefined,
			actionRejected: context && '_actionRejected' in context ? context._actionRejected : undefined,
			characterPortIndex: context && '_characterPortIndex' in context ? context._characterPortIndex : undefined,
		} );

		const allConnections = resolution.connections;

		let mainConnection = null as typeof allConnections[number] | null;
		const asyncConnections: typeof allConnections = [];

		for ( const conn of allConnections ) {
			const targetBlock = this.sceneGraph.getBlock( conn.toId );
			if ( !targetBlock ) continue;

			if ( !mainConnection && !targetBlock.nativeProperties?.isAsync ) {
				mainConnection = conn;
			} else {
				asyncConnections.push( conn );
			}
		}

		for ( const conn of asyncConnections ) {
			const targetBlock = this.sceneGraph.getBlock( conn.toId );
			if ( targetBlock ) {
				this.asyncTracks.push( new AsyncTrack( this.sceneGraph, this, targetBlock ) );
			}
		}

		for ( const track of this.asyncTracks ) {
			if ( track.isFollowNarrative() ) {
				track.notifyMainAdvance();
			}
		}

		if ( mainConnection ) {
			const nextBlock = this.sceneGraph.getBlock( mainConnection.toId );
			if ( nextBlock ) {
				const cleanupToRun = this.previousCleanup;
				this.previousCleanup = null;
				if ( cleanupToRun ) cleanupToRun();
				this.processBlock( nextBlock );
				return;
			}
		}

		this.endScene();
	}

	private endScene(): void {
		for ( const track of this.asyncTracks ) {
			track.cancel();
		}
		this.asyncTracks.length = 0;
		if ( this.previousCleanup ) {
			this.previousCleanup();
			this.previousCleanup = null;
		}
		this.running = false;
		this.currentBlock = null;
		this.fireSceneExit();
		this.callbacks.onSceneEnded( this );
	}

	// ─── Scene lifecycle ─────────────────────────────────────────────────

	private fireSceneEnter(): void {
		const handler = this.sceneRegistry.enterHandler ?? this.globalRegistry.sceneEnterHandler;
		if ( handler ) {
			handler( { scene: this, context: {} } );
		}
	}

	private fireSceneExit(): void {
		const handler = this.sceneRegistry.exitHandler ?? this.globalRegistry.sceneExitHandler;
		if ( handler ) {
			handler( { scene: this, context: {} } );
		}
	}

	// ─── Internal helpers ────────────────────────────────────────────────

	private getResolveCharacterFn(): ( characters: BlockCharacter[] ) => BlockCharacter | undefined {
		return this._resolveCharacter ?? this.callbacks.getResolveCharacter();
	}

	private evaluateConditionWithHistory(
		condition: ExportCondition,
		fallbackEvaluator: ( condition: ExportCondition ) => boolean,
	): boolean {
		if ( condition.key.startsWith( 'choice:' ) ) {
			const blockUuid = condition.key.slice( 7 );
			const history = this.choiceHistory.get( blockUuid );
			if ( !history ) return condition.operator === '!=';
			const includes = history.includes( condition.value );
			return condition.operator === '!=' ? !includes : includes;
		}
		return fallbackEvaluator( condition );
	}

	private tagChoiceVisibility(
		choices: ChoiceItem[],
		filter: ( ( condition: ExportCondition ) => boolean ) | null,
	): RuntimeChoiceItem[] {
		if ( !filter ) return choices;
		return choices.map( choice => ( {
			...choice,
			visible: !choice.visibilityConditions?.length
				? true
				: evaluateConditionChain( choice.visibilityConditions, ( cond ) => {
					if ( cond.key.startsWith( 'choice:' ) ) {
						return this.evaluateConditionWithHistory( cond, () => false );
					}
					return filter( cond );
				} ),
		} ) );
	}

	private createContext( block: BlueprintBlock ): InternalContext | null {
		const characters = block.metadata?.characters ?? [];
		const resolvedCharacter = this.getResolveCharacterFn()( characters );

		if ( isDialogBlock( block ) ) {
			return createDialogContext( block, resolvedCharacter );
		}
		if ( isChoiceBlock( block ) ) {
			const choiceFilter = this.callbacks.getChoiceFilter();
			const taggedChoices = this.tagChoiceVisibility( block.choices ?? [], choiceFilter );
			return createChoiceContext( block, taggedChoices, ( blockUuid, choiceUuid ) => {
				this.recordChoice( blockUuid, choiceUuid );
			}, resolvedCharacter );
		}
		if ( isConditionBlock( block ) ) {
			return createConditionContext( resolvedCharacter );
		}
		if ( isActionBlock( block ) ) {
			return createActionContext( resolvedCharacter );
		}
		return null;
	}

	private combineCleanups( a: CleanupFn | void, b: CleanupFn | void ): CleanupFn | null {
		if ( a && b ) return () => { a(); b(); };
		if ( a ) return a;
		if ( b ) return b;
		return null;
	}
}
