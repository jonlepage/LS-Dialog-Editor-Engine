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

/** Directed connection between two blocks in the blueprint. */
export interface BlueprintConnection {
	id: string;
	fromId: string;
	toId: string;
	fromPort: string;
	toPort: string;
	fromPortIndex?: number;
}

/** Generic key-value property attached to a block. */
export interface BlockProperty {
	key: string;
	value: string | number | boolean;
}

/** Condition evaluated to control dialogue flow or choice visibility. */
export interface ExportCondition {
	uuid: string;
	key: string;
	chain?: '|' | '&';
	operator: string;
	value: string;
}

/** Action triggered during block execution. */
export interface ExportAction {
	uuid: string;
	actionId: string;
	params: (string | number | boolean)[];
}

/** Player choice option within a choice block. */
export interface ChoiceItem {
	uuid: string;
	structureKey: string;
	label?: string;
	dialogueText?: Record<string, string>;
	visibilityConditions?: ExportCondition[];
}

/** LSDE native execution properties for a block. */
export interface NativeProperties {
	isAsync?: boolean;
	delay?: number;
	timeout?: number;
	debug?: boolean;
	portPerCharacter?: boolean;
	skipIfMissingActor?: boolean;
}

/** Character (actor) assigned to a dialogue block. */
export interface BlockCharacter {
	name: string;
	image?: string;
	emotion?: string;
	emotionIntensity?: number;
}

/** Screenshot captured from the editor. */
export interface BlockScreenshot {
	src: string;
	note?: string;
}

/** Non-logic metadata for display and organization. */
export interface BlockMetadata {
	color?: string;
	comments?: string;
	tags?: string[];
	screenShots?: BlockScreenshot[];
	characters?: BlockCharacter[];
	others?: Record<string, string | number | boolean | (string | number | boolean)[]>;
}

/** Common properties shared by all block types. */
export interface BlueprintBlockBase {
	uuid: string;
	type: BlockType;
	label?: string;
	parentLabels?: string[];
	properties: BlockProperty[];
	userProperties?: Record<string, string | number | boolean>;
	nativeProperties?: NativeProperties;
	metadata?: BlockMetadata;
	isStartBlock?: boolean;
}

/** Dialog block — displays text spoken by a character. */
export interface DialogBlock extends BlueprintBlockBase {
	type: 'DIALOG';
	structureKey?: string;
	content?: string;
	dialogueText?: Record<string, string>;
}

/** Choice block — presents selectable options to the player. */
export interface ChoiceBlock extends BlueprintBlockBase {
	type: 'CHOICE';
	choices?: ChoiceItem[];
	note?: string;
}

/** Condition block — evaluates logic to branch the flow. */
export interface ConditionBlock extends BlueprintBlockBase {
	type: 'CONDITION';
	conditions?: ExportCondition[];
	note?: string;
}

/** Action block — triggers game state changes. */
export interface ActionBlock extends BlueprintBlockBase {
	type: 'ACTION';
	actions?: ExportAction[];
	note?: string;
}

/** Note block — designer documentation, never executed. */
export interface NoteBlock extends BlueprintBlockBase {
	type: 'NOTE';
}

/** Discriminated union of all block types. Narrow on the `type` field. */
export type BlueprintBlock = DialogBlock | ChoiceBlock | ConditionBlock | ActionBlock | NoteBlock;

/** A scene containing dialogue blocks and their connections. */
export interface BlueprintScene {
	uuid: string;
	label: string;
	note?: string;
	entryBlockId?: string;
	date: string;
	blocks: BlueprintBlock[];
	connections: BlueprintConnection[];
}

/** Dictionary row entry. */
export interface DictionaryRow {
	key: string;
	note?: string;
}

/** Dictionary group for conditions and action parameters. */
export interface Dictionary {
	uuid: string;
	label?: string;
	valueType: 'string' | 'number' | 'boolean';
	rows: DictionaryRow[];
}

/** Parameter definition for an action signature. */
export interface SignatureParam {
	label?: string;
	type: 'boolean' | 'string' | 'number' | 'enum' | 'dictionary';
	dictionaryGroupUuid?: string;
	enumOptions?: { id: string; label?: string }[];
}

/** Action signature describing a reusable action type. */
export interface ActionSignature {
	uuid: string;
	id: string;
	label?: string;
	params: SignatureParam[];
}

/** Root container for exported blueprint data. */
export interface BlueprintExport {
	version: string;
	exportDate: string;
	projectName?: string;
	primaryLanguage?: string;
	locales: string[];
	dictionaries?: Dictionary[];
	signatures?: ActionSignature[];
	scenes: BlueprintScene[];
}

// ─── Engine Types ────────────────────────────────────────────────────────────

/** Single diagnostic entry (error or warning). */
export interface DiagnosticEntry {
	code: string;
	message: string;
	sceneId?: string;
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

/** Options for cross-validating blueprint data against game capabilities. */
export interface CheckOptions {
	signatures?: string[];
	dictionaries?: Record<string, string[]>;
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
	valid: boolean;
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
	/** Mark action as succeeded. Engine follows the `out` port. */
	resolve: () => void;
	/** Mark action as failed. Engine follows the `catch` port (fallback `out`). */
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
	/** ACTION blocks only — if `true`, the resolver looks for a `catch` port before falling back to `out`. */
	actionRejected?: boolean;
	/** DIALOG blocks with `portPerCharacter` — character name to match against `connection.fromPort`. */
	characterPort?: string;
}

/** Result of port resolution. */
export interface PortResolutionResult {
	connection: BlueprintConnection | null;
}
