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

import type { Blueprints, Scene, Block, Link, ConditionTest, Option, Card } from './blueprint-types.js';
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
 * not: `isAsync` spawns a parallel track, and `waitForBlocks` parks one until its blocks are seen.
 *
 * **`delay` and `timeout` are MILLISECONDS in v2.** They were seconds in v1, and nothing will
 * report the difference at runtime — a migrated project turns a 3-second pause into 3 ms.
 */
export interface NativeProperties {
	/** Run this block on a parallel track instead of the main flow. */
	isAsync?: boolean;
	/** Milliseconds to wait before the block runs. Applied by `onBeforeBlock`, not by the engine. */
	delay?: number;
	/** Milliseconds the block may take. Passed through — the engine enforces nothing. */
	timeout?: number;
	/** Wait for player input or a game signal. Passed through, never interpreted. */
	waitInput?: boolean;
	/** Editor debug flag. Passed through. */
	debug?: boolean;
	/** One exit port per actor id, `out` as the fallback. */
	portPerCharacter?: boolean;
	/** Skip the block when its actor is absent at runtime. Passed through. */
	skipIfMissingActor?: boolean;
	/** Condition blocks: each case exits by its own port instead of sharing `out`. */
	portPerCase?: boolean;
	/** Block ids OF THIS SCENE that must have been visited before this block may advance. */
	waitForBlocks?: string[];
}

/**
 * The nine ids of {@link NativeProperties}, to sort a `props` bag into natives and the designer's
 * own properties. Anything not in here belongs to the game.
 */
export const NATIVE_PROPERTY_IDS = [
	'isAsync', 'delay', 'timeout', 'waitInput', 'debug',
	'portPerCharacter', 'skipIfMissingActor', 'portPerCase', 'waitForBlocks',
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
 */
export interface RuntimeConditionGroup {
	/** The comparisons of this case, chained left to right with no precedence. */
	conditions: ConditionTest[];
	/** Port index this group maps to (case_0 = 0, case_1 = 1, ...). Pass to `resolve()` for routing. */
	portIndex: number;
	/** Pre-evaluated result. `true` if the case matches, `false` if not, `undefined` if no resolver is installed. */
	result?: boolean;
}

// ─── Engine Types ────────────────────────────────────────────────────────────

/** Single diagnostic entry (error or warning). */
export interface DiagnosticEntry {
	/** Machine-readable error/warning code (e.g. "NO_ENTRY_BLOCK", "ORPHAN_CONNECTION"). */
	code: string;
	/** Human-readable description of the issue. */
	message: string;
	/** UUID of the scene where the issue was found, if applicable. */
	sceneId?: string;
	/** UUID of the block where the issue was found, if applicable. */
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
	data: BlueprintExport;
	check?: CheckOptions;
}

/** Result of block validation. */
export interface ValidationResult {
	/** Whether the block passed validation. When `false`, the `onInvalidateBlock` handler is called. */
	valid: boolean;
	/** Reason for validation failure. Passed to `InvalidateBlockArgs.reason` when `valid` is `false`. */
	reason?: string;
}

/** Cleanup function returned by a block handler, called when leaving the block. */
export type CleanupFn = () => void;

// ─── Context Types ───────────────────────────────────────────────────────────

/** Base context available to all block handlers. */
export interface BaseBlockContext {
	/** Character resolved by the `onResolveCharacter` callback for this block, or `undefined` if none. */
	character: Card | undefined;
	/** Prevent the global (Tier 1) handler from executing after this scene handler. */
	preventGlobalHandler: () => void;
}

/** Context for DIALOG block handlers. */
export interface DialogContext extends BaseBlockContext {
	/** When portPerCharacter is enabled, specify which character port to follow. */
	resolveCharacterPort: (characterUuid: string) => void;
}

/** Context for CHOICE block handlers. */
export interface ChoiceContext extends BaseBlockContext {
	/**
	 * All choices with optional visibility tags. When `engine.onResolveCondition()` is configured,
	 * each choice is tagged `visible: true | false`. Filter with `choices.filter(c => c.visible !== false)`.
	 * Without a filter, `visible` is `undefined` and all choices pass.
	 */
	choices: RuntimeChoiceItem[];
	/** Select a choice by UUID. The engine follows the matching port. */
	selectChoice: (choiceUuid: string) => void;
}

/** Context for CONDITION block handlers. */
export interface ConditionContext extends BaseBlockContext {
	/**
	 * All condition groups with optional pre-evaluated results.
	 * When {@link IDialogueEngine.onResolveCondition | onResolveCondition()} is configured,
	 * each group has `result: true | false`. Without a resolver, `result` is `undefined`.
	 */
	conditionGroups: RuntimeConditionGroup[];
	/**
	 * Resolve the condition evaluation result.
	 * - `boolean`: legacy single-group mode — `true` → port index 0, `false` → port index 1.
	 * - `number`: switch mode — `>= 0` follows the matching case port, `< 0` follows `default`.
	 * - `number[]`: dispatcher mode — all matching case indices fire as async tracks, `default` is the main track.
	 */
	resolve: (result: boolean | number | number[]) => void;
}

/** Context for ACTION block handlers. */
export interface ActionContext extends BaseBlockContext {
	/** Mark action as succeeded. Engine follows the `then` port. */
	resolve: () => void;
	/** Mark action as failed. Engine follows the `catch` port (fallback `then` if no catch port exists). */
	reject: (error: unknown) => void;
}

/** Context passed to onBeforeBlock handler. */
export interface BeforeBlockContext {
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
 * A block-specific override via `handle.onBlock(uuid, handler)` takes highest priority.
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
	/** UUID of the first block that started this track's execution. */
	readonly startBlockUuid: string;
	/** UUID of the block currently being processed, or `null` if the track has ended. */
	readonly currentBlockUuid: string | null;
	/** Whether this track is still actively executing. */
	readonly running: boolean;
}

// ─── SceneHandle Interface ──────────────────────────────────────────────────

/**
 * Public interface for controlling a running scene.
 *
 * @remarks
 * Obtain a `SceneHandle` by calling `engine.scene(sceneUuid)`. Use it to register
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
 * Use `onBlock(uuid, handler)` for a block-specific handler that takes highest priority.
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

	/** Override a specific block by UUID. */
	onBlock(blockUuid: string, handler: BlockHandler<BlueprintBlock, BaseBlockContext>): void;
	/** Override a specific DIALOG block by UUID (type-safe). */
	onDialogId(blockUuid: string, handler: DialogHandler): void;
	/** Override a specific CHOICE block by UUID (type-safe). */
	onChoiceId(blockUuid: string, handler: ChoiceHandler): void;
	/** Override a specific CONDITION block by UUID (type-safe). */
	onConditionId(blockUuid: string, handler: ConditionHandler): void;
	/** Override a specific ACTION block by UUID (type-safe). */
	onActionId(blockUuid: string, handler: ActionHandler): void;
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
	/** Get UUIDs of all blocks visited so far. */
	getVisitedBlocks(): ReadonlySet<string>;
	/** Check if the scene flow is currently active. */
	isRunning(): boolean;
	/** Get the number of async tracks currently running in parallel. */
	getActiveTracks(): number;
	/** Get detailed info for all currently running async tracks. Useful for debug, rendering, and validation. */
	getTrackInfos(): readonly TrackInfo[];

	/** Get the full choice history for this scene. Keys are block UUIDs, values are arrays of selected choice UUIDs. */
	getChoiceHistory(): ReadonlyMap<string, readonly string[]>;
	/** Get the choice(s) selected at a specific block. Returns undefined if block never visited as choice. */
	getChoice( blockUuid: string ): readonly string[] | undefined;

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

	/** @deprecated Use {@link onResolveCondition} instead. */
	setChoiceFilter(evaluator: (condition: ConditionTest) => boolean): void;

	// ── Scene lifecycle ─────────────────────────────────────────────────

	/** Register a handler called when any scene starts. */
	onSceneEnter(handler: SceneLifecycleHandler): void;
	/** Register a handler called when any scene ends (natural or cancelled). */
	onSceneExit(handler: SceneLifecycleHandler): void;

	// ── Scene handles ───────────────────────────────────────────────────

	/** Create a scene handle. Does NOT start the flow — call handle.start(). */
	scene(sceneId: string): SceneHandle;

	// ── Engine control ──────────────────────────────────────────────────

	/** Stop all active scenes. */
	stop(): void;
	/** True if at least one scene is active. */
	isRunning(): boolean;
	/** Get all currently active scene handles. */
	getActiveScenes(): SceneHandle[];
	/** Get the current block of every active scene. */
	getCurrentBlocks(): BlueprintBlock[];
	/** Get connections for a scene (for inter-scene navigation). */
	getSceneConnections(sceneId: string): BlueprintConnection[];
}

// ─── Port Resolution Types ──────────────────────────────────────────────────

/** Input data for port resolution. */
export interface PortResolutionInput {
	/** The block whose output port is being resolved. Its `type` determines the routing rules. */
	block: BlueprintBlock;
	/** All outgoing connections from this block. The resolver picks the one to follow. */
	connections: BlueprintConnection[];
	/** CHOICE blocks only — UUID of the selected choice. Matches `connection.fromPort`. */
	selectedChoiceUuid?: string;
	/**
	 * CONDITION blocks only — evaluation result.
	 * - `boolean`: `true` → port index 0, `false` → port index 1 (legacy single-group).
	 * - `number`: `>= 0` follows matching case port, `< 0` follows `default`/`false` (switch mode).
	 * - `number[]`: all matching case indices + `default` (dispatcher mode).
	 */
	conditionResult?: boolean | number | number[];
	/** ACTION blocks only — if `true`, the resolver looks for a `catch` port before falling back to `then`. */
	actionRejected?: boolean;
	/** DIALOG blocks with `portPerCharacter` — character index in metadata.characters to match against `connection.fromPortIndex`. */
	characterPortIndex?: number;
}

/** Result of port resolution — all matching connections. */
export interface PortResolutionResult {
	connections: BlueprintConnection[];
}
