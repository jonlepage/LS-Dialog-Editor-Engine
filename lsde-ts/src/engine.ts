// LSDE Dialog Engine — Public facade

import type {
	IDialogueEngine,
	InitOptions,
	DiagnosticReport,
	SceneHandle,
	DialogHandler, ChoiceHandler, ConditionHandler, ActionHandler,
	SceneLifecycleHandler,
	ValidateNextBlockHandler,
	InvalidateBlockHandler,
	BeforeBlockHandler,
	BlueprintBlock,
	BlueprintConnection,
	Card,
	ConditionTest,
} from "./types.js";
import { validateBlueprint, mergePayloads } from "./validator.js";
import { BlueprintGraph } from "./graph.js";
import { HandlerRegistry } from "./handler-registry.js";
import { SceneHandleImpl } from "./scene-handle.js";
import { LsdeUtils } from "./lsde-utils.js";
import { runCleanup, type CleanupFault } from "./track.js";

/** LSDE Dialog Engine — callback-driven graph dispatcher. */
export class DialogueEngine implements IDialogueEngine {
	/** Indexed blueprint graph built by init(). Null until successfully initialized. */
	private graph: BlueprintGraph | null = null;
	/** Tier 1 (global) handler registry — stores all engine-level handlers. */
	private readonly globalRegistry = new HandlerRegistry();
	/**
	 * The locale the game picked. The engine keeps it for `LsdeUtils`, and never reads a text
	 * with it: it dispatches structure and hands blocks over whole.
	 */
	private locale = "";
	/**
	 * The scenes currently playing, in the order they started.
	 *
	 * Keyed by the HANDLE, not by the reference `scene()` was called with. Nothing stops a game
	 * from opening the same scene twice — a hub revisited while a first pass is parked on a
	 * handler — and keying by the reference meant the second one EVICTED the first: the engine
	 * reported one scene when two were playing, and `stop()` could no longer reach the one it had
	 * dropped, which then ran for the rest of the process.
	 */
	private readonly activeScenes = new Set<SceneHandleImpl>();
	/** Guard preventing scene creation before init() succeeds. */
	private initialized = false;
	/**
	 * Which actor of a block is the one speaking. Defaults to the first.
	 *
	 * LSDE deliberately refuses to say what the order of `actors` means — whether it is who
	 * speaks or who is present is a decision each game makes. The default picks the first because
	 * a default has to pick something, not because the format says so.
	 */
	private _resolveCharacter: ( actors: Card[] ) => Card | undefined = ( actors ) => actors[0];
	/** The single game-state evaluator, used for option visibility and for condition cases. */
	private _conditionResolver: ( ( test: ConditionTest ) => boolean ) | null = null;

	/**
	 * Load a payload and report what is wrong with it.
	 *
	 * Takes one export, or the several files of a per-scene one — each of those carries the whole
	 * header, so they are folded into a single payload after checking they come from one export.
	 *
	 * The engine is initialized only when there are no errors: a payload it cannot read leaves it
	 * unusable rather than half-loaded.
	 */
	init( options: InitOptions ): DiagnosticReport {
		const report = validateBlueprint( options );

		if ( report.errors.length === 0 ) {
			const payload = Array.isArray( options.data )
				? mergePayloads( options.data ).data!
				: options.data;
			this.graph = new BlueprintGraph( payload );
			this.initialized = true;
		}

		return report;
	}

	setLocale( locale: string ): void {
		if ( this.graph ) {
			const validLocales = this.graph.getLocales();
			if ( validLocales.length > 0 && !validLocales.includes( locale ) ) {
				throw new Error(
					`Invalid locale "${ locale }". Available locales: ${ validLocales.join( ', ' ) }`,
				);
			}
		}
		this.locale = locale;
		LsdeUtils.locale = locale;
	}

	onResolveCharacter( fn: ( actors: Card[] ) => Card | undefined ): void {
		this._resolveCharacter = fn;
	}

	onResolveCondition( evaluator: ( test: ConditionTest ) => boolean ): void {
		this._conditionResolver = evaluator;
	}

	onValidateNextBlock( handler: ValidateNextBlockHandler ): void {
		this.globalRegistry.validateNextBlockHandler = handler;
	}

	onInvalidateBlock( handler: InvalidateBlockHandler ): void {
		this.globalRegistry.invalidateBlockHandler = handler;
	}

	onBeforeBlock( handler: BeforeBlockHandler ): void {
		this.globalRegistry.beforeBlockHandler = handler;
	}

	onDialog( handler: DialogHandler ): void {
		this.globalRegistry.dialogHandler = handler;
	}

	onChoice( handler: ChoiceHandler ): void {
		this.globalRegistry.choiceHandler = handler;
	}

	onCondition( handler: ConditionHandler ): void {
		this.globalRegistry.conditionHandler = handler;
	}

	onAction( handler: ActionHandler ): void {
		this.globalRegistry.actionHandler = handler;
	}

	onSceneEnter( handler: SceneLifecycleHandler ): void {
		this.globalRegistry.sceneEnterHandler = handler;
	}

	onSceneExit( handler: SceneLifecycleHandler ): void {
		this.globalRegistry.sceneExitHandler = handler;
	}

	/**
	 * Open a scene by its path (`reactor_breach`) or by its stable id (`sc_u0vqg2g8`).
	 *
	 * Take the id wherever the reference is stored OUTSIDE the payload — a Unity asset, a save
	 * file, a database row. The path is what a writer reads and what builds the i18n keys, but it
	 * changes the day someone renames the scene, and a serialized path then stops resolving with
	 * no compiler to catch it. The id survives a rename; show the path as its label.
	 */
	scene( sceneRef: string ): SceneHandle {
		if ( !this.initialized || !this.graph ) {
			throw new Error( 'Engine not initialized. Call init() first.' );
		}

		const graph = this.graph;
		const sceneGraph = graph.getSceneGraph( sceneRef );
		if ( !sceneGraph ) {
			throw new Error( `Scene "${ sceneRef }" not found.` );
		}

		const handle = new SceneHandleImpl( sceneGraph, this.globalRegistry, {
			onSceneStarted: ( h ) => this.activeScenes.add( h ),
			// The handle that ends is the handle that leaves. No identity check to write: a set of
			// handles cannot confuse two runs of the same scene the way a map keyed by its name
			// did.
			onSceneEnded: ( h ) => this.activeScenes.delete( h ),
			getResolveCharacter: () => this._resolveCharacter,
			getConditionResolver: () => this._conditionResolver,
			getCard: ( cardId ) => graph.getCard( cardId ),
		} );

		return handle;
	}

	/**
	 * Cancel every running scene.
	 *
	 * Every one of them, even if a cleanup throws on the way. A scene left running after `stop()`
	 * is a dialogue the game can no longer see or reach, and one handler's failure must not do
	 * that to the scenes after it — the same rule a scene already applies to its own tracks. The
	 * first fault surfaces once there is nothing left to close.
	 */
	stop(): void {
		let fault: CleanupFault = null;
		// A copy: cancelling a scene removes it from the set as it ends.
		for ( const handle of Array.from( this.activeScenes ) ) {
			// Evaluated FIRST, then kept — see the note in `SceneHandleImpl.shutdown()`.
			const sceneFault = runCleanup( () => handle.cancel() );
			fault = fault ?? sceneFault;
		}
		if ( fault ) throw fault.value;
	}

	isRunning(): boolean {
		return this.activeScenes.size > 0;
	}

	getActiveScenes(): SceneHandle[] {
		return Array.from( this.activeScenes );
	}

	getCurrentBlocks(): BlueprintBlock[] {
		const blocks: BlueprintBlock[] = [];
		for ( const handle of this.activeScenes ) {
			const block = handle.getCurrentBlock();
			if ( block ) blocks.push( block );
		}
		return blocks;
	}

	/**
	 * Every wire INSIDE a scene, flattened so each carries the block it leaves.
	 *
	 * Graph inspection, for a debug view that wants to see the wiring without playing it. It has
	 * never had anything to do with going from one scene to another: a wire has never crossed a
	 * scene in any version of the format, and chaining two scenes is the game's own business.
	 */
	getSceneConnections( sceneRef: string ): BlueprintConnection[] {
		if ( !this.graph ) return [];
		return this.graph.getSceneConnections( sceneRef );
	}
}
