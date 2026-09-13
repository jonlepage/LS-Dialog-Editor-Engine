// LSDE Dialog Engine — one track walking the graph
//
// This is THE traversal. There is one of it, and every track uses it: the one the player is
// watching and every parallel branch `isAsync` opens. A track is a cursor — it knows which block
// it is on, what it still has to clean up, and whether it is parked. It does not know it is the
// main one; only the scene knows that, and only when the track ends.
//
// It used to be written twice. `SceneHandleImpl` walked the graph itself for the main flow, and
// `AsyncTrack` walked it again for the parallel ones — the same five methods, side by side in one
// file. Nobody wrote it twice on purpose; the second one was needed the day `isAsync` arrived, and
// copying was the short path. Then the two drifted, because a change to one is silent in the
// other:
//
//   `waitForBlocks` was added to the parallel copy      → inert on the main flow, for months
//   `onValidateNextBlock` was added to the main copy    → never fired on a parallel branch
//
// Both shipped in v1 and neither showed up at runtime. That is the whole argument for this file:
// not tidiness, but the fact that the duplication had already cost two bugs by the time anyone
// looked.
//
// What the scene keeps, and a track asks it for, is everything SHARED: the visited set, the choice
// history, the handler registries, the pending waits. A track owns only its own position.

import type {
	BlueprintBlock, SceneHandle, CleanupFn, Card, NativeProperties, TrackInfo, Link,
} from './types.js';
import { BlockType, SceneEndReason } from './types.js';
import type { SceneGraph } from './graph.js';
import type { HandlerRegistry, SceneHandlerRegistry } from './handler-registry.js';
import { resolveHandler } from './handler-registry.js';
import { resolvePort } from './port-resolver.js';
import type {
	InternalDialogContext, InternalChoiceContext, InternalConditionContext,
	InternalRouterContext, InternalActionContext,
} from './block-context.js';

export type InternalContext =
	InternalDialogContext | InternalChoiceContext | InternalConditionContext
	| InternalRouterContext | InternalActionContext;

/**
 * The id of the track the player is watching. Every other track is numbered from 1.
 *
 * It is a number and not a flag because the main track is not special: it is the first one, and
 * the scene ends when it ends. That is the ONLY thing that sets it apart.
 */
export const MAIN_TRACK_ID = 0;

/** How a track can end on its own. A fault and a cancel are the scene's business, not the track's. */
export type TrackEnding = typeof SceneEndReason.Completed | typeof SceneEndReason.Invalidated;

// ─── Cleanup faults ──────────────────────────────────────────────────────────

/**
 * What a cleanup threw, or `null` when it returned normally.
 *
 * A fault has to be CARRIED rather than propagated on the spot. A cleanup runs while the engine is
 * tearing something down — leaving a block, ending a track, closing a scene — and an exception
 * escaping mid-teardown stopped the teardown: the scene stayed running, `onSceneExit` never fired,
 * the remaining tracks were never cancelled, and the handle sat in the engine's registry forever.
 * The game got its exception and an engine it could no longer use.
 *
 * So: the shutdown always finishes, and the fault is re-thrown once there is nothing left to
 * unwind. Same contract as a handler that throws — one fault, one behaviour.
 */
export type CleanupFault = { value: unknown } | null;

/** Run a cleanup and hand back what it threw instead of letting it escape. */
export function runCleanup( cleanup: CleanupFn | null | undefined ): CleanupFault {
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
 * Combine a scene cleanup and a global one into the single cleanup a track keeps.
 *
 * BOTH always run. They release unrelated things — a scene handler's panel and a global handler's
 * audio voice — so letting the first one's failure skip the second leaked whatever the second
 * owned. The first fault is re-thrown once both have had their turn.
 */
export function combineCleanups( a: CleanupFn | void, b: CleanupFn | void ): CleanupFn | null {
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

// ─── Shared reading helpers ──────────────────────────────────────────────────

/**
 * The engine-facing properties of a block, read straight out of `props`.
 *
 * v2 has one bag: natives and the designer's own properties share `props`, keyed by bare id. Ids
 * cannot collide — LSDE refuses a project property that takes a native name — so reading a native
 * is a plain lookup. Only two of them mean anything here: `isAsync` opens a track, `waitForBlocks`
 * holds one. The rest are passed through untouched for the game to interpret.
 */
export function natives( block: BlueprintBlock ): NativeProperties {
	return ( block.props ?? {} ) as NativeProperties;
}

/**
 * Walk past NOTE blocks to the first block the engine actually dispatches.
 *
 * NOTE blocks are designer-only: they carry no handler and are never executed, so a track steps
 * over them and follows their first outgoing link.
 *
 * Returns `null` when the walk runs out of connections — and also when it comes back to a NOTE it
 * already stepped over. A designer can wire a NOTE into a loop, and following it recursively
 * overflowed the stack: the scene died on a `RangeError` instead of ending. Ending the flow is
 * what a dead end does everywhere else in the engine.
 */
export function skipNotes( block: BlueprintBlock, sceneGraph: SceneGraph ): BlueprintBlock | null {
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

// ─── The scene, seen from a track ────────────────────────────────────────────

/** Anything the engine can park until a set of blocks has FINISHED. */
export interface Waiter {
	notifyWaitSatisfied(): void;
}

/**
 * What a track needs from the scene that owns it.
 *
 * Deliberately narrow. Everything here is SHARED between tracks — the visited set, the registries,
 * the pending waits — which is exactly why it lives on the scene and not on a track. A track that
 * could reach the whole `SceneHandleImpl` would drift back into doing the scene's job.
 */
export interface TrackHost {
	getSceneGraph(): SceneGraph;
	getGlobalRegistry(): HandlerRegistry;
	getSceneRegistry(): SceneHandlerRegistry;
	/** The handle handed to handlers as `scene`. Always the scene, never the track. */
	asSceneHandle(): SceneHandle;
	/** Is the scene still playing? A track stops the moment its scene does. */
	isSceneRunning(): boolean;

	addVisited( blockId: string ): void;
	isVisited( blockId: string ): boolean;
	/** The track has LEFT this block: handler returned, port resolved, cleanup run. */
	addCompleted( blockId: string ): void;
	isCompleted( blockId: string ): boolean;
	registerWaitForBlocks( waiter: Waiter, blockIds: string[] ): void;

	createBlockContext( block: BlueprintBlock, entryPort: string ): InternalContext | null;
	runValidation(
		block: BlueprintBlock,
		entryPort: string,
		fromBlock: BlueprintBlock | null,
		fromCharacter: Card | undefined,
	): boolean;

	/** Open a parallel track on `startBlock`. Returns its id. */
	spawnTrack( startBlock: BlueprintBlock, parentTrackId: number | null, entryPort: string ): number;
	cancelTrack( trackId: number ): CleanupFault;
	/** This track reached the end of its flow. The scene decides what that means. */
	trackEnded( track: Track, ending: TrackEnding ): CleanupFault;
	/** A track just parked on a `waitForBlocks`. The scene closes if nothing is left to release it. */
	trackParked(): CleanupFault;
	/**
	 * Code of the game threw during the walk: close the scene. The caller re-throws.
	 *
	 * Idempotent — a fault on a nested track passes through every walk on its way out, and only the
	 * first one closes anything.
	 */
	fault(): void;
}

// ─── Track ───────────────────────────────────────────────────────────────────

/**
 * One unit of the walk, handed back to {@link Track.run} instead of called.
 *
 * `process` takes a block the track has arrived at, `execute` dispatches it once `onBeforeBlock`
 * has let it through, `advance` leaves it once the game has said so.
 */
type Step =
	| { kind: 'process'; block: BlueprintBlock; entryPort: string }
	| { kind: 'execute'; block: BlueprintBlock; entryPort: string }
	| { kind: 'advance'; block: BlueprintBlock; context: InternalContext | null };

/** One cursor walking the graph. The main flow is one of these, with id 0. */
export class Track implements Waiter {

	/** Unique within the scene. `MAIN_TRACK_ID` is the flow the player is watching. */
	public readonly id: number;
	/** The track that opened this one, or `null` when the main flow opened it. */
	public readonly parentTrackId: number | null;
	/** The block this track started on. */
	public readonly startBlockId: string;

	private readonly host: TrackHost;
	private readonly startBlock: BlueprintBlock;
	/** Tracks this one opened. Only an explicit `cancel()` cascades to them. */
	private readonly childTrackIds: number[] = [];

	private running = true;
	private currentBlock: BlueprintBlock | null = null;
	/** Where this track came from, for `onValidateNextBlock`. Its own, not another track's. */
	private previousBlock: BlueprintBlock | null = null;
	private previousCharacter: Card | undefined = undefined;
	private previousCleanup: CleanupFn | null = null;
	/** What to resume when a `waitForBlocks` is satisfied. */
	private pendingStep: Step | null = null;

	/**
	 * The wires this track still owes, in the order it will walk them.
	 *
	 * A port may carry several wires. The ones whose target is `isAsync` open their own track; the
	 * others are THIS track's to walk, one after the other — so they queue here, and the track
	 * picks the next one up when the branch it is on runs out of graph.
	 *
	 * New wires go in at the FRONT. A designer reading their own graph expects a branch to finish
	 * before its sibling starts: `A → [B, C]` then `B → [D, E]` plays B, D, E, then C — not
	 * B, D, C, E. Front insertion is what makes the walk depth-first, which is how the graph reads
	 * on screen.
	 */
	private readonly queue: Link[] = [];

	/** The entry port of the wire that opened this track. `in` for the flow the player watches. */
	private readonly startEntryPort: string;

	constructor(
		host: TrackHost,
		startBlock: BlueprintBlock,
		id: number,
		parentTrackId: number | null,
		startEntryPort: string,
	) {
		this.host = host;
		this.startBlock = startBlock;
		this.id = id;
		this.parentTrackId = parentTrackId;
		this.startBlockId = startBlock.id;
		this.startEntryPort = startEntryPort;
	}

	/** Begin walking. Must be called after the track is in the scene's pool. */
	start(): void {
		this.run( { kind: 'process', block: this.startBlock, entryPort: this.startEntryPort } );
	}

	/**
	 * Stop this track and every track it opened.
	 *
	 * Returns a fault instead of throwing one: the scene cancels the whole pool in a loop, and one
	 * badly-behaved cleanup must not leave the tracks after it running.
	 */
	cancel(): CleanupFault {
		if ( !this.running ) return null;
		this.running = false;

		const cleanup = this.previousCleanup;
		this.previousCleanup = null;
		let fault = runCleanup( cleanup );

		this.currentBlock = null;
		this.pendingStep = null;
		this.queue.length = 0;
		for ( const childId of this.childTrackIds ) {
			// Evaluated FIRST, then kept — see the note in `SceneHandleImpl.shutdown()`.
			const childFault = this.host.cancelTrack( childId );
			fault = fault ?? childFault;
		}
		this.childTrackIds.length = 0;
		return fault;
	}

	isRunning(): boolean {
		return this.running;
	}

	/**
	 * Parked on a `waitForBlocks` — alive, but unable to move on its own.
	 *
	 * It is waiting for ANOTHER track to finish a block, so it cannot be what keeps a scene open:
	 * once every remaining track is parked like this, nothing will ever finish anything again.
	 * That is the deadlock `SceneHandleImpl` closes the scene on — whether the last track able to
	 * move ENDS (`trackEnded`) or PARKS (`trackParked`).
	 */
	isWaitingForBlocks(): boolean {
		return this.pendingStep !== null;
	}

	getCurrentBlock(): BlueprintBlock | null {
		return this.currentBlock;
	}

	/** Called once every block this track was waiting on has been finished. */
	notifyWaitSatisfied(): void {
		if ( !this.running || !this.host.isSceneRunning() || !this.pendingStep ) return;
		const step = this.pendingStep;
		this.pendingStep = null;
		this.run( step );
	}

	/** A read-only snapshot, for a debug view. */
	getTrackInfo(): TrackInfo {
		return {
			id: this.id,
			parentTrackId: this.parentTrackId,
			startBlockId: this.startBlockId,
			currentBlockId: this.currentBlock?.id ?? null,
			running: this.running,
		};
	}

	// ─── The loop ────────────────────────────────────────────────────────

	/**
	 * Walk from `first` until the track has to wait for the game. The one error boundary.
	 *
	 * Two jobs, and both used to be missing.
	 *
	 * **The stack.** Every step used to CALL the next one — `processBlock` → `executeBlockHandler`
	 * → `advanceToNextBlock` → `processBlock` — three frames per block for as long as the game
	 * advanced synchronously, and nothing brought the stack back down. A condition ↔ action loop
	 * died on a `RangeError` after 694 passes, and the reference export overflowed on a loop a
	 * player can take. In C# the same walk is a `StackOverflowException`: no catch stops it, and it
	 * takes the whole Unity process down. Every one of those calls was the LAST thing its caller
	 * did, so each step now RETURNS the next one and this loop takes it — the same steps, in the
	 * same order, at a constant depth.
	 *
	 * What still nests is what has to come back: opening a child track, and releasing a parked one.
	 * Each runs the other track's loop and returns here. The depth they add is how many are opened
	 * or released in a row without the game ever waiting — a property of the graph's async shape,
	 * not of its length.
	 *
	 * **The faults.** Only the type handler used to sit inside a `try`. A throwing validation,
	 * `onBeforeBlock` or resolver — or a fault on a track this one had just opened — escaped
	 * through a track that had not finished leaving its block, and the scene stayed open with
	 * nothing able to move it. Every entry into the walk comes through here, so every line of the
	 * game's code the walk calls is inside this `try`. The scene is closed down FIRST — cleanups
	 * run, tracks cancelled, `onSceneExit` fired — and THEN the error is re-thrown, to whoever
	 * called `start()`, `next()` or `resolve()`. That is problem 11 of `MIGRATION-V2.md`, and it now
	 * holds for all of them, on every track.
	 */
	private run( first: Step ): void {
		let step: Step | null = first;
		try {
			while ( step ) step = this.take( step );
		} catch ( err ) {
			this.host.fault();
			throw err;
		}
	}

	private take( step: Step ): Step | null {
		if ( step.kind === 'process' ) return this.processBlock( step.block, step.entryPort );
		if ( step.kind === 'execute' ) return this.executeBlockHandler( step.block, step.entryPort );
		return this.advanceToNextBlock( step.block, step.context );
	}

	// ─── The traversal ───────────────────────────────────────────────────

	/**
	 * Take a block, and either park on it or dispatch it.
	 *
	 * The order matters and each step earns its place:
	 *
	 * 1. **Step over NOTEs.** They are designer-only and never dispatched.
	 * 2. **Honour `waitForBlocks`.** BEFORE anything else — see the note below.
	 * 3. **Ask `onValidateNextBlock`.** The game's gate; a refusal stops this track.
	 * 4. **Mark it current and visited.**
	 * 5. **Fire `onBeforeBlock`**, whose `resolve()` releases the type handler.
	 *
	 * @returns the next step, or `null` when the track has to wait — for `resolve()`, for a join,
	 * or for good.
	 */
	private processBlock( startingBlock: BlueprintBlock, entryPort: string ): Step | null {
		if ( !this.running || !this.host.isSceneRunning() ) return null;

		const sceneGraph = this.host.getSceneGraph();

		const block = skipNotes( startingBlock, sceneGraph );
		if ( !block ) {
			// The end of THIS branch, not of the track: whatever is queued is still owed.
			return this.endBranch();
		}

		// `waitForBlocks` holds the block BEFORE it is dispatched — the handler is never called,
		// so the game does not even learn the block exists until the wait lifts. That is the
		// engine's decision, not a rendering choice a game could make differently: the property is
		// native, the designer ticks it in LSDE, and the engine owes them the behaviour.
		//
		// It waits on blocks that have FINISHED, not on blocks that have been reached. Reaching was
		// the old rule and it made the property nearly inert: a join is normally drawn onto blocks
		// dispatched a fraction of a millisecond earlier — `DIALOG-009 → [ACTION-003, DIALOG-010]`
		// then `DIALOG-011` waiting on both — so the wait lifted in the very tick it was
		// registered, and l2 spoke over l3. `MIGRATION-V2.md` records the decision.
		//
		// It also used to mean two different things depending on where the block sat: a track's
		// FIRST block was held before dispatch, any later one was dispatched and held before
		// advancing. Same checkbox, two meanings, and the second one showed the line early.
		const waitBlocks = natives( block ).waitForBlocks;
		if ( waitBlocks?.length && !waitBlocks.every( id => this.host.isCompleted( id ) ) ) {
			this.pendingStep = { kind: 'process', block, entryPort };
			this.host.registerWaitForBlocks( this, waitBlocks );

			// Parking may be exactly what leaves the scene with nothing able to move. That used to
			// be noticed only when a track ENDED, so when the last track able to move PARKED instead
			// — a single flow waiting on a block of a branch it did not take — the scene stayed open
			// for good: no `onSceneExit`, the handle in the engine's registry, `isRunning()` true.
			const fault = this.host.trackParked();
			if ( fault ) throw fault.value;
			return null;
		}

		if ( !this.host.runValidation( block, entryPort, this.previousBlock, this.previousCharacter ) ) {
			// A refusal is a dead end like any other, so it ENDS this track.
			//
			// There is no API to resume a refused track — no goto, no retry, and `start()` refuses
			// a running scene. Returning silently left the track alive and idle for good: on the
			// main flow that was the whole scene hung open, with no `onSceneExit`, the handle still
			// in the engine's registry and `isRunning()` answering true forever; on a parallel
			// branch it was a phantom track that `getActiveTracks()` kept counting.
			//
			// The guide has always said so — "onInvalidateBlock → scene stops" — and every other
			// dead end here already does it: a NOTE loop, a port with no wire, a missing target.
			const fault = this.endFlow( SceneEndReason.Invalidated );
			if ( fault ) throw fault.value;
			return null;
		}

		this.currentBlock = block;
		this.host.addVisited( block.id );

		const registry = this.host.getGlobalRegistry();
		if ( !registry.beforeBlockHandler ) return { kind: 'execute', block, entryPort };

		// GUARDED like next(): a delay timer that fires twice would otherwise dispatch the same
		// block twice — the handler runs again, cleanups pile up, and the track advances from a
		// block it already left.
		//
		// And DEFERRED like next(): a `resolve()` called while `onBeforeBlock` is still running only
		// raises a flag, and the block is dispatched once `onBeforeBlock` has returned. Dispatching
		// it on the spot ran the whole rest of the walk INSIDE the game's callback — a frame per
		// block that nothing ever gave back — and ran the type handler before the lines the game had
		// written after its `resolve()`.
		let resolved = false;
		let inside = true;
		let resolvedInside = false;
		registry.beforeBlockHandler( {
			block,
			scene: this.host.asSceneHandle(),
			context: { nativeProperties: natives( block ) },
			resolve: () => {
				if ( resolved ) return;
				resolved = true;
				if ( inside ) {
					resolvedInside = true;
					return;
				}
				this.run( { kind: 'execute', block, entryPort } );
			},
		} );
		inside = false;
		return resolvedInside ? { kind: 'execute', block, entryPort } : null;
	}

	/**
	 * Run the handlers for a block, then leave when the game says so.
	 *
	 * `next()` is guarded and deferred: called during the handler it only raises a flag, and the
	 * advance happens once both handlers have returned. Otherwise a scene handler calling `next()`
	 * would move the flow on before the global handler ever ran.
	 *
	 * @returns the advance, when the game has already said so; `null` while it has not.
	 */
	private executeBlockHandler( block: BlueprintBlock, entryPort: string ): Step | null {
		// `running` and not just the scene's: a `resolve()` kept in a closure and fired after this
		// track ended would otherwise restart it on a dead flow.
		if ( !this.running || !this.host.isSceneRunning() ) return null;

		const { sceneHandler, globalHandler } = resolveHandler(
			block.type, block.id,
			this.host.getSceneRegistry(),
			this.host.getGlobalRegistry(),
		);

		const context = this.host.createBlockContext( block, entryPort );
		if ( !context ) return { kind: 'advance', block, context: null };

		// No handler → advance silently. `start()` already refused a scene missing one.
		if ( !sceneHandler && !globalHandler ) return { kind: 'advance', block, context };

		let nextCalled = false;
		let syncPhase = true;
		let sceneCleanup: CleanupFn | void = undefined;
		let globalCleanup: CleanupFn | void = undefined;

		const next = () => {
			if ( nextCalled ) return;
			nextCalled = true;
			if ( syncPhase ) return;
			this.run( { kind: 'advance', block, context } );
		};

		const handlerArgs = { scene: this.host.asSceneHandle(), block, context, next };

		// No `try` here any more. A handler that throws reaches `run()`, which closes the scene
		// before re-throwing — the same boundary as every other callback of the game, instead of a
		// boundary of its own that the others did not have.
		if ( sceneHandler ) {
			sceneCleanup = sceneHandler( handlerArgs );
			if ( !context._globalPrevented && globalHandler ) {
				globalCleanup = globalHandler( handlerArgs );
			}
		} else if ( globalHandler ) {
			globalCleanup = globalHandler( handlerArgs );
		}

		const cleanup = combineCleanups( sceneCleanup, globalCleanup );

		// The handler may have closed the flow from inside itself — `scene.cancel()`,
		// `engine.stop()`, anything that ends this track. Storing the cleanup then hung it on a
		// block nobody will ever leave again, and whatever it held — a panel, an audio voice —
		// was never released. The engine HAS left the block, so the cleanup runs now.
		if ( !this.running || !this.host.isSceneRunning() ) {
			const fault = runCleanup( cleanup );
			if ( fault ) throw fault.value;
			return null;
		}

		// Stored BEFORE any advance runs, so leaving the block finds it.
		this.previousCleanup = cleanup;

		syncPhase = false;
		return nextCalled ? { kind: 'advance', block, context } : null;
	}

	/**
	 * Leave a block: open a track per parallel target, walk the rest one after the other.
	 *
	 * A port may carry several wires, and each one's TARGET says how it is walked:
	 *
	 * - **`isAsync`** — it opens its own track and runs beside this one.
	 * - **not `isAsync`** — it belongs to THIS track. The first becomes the continuation; the
	 *   others queue up and are walked when the continuation runs out of graph.
	 *
	 * That second line is what `isAsync` used to be unable to say. Every wire but the first was
	 * detached whether the designer had ticked the box or not, so on a secondary wire the property
	 * was INERT: ticked or not, the target ran beside. The engine now honours it — ticked means
	 * beside, unticked means in turn — and `MIGRATION-V2.md` records the whole decision.
	 *
	 * @returns the block this track goes on to, or `null` when it has ended.
	 */
	private advanceToNextBlock( block: BlueprintBlock, context: InternalContext | null ): Step | null {
		if ( !this.running || !this.host.isSceneRunning() ) return null;

		this.previousBlock = block;
		this.previousCharacter = context?.character;

		const sceneGraph = this.host.getSceneGraph();
		const resolution = resolvePort( {
			block,
			links: sceneGraph.getOutgoingLinks( block.id ),
			selectedOptionId: context && '_selectedOptionId' in context ? context._selectedOptionId : undefined,
			conditionPort: context && '_conditionPort' in context ? context._conditionPort : undefined,
			routerPorts: context && '_routerPorts' in context ? context._routerPorts : undefined,
			actionRejected: context && '_actionRejected' in context ? context._actionRejected : undefined,
			actorPort: context && '_actorPort' in context ? context._actorPort : undefined,
		} );

		let continuation: Link | null = null;
		const detached: Link[] = [];
		const queued: Link[] = [];

		// Sorted first, acted on after. Opening a track runs its handler immediately, and a handler
		// is allowed to cancel the scene — so nothing here may depend on state a spawn could change.
		for ( const link of resolution.links ) {
			const targetBlock = sceneGraph.getBlock( link.to );
			// A wire to a block that is not in this scene: the validator reports it as BROKEN_LINK
			// at init, and the traversal simply has nowhere to go.
			if ( !targetBlock ) continue;

			if ( natives( targetBlock ).isAsync ) detached.push( link );
			else if ( !continuation ) continuation = link;
			else queued.push( link );
		}

		// In front of what was already owed: this block's own siblings come before an ancestor's.
		if ( queued.length > 0 ) this.queue.unshift( ...queued );

		for ( const link of detached ) {
			const targetBlock = sceneGraph.getBlock( link.to );
			if ( targetBlock ) {
				this.childTrackIds.push( this.host.spawnTrack( targetBlock, this.id, link.toPort ) );
			}
		}

		// The block is now DONE, and this is the one place that says so.
		//
		// Its handler returned, its exit port is resolved and its cleanup has just run — so a
		// bubble is off the screen and an audio voice is stopped BEFORE anything waiting on this
		// block is allowed to speak. Marking it any earlier would let the joining line play over
		// the one it was told to wait for, which is the whole reason the rule changed.
		//
		// The cleanup runs here rather than inside `endBranch` for the same reason; `endBranch`
		// calls it again and finds nothing, which is what makes that safe.
		//
		// A cleanup that throws is a fault like a handler that throws: `run()` closes the scene,
		// then surfaces it.
		const cleanupFault = this.runBlockCleanup();
		if ( cleanupFault ) throw cleanupFault.value;

		this.host.addCompleted( block.id );

		// Releasing a parked track re-enters the traversal immediately, and a handler there is
		// allowed to cancel the scene — so the guard is re-read rather than assumed.
		if ( !this.running || !this.host.isSceneRunning() ) return null;

		if ( continuation ) {
			const nextBlock = sceneGraph.getBlock( continuation.to );
			if ( nextBlock ) return { kind: 'process', block: nextBlock, entryPort: continuation.toPort };
		}

		return this.endBranch();
	}

	/**
	 * This branch has nowhere left to go — hand over to the queue, or stop.
	 *
	 * The block's cleanup runs FIRST, before the next wire is picked up: leaving a block is leaving
	 * a block, whether the track carries on or not. Hanging on to it until the queue emptied would
	 * keep a panel open, or an audio voice alive, through everything that came after it.
	 */
	private endBranch(): Step | null {
		const cleanupFault = this.runBlockCleanup();
		if ( cleanupFault ) throw cleanupFault.value;

		const sceneGraph = this.host.getSceneGraph();
		while ( this.queue.length > 0 ) {
			const link = this.queue.shift()!;
			const target = sceneGraph.getBlock( link.to );
			if ( !target ) continue;
			return { kind: 'process', block: target, entryPort: link.toPort };
		}

		const fault = this.retire( SceneEndReason.Completed );
		if ( fault ) throw fault.value;
		return null;
	}

	/**
	 * Stop this track for good, DROPPING whatever it still owed.
	 *
	 * For `onValidateNextBlock` refusing a block — the guide has always read `onInvalidateBlock`
	 * as "the scene stops" — so the queue goes with it. Playing the next wire after the game refused
	 * this one would be answering a "no" with "then try that". A handler or a cleanup that throws
	 * no longer comes here: that closes the whole scene, in `run()`.
	 */
	private endFlow( ending: TrackEnding ): CleanupFault {
		const fault = this.runBlockCleanup();
		return fault ?? this.retire( ending );
	}

	/**
	 * The track is done. Its cleanup has already run; the scene decides what its ending means.
	 *
	 * Child tracks SURVIVE: they live independently in the pool, and only an explicit `cancel()`
	 * cascades to them.
	 */
	private retire( ending: TrackEnding ): CleanupFault {
		this.running = false;
		this.currentBlock = null;
		this.pendingStep = null;
		this.queue.length = 0;
		return this.host.trackEnded( this, ending );
	}

	/** Run the cleanup of the block this track is leaving, once, and carry what it threw. */
	private runBlockCleanup(): CleanupFault {
		const cleanup = this.previousCleanup;
		this.previousCleanup = null;
		return runCleanup( cleanup );
	}
}
