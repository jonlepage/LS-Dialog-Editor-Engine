// LSDE Dialog Engine — Type definitions
// All interfaces and types for the engine.
// Implementation: PLAN.md §3, §8
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

/** Condition evaluated to control dialogue flow or choice visibility. Conditions are evaluated left-to-right with no operator precedence; an empty array passes (returns true). */
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

/** LSDE native execution properties for a block. */
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

/** Common properties shared by all block types. Use the `type` field to narrow to a specific block type. */
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

/** Dialog block — displays text spoken by a character. */
export interface DialogBlock extends BlueprintBlockBase {
	type: 'DIALOG';
	/** Hierarchical key for tree navigation and localization lookup. */
	structureKey?: string;
	/** Raw text content in the primary language. */
	content?: string;
	/** Localized text map: `{ locale -> text }`. */
	dialogueText?: Record<string, string>;
}

/** Choice block — presents selectable options to the player. */
export interface ChoiceBlock extends BlueprintBlockBase {
	type: 'CHOICE';
	/** Available player choices. Visibility is filtered at runtime via `visibilityConditions`. */
	choices?: ChoiceItem[];
	/** Designer note. Not displayed to players. */
	note?: string;
}

/** Condition block — evaluates logic to branch the flow. True → port index 0, false → port index 1. */
export interface ConditionBlock extends BlueprintBlockBase {
	type: 'CONDITION';
	/** Conditions to evaluate. Chained left-to-right with `chain` operators. */
	conditions?: ExportCondition[];
	/** Designer note. Not displayed to players. */
	note?: string;
}

/** Action block — triggers game state changes. */
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

/** A scene containing a group of related dialogue blocks and their connections. */
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

/** Root container for exported blueprint data. Contains all scenes, dictionaries, signatures, and metadata. */
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

/** Result of `engine.init()` — validation report. @see PLAN.md §3.1 */
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

/** Bridge between the engine and the game state. @see PLAN.md §3.2 */
export interface StateBridge {
	evaluateCondition: (condition: ExportCondition) => boolean;
	executeAction: (action: ExportAction, signature?: ActionSignature) => void;
	resolveDictionary: (groupLabel: string, rowKey: string) => string | number | boolean;
}

/** Result of block validation. @see PLAN.md §3.3 */
export interface ValidationResult {
	/** Whether the block passed validation. When `false`, the `onInvalidateBlock` handler is called. */
	valid: boolean;
	/** Reason for validation failure. Passed to `InvalidateBlockArgs.reason` when `valid` is `false`. */
	reason?: string;
}

/** Cleanup function returned by a block handler, called when leaving the block. */
export type CleanupFn = () => void;

// ─── Context Types ───────────────────────────────────────────────────────────

/** Base context available to all block handlers. @see PLAN.md §3.6 */
export interface BaseBlockContext {
	/** Prevent the global (Tier 1) handler from executing after this scene handler. */
	preventGlobalHandler: () => void;
}

/** Context for DIALOG block handlers. */
export interface DialogContext extends BaseBlockContext {
	/** First character assigned to this block, or null. */
	character: BlockCharacter | null;
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

/** Arguments passed to any block handler. @see PLAN.md §3.5 */
export interface BlockHandlerArgs<C extends BaseBlockContext> {
	/** The scene handle that owns this block. Use it to inspect state, cancel the scene, etc. */
	scene: SceneHandle;
	/** The block currently being executed. Narrow on `block.type` for type-specific fields. */
	block: BlueprintBlock;
	/** Type-specific context providing actions for this block (e.g. selectChoice, resolve). */
	context: C;
	/** Advance the flow to the next block. Must be called exactly once to continue traversal. */
	next: () => void;
}

/** A block handler function. May return a cleanup function. @see PLAN.md §3.5 */
export type BlockHandler<C extends BaseBlockContext> = (args: BlockHandlerArgs<C>) => CleanupFn | void;

/** Arguments for the onValidateNextBlock handler. @see PLAN.md §3.3 */
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

/** Arguments for the onBeforeBlock handler. @see PLAN.md §3.4 */
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

/** Handler for scene enter/exit events. @see PLAN.md §3.7 */
export type SceneLifecycleHandler = (args: SceneLifecycleArgs) => void;

// ─── SceneHandle Interface ──────────────────────────────────────────────────

/** Public interface for a scene handle. @see PLAN.md §3.8 */
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
	onBlock(blockUuid: string, handler: BlockHandler<BaseBlockContext>): void;
	/** Override all DIALOG blocks for this scene. */
	onDialog(handler: BlockHandler<DialogContext>): void;
	/** Override all CHOICE blocks for this scene. */
	onChoice(handler: BlockHandler<ChoiceContext>): void;
	/** Override all CONDITION blocks for this scene. */
	onCondition(handler: BlockHandler<ConditionContext>): void;
	/** Override all ACTION blocks for this scene. */
	onAction(handler: BlockHandler<ActionContext>): void;

	/** Get the block currently being executed. */
	getCurrentBlock(): BlueprintBlock | null;
	/** Get UUIDs of all blocks visited so far. */
	getVisitedBlocks(): ReadonlySet<string>;
	/** Check if the scene flow is currently active. */
	isRunning(): boolean;
	/** Get the number of async tracks currently running in parallel. */
	getActiveTracks(): number;
}

// ─── Port Resolution Types ──────────────────────────────────────────────────

/** Input data for port resolution. @see PLAN.md §5 */
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
