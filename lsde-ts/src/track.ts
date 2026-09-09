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
import { BlockType } from './types.js';
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
	trackEnded( track: Track ): CleanupFault;
}

// ─── Track ───────────────────────────────────────────────────────────────────

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
	private pendingAdvance: ( () => void ) | null = null;

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
		this.processBlock( this.startBlock, this.startEntryPort );
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
		this.pendingAdvance = null;
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
	 * It is waiting for ANOTHER track to visit a block, so it cannot be what keeps a scene open:
	 * once every remaining track is parked like this, nothing will ever visit anything again.
	 * That is the deadlock `SceneHandleImpl.trackEnded` closes the scene on.
	 */
	isWaitingForBlocks(): boolean {
		return this.pendingAdvance !== null;
	}

	getCurrentBlock(): BlueprintBlock | null {
		return this.currentBlock;
	}

	/** Called once every block this track was waiting on has been visited. */
	notifyWaitSatisfied(): void {
		if ( !this.running || !this.host.isSceneRunning() || !this.pendingAdvance ) return;
		const advance = this.pendingAdvance;
		this.pendingAdvance = null;
		advance();
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

	// ─── The traversal ───────────────────────────────────────────────────

	/**
	 * Take a block, and either park on it or dispatch it.
	 *
	 * The order matters and each step earns its place:
	 *
	 * 1. **Step over NOTEs.** They are designer-only and never dispatched.
	 * 2. **Honour `waitForBlocks`.** BEFORE anything else — see the note below.
	 * 3. **Ask `onValidateNextBlock`.** The game's gate; a refusal stops this track.
	 * 4. **Mark it current and visited.** Visiting it may release another parked track.
	 * 5. **Fire `onBeforeBlock`**, whose `resolve()` releases the type handler.
	 */
	private processBlock( startingBlock: BlueprintBlock, entryPort: string ): void {
		if ( !this.running || !this.host.isSceneRunning() ) return;

		const sceneGraph = this.host.getSceneGraph();

		const block = skipNotes( startingBlock, sceneGraph );
		if ( !block ) {
			// The end of THIS branch, not of the track: whatever is queued is still owed.
			const fault = this.endBranch();
			if ( fault ) throw fault.value;
			return;
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
			this.pendingAdvance = () => this.processBlock( block, entryPort );
			this.host.registerWaitForBlocks( this, waitBlocks );
			return;
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
			const fault = this.endFlow();
			if ( fault ) throw fault.value;
			return;
		}

		this.currentBlock = block;
		this.host.addVisited( block.id );

		const registry = this.host.getGlobalRegistry();
		if ( registry.beforeBlockHandler ) {
			// GUARDED like next(): a delay timer that fires twice would otherwise dispatch the
			// same block twice — the handler runs again, cleanups pile up, and the track advances
			// from a block it already left.
			let resolved = false;
			registry.beforeBlockHandler( {
				block,
				scene: this.host.asSceneHandle(),
				context: { nativeProperties: natives( block ) },
				resolve: () => {
					if ( resolved ) return;
					resolved = true;
					this.executeBlockHandler( block, entryPort );
				},
			} );
		} else {
			this.executeBlockHandler( block, entryPort );
		}
	}

	/**
	 * Run the handlers for a block, then leave when the game says so.
	 *
	 * `next()` is guarded and deferred: called during the handler it only raises a flag, and the
	 * advance happens once both handlers have returned. Otherwise a scene handler calling `next()`
	 * would move the flow on before the global handler ever ran.
	 */
	private executeBlockHandler( block: BlueprintBlock, entryPort: string ): void {
		// `running` and not just the scene's: a `resolve()` kept in a closure and fired after this
		// track ended would otherwise restart it on a dead flow.
		if ( !this.running || !this.host.isSceneRunning() ) return;

		const { sceneHandler, globalHandler } = resolveHandler(
			block.type, block.id,
			this.host.getSceneRegistry(),
			this.host.getGlobalRegistry(),
		);

		const context = this.host.createBlockContext( block, entryPort );
		if ( !context ) {
			this.advanceToNextBlock( block, null );
			return;
		}

		// No handler → advance silently. `start()` already refused a scene missing one.
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

		const handlerArgs = { scene: this.host.asSceneHandle(), block, context, next };

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
			// The flow is closed down first, THEN the error is re-thrown. By the time the game
			// sees it, the cleanups have run and `onSceneExit` has fired if this was the main
			// track. The dialogue stopped PROPERLY, and the error surfaces where the game called
			// `start()` or `next()`.
			//
			// v1 swallowed it — silently, not even logged — while an exception from the cleanup
			// that same handler returned reached the caller. One fault, two opposite behaviours.
			this.endFlow();
			throw err;
		}

		const cleanup = combineCleanups( sceneCleanup, globalCleanup );

		// The handler may have closed the flow from inside itself — `scene.cancel()`,
		// `engine.stop()`, anything that ends this track. Storing the cleanup then hung it on a
		// block nobody will ever leave again, and whatever it held — a panel, an audio voice —
		// was never released. The engine HAS left the block, so the cleanup runs now.
		if ( !this.running || !this.host.isSceneRunning() ) {
			const fault = runCleanup( cleanup );
			if ( fault ) throw fault.value;
			return;
		}

		// Stored BEFORE any advance runs, so leaving the block finds it.
		this.previousCleanup = cleanup;

		syncPhase = false;
		if ( nextCalled ) {
			this.advanceToNextBlock( block, context );
		}
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
	 */
	private advanceToNextBlock( block: BlueprintBlock, context: InternalContext | null ): void {
		if ( !this.running || !this.host.isSceneRunning() ) return;

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
		const cleanupFault = this.runBlockCleanup();
		if ( cleanupFault ) {
			// Same order as a handler that throws: close down first, surface after.
			this.endFlow();
			throw cleanupFault.value;
		}

		this.host.addCompleted( block.id );

		// Releasing a parked track re-enters the traversal immediately, and a handler there is
		// allowed to cancel the scene — so the guard is re-read rather than assumed.
		if ( !this.running || !this.host.isSceneRunning() ) return;

		if ( continuation ) {
			const nextBlock = sceneGraph.getBlock( continuation.to );
			if ( nextBlock ) {
				this.processBlock( nextBlock, continuation.toPort );
				return;
			}
		}

		const fault = this.endBranch();
		if ( fault ) throw fault.value;
	}

	/**
	 * This branch has nowhere left to go — hand over to the queue, or stop.
	 *
	 * The block's cleanup runs FIRST, before the next wire is picked up: leaving a block is leaving
	 * a block, whether the track carries on or not. Hanging on to it until the queue emptied would
	 * keep a panel open, or an audio voice alive, through everything that came after it.
	 */
	private endBranch(): CleanupFault {
		const fault = this.runBlockCleanup();
		const sceneGraph = this.host.getSceneGraph();

		while ( this.queue.length > 0 ) {
			const link = this.queue.shift()!;
			const target = sceneGraph.getBlock( link.to );
			if ( !target ) continue;
			this.processBlock( target, link.toPort );
			return fault;
		}

		return fault ?? this.retire();
	}

	/**
	 * Stop this track for good, DROPPING whatever it still owed.
	 *
	 * For the ends that are not a branch running out of graph: `onValidateNextBlock` refusing a
	 * block, a handler throwing, a cleanup throwing. All three say the flow is over — the guide has
	 * always read `onInvalidateBlock` as "the scene stops" — so the queue goes with it. Playing the
	 * next wire after the game refused this one would be answering a "no" with "then try that".
	 */
	private endFlow(): CleanupFault {
		const fault = this.runBlockCleanup();
		return fault ?? this.retire();
	}

	/**
	 * The track is done. Its cleanup has already run; the scene decides what its ending means.
	 *
	 * Child tracks SURVIVE: they live independently in the pool, and only an explicit `cancel()`
	 * cascades to them.
	 */
	private retire(): CleanupFault {
		this.running = false;
		this.currentBlock = null;
		this.pendingAdvance = null;
		this.queue.length = 0;
		return this.host.trackEnded( this );
	}

	/** Run the cleanup of the block this track is leaving, once, and carry what it threw. */
	private runBlockCleanup(): CleanupFault {
		const cleanup = this.previousCleanup;
		this.previousCleanup = null;
		return runCleanup( cleanup );
	}
}
