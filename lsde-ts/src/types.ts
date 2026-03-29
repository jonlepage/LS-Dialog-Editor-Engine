// LSDE Dialog Engine — Type definitions
// All interfaces and types for the engine.
//
// These types are structurally compatible with the LSDE-generated
// blueprint.types.ts. TypeScript's structural typing ensures any
// BlueprintExport object from LSDE will be accepted by the engine.

// ─── Blueprint Data Types (mirrors LSDE export) ─────────────────────────────

/** All possible block types in a blueprint. */
export type BlockType = 'DIALOG' | 'CHOICE' | 'CONDITION' | 'ACTION' | 'NOTE';

/** Directed connection between two blocks in the blueprint. Connections define the dialogue flow by linking output ports of source blocks to input ports of target blocks. */
export interface BlueprintConnection {
	/** Unique identifier for this connection. */
	id: string;
	/** UUID of the source block. */
	fromId: string;
	/** UUID of the target block. */
	toId: string;
	/** Output port identifier on the source block. For CHOICE blocks: the selected choice UUID. For ACTION blocks: `"then"` or `"catch"`. */
	fromPort: string;
	/** Input port identifier on the target block. */
	toPort: string;
	/** Zero-based index of the output port. For CONDITION blocks: 0 = true, 1 = false. For DIALOG with `portPerCharacter`: index of the character. */
	fromPortIndex?: number;
}

/** Generic key-value property attached to a block. */
export interface BlockProperty {
	/** Property name or identifier. */
	key: string;
	/** Property value. */
	value: string | number | boolean;
}

/**
 * Condition evaluated to control dialogue flow or choice visibility.
 *
 * @remarks
 * Conditions are evaluated **left-to-right with no operator precedence**. The `chain` field
 * on each condition determines how it combines with the accumulated result:
 *
 * - Empty array → `true` (no conditions = pass)
 * - First condition → its raw boolean result (`chain` is ignored)
 * - `chain = '&'` or absent → AND with the accumulated result
 * - `chain = '|'` → OR with the accumulated result
 *
 * This means `A AND B OR C` evaluates as `(A AND B) OR C`, not `A AND (B OR C)`.
 *
 * The developer is responsible for interpreting `key`, `operator`, and `value` against
 * the game state via the `onCondition` handler — the engine only handles the chaining logic.
 *
 * @see {@link ConditionBlock} for condition blocks
 * @see {@link ChoiceItem.visibilityConditions} for choice filtering
 */
export interface ExportCondition {
	/** Unique identifier for this condition instance. */
	uuid: string;
	/** State key to evaluate (e.g. "has_item", "player_level"). Interpreted by the `onCondition` handler. */
	key: string;
	/** Logical chaining with the previous condition: `'|'` (OR) or `'&'` (AND). Defaults to AND if omitted. Ignored on the first condition in a chain. */
	chain?: '|' | '&';
	/** Comparison operator (e.g. "==", "!=", ">", "<", ">=", "<="). Interpretation is up to the `onCondition` handler. */
	operator: string;
	/** Value to compare against. Always a string — the developer is responsible for type coercion. */
	value: string;
}

/** Action triggered during block execution. */
export interface ExportAction {
	/** Unique identifier for this action instance. */
	uuid: string;
	/** UUID of the `ActionSignature` this action references. */
	signatureUuid?: string;
	/** Action type identifier matching an `ActionSignature.id` (e.g. "set_flag", "play_sound"). The dev maps this to game-side functions. */
	actionId: string;
	/** Ordered parameter values for the action, as defined by the matching `ActionSignature.params`. */
	params: (string | number | boolean)[];
}

/** Player choice option within a choice block. */
export interface ChoiceItem {
	/** Unique identifier for this choice. */
	uuid: string;
	/** Hierarchical key for localization lookup. */
	structureKey: string;
	/** Display label for editor reference. */
	label?: string;
	/** Localized text map: `{ locale -> text }`. */
	dialogueText?: Record<string, string>;
	/** Conditions controlling whether this choice is visible. If all pass (or none set), the choice is shown. */
	visibilityConditions?: ExportCondition[];
}

/**
 * Choice item with runtime visibility tag, set by the engine when `setChoiceFilter()` is configured.
 * Use `choices.filter(c => c.visible !== false)` to get visible choices.
 */
export interface RuntimeChoiceItem extends ChoiceItem {
	/** `true` = visible, `false` = hidden, `undefined` = no filter installed (treat as visible). */
	visible?: boolean;
}

/**
 * LSDE native execution properties controlling how a block is dispatched by the engine.
 *
 * @remarks
 * These properties affect the engine's execution flow, not the block's content:
 *
 * - **Async tracks**: When `isAsync = true`, the block runs on a parallel track independent
 *   of the main flow. Async tracks skip `onBeforeBlock`, follow only one connection, and are
 *   automatically cancelled when the scene ends.
 *
 * - **waitForBlocks**: When set, the block defers its advance until ALL listed block UUIDs
 *   have been visited in the scene. This enables precise synchronization between parallel
 *   async branches (e.g. a character waits for another to finish before reacting).
 *
 * - **delay**: Consumed by `onBeforeBlock` — the engine does not enforce it automatically.
 *   Your `onBeforeBlock` handler should read `block.nativeProperties.delay` and call
 *   `resolve()` after the delay.
 *
 * - **portPerCharacter**: Creates one output port per character in `metadata.characters`.
 *   The DIALOG handler must call `context.resolveCharacterPort(character.uuid)` to pick which port
 *   to follow.
 *
 * @see {@link DialogBlock} for portPerCharacter usage
 * @see {@link BeforeBlockArgs} for delay handling
 */
export interface NativeProperties {
	/** Execute this block on a separate async track running in parallel with the main flow. */
	isAsync?: boolean;
	/** Delay in seconds before the block is executed. Applied by the `onBeforeBlock` handler. */
	delay?: number;
	/** Timeout in seconds for block execution. */
	timeout?: number;
	/** Enable debug mode for this block (editor use). */
	debug?: boolean;
	/** One output port per character in `metadata.characters`. The handler calls `resolveCharacterPort()` to pick which port to follow. */
	portPerCharacter?: boolean;
	/** Skip this block entirely if the assigned actor/character is missing at runtime. */
	skipIfMissingActor?: boolean;
	/**
	 * UUIDs of blocks that must have been visited before this block can progress.
	 * When `next()` is called and not all listed blocks are in `visitedBlocks`,
	 * the block defers its advance. Once the last required block is visited
	 * anywhere in the scene (main or async track), the deferred advance fires.
	 * Enables precise synchronization of parallel async branches.
	 */
	waitForBlocks?: string[];
	/**
	 * Passive flag indicating this block should wait for explicit player input
	 * or an engine-specific signal before proceeding. The engine does NOT
	 * interpret this flag — it is exposed as-is to game handlers.
	 * Use case: second player controller, custom input events, etc.
	 */
	waitInput?: boolean;
}

/** Character (actor) assigned to a block. */
export interface BlockCharacter {
	/** Internal UUID used by the dialog engine. */
	uuid: string;
	/** Game-side character identifier. Use this to look up the character in your game engine. */
	id: string;
	/** Display name for debugging and editor preview. Not intended for in-game display. */
	name: string;
	/** Emotion label for the character in this block (e.g. "happy", "angry", "sad"). */
	emotion?: string;
	/** Emotion intensity (e.g. 0 = neutral, higher = stronger). */
	emotionIntensity?: number;
}

/** Screenshot or image captured from the editor for documentation. */
export interface BlockScreenshot {
	/** Image source as a data URL (base64) or file path. */
	src: string;
	/** Optional caption or description. */
	note?: string;
}

/** Non-logic metadata for display and organization. Should not affect game logic. */
export interface BlockMetadata {
	/** Visual color coding (hex) assigned by the designer. */
	color?: string;
	/** Free-form designer notes. Not displayed to players. */
	comments?: string;
	/** Contextual tags for categorization and filtering. */
	tags?: string[];
	/** Screenshots captured from the editor for this block. */
	screenShots?: BlockScreenshot[];
	/** Characters (actors) assigned to this block. */
	characters?: BlockCharacter[];
	/** Additional designer-defined metadata key-value pairs. */
	others?: Record<string, string | number | boolean | (string | number | boolean)[]>;
}

/**
 * Common properties shared by all block types.
 *
 * @remarks
 * All five block types ({@link DialogBlock}, {@link ChoiceBlock}, {@link ConditionBlock},
 * {@link ActionBlock}, {@link NoteBlock}) extend this base. Use the `type` discriminant field
 * to narrow to a specific block type in TypeScript:
 *
 * ```ts
 * if (block.type === 'DIALOG') {
 *   // block is DialogBlock here
 *   console.log(block.dialogueText);
 * }
 * ```
 *
 * The `properties` array contains designer-defined key-value pairs from the editor's block
 * configuration panel. `userProperties` is a free-form dictionary for narrative-designer data
 * that doesn't fit the structured property model.
 *
 * @see {@link BlueprintBlock} for the discriminated union type
 * @see {@link NativeProperties} for execution-related properties
 * @see {@link BlockMetadata} for non-logic display metadata
 */
export interface BlueprintBlockBase {
	/** Unique block identifier. */
	uuid: string;
	/** Block type determining behavior and rendering. */
	type: BlockType;
	/** Display label assigned in the editor. */
	label?: string;
	/** Hierarchy of parent folder labels providing structural context. */
	parentLabels?: string[];
	/** Custom key-value properties defined by block configuration. */
	properties: BlockProperty[];
	/** User-defined custom properties dictionary set by the narrative designer. */
	userProperties?: Record<string, string | number | boolean>;
	/** LSDE native execution properties (async, delay, portPerCharacter, etc.). */
	nativeProperties?: NativeProperties;
	/** Non-logic metadata for display and organization. */
	metadata?: BlockMetadata;
	/** When true, this block is the entry point of the scene. Only one per scene. */
	isStartBlock?: boolean;
}

/**
 * Dialog block — displays text spoken by a character.
 *
 * @remarks
 * The character is resolved by the `onResolveCharacter` callback and exposed as `context.character` in the handler.
 * When `nativeProperties.portPerCharacter` is enabled, each character gets a dedicated output port
 * and the handler must call `context.resolveCharacterPort(character.uuid)` to select which port to follow.
 *
 * If no `onDialog` handler is registered, the engine silently advances to the next block.
 *
 * @example
 * ```ts
 * engine.onDialog(({ block, context, next }) => {
 *   const text = block.dialogueText?.['en'] ?? '';
 *   const char = context.character;
 *   showDialogUI(char?.name, text);
 *   next();
 * });
 * ```
 *
 * @see {@link DialogContext} for handler context
 * @see {@link BlockCharacter} for character data
 * @see {@link NativeProperties.portPerCharacter} for multi-port routing
 */
export interface DialogBlock extends BlueprintBlockBase {
	type: 'DIALOG';
	/** Hierarchical key for tree navigation and localization lookup. */
	structureKey?: string;
	/** Raw text content in the primary language. */
	content?: string;
	/** Localized text map: `{ locale -> text }`. */
	dialogueText?: Record<string, string>;
}

/**
 * Choice block — presents selectable options to the player.
 *
 * @remarks
 * The `context.choices` array contains ALL choices — none are filtered out.
 * When {@link IDialogueEngine.setChoiceFilter | setChoiceFilter()} is configured, the engine
 * evaluates each choice's `visibilityConditions` and tags every {@link RuntimeChoiceItem} with
 * `visible: true | false`. The developer filters with `choices.filter(c => c.visible !== false)`.
 * Without a filter, `visible` is `undefined` and all choices pass.
 *
 * The handler must call `context.selectChoice(uuid)` to pick a choice. The engine then follows
 * the connection whose `fromPort` matches the selected choice UUID.
 *
 * If no `onChoice` handler is registered, the engine silently advances with no selection — the
 * flow may end if no default connection exists.
 *
 * @example
 * ```ts
 * engine.onChoice(({ context, next }) => {
 *   showChoicesUI(context.choices, (selectedUuid) => {
 *     context.selectChoice(selectedUuid);
 *     next();
 *   });
 * });
 * ```
 *
 * @see {@link ChoiceItem} for choice structure
 * @see {@link ChoiceContext} for handler context
 * @see {@link ExportCondition} for visibility conditions
 */
export interface ChoiceBlock extends BlueprintBlockBase {
	type: 'CHOICE';
	/** Available player choices. Visibility is filtered at runtime via `visibilityConditions`. */
	choices?: ChoiceItem[];
	/** Designer note. Not displayed to players. */
	note?: string;
}

/**
 * Condition block — evaluates logic to branch the dialogue flow.
 *
 * @remarks
 * The developer MUST handle evaluation in the `onCondition` handler. Conditions are chained
 * left-to-right with no operator precedence: `'&'` = AND, `'|'` = OR. An empty array
 * evaluates to `true`.
 *
 * The result maps to output ports: `true` follows port index 0, `false` follows port index 1.
 * Call `context.resolve(result)` to set the branch direction.
 *
 * @example
 * ```ts
 * engine.onCondition(({ block, context, next }) => {
 *   const result = myCustomEvaluator(block.conditions ?? []);
 *   context.resolve(result); // true → port 0, false → port 1
 *   next();
 * });
 * ```
 *
 * @see {@link ExportCondition} for condition structure and chaining rules
 * @see {@link ConditionContext} for handler context
 */
export interface ConditionBlock extends BlueprintBlockBase {
	type: 'CONDITION';
	/** Conditions to evaluate. Chained left-to-right with `chain` operators. */
	conditions?: ExportCondition[];
	/** Designer note. Not displayed to players. */
	note?: string;
}

/**
 * Action block — triggers game state changes.
 *
 * @remarks
 * The developer MUST handle execution in the `onAction` handler.
 *
 * The block has two output ports: `"then"` (success) and `"catch"` (failure).
 * Call `context.resolve()` for success or `context.reject(error)` for failure. If no
 * `"catch"` connection exists, rejection falls back to the `"then"` port.
 *
 * @example
 * ```ts
 * engine.onAction(({ block, context, next }) => {
 *   try {
 *     for (const action of block.actions ?? []) {
 *       executeGameAction(action);
 *     }
 *     context.resolve();   // → "then" port
 *   } catch (err) {
 *     context.reject(err); // → "catch" port (fallback "then")
 *   }
 *   next();
 * });
 * ```
 *
 * @see {@link ExportAction} for action structure
 * @see {@link ActionSignature} for reusable action type definitions
 * @see {@link ActionContext} for handler context
 */
export interface ActionBlock extends BlueprintBlockBase {
	type: 'ACTION';
	/** Actions to execute. Each references an `ActionSignature` via `actionId`. */
	actions?: ExportAction[];
	/** Designer note. Not displayed to players. */
	note?: string;
}

/** Note block — designer documentation, never executed at runtime. */
export interface NoteBlock extends BlueprintBlockBase {
	type: 'NOTE';
}

/** Discriminated union of all block types. Narrow on the `type` field. */
export type BlueprintBlock = DialogBlock | ChoiceBlock | ConditionBlock | ActionBlock | NoteBlock;

/**
 * A scene — an independent dialogue subgraph with its own entry point.
 *
 * @remarks
 * A scene is the unit of execution in the engine. Call `engine.scene(uuid)` to obtain a
 * {@link SceneHandle}, then `handle.start()` to begin traversing from `entryBlockId`.
 *
 * The `blocks` array contains all blocks in this scene. The `connections` array defines the
 * directed edges between blocks (output port → input port). Together they form a directed
 * graph that the engine traverses at runtime.
 *
 * Multiple scenes can run concurrently — each gets its own `SceneHandle` with independent
 * state, visited blocks, and async tracks.
 *
 * @example
 * ```ts
 * const sceneId = blueprint.scenes[0].uuid;
 * const handle = engine.scene(sceneId);
 * handle.onDialog(({ block, next }) => { next(); });
 * handle.start();
 * ```
 *
 * @see {@link SceneHandle} for runtime scene control
 * @see {@link BlueprintConnection} for edge structure
 * @see {@link BlueprintBlock} for block types
 */
export interface BlueprintScene {
	/** Unique scene identifier. */
	uuid: string;
	/** Scene name assigned by the designer. */
	label: string;
	/** Scene-level designer notes. */
	note?: string;
	/** UUID of the entry block for this scene. */
	entryBlockId?: string;
	/** Scene creation or last modification date. */
	date: string;
	/** All blocks contained within this scene. */
	blocks: BlueprintBlock[];
	/** All connections defining the dialogue flow in this scene. */
	connections: BlueprintConnection[];
}

/** A single entry in a dictionary group. */
export interface DictionaryRow {
	/** Key identifier referenced in conditions and action parameters. */
	key: string;
	/** Optional description for this dictionary entry. */
	note?: string;
}

/** Dictionary group defining reusable key-value pairs for conditions and actions. */
export interface Dictionary {
	/** Unique identifier for this dictionary group. */
	uuid: string;
	/** Display name, used as prefix in condition keys (e.g. `"groupLabel.rowKey"`). */
	label?: string;
	/** Data type of values in this dictionary. Determines how condition values are parsed. */
	valueType: 'string' | 'number' | 'boolean';
	/** All entries in this dictionary group. */
	rows: DictionaryRow[];
}

/** Parameter definition for an action signature. */
export interface SignatureParam {
	/** Display label for this parameter. */
	label?: string;
	/** Data type of this parameter. */
	type: 'boolean' | 'string' | 'number' | 'enum' | 'dictionary';
	/** UUID of the dictionary group this parameter references. Only when `type` is `"dictionary"`. */
	dictionaryGroupUuid?: string;
	/** Available options when `type` is `"enum"`. */
	enumOptions?: { id: string; label?: string }[];
}

/** Action signature defining a reusable action type. Map `id` to your engine's action handlers. */
export interface ActionSignature {
	/** Unique identifier for this signature. */
	uuid: string;
	/** Short action type identifier (e.g. "set_flag"). Referenced by `ExportAction.actionId`. */
	id: string;
	/** Human-readable description of what this action does. */
	label?: string;
	/** Parameter definitions describing the expected inputs. */
	params: SignatureParam[];
}

/**
 * Root container for exported blueprint data.
 *
 * @remarks
 * This is the top-level JSON structure exported by the LS-Dialog editor. Pass it to
 * `engine.init({ data })` to load and validate the blueprint. The engine indexes all scenes,
 * blocks, and connections internally — the original object is not mutated.
 *
 * The `locales` array lists all available languages. Call `engine.setLocale(code)` to store
 * the active locale — your handlers are responsible for reading the appropriate key from
 * `DialogBlock.dialogueText` and `ChoiceItem.dialogueText`.
 *
 * Use the optional `check` parameter in `init()` to cross-validate blueprint references
 * (signatures, dictionaries, characters) against your game's known capabilities.
 *
 * @example
 * ```ts
 * import blueprint from './blueprint.json';
 *
 * const engine = new DialogueEngine();
 * const report = engine.init({
 *   data: blueprint as BlueprintExport,
 *   check: {
 *     signatures: ['set_flag', 'play_sound'],
 *     characters: ['Alice', 'Bob'],
 *   },
 * });
 *
 * if (report.errors.length > 0) {
 *   console.error('Invalid blueprint:', report.errors);
 * }
 * ```
 *
 * @see {@link BlueprintScene} for scene structure
 * @see {@link ActionSignature} for action type definitions
 * @see {@link Dictionary} for dictionary groups
 * @see {@link DiagnosticReport} for validation results
 */
export interface BlueprintExport {
	/** Schema version of this export format. */
	version: string;
	/** ISO 8601 timestamp of when this export was generated. */
	exportDate: string;
	/** Name of the LSDE project. */
	projectName?: string;
	/** Primary language locale code (e.g. "fr", "en"). */
	primaryLanguage?: string;
	/** All language locale codes included in this export. */
	locales: string[];
	/** Dictionary groups for conditions and action parameters. */
	dictionaries?: Dictionary[];
	/** Action signature definitions describing available action types. */
	signatures?: ActionSignature[];
	/** All exported scenes. */
	scenes: BlueprintScene[];
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
	/** Known action signature IDs in your game. Blueprint actions referencing unknown IDs will produce warnings. */
	signatures?: string[];
	/** Known dictionary groups and their row keys. Blueprint references to unknown groups/keys will produce warnings. */
	dictionaries?: Record<string, string[]>;
	/** Known character names in your game. Blueprint blocks referencing unknown characters will produce warnings. */
	characters?: string[];
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
	character: BlockCharacter | undefined;
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
	 * All choices with optional visibility tags. When `engine.setChoiceFilter()` is configured,
	 * each choice is tagged `visible: true | false`. Filter with `choices.filter(c => c.visible !== false)`.
	 * Without a filter, `visible` is `undefined` and all choices pass.
	 */
	choices: RuntimeChoiceItem[];
	/** Select a choice by UUID. The engine follows the matching port. */
	selectChoice: (choiceUuid: string) => void;
}

/** Context for CONDITION block handlers. */
export interface ConditionContext extends BaseBlockContext {
	/** Resolve the condition: true → port index 0, false → port index 1. */
	resolve: (result: boolean) => void;
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
 * @see {@link BlockCharacter} for character data
 * @see {@link ValidateNextBlockArgs} for usage
 */
export interface ValidateNextBlockContext {
	/** Character resolved for this block, or `undefined` if none. */
	character: BlockCharacter | undefined;
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
 * @see {@link BlockCharacter} for character data
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
	evaluateCondition(condition: ExportCondition): boolean;
	/** Override character resolution for this scene. Defaults to engine-level resolver. */
	onResolveCharacter(fn: (characters: BlockCharacter[]) => BlockCharacter | undefined): void;
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
	/** Register a global handler for CHOICE blocks. All choices are provided, tagged with `visible` when `setChoiceFilter()` is configured. */
	onChoice(handler: ChoiceHandler): void;
	/** Register a global handler for CONDITION blocks. The developer MUST handle evaluation in this handler. */
	onCondition(handler: ConditionHandler): void;
	/** Register a global handler for ACTION blocks. The developer MUST handle execution in this handler. */
	onAction(handler: ActionHandler): void;

	// ── Character resolution ────────────────────────────────────────────

	/** Register a global character resolver. Called for every block with `metadata.characters`. */
	onResolveCharacter(fn: (characters: BlockCharacter[]) => BlockCharacter | undefined): void;

	// ── Choice visibility ────────────────────────────────────────────────

	/**
	 * Install a condition evaluator for choice visibility tagging.
	 * When set, the engine evaluates each choice's `visibilityConditions` before calling `onChoice`,
	 * tagging each choice with `visible: true | false`. The engine handles `choice:` conditions
	 * internally via choice history — this callback evaluates game-state conditions only.
	 */
	setChoiceFilter(evaluator: (condition: ExportCondition) => boolean): void;

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
	/** CONDITION blocks only — evaluation result. `true` → port index 0, `false` → port index 1. */
	conditionResult?: boolean;
	/** ACTION blocks only — if `true`, the resolver looks for a `catch` port before falling back to `then`. */
	actionRejected?: boolean;
	/** DIALOG blocks with `portPerCharacter` — character index in metadata.characters to match against `connection.fromPortIndex`. */
	characterPortIndex?: number;
}

/** Result of port resolution — all matching connections. */
export interface PortResolutionResult {
	connections: BlueprintConnection[];
}
