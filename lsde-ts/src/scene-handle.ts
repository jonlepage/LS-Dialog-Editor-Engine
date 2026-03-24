// LSDE Dialog Engine — SceneHandle (Tier 2) + traversal loop

import type {
	BlueprintBlock, SceneHandle,
	BlockHandler, BaseBlockContext,
	DialogHandler, ChoiceHandler, ConditionHandler, ActionHandler,
	SceneLifecycleHandler, StateBridge, CleanupFn,
	ExportCondition,
} from './types.js';
import { SceneGraph } from './graph.js';
import { HandlerRegistry, SceneHandlerRegistry, resolveHandler } from './handler-registry.js';
import { resolvePort } from './port-resolver.js';
import { evaluateConditionChain } from './condition-evaluator.js';
import {
	createDialogContext, createChoiceContext, createConditionContext, createActionContext,
	type InternalDialogContext, type InternalChoiceContext, type InternalConditionContext, type InternalActionContext,
} from './block-context.js';
import { isDialogBlock, isChoiceBlock, isConditionBlock, isActionBlock } from './utils.js';

type InternalContext = InternalDialogContext | InternalChoiceContext | InternalConditionContext | InternalActionContext;

export interface SceneHandleCallbacks {
	onSceneStarted: ( handle: SceneHandleImpl ) => void;
	onSceneEnded: ( handle: SceneHandleImpl ) => void;
	getStateBridge: () => StateBridge | null;
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
			// next() was already called — execute the pending advance
			const advance = this.pendingAdvance;
			this.pendingAdvance = null;
			advance();
		} else {
			// next() hasn't been called yet — force-advance (skip current block)
			this.forceAdvance();
		}
	}

	// ─── Traversal (mirrors SceneHandleImpl logic) ───────────────────

	private processBlock( block: BlueprintBlock ): void {
		if ( !this.running ) return;

		// Skip NOTE blocks
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

		// Skip onBeforeBlock for async tracks — go straight to handler
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

		// Auto-behavior
		if ( !sceneHandler && !globalHandler ) {
			if ( isConditionBlock( block ) ) {
				this.autoEvaluateCondition( block, context as InternalConditionContext );
				return;
			}
			if ( isActionBlock( block ) ) {
				this.autoExecuteAction( block, context as InternalActionContext );
				return;
			}
		}

		let nextCalled = false;
		let syncPhase = true;
		let sceneCleanup: CleanupFn | void = undefined;
		let globalCleanup: CleanupFn | void = undefined;

		const next = () => {
			if ( nextCalled ) return;
			nextCalled = true;

			if ( this.followNarrative ) {
				// Don't advance yet — wait for notifyMainAdvance
				this.pendingAdvance = () => this.advanceToNextBlock( block, context );
				return;
			}

			if ( syncPhase ) return;
			this.advanceToNextBlock( block, context );
		};

		const handlerArgs = { scene: this.parentHandle as SceneHandle, block, context, next };

		if ( sceneHandler ) {
			sceneCleanup = sceneHandler( handlerArgs );
			if ( !context._globalPrevented && globalHandler ) {
				globalCleanup = globalHandler( handlerArgs );
			}
		} else if ( globalHandler ) {
			globalCleanup = globalHandler( handlerArgs );
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

		// Async tracks follow the first connection only (no nested forking)
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
		// Force cleanup and advance even if next() wasn't called
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

	private autoEvaluateCondition( block: BlueprintBlock, context: InternalConditionContext ): void {
		const bridge = this.parentHandle.getStateBridge();
		if ( isConditionBlock( block ) ) {
			const conditions = block.conditions ?? [];
			const hasChoiceConditions = conditions.some( c => c.key.startsWith( 'choice:' ) );
			if ( !bridge && !hasChoiceConditions ) { this.endTrack(); return; }
			const evaluator = ( condition: ExportCondition ) =>
				this.parentHandle.evaluateConditionForBlock( condition, bridge ? bridge.evaluateCondition : () => false );
			context._conditionResult = evaluateConditionChain( conditions, evaluator );
		} else if ( !bridge ) {
			this.endTrack();
			return;
		}
		this.previousCleanup = null;
		this.advanceToNextBlock( block, context );
	}

	private autoExecuteAction( block: BlueprintBlock, context: InternalActionContext ): void {
		const bridge = this.parentHandle.getStateBridge();
		if ( !bridge ) { this.endTrack(); return; }
		if ( isActionBlock( block ) ) {
			for ( const action of block.actions ?? [] ) {
				bridge.executeAction( action );
			}
		}
		context._actionRejected = false;
		this.previousCleanup = null;
		this.advanceToNextBlock( block, context );
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
		// Cancel all async tracks
		for ( const track of this.asyncTracks ) {
			track.cancel();
		}
		this.asyncTracks.length = 0;
		// Cleanup main track
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

	// ─── Internal API (used by AsyncTrack) ───────────────────────────────

	/** @internal */ getSceneRegistry(): SceneHandlerRegistry { return this.sceneRegistry; }
	/** @internal */ getGlobalRegistry(): HandlerRegistry { return this.globalRegistry; }
	/** @internal */ getStateBridge(): StateBridge | null { return this.callbacks.getStateBridge(); }
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
		bridgeEvaluator: ( condition: ExportCondition ) => boolean,
	): boolean {
		return this.evaluateConditionWithHistory( condition, bridgeEvaluator );
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

		// Auto-behavior: no handlers → auto-evaluate/execute
		if ( !sceneHandler && !globalHandler ) {
			if ( isConditionBlock( block ) ) {
				this.autoEvaluateCondition( block, context as InternalConditionContext );
				return;
			}
			if ( isActionBlock( block ) ) {
				this.autoExecuteAction( block, context as InternalActionContext );
				return;
			}
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

		if ( sceneHandler ) {
			sceneCleanup = sceneHandler( handlerArgs );
			if ( !context._globalPrevented && globalHandler ) {
				globalCleanup = globalHandler( handlerArgs );
			}
		} else if ( globalHandler ) {
			globalCleanup = globalHandler( handlerArgs );
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

		// Step 8: Port resolution — returns ALL matching connections
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

		// Separate: first non-async target = main track, rest = async tracks
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

		// Spawn async tracks
		for ( const conn of asyncConnections ) {
			const targetBlock = this.sceneGraph.getBlock( conn.toId );
			if ( targetBlock ) {
				this.asyncTracks.push( new AsyncTrack( this.sceneGraph, this, targetBlock ) );
			}
		}

		// Notify existing follow-narrative tracks
		for ( const track of this.asyncTracks ) {
			if ( track.isFollowNarrative() ) {
				track.notifyMainAdvance();
			}
		}

		// Step 9: Continue main track
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

		// Step 10: Dead end — scene complete
		this.endScene();
	}

	private endScene(): void {
		// Cancel all async tracks
		for ( const track of this.asyncTracks ) {
			track.cancel();
		}
		this.asyncTracks.length = 0;
		// Call cleanup of the last block
		if ( this.previousCleanup ) {
			this.previousCleanup();
			this.previousCleanup = null;
		}
		this.running = false;
		this.currentBlock = null;
		this.fireSceneExit();
		this.callbacks.onSceneEnded( this );
	}

	// ─── Auto-behaviors ──────────────────────────────────────────────────

	private autoEvaluateCondition( block: BlueprintBlock, context: InternalConditionContext ): void {
		const bridge = this.callbacks.getStateBridge();
		if ( isConditionBlock( block ) ) {
			const conditions = block.conditions ?? [];
			const hasChoiceConditions = conditions.some( c => c.key.startsWith( 'choice:' ) );
			if ( !bridge && !hasChoiceConditions ) {
				this.endScene();
				return;
			}
			const evaluator = ( condition: ExportCondition ) =>
				this.evaluateConditionWithHistory( condition, bridge ? bridge.evaluateCondition : () => false );
			context._conditionResult = evaluateConditionChain( conditions, evaluator );
		} else if ( !bridge ) {
			this.endScene();
			return;
		}
		this.previousCleanup = null;
		this.advanceToNextBlock( block, context );
	}

	private autoExecuteAction( block: BlueprintBlock, context: InternalActionContext ): void {
		const bridge = this.callbacks.getStateBridge();
		if ( !bridge ) {
			this.endScene();
			return;
		}
		if ( isActionBlock( block ) ) {
			for ( const action of block.actions ?? [] ) {
				bridge.executeAction( action );
			}
		}
		context._actionRejected = false;
		this.previousCleanup = null;
		this.advanceToNextBlock( block, context );
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

	private evaluateConditionWithHistory(
		condition: ExportCondition,
		bridgeEvaluator: ( condition: ExportCondition ) => boolean,
	): boolean {
		if ( condition.key.startsWith( 'choice:' ) ) {
			const blockUuid = condition.key.slice( 7 );
			const history = this.choiceHistory.get( blockUuid );
			if ( !history ) return condition.operator === '!=';
			const includes = history.includes( condition.value );
			return condition.operator === '!=' ? !includes : includes;
		}
		return bridgeEvaluator( condition );
	}

	private createContext( block: BlueprintBlock ): InternalContext | null {
		if ( isDialogBlock( block ) ) {
			return createDialogContext( block );
		}
		if ( isChoiceBlock( block ) ) {
			const bridge = this.callbacks.getStateBridge();
			const rawEvaluator = bridge ? bridge.evaluateCondition : () => true;
			const evaluator = ( condition: ExportCondition ) =>
				this.evaluateConditionWithHistory( condition, rawEvaluator );
			return createChoiceContext( block, evaluator, ( blockUuid, choiceUuid ) => {
				this.recordChoice( blockUuid, choiceUuid );
			} );
		}
		if ( isConditionBlock( block ) ) {
			return createConditionContext();
		}
		if ( isActionBlock( block ) ) {
			return createActionContext();
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
