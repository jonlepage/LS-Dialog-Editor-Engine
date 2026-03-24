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
 * The engine passes each condition to {@link StateBridge.evaluateCondition} individually.
 * The StateBridge is responsible for interpreting `key`, `operator`, and `value` against
 * your game state — the engine only handles the chaining logic.
 *
 * @see {@link ConditionBlock} for condition blocks
 * @see {@link ChoiceItem.visibilityConditions} for choice filtering
 * @see {@link StateBridge.evaluateCondition} for evaluation callback
 */
export interface ExportCondition {
	/** Unique identifier for this condition instance. */
	uuid: string;
	/** State key to evaluate (e.g. "has_item", "player_level"). Resolved by `StateBridge.evaluateCondition()`. */
	key: string;
	/** Logical chaining with the previous condition: `'|'` (OR) or `'&'` (AND). Defaults to AND if omitted. Ignored on the first condition in a chain. */
	chain?: '|' | '&';
	/** Comparison operator (e.g. "==", "!=", ">", "<", ">=", "<="). Interpretation is up to `StateBridge.evaluateCondition()`. */
	operator: string;
	/** Value to compare against. Always a string — the StateBridge is responsible for type coercion. */
	value: string;
}

/** Action triggered during block execution. */
export interface ExportAction {
	/** Unique identifier for this action instance. */
	uuid: string;
	/** Action type identifier matching an `ActionSignature.id` (e.g. "set_flag", "play_sound"). */
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
 * LSDE native execution properties controlling how a block is dispatched by the engine.
 *
 * @remarks
 * These properties affect the engine's execution flow, not the block's content:
 *
 * - **Async tracks**: When `isAsync = true`, the block runs on a parallel track independent
 *   of the main flow. Async tracks skip `onBeforeBlock`, follow only one connection, and are
 *   automatically cancelled when the scene ends.
 *
 * - **followNarrative**: Only meaningful when `isAsync = true`. The async track waits for
 *   the main flow to advance before continuing. If `next()` was already called in the handler,
 *   the pending advance executes immediately; otherwise the block is force-advanced (skipped).
 *
 * - **delay**: Consumed by `onBeforeBlock` — the engine does not enforce it automatically.
 *   Your `onBeforeBlock` handler should read `block.nativeProperties.delay` and call
 *   `resolve()` after the delay.
 *
 * - **portPerCharacter**: Creates one output port per character in `metadata.characters`.
 *   The DIALOG handler must call `context.resolveCharacterPort(name)` to pick which port
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
	/** When true (requires `isAsync`), this async track advances automatically when the main track advances. If `next()` was already called, the pending advance executes; otherwise the block is force-advanced (skipped). */
	followNarrative?: boolean;
}

/** Character (actor) assigned to a dialogue block. */
export interface BlockCharacter {
	/** Character display name. */
	name: string;
	/** Optional portrait/avatar image path. */
	image?: string;
	/** Emotion label for the character in this block (e.g. "happy", "angry"). */
	emotion?: string;
	/** Emotion intensity from 0 (neutral) to 1 (maximum). */
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
 * The character is resolved by {@link StateBridge.resolveCharacter} and exposed as `context.character` in the handler.
 * When `nativeProperties.portPerCharacter` is enabled, each character gets a dedicated output port
 * and the handler must call `context.resolveCharacterPort(name)` to select which port to follow.
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
 * Before the handler is called, the engine filters `choices` through their `visibilityConditions`
 * using {@link StateBridge.evaluateCondition}. The handler receives only visible choices via
 * `context.choices`.
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
 * If no `onCondition` handler is registered, the engine automatically evaluates the `conditions`
 * array using {@link StateBridge.evaluateCondition}. Conditions are chained left-to-right with
 * no operator precedence: `'&'` = AND, `'|'` = OR. An empty array evaluates to `true`.
 *
 * The result maps to output ports: `true` follows port index 0, `false` follows port index 1.
 * When using a handler, call `context.resolve(result)` to set the branch direction.
 *
 * @example
 * ```ts
 * // Custom handler — overrides StateBridge auto-evaluation
 * engine.onCondition(({ block, context, next }) => {
 *   const result = myCustomEvaluator(block.conditions ?? []);
 *   context.resolve(result); // true → port 0, false → port 1
 *   next();
 * });
 * ```
 *
 * @see {@link ExportCondition} for condition structure and chaining rules
 * @see {@link ConditionContext} for handler context
 * @see {@link StateBridge.evaluateCondition} for automatic evaluation
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
 * If no `onAction` handler is registered, the engine automatically executes each action in the
 * `actions` array using {@link StateBridge.executeAction}, passing the matching
 * {@link ActionSignature} when available.
 *
 * The block has two output ports: `"then"` (success) and `"catch"` (failure). When using a
 * handler, call `context.resolve()` for success or `context.reject(error)` for failure. If no
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
 * @see {@link StateBridge.executeAction} for automatic execution
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

/**
 * Bridge between the dialogue engine and your game state.
 *
 * @remarks
 * The StateBridge connects blueprint-driven conditions, actions, and dictionary lookups to
 * your game's runtime state. It complements the handler system — handlers (`onDialog`,
 * `onChoice`, etc.) control UI and game flow, while the StateBridge provides data-level
 * evaluation and execution.
 *
 * The engine calls StateBridge methods **automatically** in these situations:
 *
 * | Situation | Method called |
 * |-----------|---------------|
 * | CONDITION block without `onCondition` handler | `evaluateCondition()` |
 * | Choice `visibilityConditions` filtering | `evaluateCondition()` (always, even with an `onCondition` handler) |
 * | ACTION block without `onAction` handler | `executeAction()` |
 * | Dictionary parameter resolution | `resolveDictionary()` |
 *
 * If you register an `onCondition` handler, it replaces auto-evaluation for **CONDITION blocks
 * only**. Choice visibility filtering still calls `evaluateCondition()` regardless.
 * Similarly, an `onAction` handler replaces auto-execution for ACTION blocks only.
 *
 * @example
 * ```ts
 * const bridge: StateBridge = {
 *   evaluateCondition: (cond) => {
 *     const val = gameState.get(cond.key);
 *     switch (cond.operator) {
 *       case '==': return val === cond.value;
 *       case '!=': return val !== cond.value;
 *       default:   return false;
 *     }
 *   },
 *   executeAction: (action, signature) => {
 *     gameActions.dispatch(action.actionId, action.params);
 *   },
 *   resolveDictionary: (group, key) => {
 *     return gameData.dictionaries[group]?.[key] ?? key;
 *   },
 *   resolveCharacter: (characters) => {
 *     return characters.find(c => party.includes(c.name));
 *   },
 * };
 * engine.setStateBridge(bridge);
 * ```
 *
 * @see {@link ExportCondition} for condition structure
 * @see {@link ExportAction} for action structure
 * @see {@link ActionSignature} for action type definitions
 */
export interface StateBridge {
	/** Evaluate a single condition against your game state. Return `true` if the condition passes. Called for CONDITION blocks (auto-evaluation) and choice visibility filtering. */
	evaluateCondition: (condition: ExportCondition) => boolean;
	/** Execute a game action. Called for ACTION blocks when no `onAction` handler is registered. The matching `signature` is provided when available in the blueprint. */
	executeAction: (action: ExportAction, signature?: ActionSignature) => void;
	/** Resolve a dictionary value by group label and row key. Used when evaluating condition values or action parameters that reference dictionaries. */
	resolveDictionary: (groupLabel: string, rowKey: string) => string | number | boolean;
	/** Resolve which character to use for a block. Called for every block with the characters from `metadata.characters` (may be empty). Return the chosen character or `undefined` if none applies. */
	resolveCharacter: (characters: BlockCharacter[]) => BlockCharacter | undefined;
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
	/** Character resolved by {@link StateBridge.resolveCharacter} for this block, or `undefined` if none. */
	character: BlockCharacter | undefined;
	/** Prevent the global (Tier 1) handler from executing after this scene handler. */
	preventGlobalHandler: () => void;
}

/** Context for DIALOG block handlers. */
export interface DialogContext extends BaseBlockContext {
	/** When portPerCharacter is enabled, specify which character port to follow. */
	resolveCharacterPort: (characterName: string) => void;
}

/** Context for CHOICE block handlers. */
export interface ChoiceContext extends BaseBlockContext {
	/** Visible choices (already filtered by visibilityConditions via StateBridge). */
	choices: ChoiceItem[];
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

/** Arguments for the onValidateNextBlock handler. */
export interface ValidateNextBlockArgs {
	nextBlock: BlueprintBlock;
	fromBlock: BlueprintBlock | null;
	port: string | null;
	context: SceneContext;
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

	/** Get the full choice history for this scene. Keys are block UUIDs, values are arrays of selected choice UUIDs. */
	getChoiceHistory(): ReadonlyMap<string, readonly string[]>;
	/** Get the choice(s) selected at a specific block. Returns undefined if block never visited as choice. */
	getChoice( blockUuid: string ): readonly string[] | undefined;
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
 * @see {@link StateBridge} for game state integration
 */
export interface IDialogueEngine {
	// ── Initialization ──────────────────────────────────────────────────

	/** Validate blueprint data, build internal graph, return diagnostic report. */
	init(options: InitOptions): DiagnosticReport;
	/** Set the active locale for text resolution. */
	setLocale(locale: string): void;
	/** Set the bridge between the engine and the game state. */
	setStateBridge(bridge: StateBridge): void;

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
	/** Register a global handler for CHOICE blocks. Choices are pre-filtered by visibilityConditions. */
	onChoice(handler: ChoiceHandler): void;
	/** Register a global handler for CONDITION blocks. If absent, the engine auto-evaluates via StateBridge. */
	onCondition(handler: ConditionHandler): void;
	/** Register a global handler for ACTION blocks. If absent, the engine auto-executes via StateBridge. */
	onAction(handler: ActionHandler): void;

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
