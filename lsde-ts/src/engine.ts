// LSDE Dialog Engine — Public facade
// Implementation: PLAN.md §3

import type {
	InitOptions, DiagnosticReport, StateBridge, SceneHandle,
	BlockHandler, DialogContext, ChoiceContext, ConditionContext, ActionContext,
	SceneLifecycleHandler, ValidateNextBlockHandler, InvalidateBlockHandler, BeforeBlockHandler,
	BlueprintBlock, BlueprintConnection,
} from './types.js';
import { validateBlueprint } from './validator.js';
import { BlueprintGraph } from './graph.js';
import { HandlerRegistry } from './handler-registry.js';
import { SceneHandleImpl } from './scene-handle.js';

/** LSDE Dialog Engine — callback-driven graph dispatcher. @see PLAN.md §3 */
export class DialogueEngine {

	private graph: BlueprintGraph | null = null;
	private readonly globalRegistry = new HandlerRegistry();
	private stateBridge: StateBridge | null = null;
	private locale = '';
	private readonly activeScenes = new Map<string, SceneHandleImpl>();
	private initialized = false;

	// ─── Initialization — §3.1 ───────────────────────────────────────────

	/** Validate blueprint data, build internal graph, return diagnostic report. */
	init( options: InitOptions ): DiagnosticReport {
		const report = validateBlueprint( options );

		if ( report.errors.length === 0 ) {
			this.graph = new BlueprintGraph( options.data );
			this.initialized = true;
		}

		return report;
	}

	/** Set the active locale for text resolution. */
	setLocale( locale: string ): void {
		this.locale = locale;
	}

	// ─── StateBridge — §3.2 ──────────────────────────────────────────────

	/** Set the bridge between the engine and the game state. */
	setStateBridge( bridge: StateBridge ): void {
		this.stateBridge = bridge;
	}

	// ─── Validation — §3.3 ───────────────────────────────────────────────

	/** Register a handler called before each block to validate it. */
	onValidateNextBlock( handler: ValidateNextBlockHandler ): void {
		this.globalRegistry.validateNextBlockHandler = handler;
	}

	/** Register a handler called when a block fails validation. */
	onInvalidateBlock( handler: InvalidateBlockHandler ): void {
		this.globalRegistry.invalidateBlockHandler = handler;
	}

	// ─── Pre-execution — §3.4 ────────────────────────────────────────────

	/** Register a handler called before every block. Must call resolve() to continue. */
	onBeforeBlock( handler: BeforeBlockHandler ): void {
		this.globalRegistry.beforeBlockHandler = handler;
	}

	// ─── Type handlers — §3.5 ────────────────────────────────────────────

	/** Register a global handler for DIALOG blocks. May return a cleanup function. @see PLAN.md §3.5 */
	onDialog( handler: BlockHandler<DialogContext> ): void {
		this.globalRegistry.dialogHandler = handler;
	}

	/** Register a global handler for CHOICE blocks. Choices are pre-filtered by visibilityConditions. @see PLAN.md §3.5 */
	onChoice( handler: BlockHandler<ChoiceContext> ): void {
		this.globalRegistry.choiceHandler = handler;
	}

	/** Register a global handler for CONDITION blocks. If absent, the engine auto-evaluates via StateBridge. @see PLAN.md §3.5 */
	onCondition( handler: BlockHandler<ConditionContext> ): void {
		this.globalRegistry.conditionHandler = handler;
	}

	/** Register a global handler for ACTION blocks. If absent, the engine auto-executes via StateBridge. @see PLAN.md §3.5 */
	onAction( handler: BlockHandler<ActionContext> ): void {
		this.globalRegistry.actionHandler = handler;
	}

	// ─── Scene lifecycle — §3.7 ──────────────────────────────────────────

	/** Register a handler called when any scene starts. @see PLAN.md §3.7 */
	onSceneEnter( handler: SceneLifecycleHandler ): void {
		this.globalRegistry.sceneEnterHandler = handler;
	}

	/** Register a handler called when any scene ends (natural or cancelled). @see PLAN.md §3.7 */
	onSceneExit( handler: SceneLifecycleHandler ): void {
		this.globalRegistry.sceneExitHandler = handler;
	}

	// ─── Scene handles — §3.8 ────────────────────────────────────────────

	/** Create a scene handle. Does NOT start the flow — call handle.start(). */
	scene( sceneId: string ): SceneHandle {
		if ( !this.initialized || !this.graph ) {
			throw new Error( 'Engine not initialized. Call init() first.' );
		}

		const sceneGraph = this.graph.getSceneGraph( sceneId );
		if ( !sceneGraph ) {
			throw new Error( `Scene "${ sceneId }" not found.` );
		}

		const handle = new SceneHandleImpl( sceneGraph, this.globalRegistry, {
			onSceneStarted: ( h ) => this.activeScenes.set( sceneId, h ),
			onSceneEnded: ( ) => this.activeScenes.delete( sceneId ),
			getStateBridge: () => this.stateBridge,
			getLocale: () => this.locale,
		} );

		return handle;
	}

	// ─── Engine control — §3.9 ───────────────────────────────────────────

	/** Stop all active scenes. */
	stop(): void {
		for ( const handle of Array.from( this.activeScenes.values() ) ) {
			handle.cancel();
		}
	}

	/** True if at least one scene is active. */
	isRunning(): boolean {
		return this.activeScenes.size > 0;
	}

	/** Get all currently active scene handles. */
	getActiveScenes(): SceneHandle[] {
		return Array.from( this.activeScenes.values() );
	}

	/** Get the current block of every active scene. */
	getCurrentBlocks(): BlueprintBlock[] {
		const blocks: BlueprintBlock[] = [];
		for ( const handle of this.activeScenes.values() ) {
			const block = handle.getCurrentBlock();
			if ( block ) blocks.push( block );
		}
		return blocks;
	}

	/** Get connections for a scene (for inter-scene navigation). */
	getSceneConnections( sceneId: string ): BlueprintConnection[] {
		if ( !this.graph ) return [];
		return this.graph.getSceneConnections( sceneId );
	}
}
