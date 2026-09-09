// LSDE Dialog Engine — SceneHandle (Tier 2): the scene and everything its tracks share
//
// This file does NOT walk the graph. Walking is one thing, written once, in `track.ts`.
//
// What lives here is what every track of a scene has in common and could not own: the blocks
// already visited, what the player answered, the handler registries, the tracks parked on a
// `waitForBlocks`, and the scene's own lifecycle. A track holds only its own position.
//
// The split is also the answer to a real defect. The traversal used to be written twice — once
// here for the flow the player watches, once in an `AsyncTrack` class for the parallel ones — and
// the two drifted: `waitForBlocks` was honoured by one, `onValidateNextBlock` fired by the other.
// Both shipped. `MIGRATION-V2.md` tells that story in full.

import type {
	BlueprintBlock, SceneHandle,
	BlockHandler, BaseBlockContext,
	DialogHandler, ChoiceHandler, ConditionHandler, ActionHandler,
	SceneLifecycleHandler, TrackInfo,
	ConditionTest, Card, RuntimeConditionCase,
	ConditionBlock, RouterBlock,
} from './types.js';
import { ConditionOperator, Ports } from './types.js';
import { SceneGraph } from './graph.js';
import { HandlerRegistry, SceneHandlerRegistry } from './handler-registry.js';
import {
	createDialogContext, createChoiceContext, createConditionContext, createRouterContext,
	createActionContext,
	resolveCards, type ResolvedCards,
} from './block-context.js';
import { isDialogBlock, isChoiceBlock, isConditionBlock, isRouterBlock, isActionBlock } from './utils.js';
import {
	pickPortFromResults, pickRouterPorts, tagOptionVisibility,
	evaluateConditionChain as evaluateConditionChainOf,
} from './condition-evaluator.js';
import {
	Track, MAIN_TRACK_ID, natives,
	type TrackHost, type Waiter, type CleanupFault, type InternalContext,
} from './track.js';

export interface SceneHandleCallbacks {
	onSceneStarted: ( handle: SceneHandleImpl ) => void;
	onSceneEnded: ( handle: SceneHandleImpl ) => void;
	getResolveCharacter: () => ( actors: Card[] ) => Card | undefined;
	getConditionResolver: () => ( ( test: ConditionTest ) => boolean ) | null;
	/** Look a card id (`var1`) up in the export's `cards` table. */
	getCard: ( cardId: string ) => Card | undefined;
}

/** Concrete implementation of SceneHandle. */
export class SceneHandleImpl implements SceneHandle, TrackHost {

	private readonly sceneGraph: SceneGraph;
	private readonly globalRegistry: HandlerRegistry;
	private readonly sceneRegistry = new SceneHandlerRegistry();
	private readonly callbacks: SceneHandleCallbacks;

	private running = false;

	// ─── Shared by every track of this scene ─────────────────────────────
	private readonly visited = new Set<string>();

	/**
	 * Blocks this scene has FINISHED, which is not the same as blocks it has reached.
	 *
	 * A block joins `visited` when it is dispatched and `completed` when the track leaves it — the
	 * game called `next()`, the exit port was resolved and the block's cleanup has run. The two
	 * sets answer two different questions and only one of them is `waitForBlocks`.
	 *
	 * It used to be the visited set, and that made the property nearly inert: a join is normally
	 * drawn onto blocks that were dispatched a fraction of a millisecond earlier, so the wait lifted
	 * in the same tick it was registered. A designer writing « DIALOG-011 waits for DIALOG-010 »
	 * means "wait until l3 has finished speaking", not "wait until l3 has been given the floor".
	 */
	private readonly completed = new Set<string>();
	private readonly choiceHistory = new Map<string, string[]>();
	/** Tracks — the main flow included — parked until a set of blocks has been visited. */
	private readonly pendingWaits = new Map<Waiter, string[]>();

	// ─── The tracks ──────────────────────────────────────────────────────
	/** Every live track, the main flow first. */
	private readonly tracks: Track[] = [];
	/** The flow the player is watching. Null until `start()`. */
	private mainTrack: Track | null = null;
	/** Auto-incremented track id. `MAIN_TRACK_ID` (0) belongs to the main flow. */
	private nextTrackId = MAIN_TRACK_ID + 1;

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
		this.callbacks.onSceneStarted( this );

		this.fireSceneEnter();

		const startBlock = this.sceneGraph.getStartBlock();
		if ( !startBlock ) {
			const fault = this.shutdown();
			if ( fault ) throw fault.value;
			return;
		}

		// The flow the player watches is a track like any other. The only thing that sets it
		// apart is what happens when it ends — see `trackEnded`.
		this.mainTrack = new Track( this, startBlock, MAIN_TRACK_ID, null, Ports.In );
		this.tracks.push( this.mainTrack );
		this.mainTrack.start();
	}

	cancel(): void {
		if ( !this.running ) return;
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

	/** The block the flow the player is watching is on. Parallel tracks have their own. */
	getCurrentBlock(): BlueprintBlock | null {
		return this.mainTrack?.getCurrentBlock() ?? null;
	}

	getVisitedBlocks(): ReadonlySet<string> {
		return this.visited;
	}

	isRunning(): boolean {
		return this.running;
	}

	/** How many PARALLEL tracks are running. The main flow is not one of them. */
	getActiveTracks(): number {
		return this.parallelTracks().length;
	}

	getTrackInfos(): readonly TrackInfo[] {
		return this.parallelTracks().map( t => t.getTrackInfo() );
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

	// ─── TrackHost — what a track asks the scene for ─────────────────────

	/** @internal */ getSceneGraph(): SceneGraph { return this.sceneGraph; }
	/** @internal */ getSceneRegistry(): SceneHandlerRegistry { return this.sceneRegistry; }
	/** @internal */ getGlobalRegistry(): HandlerRegistry { return this.globalRegistry; }
	/** @internal */ asSceneHandle(): SceneHandle { return this; }
	/** @internal */ isSceneRunning(): boolean { return this.running; }
	/** @internal */ isVisited( blockId: string ): boolean { return this.visited.has( blockId ); }
	/** @internal */ isCompleted( blockId: string ): boolean { return this.completed.has( blockId ); }
	/** @internal */ createBlockContext( block: BlueprintBlock, entryPort: string ): InternalContext | null {
		return this.createContext( block, entryPort );
	}

	/**
	 * @internal — Mark a block reached. Nothing is released by this.
	 *
	 * The visited set is what `getVisitedBlocks()` publishes: the blocks the player has been shown.
	 * Reaching a block is not finishing it, so a join no longer lifts here — see `addCompleted`.
	 */
	addVisited( blockId: string ): void {
		this.visited.add( blockId );
	}

	/**
	 * @internal — Mark a block finished, and release anything that was waiting on it.
	 *
	 * The set is the scene's, not a track's: `waitForBlocks` is how a branch joins back, so a track
	 * has to see what the others have finished.
	 */
	addCompleted( blockId: string ): void {
		this.completed.add( blockId );
		if ( this.pendingWaits.size === 0 ) return;

		// Collected before notifying: releasing a track re-enters the traversal, which can park
		// or release others, and mutating the map mid-iteration would skip entries.
		const satisfied: Waiter[] = [];
		for ( const [waiter, required] of this.pendingWaits ) {
			if ( required.every( id => this.completed.has( id ) ) ) satisfied.push( waiter );
		}
		for ( const waiter of satisfied ) {
			this.pendingWaits.delete( waiter );
			waiter.notifyWaitSatisfied();
		}
	}

	/** @internal — Park a track until every listed block has been FINISHED. */
	registerWaitForBlocks( waiter: Waiter, blockIds: string[] ): void {
		this.pendingWaits.set( waiter, blockIds );
	}

	/** @internal — Open a parallel track. Returns its id. */
	spawnTrack( startBlock: BlueprintBlock, parentTrackId: number | null, entryPort: string ): number {
		const id = this.nextTrackId++;
		// `null` when the main flow opened it — the convention {@link TrackInfo} publishes.
		const parent = parentTrackId === MAIN_TRACK_ID ? null : parentTrackId;
		const track = new Track( this, startBlock, id, parent, entryPort );
		this.tracks.push( track );
		track.start();
		return id;
	}

	/** @internal — Cancel one track by id, for the parent→child cascade. */
	cancelTrack( trackId: number ): CleanupFault {
		const track = this.tracks.find( t => t.id === trackId );
		return track ? track.cancel() : null;
	}

	/**
	 * @internal — A track has nowhere left to go. Retire it, and close the scene once nothing is
	 * left that could still move.
	 *
	 * Every track is retired the same way, the main flow included. What ends the scene is the
	 * pool running out of tracks able to advance, not the main flow reaching its end.
	 *
	 * It used to be the main flow: `trackEnded` on track 0 called `shutdown()`, which cancels
	 * every live track. That contradicted the promise `Track.endFlow` makes — child tracks
	 * survive, only an explicit `cancel()` cascades — for the one track that opens most of them,
	 * and it made a whole port silently do nothing: a port whose targets are ALL `isAsync` leaves
	 * the main flow no continuation, so it ends the instant it has spawned them, and shutdown
	 * cancelled the branches born three lines earlier. They never got past `onBeforeBlock`.
	 *
	 * A track parked on a `waitForBlocks` does NOT count as able to advance: it is waiting for
	 * another track to visit a block, so once every survivor is parked, nothing will ever visit
	 * anything again. Keeping the scene open on those would turn an unreachable wait into a scene
	 * that never closes.
	 *
	 * An explicit `cancel()` still tears the whole scene down at once — that is its job.
	 */
	trackEnded( track: Track ): CleanupFault {
		this.removeTrack( track );
		const canStillAdvance = this.tracks.some( t => t.isRunning() && !t.isWaitingForBlocks() );
		if ( canStillAdvance ) return null;
		return this.shutdown();
	}

	/**
	 * @internal — Run `onValidateNextBlock` for a block, and `onInvalidateBlock` when it refuses.
	 *
	 * Called by EVERY track. It used to live inline in the main flow's traversal only, so a game
	 * using this hook as a gate — "do not enter this block unless the player has the keycard" —
	 * was bypassed the moment a branch was marked `isAsync`. Nothing in the hook's contract said
	 * it only applied to the flow the player was watching, and nothing on screen would have said
	 * so either.
	 *
	 * `entryPort` is the port the wire arrived on, and it is passed for one reason: under
	 * `inPortPerCharacter` the gate must be asked about the actor the DESIGNER wired, not about
	 * whichever one the whole cast would have produced. A gate reading "do not enter unless this
	 * character is here" would otherwise be answered about the wrong character.
	 *
	 * @returns `false` when the track must stop rather than dispatch the block.
	 */
	runValidation(
		block: BlueprintBlock,
		entryPort: string,
		fromBlock: BlueprintBlock | null,
		fromCharacter: Card | undefined,
	): boolean {
		const handler = this.globalRegistry.validateNextBlockHandler;
		if ( !handler ) return true;

		const result = handler( {
			nextBlock: block,
			fromBlock,
			nextContext: { character: this.resolveCardsFor( block, entryPort ).character },
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

	// ─── Scene lifecycle ─────────────────────────────────────────────────

	/**
	 * Close the scene down: cancel every track, fire `onSceneExit`, tell the engine.
	 *
	 * Returns what a cleanup threw rather than throwing it, so the teardown always runs to the
	 * end. Callers re-throw once there is nothing left to unwind — this is reached from a dead
	 * end, from a note loop, from `cancel()` and from a handler that already failed, and only the
	 * caller knows which error the game should see.
	 */
	private shutdown(): CleanupFault {
		this.pendingWaits.clear();

		let fault: CleanupFault = null;
		// A copy: cancelling a track cascades to its children, and every track is cancelled even
		// if an earlier cleanup threw. Leaving live tracks behind on a closed scene is how a
		// dialogue kept running after it ended.
		for ( const track of [...this.tracks] ) {
			// Evaluated FIRST, then kept: `fault ?? track.cancel()` short-circuits, and the very
			// thing this loop promises — every track closed, whatever threw — stopped happening
			// at the first fault. The tracks after it stayed alive with their cleanups unrun.
			const trackFault = track.cancel();
			fault = fault ?? trackFault;
		}
		this.tracks.length = 0;

		this.running = false;
		this.fireSceneExit();
		this.callbacks.onSceneEnded( this );
		return fault;
	}

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

	private parallelTracks(): Track[] {
		return this.tracks.filter( t => t.id !== MAIN_TRACK_ID && t.isRunning() );
	}

	private removeTrack( track: Track ): void {
		const idx = this.tracks.indexOf( track );
		if ( idx >= 0 ) this.tracks.splice( idx, 1 );
	}

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

	/**
	 * Look up the cards a block cites, and let the game pick which actor is speaking.
	 *
	 * With `inPortPerCharacter`, the wire that reached the block named the actor: `entryPort` holds
	 * a CARD ID instead of `in`, and only that actor is offered to `onResolveCharacter`. The game
	 * is still the one answering — it may say `undefined` — it simply cannot pick a different
	 * actor than the one the designer wired.
	 *
	 * Without the property, or when the block was entered through `in`, `entryPort` is ignored and
	 * the whole cast is offered, exactly as before. That is what keeps every existing project — and
	 * every wire LSDE has ever written with `toPort: "in"` — behaving identically.
	 */
	private resolveCardsFor( block: BlueprintBlock, entryPort: string = Ports.In ): ResolvedCards {
		const designated = natives( block ).inPortPerCharacter === true && entryPort !== Ports.In
			? entryPort
			: undefined;
		return resolveCards( block, this.callbacks.getCard, this.getResolveCharacterFn(), designated );
	}

	/**
	 * Evaluate every case of a CONDITION or a ROUTER, before its context is built.
	 *
	 * The handler is then handed RESULTS rather than questions, and the exit port is read off these
	 * same results rather than re-asking the game: each test reaches `onResolveCondition` exactly
	 * ONE time — whatever the block type, whatever the mode, whichever case matches. That is also
	 * what makes `onCondition` optional: with a resolver installed the engine already knows where
	 * it is going, and the handler becomes a place to log or to override.
	 *
	 * Written ONCE for both block types on purpose. They ask the same question; only the reading of
	 * the answer differs, and that belongs to `pickPortFromResults` and `pickRouterPorts`. Two
	 * copies of an evaluation is precisely how this engine already shipped two bugs — the header of
	 * `track.ts` tells that story.
	 */
	private evaluateCases( block: ConditionBlock | RouterBlock ): RuntimeConditionCase[] {
		const evaluate = this.routingEvaluator();
		return ( block.cases ?? [] ).map( c => ( {
			port: c.port,
			when: c.when,
			result: evaluateConditionChainOf( c.when, evaluate ),
		} ) );
	}

	// Cards are resolved fresh every time, never cached. This runs for every track, and a cache
	// would leak one track's actor into another released later by waitForBlocks.
	private createContext( block: BlueprintBlock, entryPort: string ): InternalContext | null {
		const cards = this.resolveCardsFor( block, entryPort );

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
			const cases = this.evaluateCases( block );
			const ctx = createConditionContext( block, cards, cases );
			ctx._conditionPort = pickPortFromResults(
				block.cases,
				natives( block ).portPerCase === true,
				cases.map( c => c.result === true ),
			);
			return ctx;
		}

		if ( isRouterBlock( block ) ) {
			// The same cases, read the opposite way: EVERY case counts, each true one launches its
			// port, and the tally picks `then` or `catch`. That difference lives entirely in
			// `pickRouterPorts` — there is no second evaluator and no router-specific hook.
			const cases = this.evaluateCases( block );
			const ctx = createRouterContext( block, cards, cases );
			ctx._routerPorts = pickRouterPorts( block.cases, cases.map( c => c.result === true ) );
			return ctx;
		}

		if ( isActionBlock( block ) ) {
			return createActionContext( block, cards );
		}

		return null;
	}
}
