// LSDE Dialog Engine — Public barrel export
// Build order: types → validator → graph → condition-evaluator → port-resolver
//              → handler-registry → block-context → scene-handle → engine

export { DialogueEngine } from './engine.js';

export type {
	// Blueprint data types
	BlockType,
	BlueprintExport, BlueprintScene, BlueprintBlock, BlueprintConnection, BlueprintBlockBase,
	DialogBlock, ChoiceBlock, ConditionBlock, ActionBlock, NoteBlock,
	ExportCondition, ExportAction, ChoiceItem,
	NativeProperties, BlockCharacter, BlockMetadata, BlockProperty, BlockScreenshot,
	Dictionary, DictionaryRow, ActionSignature, SignatureParam,

	// Engine types
	DiagnosticReport, DiagnosticEntry, DiagnosticStats,
	InitOptions, CheckOptions,
	StateBridge,
	ValidationResult, CleanupFn,

	// Context types
	BaseBlockContext, DialogContext, ChoiceContext, ConditionContext, ActionContext,
	BeforeBlockContext, SceneContext,

	// Handler types
	BlockHandlerArgs, BlockHandler,
	ValidateNextBlockArgs, ValidateNextBlockHandler,
	InvalidateBlockArgs, InvalidateBlockHandler,
	BeforeBlockArgs, BeforeBlockHandler,
	SceneLifecycleArgs, SceneLifecycleHandler,

	// Scene handle & engine interface
	SceneHandle,
	IDialogueEngine,

	// Port resolution
	PortResolutionInput, PortResolutionResult,
} from './types.js';
