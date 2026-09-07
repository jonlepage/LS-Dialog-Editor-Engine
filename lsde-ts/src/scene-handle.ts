// LSDE Dialog Engine — SceneHandle (Tier 2) + traversal loop

import type {
	BlueprintBlock, SceneHandle,
	BlockHandler, BaseBlockContext,
	DialogHandler, ChoiceHandler, ConditionHandler, ActionHandler,
	SceneLifecycleHandler, CleanupFn,
	ConditionTest, Card, NativeProperties, RuntimeConditionCase,
} from './types.js';
import { BlockType, ConditionOperator, Ports } from './types.js';
import { SceneGraph } from './graph.js';
import { HandlerRegistry, SceneHandlerRegistry, resolveHandler } from './handler-registry.js';
import { resolvePort } from './port-resolver.js';
import {
	createDialogContext, createChoiceContext, createConditionContext, createActionContext,
	type InternalDialogContext, type InternalChoiceContext, type InternalConditionContext, type InternalActionContext,
} from './block-context.js';
import { isDialogBlock, isChoiceBlock, isConditionBlock, isActionBlock } from './utils.js';
import {
	pickPortFromResults, tagOptionVisibility,
	evaluateConditionChain as evaluateConditionChainOf,
} from './condition-evaluator.js';
import { resolveCards, type ResolvedCards } from './block-context.js';

type InternalContext = InternalDialogContext | InternalChoiceContext | InternalConditionContext | InternalActionContext;

export interface SceneHandleCallbacks {
	onSceneStarted: ( handle: SceneHandleImpl ) => void;
	onSceneEnded: ( handle: SceneHandleImpl ) => void;
	getResolveCharacter: () => ( actors: Card[] ) => Card | undefined;
	getConditionResolver: () => ( ( test: ConditionTest ) => boolean ) | null;
	/** Look a card id (`var1`) up in the export's `cards` table. */
	getCard: ( cardId: string ) => Card | undefined;
}

/**
 * The engine-facing properties of a block, read straight out of `props`.
 *
 * v2 has one bag: natives and the designer's own properties share `props`, keyed by bare id.
 * Ids cannot collide — LSDE refuses a project property that takes a native name — so reading a
 * native is a plain lookup. Only two of them mean anything to the traversal: `isAsync` spawns a
 * parallel track, `waitForBlocks` parks one. The rest are passed through untouched.
 */
function natives( block: BlueprintBlock ): NativeProperties {
	return ( block.props ?? {} ) as NativeProperties;
}

/**
 * Walk past NOTE blocks to the first block the engine actually dispatches.
 *
 * NOTE blocks are designer-only: they carry no handler and are never executed, so the
 * traversal steps over them and follows their first outgoing link.
 *
 * Returns `null` when the walk runs out of connections — and also when it comes back to a
 * NOTE it already stepped over. A designer can wire a NOTE into a loop, and following it
 * recursively overflowed the stack: the scene died on a `RangeError` instead of ending.
 * Ending the flow is what a dead end does everywhere else in the engine.
 */
function skipNotes( block: BlueprintBlock, sceneGraph: SceneGraph ): BlueprintBlock | null {
	let current: BlueprintBlock | undefined = block;
	let seen: Set<string> | null = null;

	while ( current && current.type === BlockType.Note ) {
		seen ??= new Set<string>();
		if ( seen.has( current.id ) ) return null;
		seen.add( current.id );

		const links = sceneGraph.getOutgoingLinks( current.id );
		current = links.length > 0 ? sceneGraph.getBlock( links[0]!.to ) : undefined;
	}

	return current ?? null;
}

/**
 * Anything the traversal can park until a set of blocks has been visited.
 *
 * `waitForBlocks` is a property of the BLOCK — "the block waits for these before it advances", in
 * the format's own words. It is not a property of a parallel track, and it used to behave as if it
 * were: only `AsyncTrack` read it, so a designer who set it on a block of the main flow got
 * nothing at all, silently, with the checkbox ticked in the editor.
 *
 * The main flow parks through this same interface now. Both are a track; one of them happens to
 * be the one the player is watching.
 */
interface Waiter {
	notifyWaitSatisfied(): void;
}

/**
 * What a cleanup threw, or `null` when it returned normally.
 *
 * A fault has to be CARRIED rather than propagated on the spot. A cleanup runs while the engine is
 * tearing something down — leaving a block, ending a track, closing a scene — and an exception
 * escaping mid-teardown stopped the teardown: the scene stayed `running`, `onSceneExit` never
 * fired, the remaining tracks were never cancelled, and the handle sat in the engine's registry
 * forever. The game got its exception and an engine it could no longer use.
 *
 * So: the shutdown always finishes, and the fault is re-thrown once there is nothing left to
 * unwind. Same contract as a handler that throws — one fault, one behaviour.
 */
type CleanupFault = { value: unknown } | null;

/** Run a cleanup and hand back what it threw instead of letting it escape. */
function runCleanup( cleanup: CleanupFn | null | undefined ): CleanupFault {
	if ( !cleanup ) return null;
	try {
		cleanup();
		return null;
	} catch ( value ) {
		// `{ value }` rather than the bare value: `throw undefined` is legal, and a bare
		// `undefined` would read as "nothing went wrong".
		return { value };
	}
}

/**
 * Combine a scene cleanup and a global one into the single cleanup the traversal keeps.
 *
 * BOTH always run. They release unrelated things — a scene handler's panel and a global
 * handler's audio voice — so letting the first one's failure skip the second leaked whatever the
 * second owned. The first fault is re-thrown once both have had their turn.
 */
function combineCleanups( a: CleanupFn | void, b: CleanupFn | void ): CleanupFn | null {
	if ( a && b ) {
		return () => {
			const first = runCleanup( a );
			const second = runCleanup( b );
			const fault = first ?? second;
			if ( fault ) throw fault.value;
		};
	}
	if ( a ) return a;
	if ( b ) return b;
	return null;
}

// ─── AsyncTrack — parallel execution branch ──────────────────────────────────

class AsyncTrack implements Waiter {

	private running = true;
	private currentBlock: BlueprintBlock | null = null;
	/** The block this track came from, for `onValidateNextBlock`. Its own, not the main flow's. */
	private previousBlock: BlueprintBlock | null = null;
	private previousCharacter: Card | undefined = undefined;
	private previousCleanup: CleanupFn | null = null;
	private pendingAdvance: ( () => void ) | null = null;

	/** Unique auto-incremented identifier for this track within the scene. */
	public readonly id: number;
	/** ID of the parent track that spawned this one, or `null` if spawned by the main track. */
	public readonly parentTrackId: number | null;
	/** Id of the block that started this track's execution, within its scene. */
	public readonly startBlockUuid: string;
	/** IDs of child tracks spawned by this track, used for recursive cancel cascade. */
	private readonly childTrackIds: number[] = [];

	private readonly startBlock: BlueprintBlock;

	constructor(
		private readonly sceneGraph: SceneGraph,
		private readonly parentHandle: SceneHandleImpl,
		startBlock: BlueprintBlock,
		id: number,
		parentTrackId: number | null,
	) {
		this.id = id;
		this.parentTrackId = parentTrackId;
		this.startBlockUuid = startBlock.id;
		this.startBlock = startBlock;
	}

	/** Begin track execution. Must be called after the track is added to the pool. */
	start(): void {
		// If the start block has waitForBlocks, defer the entire track until satisfied.
		// Sequence: spawn → wait → processBlock → onBeforeBlock (delay) → handler
		const waitBlocks = natives( this.startBlock ).waitForBlocks;
		if ( waitBlocks?.length && !waitBlocks.every( id => this.parentHandle.isVisited( id ) ) ) {
			this.pendingAdvance = () => this.processBlock( this.startBlock );
			this.parentHandle.registerWaitForBlocks( this, waitBlocks );
			return;
		}
		this.processBlock( this.startBlock );
	}

	/**
	 * Stop this track and every track it spawned.
	 *
	 * Returns a fault instead of throwing one: `endScene()` cancels the whole pool in a loop, and
	 * one badly-behaved cleanup must not leave the tracks after it running.
	 */
	cancel(): CleanupFault {
		if ( !this.running ) return null;
		this.running = false;

		const cleanup = this.previousCleanup;
		this.previousCleanup = null;
		let fault = runCleanup( cleanup );

		this.currentBlock = null;
		this.pendingAdvance = null;
		for ( const childId of this.childTrackIds ) {
			fault = fault ?? this.parentHandle.cancelTrack( childId );
		}
		this.childTrackIds.length = 0;
		return fault;
	}

	isRunning(): boolean {
		return this.running;
	}

	/** Called by the parent handle when all `waitForBlocks` UUIDs have been visited. */
	notifyWaitSatisfied(): void {
		if ( !this.running || !this.pendingAdvance ) return;
		const advance = this.pendingAdvance;
		this.pendingAdvance = null;
		advance();
	}

	/** Build a read-only snapshot of this track's state for the public API. */
	getTrackInfo(): import('./types.js').TrackInfo {
		return {
			id: this.id,
			parentTrackId: this.parentTrackId,
			startBlockUuid: this.startBlockUuid,
			currentBlockUuid: this.currentBlock?.id ?? null,
			running: this.running,
		};
	}

	// ─── Traversal (mirrors SceneHandleImpl logic) ───────────────────

	private processBlock( startingBlock: BlueprintBlock ): void {
		if ( !this.running ) return;

		const block = skipNotes( startingBlock, this.sceneGraph );
		if ( !block ) {
			const fault = this.endTrack();
			if ( fault ) throw fault.value;
			return;
		}

		// The same gate the main flow goes through. A parallel track is still the game's dialogue.
		if ( !this.parentHandle.runValidation( block, this.previousBlock, this.previousCharacter ) ) {
			return;
		}

		this.currentBlock = block;
		this.parentHandle.addVisited( block.id );

		// Fire onBeforeBlock — same gate pattern as SceneHandleImpl.processBlock,
		// including the single-resolve guard.
		const registry = this.parentHandle.getGlobalRegistry();
		if ( registry.beforeBlockHandler ) {
			let resolved = false;
			registry.beforeBlockHandler( {
				block,
				scene: this.parentHandle as SceneHandle,
				context: { nativeProperties: natives( block ) },
				resolve: () => {
					if ( resolved ) return;
					resolved = true;
					this.executeBlockHandler( block );
				},
			} );
		} else {
			this.executeBlockHandler( block );
		}
	}

	private executeBlockHandler( block: BlueprintBlock ): void {
		if ( !this.running ) return;

		const { sceneHandler, globalHandler } = resolveHandler(
			block.type, block.id,
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

			// waitForBlocks: defer advance until all required blocks are visited
			const waitBlocks = natives( block ).waitForBlocks;
			if ( waitBlocks?.length ) {
				if ( !waitBlocks.every( id => this.parentHandle.isVisited( id ) ) ) {
					this.pendingAdvance = () => this.advanceToNextBlock( block, context );
					this.parentHandle.registerWaitForBlocks( this, waitBlocks );
					return;
				}
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
		} catch ( err ) {
			// The track is closed down first, THEN the error is re-thrown. By the time it reaches
			// the game, the cleanups have run and the track is gone - it stops properly, and the
			// game decides what to do about it. Swallowing it here was the v1 behaviour, and it
			// made the same fault behave in two opposite ways depending on whether it happened in
			// a handler or in the cleanup that handler returned.
			this.endTrack();
			throw err;
		}

		this.previousCleanup = combineCleanups( sceneCleanup, globalCleanup );

		syncPhase = false;
		if ( nextCalled && !this.pendingAdvance ) {
			this.advanceToNextBlock( block, context );
		}
	}

	private advanceToNextBlock( block: BlueprintBlock, context: InternalContext | null ): void {
		if ( !this.running ) return;

		this.previousBlock = block;
		this.previousCharacter = context?.character;

		const resolution = resolvePort( {
			block,
			links: this.sceneGraph.getOutgoingLinks( block.id ),
			selectedOptionId: context && '_selectedOptionId' in context ? context._selectedOptionId : undefined,
			conditionPort: context && '_conditionPort' in context ? context._conditionPort : undefined,
			actionRejected: context && '_actionRejected' in context ? context._actionRejected : undefined,
			actorPort: context && '_actorPort' in context ? context._actorPort : undefined,
		} );

		// Separate main (first non-async) from async links, same logic as SceneHandleImpl.
		const allLinks = resolution.links;
		let mainLink: typeof allLinks[number] | null = null;
		const asyncLinks: typeof allLinks = [];

		for ( const link of allLinks ) {
			const targetBlock = this.sceneGraph.getBlock( link.to );
			if ( !targetBlock ) continue;

			if ( !mainLink && !natives( targetBlock ).isAsync ) {
				mainLink = link;
			} else {
				asyncLinks.push( link );
			}
		}

		// Spawn sub-tracks for async links
		for ( const link of asyncLinks ) {
			const targetBlock = this.sceneGraph.getBlock( link.to );
			if ( targetBlock ) {
				const trackId = this.parentHandle.spawnAsyncTrack( targetBlock, this.id );
				this.childTrackIds.push( trackId );
			}
		}

		// Follow the main link or end the track
		if ( mainLink ) {
			const nextBlock = this.sceneGraph.getBlock( mainLink.to );
			if ( nextBlock ) {
				const cleanupToRun = this.previousCleanup;
				this.previousCleanup = null;
				const fault = runCleanup( cleanupToRun );
				if ( fault ) {
					this.endTrack();
					throw fault.value;
				}
				this.processBlock( nextBlock );
				return;
			}
		}

		const fault = this.endTrack();
		if ( fault ) throw fault.value;
	}

	/** Close this track down. Returns what its cleanup threw, having finished regardless. */
	private endTrack(): CleanupFault {
		const cleanup = this.previousCleanup;
		this.previousCleanup = null;
		const fault = runCleanup( cleanup );

		// Child tracks survive — they live independently in the flat pool.
		// Only explicit cancel() cascades to children.
		this.running = false;
		this.currentBlock = null;
		this.parentHandle.removeTrack( this );
		return fault;
	}
}

// ─── SceneHandleImpl ─────────────────────────────────────────────────────────

/** Concrete implementation of SceneHandle. */
export class SceneHandleImpl implements SceneHandle, Waiter {

	private readonly sceneGraph: SceneGraph;
	private readonly globalRegistry: HandlerRegistry;
	private readonly sceneRegistry = new SceneHandlerRegistry();
	private readonly callbacks: SceneHandleCallbacks;

	private running = false;
	private cancelled = false;
	private currentBlock: BlueprintBlock | null = null;
	private previousBlock: BlueprintBlock | null = null;
	private previousCharacter: Card | undefined = undefined;
	private readonly visited = new Set<string>();
	private readonly choiceHistory = new Map<string, string[]>();
	private previousCleanup: CleanupFn | null = null;
	private readonly asyncTracks: AsyncTrack[] = [];
	/** Auto-incremented counter for track IDs. 0 is reserved for the implicit main track. */
	private nextTrackId = 1;
	/** Tracks waiting for specific blocks to be visited before they can advance. */
	private readonly pendingWaits = new Map<Waiter, string[]>();
	/** The main flow's own parked advance, when its block carries `waitForBlocks`. */
	private pendingAdvance: ( () => void ) | null = null;
	private _resolveCharacter: ( ( actors: Card[] ) => Card | undefined ) | null = null;

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
		// onCondition is optional when onResolveCondition is installed: the engine already knows
		// which port the cases picked, so the handler is only a logging or override hook.
		if ( !this.sceneRegistry.conditionHandler && !this.globalRegistry.conditionHandler
			&& !this.callbacks.getConditionResolver() ) missing.push( 'onCondition' );
		if ( !this.sceneRegistry.actionHandler && !this.globalRegistry.actionHandler ) missing.push( 'onAction' );
		if ( missing.length > 0 ) {
			throw new Error(
				`Cannot start scene — missing required handler(s): ${ missing.join( ', ' ) }.\n` +
				'Register handlers before starting:\n' +
				'  engine.onDialog(handler)\n  engine.onChoice(handler)\n  engine.onCondition(handler)\n  engine.onAction(handler)\n' +
				'Note: onCondition is optional when engine.onResolveCondition() is installed.',
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
			const fault = this.endScene();
			if ( fault ) throw fault.value;
		}
	}

	cancel(): void {
		if ( !this.running ) return;
		this.cancelled = true;
		const fault = this.shutdown();
		if ( fault ) throw fault.value;
	}

	onEnter( handler: SceneLifecycleHandler ): void {
		this.sceneRegistry.enterHandler = handler;
	}

	onExit( handler: SceneLifecycleHandler ): void {
		this.sceneRegistry.exitHandler = handler;
	}

	onBlock( blockId: string, handler: BlockHandler<BlueprintBlock, BaseBlockContext> ): void {
		this.sceneRegistry.setBlockHandler( blockId, handler );
	}

	onDialogId( blockId: string, handler: DialogHandler ): void {
		this.sceneRegistry.setBlockHandler( blockId, handler as BlockHandler<BlueprintBlock, BaseBlockContext> );
	}

	onChoiceId( blockId: string, handler: ChoiceHandler ): void {
		this.sceneRegistry.setBlockHandler( blockId, handler as BlockHandler<BlueprintBlock, BaseBlockContext> );
	}

	onConditionId( blockId: string, handler: ConditionHandler ): void {
		this.sceneRegistry.setBlockHandler( blockId, handler as BlockHandler<BlueprintBlock, BaseBlockContext> );
	}

	onActionId( blockId: string, handler: ActionHandler ): void {
		this.sceneRegistry.setBlockHandler( blockId, handler as BlockHandler<BlueprintBlock, BaseBlockContext> );
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

	getTrackInfos(): readonly import('./types.js').TrackInfo[] {
		return this.asyncTracks
			.filter( t => t.isRunning() )
			.map( t => t.getTrackInfo() );
	}

	getSceneGraph(): SceneGraph {
		return this.sceneGraph;
	}

	getChoiceHistory(): ReadonlyMap<string, readonly string[]> {
		return this.choiceHistory;
	}

	getChoice( blockId: string ): readonly string[] | undefined {
		return this.choiceHistory.get( blockId );
	}

	// A `choice` test is answered from this scene's own history; anything else goes to the game's
	// resolver. Without a resolver, a game-state test is false.
	evaluateCondition( test: ConditionTest ): boolean {
		const resolver = this.callbacks.getConditionResolver();
		return this.evaluateConditionWithHistory( test, resolver ?? ( () => false ) );
	}

	onResolveCharacter( fn: ( actors: Card[] ) => Card | undefined ): void {
		this._resolveCharacter = fn;
	}

	/** @internal — Called once every block this flow was waiting on has been visited. */
	notifyWaitSatisfied(): void {
		if ( !this.running || this.cancelled || !this.pendingAdvance ) return;
		const advance = this.pendingAdvance;
		this.pendingAdvance = null;
		advance();
	}

	// ─── Internal API (used by AsyncTrack) ───────────────────────────────

	/** @internal */ getSceneRegistry(): SceneHandlerRegistry { return this.sceneRegistry; }
	/** @internal */ getGlobalRegistry(): HandlerRegistry { return this.globalRegistry; }
	/** @internal */ addVisited( blockId: string ): void {
		this.visited.add( blockId );
		if ( this.pendingWaits.size > 0 ) {
			const satisfied: Waiter[] = [];
			for ( const [waiter, required] of this.pendingWaits ) {
				if ( required.every( id => this.visited.has( id ) ) ) {
					satisfied.push( waiter );
				}
			}
			for ( const waiter of satisfied ) {
				this.pendingWaits.delete( waiter );
				waiter.notifyWaitSatisfied();
			}
		}
	}

	/** @internal — Spawn a new async track in the flat pool. Returns the assigned track ID. */
	spawnAsyncTrack( startBlock: BlueprintBlock, parentTrackId: number | null ): number {
		const id = this.nextTrackId++;
		const track = new AsyncTrack( this.sceneGraph, this, startBlock, id, parentTrackId );
		this.asyncTracks.push( track );
		track.start();
		return id;
	}

	/** @internal — Cancel a specific track by ID (used for parent→child cascade). */
	cancelTrack( trackId: number ): CleanupFault {
		const track = this.asyncTracks.find( t => t.id === trackId );
		return track ? track.cancel() : null;
	}

	/** @internal — Park a track (or the main flow) until every listed block has been visited. */
	registerWaitForBlocks( waiter: Waiter, blockIds: string[] ): void {
		this.pendingWaits.set( waiter, blockIds );
	}

	/** @internal — Has a block of this scene been visited? */
	isVisited( blockId: string ): boolean {
		return this.visited.has( blockId );
	}

	/**
	 * @internal — Run `onValidateNextBlock` for a block, and `onInvalidateBlock` when it refuses.
	 *
	 * Called by BOTH the main flow and every parallel track. It used to live inline in the main
	 * flow's `processBlock` only, so a game using this hook as a gate — "do not enter this block
	 * unless the player has the keycard" — was bypassed entirely the moment a branch was marked
	 * `isAsync`. Nothing in the hook's contract said it only applied to the flow the player was
	 * watching, and nothing on screen would have told anyone.
	 *
	 * @returns `false` when the caller must stop rather than dispatch the block.
	 */
	runValidation(
		block: BlueprintBlock,
		fromBlock: BlueprintBlock | null,
		fromCharacter: Card | undefined,
	): boolean {
		const handler = this.globalRegistry.validateNextBlockHandler;
		if ( !handler ) return true;

		const result = handler( {
			nextBlock: block,
			fromBlock,
			nextContext: { character: this.resolveCardsFor( block ).character },
			fromContext: fromBlock ? { character: fromCharacter } : null,
			port: null,
		} );
		if ( result.valid ) return true;

		if ( this.globalRegistry.invalidateBlockHandler ) {
			this.globalRegistry.invalidateBlockHandler( {
				scene: this,
				reason: result.reason ?? 'validation_failed',
			} );
		}
		return false;
	}

	/** @internal */ recordChoice( blockId: string, optionId: string ): void {
		const existing = this.choiceHistory.get( blockId );
		if ( existing ) {
			existing.push( optionId );
		} else {
			this.choiceHistory.set( blockId, [optionId] );
		}
	}

	/** @internal */ evaluateConditionForBlock(
		test: ConditionTest,
		fallbackEvaluator: ( test: ConditionTest ) => boolean,
	): boolean {
		return this.evaluateConditionWithHistory( test, fallbackEvaluator );
	}

	/** @internal — Safe to call during addVisited→notifyWaitSatisfied chains
	 *  because satisfied tracks are collected before notification (no concurrent iteration on asyncTracks). */
	removeTrack( track: AsyncTrack ): void {
		const idx = this.asyncTracks.indexOf( track );
		if ( idx >= 0 ) this.asyncTracks.splice( idx, 1 );
	}

	/** @internal */ createBlockContext( block: BlueprintBlock ): InternalContext | null {
		return this.createContext( block );
	}

	// ─── Traversal loop ─────────────────────────────────────────────────

	private processBlock( startingBlock: BlueprintBlock ): void {
		if ( !this.running || this.cancelled ) return;

		// Step 1: Skip NOTE blocks
		const block = skipNotes( startingBlock, this.sceneGraph );
		if ( !block ) {
			const fault = this.endScene();
			if ( fault ) throw fault.value;
			return;
		}

		// Step 2: Validate
		if ( !this.runValidation( block, this.previousBlock, this.previousCharacter ) ) return;

		if ( this.cancelled ) return;

		// Step 3: Mark as current and visited
		this.currentBlock = block;
		this.addVisited( block.id );

		// Step 3b: onBeforeBlock
		if ( this.globalRegistry.beforeBlockHandler ) {
			// GUARDED like next(): a delay timer that fires twice would otherwise dispatch
			// the same block twice — the handler runs again, cleanups pile up, and the scene
			// advances from a block it already left.
			let resolved = false;
			this.globalRegistry.beforeBlockHandler( {
				block,
				scene: this,
				context: { nativeProperties: natives( block ) },
				resolve: () => {
					if ( resolved ) return;
					resolved = true;
					this.executeBlockHandler( block );
				},
			} );
		} else {
			this.executeBlockHandler( block );
		}
	}

	private executeBlockHandler( block: BlueprintBlock ): void {
		// `running` and not just `cancelled`: a resolve() kept in a closure and fired after
		// the scene ended on its own would otherwise restart traversal on a dead scene,
		// re-dispatching blocks and firing onSceneExit a second time.
		if ( !this.running || this.cancelled ) return;

		// Step 4: Resolve handler
		const { sceneHandler, globalHandler } = resolveHandler(
			block.type, block.id, this.sceneRegistry, this.globalRegistry,
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

			// waitForBlocks: park until every listed block has been visited. The main flow honours
			// it exactly like a parallel track — this is the join half of the fork `isAsync` opens.
			const waitBlocks = natives( block ).waitForBlocks;
			if ( waitBlocks?.length && !waitBlocks.every( id => this.isVisited( id ) ) ) {
				this.pendingAdvance = () => this.advanceToNextBlock( block, context );
				this.registerWaitForBlocks( this, waitBlocks );
				return;
			}

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
			// The scene is closed down first, THEN the error is re-thrown. The order is what makes
			// this usable: by the time the game sees the error, the cleanups have run, the async
			// tracks are cancelled and `onSceneExit` has fired. The dialogue stopped PROPERLY, and
			// the error surfaces where the game called `start()` or `next()`.
			//
			// v1 swallowed it — silently, not even logged — while an exception from the cleanup
			// function that same handler returned reached the caller. One fault, two opposite
			// behaviours, and the quiet one hid real bugs for as long as a project ran.
			this.endScene();
			throw err;
		}

		// Store combined cleanup BEFORE any advance runs
		this.previousCleanup = combineCleanups( sceneCleanup, globalCleanup );

		// End sync phase — if next() was already called, advance now. Unless the block is parked
		// on waitForBlocks: releasing it is `notifyWaitSatisfied`'s job, not ours.
		syncPhase = false;
		if ( nextCalled && !this.pendingAdvance ) {
			this.advanceToNextBlock( block, context );
		}
	}

	private advanceToNextBlock( block: BlueprintBlock, context: InternalContext | null ): void {
		if ( this.cancelled ) return;

		this.previousBlock = block;
		this.previousCharacter = context?.character;

		const resolution = resolvePort( {
			block,
			links: this.sceneGraph.getOutgoingLinks( block.id ),
			selectedOptionId: context && '_selectedOptionId' in context ? context._selectedOptionId : undefined,
			conditionPort: context && '_conditionPort' in context ? context._conditionPort : undefined,
			actionRejected: context && '_actionRejected' in context ? context._actionRejected : undefined,
			actorPort: context && '_actorPort' in context ? context._actorPort : undefined,
		} );

		const allLinks = resolution.links;

		// The FIRST non-async target becomes the main flow; every other resolved link spawns a
		// parallel track. A port with several non-async targets is a MULTIPLE_NON_ASYNC_FORK
		// warning at init, and here the second one simply never becomes the main track.
		let mainLink = null as typeof allLinks[number] | null;
		const asyncLinks: typeof allLinks = [];

		for ( const link of allLinks ) {
			const targetBlock = this.sceneGraph.getBlock( link.to );
			if ( !targetBlock ) continue;

			if ( !mainLink && !natives( targetBlock ).isAsync ) {
				mainLink = link;
			} else {
				asyncLinks.push( link );
			}
		}

		for ( const link of asyncLinks ) {
			const targetBlock = this.sceneGraph.getBlock( link.to );
			if ( targetBlock ) {
				this.spawnAsyncTrack( targetBlock, null );
			}
		}

		if ( mainLink ) {
			const nextBlock = this.sceneGraph.getBlock( mainLink.to );
			if ( nextBlock ) {
				const cleanupToRun = this.previousCleanup;
				this.previousCleanup = null;
				const fault = runCleanup( cleanupToRun );
				if ( fault ) {
					// Same order as a handler that throws: the scene is closed down first, and the
					// error reaches the game with the dialogue already stopped properly.
					this.endScene();
					throw fault.value;
				}
				this.processBlock( nextBlock );
				return;
			}
		}

		const fault = this.endScene();
		if ( fault ) throw fault.value;
	}

	/**
	 * Close the scene down: cancel every track, run the pending cleanup, fire `onSceneExit`.
	 *
	 * Returns what a cleanup threw rather than throwing it, so the teardown always runs to the
	 * end. Callers re-throw once there is nothing left to unwind — `endScene` is reached from a
	 * dead end, from a note loop, from `cancel()` and from a handler that already failed, and only
	 * the caller knows which error the game should see.
	 */
	private endScene(): CleanupFault {
		return this.shutdown();
	}

	private shutdown(): CleanupFault {
		this.pendingWaits.clear();
		this.pendingAdvance = null;

		let fault: CleanupFault = null;
		for ( const track of this.asyncTracks ) {
			// Every track is cancelled even if an earlier one's cleanup threw: leaving live tracks
			// behind on a closed scene is how a dialogue kept running after it ended.
			fault = fault ?? track.cancel();
		}
		this.asyncTracks.length = 0;

		const cleanup = this.previousCleanup;
		this.previousCleanup = null;
		fault = fault ?? runCleanup( cleanup );

		this.running = false;
		this.currentBlock = null;
		this.fireSceneExit();
		this.callbacks.onSceneEnded( this );
		return fault;
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

	private getResolveCharacterFn(): ( actors: Card[] ) => Card | undefined {
		return this._resolveCharacter ?? this.callbacks.getResolveCharacter();
	}

	/**
	 * Answer a test, taking the reserved `choice` dictionary on ourselves.
	 *
	 * `{ dict: "choice", entry: "CHOICE-001", value: "C1" }` asks whether the player picked C1 at
	 * CHOICE-001 earlier IN THIS SCENE. The engine kept that history, so the question never
	 * reaches the game: it would otherwise have to mirror a record the engine already holds, and
	 * the two would drift. The memory starts and ends with the scene.
	 *
	 * A block that was never reached answers `false` for `equals`, and `true` for `notEquals`.
	 */
	private evaluateConditionWithHistory(
		test: ConditionTest,
		fallbackEvaluator: ( test: ConditionTest ) => boolean,
	): boolean {
		if ( test.dict !== Ports.Choice ) return fallbackEvaluator( test );

		const history = this.choiceHistory.get( test.entry );
		const negated = test.op === ConditionOperator.NotEquals;
		if ( !history ) return negated;

		const picked = history.includes( String( test.value ) );
		return negated ? !picked : picked;
	}

	/**
	 * The evaluator that ROUTES a condition block. Always present.
	 *
	 * With no game resolver installed it still answers `choice` tests on its own, and says false
	 * to anything about game state — a scene that only asks about its own past answers therefore
	 * plays without a single line of game code, and one that asks about the world takes its
	 * `default` branch rather than stalling.
	 */
	private routingEvaluator(): ( test: ConditionTest ) => boolean {
		const resolver = this.callbacks.getConditionResolver();
		if ( !resolver ) {
			return ( test ) => test.dict === Ports.Choice
				&& this.evaluateConditionWithHistory( test, () => false );
		}
		return ( test ) => this.evaluateConditionWithHistory( test, resolver );
	}

	/**
	 * The evaluator that TAGS option visibility, or `undefined` when there is no game resolver.
	 *
	 * Routing and tagging cannot share one answer here. Routing has to pick a branch, so an
	 * unanswerable test has to become false. An option has no such obligation: saying `false`
	 * about a question nobody could answer would HIDE an answer from the player. `undefined` says
	 * unknown, and a game reading `visible !== false` still offers it.
	 */
	private visibilityEvaluator(): ( ( test: ConditionTest ) => boolean ) | undefined {
		const resolver = this.callbacks.getConditionResolver();
		if ( !resolver ) return undefined;
		return ( test ) => this.evaluateConditionWithHistory( test, resolver );
	}

	/** Look up the cards a block cites, and let the game pick which actor is speaking. */
	private resolveCardsFor( block: BlueprintBlock ): ResolvedCards {
		return resolveCards( block, this.callbacks.getCard, this.getResolveCharacterFn() );
	}

	// Cards are resolved fresh every time, never cached. This runs for the main track AND for
	// async tracks (through createBlockContext), and a cache would leak the main track's actor
	// into a track released later by waitForBlocks.
	private createContext( block: BlueprintBlock ): InternalContext | null {
		const cards = this.resolveCardsFor( block );

		if ( isDialogBlock( block ) ) {
			return createDialogContext( block, cards );
		}

		if ( isChoiceBlock( block ) ) {
			const options = tagOptionVisibility( block.options, this.visibilityEvaluator() );
			return createChoiceContext( block, cards, options, ( blockId, optionId ) => {
				this.recordChoice( blockId, optionId );
			} );
		}

		if ( isConditionBlock( block ) ) {
			const evaluate = this.routingEvaluator();
			const portPerCase = natives( block ).portPerCase === true;

			// Every case is evaluated up front, so the handler is handed results rather than
			// questions. With a resolver installed the engine already knows where to go, which is
			// what makes onCondition optional: the handler becomes a place to log or to override.
			//
			// ONCE. The port is then read off these same results rather than re-asking the game:
			// each test reaches `onResolveCondition` exactly one time, whatever the mode and
			// whichever case matches.
			const cases: RuntimeConditionCase[] = ( block.cases ?? [] ).map( c => ( {
				port: c.port,
				when: c.when,
				result: evaluateConditionChainOf( c.when, evaluate ),
			} ) );

			const ctx = createConditionContext( block, cards, cases );
			ctx._conditionPort = pickPortFromResults(
				block.cases, portPerCase, cases.map( c => c.result === true ),
			);
			return ctx;
		}

		if ( isActionBlock( block ) ) {
			return createActionContext( block, cards );
		}

		return null;
	}

}
