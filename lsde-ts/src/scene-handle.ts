// LSDE Dialog Engine — SceneHandle (Tier 2) + traversal loop
// Implementation: PLAN.md §3.8, §6

import type {
	BlueprintBlock, SceneHandle,
	BlockHandler, BaseBlockContext, DialogContext, ChoiceContext, ConditionContext, ActionContext,
	SceneLifecycleHandler, StateBridge, CleanupFn,
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

/** Concrete implementation of SceneHandle. @see PLAN.md §3.8, §6 */
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
	private previousCleanup: CleanupFn | null = null;

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

		// Fire onSceneEnter (Tier 2 takes priority, else Tier 1)
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
		// Call cleanup of current block
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

	onBlock( blockUuid: string, handler: BlockHandler<BaseBlockContext> ): void {
		this.sceneRegistry.setBlockHandler( blockUuid, handler );
	}

	onDialog( handler: BlockHandler<DialogContext> ): void {
		this.sceneRegistry.dialogHandler = handler;
	}

	onChoice( handler: BlockHandler<ChoiceContext> ): void {
		this.sceneRegistry.choiceHandler = handler;
	}

	onCondition( handler: BlockHandler<ConditionContext> ): void {
		this.sceneRegistry.conditionHandler = handler;
	}

	onAction( handler: BlockHandler<ActionContext> ): void {
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

	getSceneGraph(): SceneGraph {
		return this.sceneGraph;
	}

	// ─── Traversal loop — PLAN.md §6 ────────────────────────────────────

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
			// Unknown block type — advance
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

		// Steps 5-6: Call handlers, wait for next()
		// next() may be called synchronously (inside the handler) or asynchronously (later).
		// We must capture the cleanup return value BEFORE advancing, so next() defers
		// the advance if called during handler execution.
		let nextCalled = false;
		let syncPhase = true;
		let sceneCleanup: CleanupFn | void = undefined;
		let globalCleanup: CleanupFn | void = undefined;

		const next = () => {
			if ( nextCalled ) return;
			nextCalled = true;
			if ( syncPhase ) return; // Will be picked up after handler returns
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

		// Step 7: Cleanup of the PREVIOUS block (swap is done in processBlock by tracking previousBlock)
		// Actually: at this point, previousCleanup holds the cleanup of the block BEFORE this one.
		// We already set the NEW cleanup in executeBlockHandler. We need to call the OLD one.
		// The flow: when next() is called on block N, we need to call cleanup from block N-1.
		// But we already stored block N's cleanup as previousCleanup in executeBlockHandler.
		// Solution: we swap cleanups. The old one fires, the new one persists for the next advance.
		// Note: this is handled correctly because previousCleanup was already stored in
		// executeBlockHandler for block N. We need to track the cleanup separately.

		// Record this block as previous for validation context
		this.previousBlock = block;

		// Step 8: Port resolution
		const connections = this.sceneGraph.getOutgoingConnections( block.uuid );
		const resolution = resolvePort( {
			block,
			connections,
			selectedChoiceUuid: context && '_selectedChoiceUuid' in context ? context._selectedChoiceUuid : undefined,
			conditionResult: context && '_conditionResult' in context ? context._conditionResult : undefined,
			actionRejected: context && '_actionRejected' in context ? context._actionRejected : undefined,
			characterPortIndex: context && '_characterPortIndex' in context ? context._characterPortIndex : undefined,
		} );

		// Step 9: Follow connection
		if ( resolution.connection ) {
			const nextBlock = this.sceneGraph.getBlock( resolution.connection.toId );
			if ( nextBlock ) {
				// Call cleanup of the block we're leaving (current block)
				// This is the correct timing: cleanup fires when advancing AWAY from the block.
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
		if ( !bridge ) {
			this.endScene();
			return;
		}
		if ( isConditionBlock( block ) ) {
			const result = evaluateConditionChain( block.conditions ?? [], bridge.evaluateCondition );
			context._conditionResult = result;
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

	private createContext( block: BlueprintBlock ): InternalContext | null {
		if ( isDialogBlock( block ) ) {
			return createDialogContext( block );
		}
		if ( isChoiceBlock( block ) ) {
			const bridge = this.callbacks.getStateBridge();
			const evaluator = bridge ? bridge.evaluateCondition : () => true;
			return createChoiceContext( block, evaluator );
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
