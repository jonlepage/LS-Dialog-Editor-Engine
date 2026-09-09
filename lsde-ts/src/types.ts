// LSDE Dialog Engine — Type definitions
// The engine's own types. The payload types are NOT written here.

// ─── The payload contract ────────────────────────────────────────────────────
//
// Everything describing an LSDE export lives in blueprint-types.ts, a verbatim copy of the file
// LSDE generates beside its JSON. It is re-exported whole so `@lsde/dialog-engine` remains the
// single import, and so the engine cannot drift from the format by editing a type by hand.
//
// What this section adds on top: the names the engine's public API has always used, the per-type
// block refinements its handlers are generic over, and the flattened connection shape used for
// graph inspection.

export * from './blueprint-types.js';

import type {
	Blueprints, Scene, Block, Link, ConditionTest, Option, Card, ActionCall,
} from './blueprint-types.js';
import { BlockType } from './blueprint-types.js';

/** A whole export. The engine's name for the generated {@link Blueprints}. */
export type BlueprintExport = Blueprints;
/** One scene of an export. The engine's name for the generated {@link Scene}. */
export type BlueprintScene = Scene;
/** One node of the graph. The engine's name for the generated {@link Block}. */
export type BlueprintBlock = Block;

/**
 * A wire seen from OUTSIDE the block that carries it.
 *
 * In the payload a wire is a {@link Link} listed in `block.next`, so it only knows where it goes —
 * where it comes from is the block holding it. Graph inspection needs both ends, so the engine
 * flattens every `next` into this shape. Nothing in the file has it; it exists only in memory.
 */
export type BlueprintConnection = Link & {
	/** The id of the block this wire leaves, within its scene. */
	from: string;
};

// ─── Block refinements ───────────────────────────────────────────────────────
//
// The payload has ONE `Block` interface whose optional fields depend on `type` — that is the
// format's own shape and it stays authoritative. These aliases narrow it per type so a handler
// can be typed `BlockHandler<DialogBlock, DialogContext>`.
//
// They do not narrow on their own: `block.type === 'dialog'` tells TypeScript nothing about
// `block`, since `Block` is not a union. Narrow through the guards in `LsdeUtils`.

/** A block whose `type` is known. */
export type BlockOfType<T extends BlockType> = Block & { type: T };

/** A spoken line. Carries `text`, `actors`, `emotion`, and exits by `out`. */
export type DialogBlock = BlockOfType<typeof BlockType.Dialog>;
/** A question. Carries `options`, and exits by an option id (`C1`…) — never by `out`. */
export type ChoiceBlock = BlockOfType<typeof BlockType.Choice>;
/** A switch. Carries `cases`, and exits by `out`/`default` or by a case port (`K1`…). */
export type ConditionBlock = BlockOfType<typeof BlockType.Condition>;
/**
 * A dispatcher. Carries the SAME `cases` as a condition and reads them the opposite way: every
 * case is evaluated, each true one launches its port, and the flow then always continues — by
 * `then` when all of them held, by `catch` when any did not.
 */
export type RouterBlock = BlockOfType<typeof BlockType.Router>;
/** A call into the game. Carries `calls`, and exits by `then` or `catch`. */
export type ActionBlock = BlockOfType<typeof BlockType.Action>;
/** Designer documentation. Never dispatched — the engine steps over it. */
export type NoteBlock = BlockOfType<typeof BlockType.Note>;

// ─── Native properties ───────────────────────────────────────────────────────

/**
 * The block properties the ENGINE acts on, read out of `block.props`.
 *
 * In v2 there is no separate bag: natives and the designer's own properties share `props`, keyed
 * by bare id. Ids cannot collide — LSDE refuses a project property that takes a native name — so
 * the only way to tell them apart is this list. {@link NATIVE_PROPERTY_IDS} is it.
 *
 * Most of these are inert: the engine passes `delay`, `timeout`, `debug`, `waitInput`,
 * `portPerCharacter` and `skipIfMissingActor` through untouched and lets the game decide. Two are
 * not: `isAsync` opens a parallel track, and `waitForBlocks` holds a block until the ones it
 * names have FINISHED.
 *
 * **Inert is not the same as free.** A writer who fills a field in expects a behaviour, and the
 * doc on each property below says which one. `timeout` is the one that is easy to implement
 * backwards, so read it before wiring a timer.
 *
 * **`delay` and `timeout` are MILLISECONDS in v2.** They were seconds in v1, and nothing will
 * report the difference at runtime — a migrated project turns a 3-second pause into 3 ms.
 */
export interface NativeProperties {
	/** Run this block on a parallel track instead of the main flow. */
	isAsync?: boolean;
	/** Milliseconds to wait before the block runs. Applied by `onBeforeBlock`, not by the engine. */
	delay?: number;
	/**
	 * MILLISECONDS the block STAYS once its line has been said — an auto-advance for blocks.
	 *
	 * **The countdown starts at the END of the reveal, not when the block is dispatched.** What
	 * the writer sets is how long the line remains on screen after its last character has been
	 * typed (or its last syllable spoken), and then the block leaves on its own. Counting from
	 * arrival instead cuts the line in half whenever the text takes longer to reveal than the
	 * timeout allows — a 2500 ms timeout on a 120-character line truncates it mid-sentence.
	 *
	 * **It overrides {@link NativeProperties.waitInput} and it overrides leaving immediately.**
	 * All three say WHEN the block is left, and the one the writer put on the card is the most
	 * specific answer. So a click no longer dismisses the block: it may only HURRY the reveal to
	 * its end, which is what arms the countdown. Pressing a line that plays its own time makes no
	 * sense; speeding it up does.
	 *
	 * Leaving the block is also what marks it FINISHED, so on a block listed in a
	 * {@link NativeProperties.waitForBlocks} elsewhere, this is the property that releases the
	 * join.
	 *
	 * The engine enforces none of it — no timers, no game loop, nothing is read here. The game
	 * arms the countdown, and this is the behaviour the writer is owed when they fill the field.
	 */
	timeout?: number;
	/**
	 * Wait for player input or a game signal instead of leaving on its own. Passed through, never
	 * interpreted — and outranked by {@link NativeProperties.timeout}, which says the block plays
	 * its own time and cannot be dismissed early.
	 */
	waitInput?: boolean;
	/** Editor debug flag. Passed through. */
	debug?: boolean;
	/** One exit port per actor id, `out` as the fallback. */
	portPerCharacter?: boolean;
	/**
	 * One ENTRY port per actor id, `in` as the fallback — the mirror of `portPerCharacter`.
	 *
	 * The wire names the speaker: a link's `toPort` carries the CARD ID of the actor the block is
	 * to be assigned to on that pass. This is what lets several wires reach one block and each
	 * stand for a different actor — a block alone cannot tell which path brought it.
	 *
	 * The engine still ASKS: `onResolveCharacter` is handed that one actor rather than the whole
	 * cast, and a game that returns `undefined` says the character does not exist. Entering
	 * through `in` names nobody, and the callback gets the whole list as everywhere else.
	 */
	inPortPerCharacter?: boolean;
	/** Skip the block when its actor is absent at runtime. Passed through. */
	skipIfMissingActor?: boolean;
	/** Condition blocks: each case exits by its own port instead of sharing `out`. */
	portPerCase?: boolean;
	/**
	 * Block ids OF THIS SCENE that must have FINISHED before this block STARTS.
	 *
	 * The join half of the fork {@link NativeProperties.isAsync} opens: a branch runs in parallel,
	 * and a block downstream waits for it to be over before it plays.
	 *
	 * **Finished, not reached.** A listed block counts once the flow has LEFT it: the game called
	 * `next()`, the exit port was resolved, and the block's cleanup has run. So the bubble is off
	 * the screen and the audio voice is stopped before the joining line is dispatched — which is
	 * the whole point of drawing a join.
	 *
	 * That is a change from the first v2 releases, where being reached was enough. It made the
	 * property nearly inert in the shape designers actually draw: a fork into two blocks, then a
	 * join on both, lifted in the very tick it was registered because the two had been dispatched
	 * a fraction of a millisecond earlier — and the joining line spoke over them.
	 *
	 * **The engine holds the block BEFORE dispatching it.** No handler is called, so the game
	 * never learns the block exists until the wait lifts — nothing of it can reach the screen
	 * early. That is the engine's decision and not a rendering choice a game could make
	 * differently: this is a NATIVE property, the designer ticks it in LSDE, and the engine owes
	 * them the behaviour.
	 *
	 * The rule is the same on every track, the one the player is watching included.
	 *
	 * - **All** the listed blocks must have finished, not just one.
	 * - Finishing a block releases everything waiting on it, in turn.
	 * - A block that never finishes parks its track for good — and a block that waits for input
	 *   forever never finishes. `init()` reports `UNKNOWN_WAIT_BLOCK` when an id is not a block of
	 *   the scene at all, but it cannot know whether a real one will ever be played.
	 * - `getVisitedBlocks()` is unaffected: it still lists what the player has been SHOWN, which
	 *   includes a block still mid-sentence.
	 */
	waitForBlocks?: string[];
}

/**
 * The ten ids of {@link NativeProperties}, to sort a `props` bag into natives and the designer's
 * own properties. Anything not in here belongs to the game.
 */
export const NATIVE_PROPERTY_IDS = [
	'isAsync', 'delay', 'timeout', 'waitInput', 'debug',
	'portPerCharacter', 'inPortPerCharacter', 'skipIfMissingActor', 'portPerCase', 'waitForBlocks',
] as const;

// ─── Runtime tags ────────────────────────────────────────────────────────────

/**
 * A choice option tagged with what `onResolveCondition()` said about its `when`.
 *
 * The engine hands over EVERY option, tagged — never a pre-filtered list. Filter with
 * `options.filter( o => o.visible !== false )`.
 */
export interface RuntimeChoiceItem extends Option {
	/** `true` = offered, `false` = hidden, `undefined` = no resolver installed (treat as offered). */
	visible?: boolean;
}

/**
 * A condition case with its pre-evaluated result, set when `onResolveCondition()` is installed.
 * Mirrors how {@link RuntimeChoiceItem} tags an option.
 *
 * The case carries its own exit port, so there is no index to map back to anything — that is the
 * v1 shape (`portIndex`) and it is gone. Pass the `port` to `resolve()` to override the routing.
 */
export interface RuntimeConditionCase {
	/** The exit port of this case: `K1`… with `portPerCase`, otherwise the block's `out`. */
	port: string;
	/** Its comparisons, chained left to right with no precedence. Absent = always true. */
	when?: ConditionTest[];
	/** `true` if the case holds, `false` if not, `undefined` if no resolver is installed. */
	result?: boolean;
}

// ─── Engine Types ────────────────────────────────────────────────────────────

/** Single diagnostic entry (error or warning). */
export interface DiagnosticEntry {
	/**
	 * Machine-readable code, e.g. `BROKEN_LINK` or `UNKNOWN_WAIT_BLOCK`.
	 *
	 * The seventeen the engine emits are listed in the Getting Started guide, split into the
	 * eleven that refuse the payload and the six that let it play. It is a `string` and not a
	 * union on purpose: a runtime is allowed to add one — TypeScript and GDScript read the raw
	 * payload and can say `WRONG_NAMING_CONVENTION`, where C# and C++ only ever see a typed
	 * object and report `INVALID_FORMAT` for the same file.
	 */
	code: string;
	/** Human-readable description of the issue. */
	message: string;
	/** Id of the scene where the issue was found, if applicable. */
	sceneId?: string;
	/** Id of the block where the issue was found, if applicable. */
	blockId?: string;
}

/** Aggregate statistics from blueprint validation. */
export interface DiagnosticStats {
	sceneCount: number;
	blockCount: number;
	connectionCount: number;
}

/** Result of `engine.init()` — validation report. */
export interface DiagnosticReport {
	errors: DiagnosticEntry[];
	warnings: DiagnosticEntry[];
	stats: DiagnosticStats;
}

/** Options for cross-validating blueprint data against game capabilities. When provided, the engine warns about blueprint references that don't match your game's known capabilities. */
export interface CheckOptions {
	/** Function ids your game implements. A blueprint function outside this list warns. */
	functions?: string[];
	/** Dictionary ids and their entry keys, as your game holds them. Anything outside warns. */
	dictionaries?: Record<string, string[]>;
	/** Card NAMES your game knows — `card.name`, never the editor id (`var1`). */
	cards?: string[];
}

/** Options passed to `engine.init()`. */
export interface InitOptions {
	/**
	 * One payload, or the several files of a per-scene export.
	 *
	 * LSDE can write one file per scene, and each of those is self-contained: it carries the whole
	 * header — every dictionary, function and card — so a scene loads and plays on its own. Pass
	 * the list and the engine stacks the scenes behind one header, after checking that the files
	 * really do come from the same export.
	 */
	data: BlueprintExport | BlueprintExport[];
	check?: CheckOptions;
}

/** Result of block validation. */
export interface ValidationResult {
	/**
	 * Whether the block passed validation.
	 *
	 * `false` calls `onInvalidateBlock` and then **ends the flow that was entering the block** —
	 * the whole scene when it is the one the player is watching (`onSceneExit` fires), just that
	 * branch when a parallel track was refused. A refusal is a dead end: nothing can resume a
	 * track the game turned away.
	 */
	valid: boolean;
	/** Reason for validation failure. Passed to `InvalidateBlockArgs.reason` when `valid` is `false`. */
	reason?: string;
}

/** Cleanup function returned by a block handler, called when leaving the block. */
export type CleanupFn = () => void;

// ─── Context Types ───────────────────────────────────────────────────────────

/** What every block handler gets, whatever the block type. */
export interface BaseBlockContext {
	/**
	 * The actor `onResolveCharacter()` picked for this block, or `undefined`.
	 *
	 * A block lists a CAST in `actors` — card ids, in an order LSDE deliberately refuses to give a
	 * meaning to. Whether the first one speaks, whether they all do, whether the rest are simply
	 * present is the game's call, so the engine hands the whole list to `onResolveCharacter()` and
	 * keeps whatever comes back. It does not elect a first one, the way v1 did.
	 */
	character: Card | undefined;
	/** Every card the block cites, resolved through the export's `cards` table, in file order. */
	actors: Card[];
	/**
	 * The emotion of the block, resolved through `cards` — the TONE of the line, not of a speaker.
	 *
	 * In v1 each character carried its own emotion, which meant writing the same feeling twice for
	 * two actors saying one sentence, and being free to desynchronise them by accident. A block is
	 * one line and one line has one tone; `actors` says who may carry it.
	 */
	emotion: Card | undefined;
	/** How strongly, when the writer set an emotion. Passed through untouched. */
	intensity: number | undefined;
	/** Stop the global (Tier 1) handler from running after this scene handler. */
	preventGlobalHandler: () => void;
}

/** What a DIALOG handler gets. */
export interface DialogContext extends BaseBlockContext {
	/**
	 * With `portPerCharacter`, name the actor whose port the flow should take.
	 *
	 * Takes a CARD ID (`var1`) — the same id `block.actors` lists and the same one the port is
	 * named after. A card the block does not cite, or one with no port drawn, falls back to `out`.
	 */
	resolveCharacterPort: ( cardId: string ) => void;
}

/** What a CHOICE handler gets. */
export interface ChoiceContext extends BaseBlockContext {
	/**
	 * EVERY option of the block, tagged. Not a shortened list.
	 *
	 * With `engine.onResolveCondition()` installed, each carries `visible: true | false`; without
	 * one it is `undefined` — unknown, not hidden. Show the offered ones with
	 * `options.filter( o => o.visible !== false )`, or keep the rest to grey them out.
	 */
	options: RuntimeChoiceItem[];
	/** Pick an option by its id (`C1`). That id is also the port the flow leaves by. */
	selectChoice: ( optionId: string ) => void;
}

/** What a CONDITION handler gets. */
export interface ConditionContext extends BaseBlockContext {
	/**
	 * The block's cases, each with its port and its pre-evaluated `result`.
	 *
	 * With `onResolveCondition()` installed the engine has already evaluated them and already
	 * knows where to go — the handler becomes a place to log or to override, and is optional.
	 */
	cases: RuntimeConditionCase[];
	/**
	 * Override the exit port. Takes a PORT NAME: `out`, `default`, or a case port (`K1`).
	 *
	 * v1 took `boolean | number | number[]` — three shapes for one method, the third being the
	 * dispatcher. Both are gone: a condition picks one path.
	 */
	resolve: ( port: string ) => void;
}

/**
 * What a ROUTER handler gets.
 *
 * The same pre-evaluated `cases` as a condition, and **no `resolve`**: a router's exits are a
 * tally, not a choice. Every true case has already launched its port and the continuation is
 * already picked — `then` when they all held, `catch` otherwise — by the time a handler could
 * speak. There is nothing left to override, which is also why no handler is required for the type.
 */
export interface RouterContext extends BaseBlockContext {
	/** The block's cases, each with its port and its pre-evaluated `result`. ALL of them ran. */
	cases: RuntimeConditionCase[];
}

/** What an ACTION handler gets. */
export interface ActionContext extends BaseBlockContext {
	/** The calls the block asks the game to run, in order, with their arguments BY NAME. */
	calls: ActionCall[];
	/** The calls went through. The flow leaves by `then`. */
	resolve: () => void;
	/**
	 * A call failed. The flow leaves by `catch`, or by `then` when no error branch was drawn.
	 *
	 * The error is OPTIONAL and the engine does nothing with it: routing only needs to know that
	 * the call failed. Pass one if it reads better next to your own logging — nothing here reads
	 * it, forwards it or logs it.
	 */
	reject: ( error?: unknown ) => void;
}

/** What `onBeforeBlock` gets. */
export interface BeforeBlockContext {
	/** The engine-facing properties of the block, read out of `props`. */
	nativeProperties: NativeProperties | undefined;
}

/** Context passed to scene lifecycle handlers. */
export interface SceneContext {
	// Extensible — reserved for future scene-level data.
}

// ─── Handler Types ───────────────────────────────────────────────────────────

/**
 * Arguments passed to any block handler.
 *
 * @remarks
 * Every block handler receives this common structure. The generic `B` parameter provides
 * the block type ({@link DialogBlock}, {@link ChoiceBlock}, etc.) and `C` provides
 * the type-specific context ({@link DialogContext}, {@link ChoiceContext}, etc.).
 *
 * The engine uses a **two-tier handler system**:
 * 1. **Tier 2 (scene)**: registered via `handle.onDialog()`, `handle.onChoice()`, etc.
 * 2. **Tier 1 (global)**: registered via `engine.onDialog()`, `engine.onChoice()`, etc.
 *
 * When a block is dispatched, the scene handler (Tier 2) is called first. The global handler
 * (Tier 1) is then called **after**, unless `context.preventGlobalHandler()` was invoked.
 *
 * A block-specific override via `handle.onBlock(blockId, handler)` takes highest priority.
 *
 * @see {@link BlockHandler} for the handler function signature
 * @see {@link SceneHandle} for scene-level handler registration
 * @see {@link BaseBlockContext.preventGlobalHandler} for suppressing Tier 1
 */
export interface BlockHandlerArgs<B extends BlueprintBlock, C extends BaseBlockContext> {
	/** The scene handle that owns this block. Use it to inspect state, cancel the scene, etc. */
	scene: SceneHandle;
	/** The block being executed, typed to match the handler (e.g. `DialogBlock` for `onDialog`). */
	block: B;
	/** Type-specific context providing actions for this block (e.g. selectChoice, resolve). */
	context: C;
	/** Advance the flow to the next block. Must be called exactly once to continue traversal. */
	next: () => void;
}

/**
 * A block handler function. May return a cleanup function.
 *
 * @remarks
 * The handler is called when the engine dispatches a block of the matching type. It **must**
 * call `next()` exactly once to advance the flow to the next block.
 *
 * If the handler returns a function, it is stored as a **cleanup function** and called when
 * the engine moves to the next block — use this to tear down UI, stop timers, etc.
 *
 * @example
 * ```ts
 * engine.onDialog(({ block, next }) => {
 *   const el = showDialogUI(block);
 *   next();
 *   return () => el.remove(); // cleanup when leaving this block
 * });
 * ```
 *
 * @see {@link CleanupFn} for the cleanup function type
 * @see {@link BlockHandlerArgs} for handler arguments
 */
export type BlockHandler<B extends BlueprintBlock, C extends BaseBlockContext> = (args: BlockHandlerArgs<B, C>) => CleanupFn | void;

/** Handler for DIALOG blocks. Shorthand for `BlockHandler<DialogBlock, DialogContext>`. */
export type DialogHandler = BlockHandler<DialogBlock, DialogContext>;
/** Handler for CHOICE blocks. Shorthand for `BlockHandler<ChoiceBlock, ChoiceContext>`. */
export type ChoiceHandler = BlockHandler<ChoiceBlock, ChoiceContext>;
/** Handler for CONDITION blocks. Shorthand for `BlockHandler<ConditionBlock, ConditionContext>`. */
export type ConditionHandler = BlockHandler<ConditionBlock, ConditionContext>;
/** Handler for ACTION blocks. Shorthand for `BlockHandler<ActionBlock, ActionContext>`. */
export type ActionHandler = BlockHandler<ActionBlock, ActionContext>;

/**
 * Context attached to a block inside {@link ValidateNextBlockArgs}.
 *
 * @remarks
 * The character is resolved by the `onResolveCharacter` callback **before** the
 * validation handler is invoked. If the block has no characters in its metadata,
 * or the resolver returns nothing, `character` will be `undefined`.
 *
 * @see {@link Card} for character data
 * @see {@link ValidateNextBlockArgs} for usage
 */
export interface ValidateNextBlockContext {
	/** Character resolved for this block, or `undefined` if none. */
	character: Card | undefined;
}

/**
 * Arguments for the onValidateNextBlock handler.
 *
 * @remarks
 * Called before each block is executed. Provides the resolved character for both
 * the upcoming block (`nextContext`) and the previously executed block (`fromContext`).
 * This enables game-side validation such as character authorization, status checks,
 * or transition rules between characters.
 *
 * `fromContext` is `null` for the first block of a scene (no previous block exists).
 *
 * @example
 * ```ts
 * engine.onValidateNextBlock(({ nextBlock, nextContext, fromContext }) => {
 *   const { character } = nextContext;
 *   if (!character) return { valid: false, reason: 'no_character' };
 *   if (game.characterHasStatus(character, 'stunned'))
 *     return { valid: false, reason: 'character_stunned' };
 *   return { valid: true };
 * });
 * ```
 *
 * @see {@link ValidateNextBlockContext} for per-block context details
 * @see {@link Card} for character data
 */
export interface ValidateNextBlockArgs {
	/** The block about to be executed. */
	nextBlock: BlueprintBlock;
	/** The block that was just executed, or `null` for the first block of the scene. */
	fromBlock: BlueprintBlock | null;
	/** Context for the upcoming block (character, etc.). */
	nextContext: ValidateNextBlockContext;
	/** Context for the previous block, or `null` if this is the first block. */
	fromContext: ValidateNextBlockContext | null;
	/** The port that was followed to reach `nextBlock` (reserved for future use). */
	port: string | null;
}

/** Handler for block validation. */
export type ValidateNextBlockHandler = (args: ValidateNextBlockArgs) => ValidationResult;

/** Arguments for the onInvalidateBlock handler. */
export interface InvalidateBlockArgs {
	scene: SceneHandle;
	reason: string;
}

/** Handler called when a block fails validation. */
export type InvalidateBlockHandler = (args: InvalidateBlockArgs) => void;

/** Arguments for the onBeforeBlock handler. */
export interface BeforeBlockArgs {
	block: BlueprintBlock;
	scene: SceneHandle;
	context: BeforeBlockContext;
	resolve: () => void;
}

/** Handler called before every block. Must call resolve() to continue. */
export type BeforeBlockHandler = (args: BeforeBlockArgs) => void;

/** Arguments for scene lifecycle handlers. */
export interface SceneLifecycleArgs {
	scene: SceneHandle;
	context: SceneContext;
}

/** Handler for scene enter/exit events. */
export type SceneLifecycleHandler = (args: SceneLifecycleArgs) => void;

// ─── TrackInfo ──────────────────────────────────────────────────────────────

/**
 * Read-only snapshot of an async track's state.
 * Returned by {@link SceneHandle.getTrackInfos} for debug, rendering, and validation.
 *
 * Track IDs are auto-incremented integers starting at 1. The main track is implicit (id 0)
 * and never appears in the track info list.
 */
export interface TrackInfo {
	/** Unique auto-incremented identifier for this track within the scene. Main track is implicit (id 0). */
	readonly id: number;
	/** ID of the track that spawned this one. `null` means spawned directly by the main track. */
	readonly parentTrackId: number | null;
	/** Id of the first block that started this track's execution. */
	readonly startBlockId: string;
	/** Id of the block currently being processed, or `null` if the track has ended. */
	readonly currentBlockId: string | null;
	/** Whether this track is still actively executing. */
	readonly running: boolean;
}

// ─── SceneHandle Interface ──────────────────────────────────────────────────

/**
 * Public interface for controlling a running scene.
 *
 * @remarks
 * Obtain a `SceneHandle` by calling `engine.scene(sceneRef)`. Use it to register
 * scene-specific (Tier 2) handlers, then call `start()` to begin traversal from the
 * scene's entry block.
 *
 * **Lifecycle**:
 * 1. `start()` → `onSceneEnter` fires → first block is dispatched
 * 2. Blocks are dispatched sequentially, following connections via port resolution
 * 3. Scene ends when: no more connections, or `cancel()` is called
 * 4. All async tracks are cancelled → current block cleanup runs → `onSceneExit` fires
 *
 * Scene-level handlers (`onDialog`, `onChoice`, etc.) are called **before** global handlers.
 * Both tiers execute unless the scene handler calls `context.preventGlobalHandler()`.
 * Use `onBlock(blockId, handler)` for a block-specific handler that takes highest priority.
 *
 * @example
 * ```ts
 * const handle = engine.scene(sceneId);
 * handle.onDialog(({ block, context, next }) => {
 *   showText(block.dialogueText?.['en']);
 *   next();
 * });
 * handle.onExit(({ scene }) => {
 *   console.log('Scene finished, visited:', scene.getVisitedBlocks().size);
 * });
 * handle.start();
 * ```
 *
 * @see {@link BlockHandlerArgs} for handler arguments
 * @see {@link BlueprintScene} for the scene data structure
 */
export interface SceneHandle {
	/** Start the scene flow from the entry block. */
	start(): void;
	/** Cancel the scene flow. */
	cancel(): void;

	/** Override the global onSceneEnter for this scene. */
	onEnter(handler: SceneLifecycleHandler): void;
	/** Override the global onSceneExit for this scene. */
	onExit(handler: SceneLifecycleHandler): void;

	/** Override one block by its id (DIALOG-001). */
	onBlock(blockId: string, handler: BlockHandler<BlueprintBlock, BaseBlockContext>): void;
	/** Override one DIALOG block by its id (type-safe). */
	onDialogId(blockId: string, handler: DialogHandler): void;
	/** Override one CHOICE block by its id (type-safe). */
	onChoiceId(blockId: string, handler: ChoiceHandler): void;
	/** Override one CONDITION block by its id (type-safe). */
	onConditionId(blockId: string, handler: ConditionHandler): void;
	/** Override one ACTION block by its id (type-safe). */
	onActionId(blockId: string, handler: ActionHandler): void;
	/** Override all DIALOG blocks for this scene. */
	onDialog(handler: DialogHandler): void;
	/** Override all CHOICE blocks for this scene. */
	onChoice(handler: ChoiceHandler): void;
	/** Override all CONDITION blocks for this scene. */
	onCondition(handler: ConditionHandler): void;
	/** Override all ACTION blocks for this scene. */
	onAction(handler: ActionHandler): void;

	/** Get the block currently being executed. */
	getCurrentBlock(): BlueprintBlock | null;
	/** The id of every block visited so far, in this scene. */
	getVisitedBlocks(): ReadonlySet<string>;
	/** Check if the scene flow is currently active. */
	isRunning(): boolean;
	/** Get the number of async tracks currently running in parallel. */
	getActiveTracks(): number;
	/** Get detailed info for all currently running async tracks. Useful for debug, rendering, and validation. */
	getTrackInfos(): readonly TrackInfo[];

	/** Get the full choice history for this scene. Keys are block ids, values are the option ids the player picked there, in order. */
	getChoiceHistory(): ReadonlyMap<string, readonly string[]>;
	/** Get the choice(s) selected at a specific block. Returns undefined if block never visited as choice. */
	getChoice( blockId: string ): readonly string[] | undefined;

	/** Evaluate a condition. Handles `choice:` conditions via internal choice history. Returns `false` for non-choice conditions. */
	evaluateCondition(condition: ConditionTest): boolean;
	/** Override character resolution for this scene. Defaults to engine-level resolver. */
	onResolveCharacter(fn: (characters: Card[]) => Card | undefined): void;
}

// ─── DialogueEngine Interface ────────────────────────────────────────────────

/**
 * Public interface for the dialogue engine facade.
 *
 * @remarks
 * This is the top-level entry point for the LSDEDE runtime. It manages blueprint loading,
 * global handler registration, and scene creation. Use {@link SceneHandle} for per-scene control.
 *
 * @see {@link SceneHandle} for per-scene runtime control
 */
export interface IDialogueEngine {
	// ── Initialization ──────────────────────────────────────────────────

	/** Validate blueprint data, build internal graph, return diagnostic report. */
	init(options: InitOptions): DiagnosticReport;
	/** Set the active locale for text resolution. */
	setLocale(locale: string): void;

	// ── Validation handlers ─────────────────────────────────────────────

	/** Register a handler called before each block to validate it. */
	onValidateNextBlock(handler: ValidateNextBlockHandler): void;
	/** Register a handler called when a block fails validation. */
	onInvalidateBlock(handler: InvalidateBlockHandler): void;

	// ── Pre-execution ───────────────────────────────────────────────────

	/** Register a handler called before every block. Must call resolve() to continue. */
	onBeforeBlock(handler: BeforeBlockHandler): void;

	// ── Type handlers (Tier 1 — global) ─────────────────────────────────

	/** Register a global handler for DIALOG blocks. May return a cleanup function. */
	onDialog(handler: DialogHandler): void;
	/** Register a global handler for CHOICE blocks. All choices are provided, tagged with `visible` when `onResolveCondition()` is configured. */
	onChoice(handler: ChoiceHandler): void;
	/** Register a global handler for CONDITION blocks. The developer MUST handle evaluation in this handler. */
	onCondition(handler: ConditionHandler): void;
	/** Register a global handler for ACTION blocks. The developer MUST handle execution in this handler. */
	onAction(handler: ActionHandler): void;

	// ── Character resolution ────────────────────────────────────────────

	/** Register a global character resolver. Called for every block with `metadata.characters`. */
	onResolveCharacter(fn: (characters: Card[]) => Card | undefined): void;

	// ── Choice visibility ────────────────────────────────────────────────

	/**
	 * Install a unified condition evaluator for both choice visibility and condition block pre-evaluation.
	 * The engine handles `choice:` conditions internally via choice history — this callback
	 * evaluates game-state conditions only.
	 *
	 * When installed:
	 * - Choice blocks: each choice is tagged with `visible: true | false` based on its `visibilityConditions`.
	 * - Condition blocks: each group is pre-evaluated and the result is available in `context.groups[i].result`
	 *   and `context.evaluation`.
	 */
	onResolveCondition(evaluator: (condition: ConditionTest) => boolean): void;


	// ── Scene lifecycle ─────────────────────────────────────────────────

	/** Register a handler called when any scene starts. */
	onSceneEnter(handler: SceneLifecycleHandler): void;
	/** Register a handler called when any scene ends (natural or cancelled). */
	onSceneExit(handler: SceneLifecycleHandler): void;

	// ── Scene handles ───────────────────────────────────────────────────

	/** Create a scene handle. Does NOT start the flow — call handle.start(). */
	scene(sceneId: string): SceneHandle;

	// ── Engine control ──────────────────────────────────────────────────

	/**
	 * Cancel every running scene.
	 *
	 * Every one of them, even if a cleanup throws on the way — the first fault surfaces once
	 * there is nothing left to close. A scene opened twice is two scenes here, and both stop.
	 */
	stop(): void;
	/** True if at least one scene is active. */
	isRunning(): boolean;
	/** Get all currently active scene handles. */
	getActiveScenes(): SceneHandle[];
	/** Get the current block of every active scene. */
	getCurrentBlocks(): BlueprintBlock[];
	/**
	 * Every wire INSIDE a scene, flattened so each carries the block it leaves.
	 *
	 * Graph inspection, for a debug view that wants to see the wiring without playing it. It has
	 * never had anything to do with going from one scene to another: a wire has never crossed a
	 * scene in any version of the format, and chaining two scenes is the game's own business.
	 */
	getSceneConnections(sceneId: string): BlueprintConnection[];
}

// ─── Port Resolution Types ──────────────────────────────────────────────────

/** What `resolvePort()` needs to pick the wires to follow. */
export interface PortResolutionInput {
	/** The block being left. Its `type` picks the routing rule. */
	block: BlueprintBlock;
	/** The wires it carries — `block.next`, straight off the block. */
	links: Link[];
	/** CHOICE only: the option the player picked. Its id **is** its port (`C1`…). */
	selectedOptionId?: string;
	/** CONDITION only: the port its cases picked — `out`, `default`, or `K1`…. */
	conditionPort?: string;
	/**
	 * ROUTER only: every port it leaves by, in order — the `K*` of each true case, then `then` or
	 * `catch` LAST.
	 *
	 * A list and not one port, because a router does not pick an exit: it launches one per true
	 * case and continues besides. The continuation comes last so that the traversal, which keeps
	 * the first non-async target as the main flow, keeps `then`/`catch` when the case routes are
	 * async — which is the arrangement LSDE recommends and `init()` warns about otherwise.
	 */
	routerPorts?: string[];
	/** ACTION only: `true` when a call failed, so `catch` is tried before `then`. */
	actionRejected?: boolean;
	/** DIALOG with `portPerCharacter`: the CARD ID of the speaking actor (`var1`), never an index. */
	actorPort?: string;
}

/** The wires to follow. The traversal decides which is the main track. */
export interface PortResolutionResult {
	links: Link[];
}
