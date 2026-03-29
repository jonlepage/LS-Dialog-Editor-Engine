// LSDE Dialog Engine — Type definitions (C# port of types.ts)
// All classes, enums, interfaces, and delegates for the engine.

using System;
using System.Collections.Generic;

namespace LsdeDialogEngine
{
    // ─── Blueprint Data Types (mirrors LSDE export) ─────────────────────────────

    /// <summary>All possible block types in a blueprint.</summary>
    public enum BlockType
    {
        DIALOG,
        CHOICE,
        CONDITION,
        ACTION,
        NOTE,
    }

    /// <summary>Directed connection between two blocks in the blueprint.
    /// Connections define the dialogue flow by linking output ports of source blocks
    /// to input ports of target blocks.</summary>
    public class BlueprintConnection
    {
        /// <summary>Unique identifier for this connection.</summary>
        public string Id { get; set; } = "";

        /// <summary>UUID of the source block.</summary>
        public string FromId { get; set; } = "";

        /// <summary>UUID of the target block.</summary>
        public string ToId { get; set; } = "";

        /// <summary>Output port identifier on the source block.
        /// For CHOICE blocks: the selected choice UUID. For ACTION blocks: "then" or "catch".</summary>
        public string FromPort { get; set; } = "";

        /// <summary>Input port identifier on the target block.</summary>
        public string ToPort { get; set; } = "";

        /// <summary>Zero-based index of the output port.
        /// For CONDITION blocks: 0 = true, 1 = false. For DIALOG with portPerCharacter: index of the character.</summary>
        public int? FromPortIndex { get; set; }
    }

    /// <summary>Generic key-value property attached to a block.</summary>
    public class BlockProperty
    {
        /// <summary>Property name or identifier.</summary>
        public string Key { get; set; } = "";

        /// <summary>Property value.</summary>
        public object Value { get; set; } = "";
    }

    /// <summary>Condition evaluated to control dialogue flow or choice visibility.
    /// <para>Conditions are evaluated left-to-right with no operator precedence. The Chain field
    /// on each condition determines how it combines with the accumulated result:
    /// empty list → true; first condition → raw result (Chain ignored);
    /// Chain = "&amp;" or absent → AND; Chain = "|" → OR.</para>
    /// <para>The developer is responsible for interpreting Key, Operator, and Value against
    /// the game state via the OnCondition handler — the engine only handles the chaining logic.</para></summary>
    public class ExportCondition
    {
        /// <summary>Unique identifier for this condition instance.</summary>
        public string Uuid { get; set; } = "";

        /// <summary>State key to evaluate (e.g. "has_item", "player_level"). Interpreted by the OnCondition handler.</summary>
        public string Key { get; set; } = "";

        /// <summary>Logical chaining with the previous condition: "|" (OR) or "&amp;" (AND). Defaults to AND if omitted.</summary>
        public string? Chain { get; set; }

        /// <summary>Comparison operator (e.g. "==", "!=", ">"). Interpretation is up to the OnCondition handler.</summary>
        public string Operator { get; set; } = "";

        /// <summary>Value to compare against. Always a string — the developer is responsible for type coercion.</summary>
        public string Value { get; set; } = "";
    }

    /// <summary>Action triggered during block execution.</summary>
    public class ExportAction
    {
        /// <summary>Unique identifier for this action instance.</summary>
        public string Uuid { get; set; } = "";

        /// <summary>Action type identifier matching an ActionSignature.Id (e.g. "set_flag", "play_sound").</summary>
        public string ActionId { get; set; } = "";

        /// <summary>UUID of the ActionSignature this action references.</summary>
        public string? SignatureUuid { get; set; }

        /// <summary>Ordered parameter values for the action, as defined by the matching ActionSignature.Params.</summary>
        public List<object> Params { get; set; } = new List<object>();
    }

    /// <summary>Player choice option within a choice block.</summary>
    public class ChoiceItem
    {
        /// <summary>Unique identifier for this choice.</summary>
        public string Uuid { get; set; } = "";

        /// <summary>Hierarchical key for localization lookup.</summary>
        public string StructureKey { get; set; } = "";

        /// <summary>Display label for editor reference.</summary>
        public string? Label { get; set; }

        /// <summary>Localized text map: { locale → text }.</summary>
        public Dictionary<string, string>? DialogueText { get; set; }

        /// <summary>Conditions controlling whether this choice is visible. If all pass (or none set), the choice is shown.</summary>
        public List<ExportCondition>? VisibilityConditions { get; set; }
    }

    /// <summary>Choice item with runtime visibility tag. Set by the engine when SetChoiceFilter() is configured.
    /// Use <c>Visible != false</c> to get visible choices (null = no filter installed = treat as visible).</summary>
    public class RuntimeChoiceItem : ChoiceItem
    {
        /// <summary>true = visible, false = hidden, null = no filter installed (treat as visible).</summary>
        public bool? Visible { get; set; }
    }

    /// <summary>LSDE native execution properties controlling how a block is dispatched by the engine.
    /// <para>These properties affect the engine's execution flow, not the block's content:</para>
    /// <para>- <b>IsAsync</b>: Block runs on a parallel track. Async tracks call OnBeforeBlock, can spawn sub-tracks, auto-cancel on scene end.</para>
    /// <para>- <b>WaitForBlocks</b>: Defers block progression until all listed block UUIDs have been visited.</para>
    /// <para>- <b>Delay</b>: Consumed by OnBeforeBlock — the engine does not enforce it automatically.</para>
    /// <para>- <b>PortPerCharacter</b>: One output port per character. The DIALOG handler must call ResolveCharacterPort().</para></summary>
    public class NativeProperties
    {
        /// <summary>Execute this block on a separate async track running in parallel with the main flow.</summary>
        public bool? IsAsync { get; set; }

        /// <summary>Delay in seconds before the block is executed. Applied by the OnBeforeBlock handler.</summary>
        public double? Delay { get; set; }

        /// <summary>Timeout in seconds for block execution.</summary>
        public double? Timeout { get; set; }

        /// <summary>Enable debug mode for this block (editor use).</summary>
        public bool? Debug { get; set; }

        /// <summary>One output port per character in Metadata.Characters. Handler calls ResolveCharacterPort() to pick which port to follow.</summary>
        public bool? PortPerCharacter { get; set; }

        /// <summary>Skip this block entirely if the assigned actor/character is missing at runtime.</summary>
        public bool? SkipIfMissingActor { get; set; }

        /// <summary>UUIDs of blocks that must have been visited before this block can progress.
        /// Enables precise synchronization of parallel async branches.</summary>
        public List<string>? WaitForBlocks { get; set; }

        /// <summary>Passive flag indicating this block should wait for explicit player input.
        /// The engine does NOT interpret this flag — it is exposed as-is to game handlers.</summary>
        public bool? WaitInput { get; set; }
    }

    /// <summary>Read-only snapshot of an async track's state.
    /// Returned by ISceneHandle.GetTrackInfos() for debug, rendering, and validation.</summary>
    public class TrackInfo
    {
        /// <summary>Unique auto-incremented identifier for this track within the scene. Main track is implicit (id 0).</summary>
        public int Id { get; set; }
        /// <summary>ID of the track that spawned this one. Null means spawned directly by the main track.</summary>
        public int? ParentTrackId { get; set; }
        /// <summary>UUID of the first block that started this track's execution.</summary>
        public string StartBlockUuid { get; set; } = "";
        /// <summary>UUID of the block currently being processed, or null if the track has not yet started.</summary>
        public string? CurrentBlockUuid { get; set; }
        /// <summary>Whether this track is still actively executing.</summary>
        public bool Running { get; set; }
    }

    /// <summary>Character (actor) assigned to a block.</summary>
    public class BlockCharacter
    {
        /// <summary>Internal UUID used by the dialog engine.</summary>
        public string Uuid { get; set; } = "";

        /// <summary>Game-side character identifier. Use this to look up the character in your game engine.</summary>
        public string Id { get; set; } = "";

        /// <summary>Display name for debugging and editor preview. Not intended for in-game display.</summary>
        public string Name { get; set; } = "";

        /// <summary>Emotion label (e.g. "happy", "angry", "sad").</summary>
        public string? Emotion { get; set; }

        /// <summary>Emotion intensity (e.g. 0 = neutral, higher = stronger).</summary>
        public double? EmotionIntensity { get; set; }
    }

    /// <summary>Screenshot or image captured from the editor for documentation.</summary>
    public class BlockScreenshot
    {
        /// <summary>Image source as a data URL (base64) or file path.</summary>
        public string Src { get; set; } = "";

        /// <summary>Optional caption or description.</summary>
        public string? Note { get; set; }
    }

    /// <summary>Non-logic metadata for display and organization. Should not affect game logic.</summary>
    public class BlockMetadata
    {
        /// <summary>Visual color coding (hex) assigned by the designer.</summary>
        public string? Color { get; set; }

        /// <summary>Free-form designer notes. Not displayed to players.</summary>
        public string? Comments { get; set; }

        /// <summary>Contextual tags for categorization and filtering.</summary>
        public List<string>? Tags { get; set; }

        /// <summary>Screenshots captured from the editor for this block.</summary>
        public List<BlockScreenshot>? ScreenShots { get; set; }

        /// <summary>Characters (actors) assigned to this block.</summary>
        public List<BlockCharacter>? Characters { get; set; }

        /// <summary>Additional designer-defined metadata key-value pairs.</summary>
        public Dictionary<string, object>? Others { get; set; }
    }

    /// <summary>Common properties shared by all block types.
    /// <para>All five block types (DialogBlock, ChoiceBlock, ConditionBlock, ActionBlock, NoteBlock)
    /// extend this base. Use the Type field to determine the concrete type, or use pattern matching.</para></summary>
    public abstract class BlueprintBlock
    {
        /// <summary>Unique block identifier.</summary>
        public string Uuid { get; set; } = "";

        /// <summary>Block type determining behavior and rendering.</summary>
        public BlockType Type { get; set; }

        /// <summary>Display label assigned in the editor.</summary>
        public string? Label { get; set; }

        /// <summary>Hierarchy of parent folder labels providing structural context.</summary>
        public List<string>? ParentLabels { get; set; }

        /// <summary>Custom key-value properties defined by block configuration.</summary>
        public List<BlockProperty> Properties { get; set; } = new List<BlockProperty>();

        /// <summary>User-defined custom properties dictionary set by the narrative designer.</summary>
        public Dictionary<string, object>? UserProperties { get; set; }

        /// <summary>LSDE native execution properties (async, delay, portPerCharacter, etc.).</summary>
        public NativeProperties? NativeProperties { get; set; }

        /// <summary>Non-logic metadata for display and organization.</summary>
        public BlockMetadata? Metadata { get; set; }

        /// <summary>When true, this block is the entry point of the scene. Only one per scene.</summary>
        public bool? IsStartBlock { get; set; }
    }

    /// <summary>Dialog block — displays text spoken by a character.
    /// <para>The character is resolved by OnResolveCharacter and exposed as Context.Character.
    /// When PortPerCharacter is enabled, the handler must call Context.ResolveCharacterPort(character.Uuid).</para></summary>
    public class DialogBlock : BlueprintBlock
    {
        /// <summary>Hierarchical key for tree navigation and localization lookup.</summary>
        public string? StructureKey { get; set; }

        /// <summary>Raw text content in the primary language.</summary>
        public string? Content { get; set; }

        /// <summary>Localized text map: { locale → text }.</summary>
        public Dictionary<string, string>? DialogueText { get; set; }
    }

    /// <summary>Choice block — presents selectable options to the player.
    /// <para>Context.Choices returns ALL choices — none are filtered out.
    /// When SetChoiceFilter() is configured, the engine tags each RuntimeChoiceItem with
    /// Visible = true/false. Filter with <c>choices.Where(c => c.Visible != false)</c>.
    /// Without a filter, Visible is null and all choices pass.</para>
    /// <para>The handler must call Context.SelectChoice(uuid) to pick a choice.</para></summary>
    public class ChoiceBlock : BlueprintBlock
    {
        /// <summary>Available player choices. Visibility is tagged at runtime via VisibilityConditions.</summary>
        public List<ChoiceItem>? Choices { get; set; }

        /// <summary>Designer note. Not displayed to players.</summary>
        public string? Note { get; set; }
    }

    /// <summary>Condition block — evaluates logic to branch the dialogue flow.
    /// <para>The developer MUST handle evaluation in the OnCondition handler.
    /// Call Context.Resolve(result): true → port index 0, false → port index 1.</para></summary>
    public class ConditionBlock : BlueprintBlock
    {
        /// <summary>Conditions to evaluate. Chained left-to-right with Chain operators.</summary>
        public List<ExportCondition>? Conditions { get; set; }

        /// <summary>Designer note. Not displayed to players.</summary>
        public string? Note { get; set; }
    }

    /// <summary>Action block — triggers game state changes.
    /// <para>The developer MUST handle execution in the OnAction handler.
    /// Two output ports: "then" (success) and "catch" (failure).
    /// Call Context.Resolve() for success or Context.Reject(error) for failure.
    /// If no "catch" connection exists, rejection falls back to "then".</para></summary>
    public class ActionBlock : BlueprintBlock
    {
        /// <summary>Actions to execute. Each references an ActionSignature via ActionId.</summary>
        public List<ExportAction>? Actions { get; set; }

        /// <summary>Designer note. Not displayed to players.</summary>
        public string? Note { get; set; }
    }

    /// <summary>Note block — designer documentation, never executed at runtime. Skipped during traversal.</summary>
    public class NoteBlock : BlueprintBlock { }

    /// <summary>A scene — an independent dialogue subgraph with its own entry point.
    /// <para>A scene is the unit of execution. Call engine.Scene(uuid) to get an ISceneHandle,
    /// then handle.Start() to begin traversal. Multiple scenes can run concurrently.</para></summary>
    public class BlueprintScene
    {
        /// <summary>Unique scene identifier.</summary>
        public string Uuid { get; set; } = "";

        /// <summary>Scene name assigned by the designer.</summary>
        public string Label { get; set; } = "";

        /// <summary>Scene-level designer notes.</summary>
        public string? Note { get; set; }

        /// <summary>UUID of the entry block for this scene.</summary>
        public string? EntryBlockId { get; set; }

        /// <summary>Scene creation or last modification date.</summary>
        public string Date { get; set; } = "";

        /// <summary>All blocks contained within this scene.</summary>
        public List<BlueprintBlock> Blocks { get; set; } = new List<BlueprintBlock>();

        /// <summary>All connections defining the dialogue flow in this scene.</summary>
        public List<BlueprintConnection> Connections { get; set; } =
            new List<BlueprintConnection>();
    }

    /// <summary>A single entry in a dictionary group.</summary>
    public class DictionaryRow
    {
        /// <summary>Key identifier referenced in conditions and action parameters.</summary>
        public string Key { get; set; } = "";

        /// <summary>Optional description for this dictionary entry.</summary>
        public string? Note { get; set; }
    }

    /// <summary>Dictionary group defining reusable key-value pairs for conditions and actions.</summary>
    public class LsdeDictionary
    {
        /// <summary>Unique identifier for this dictionary group.</summary>
        public string Uuid { get; set; } = "";

        /// <summary>Display name, used as prefix in condition keys (e.g. "groupLabel.rowKey").</summary>
        public string? Label { get; set; }

        /// <summary>Data type of values in this dictionary.</summary>
        public string ValueType { get; set; } = "string";

        /// <summary>All entries in this dictionary group.</summary>
        public List<DictionaryRow> Rows { get; set; } = new List<DictionaryRow>();
    }

    /// <summary>Enum option for a signature parameter.</summary>
    public class EnumOption
    {
        /// <summary>Option identifier.</summary>
        public string Id { get; set; } = "";

        /// <summary>Display label for this option.</summary>
        public string? Label { get; set; }
    }

    /// <summary>Parameter definition for an action signature.</summary>
    public class SignatureParam
    {
        /// <summary>Display label for this parameter.</summary>
        public string? Label { get; set; }

        /// <summary>Data type of this parameter.</summary>
        public string Type { get; set; } = "string";

        /// <summary>UUID of the dictionary group this parameter references. Only when Type is "dictionary".</summary>
        public string? DictionaryGroupUuid { get; set; }

        /// <summary>Available options when Type is "enum".</summary>
        public List<EnumOption>? EnumOptions { get; set; }
    }

    /// <summary>Action signature defining a reusable action type. Map Id to your engine's action handlers.</summary>
    public class ActionSignature
    {
        /// <summary>Unique identifier for this signature.</summary>
        public string Uuid { get; set; } = "";

        /// <summary>Short action type identifier (e.g. "set_flag"). Referenced by ExportAction.ActionId.</summary>
        public string Id { get; set; } = "";

        /// <summary>Human-readable description of what this action does.</summary>
        public string? Label { get; set; }

        /// <summary>Parameter definitions describing the expected inputs.</summary>
        public List<SignatureParam> Params { get; set; } = new List<SignatureParam>();
    }

    /// <summary>Root container for exported blueprint data.
    /// <para>Top-level JSON structure exported by the LS-Dialog editor. Pass it to
    /// engine.Init(options) to load and validate. The Locales list contains all available languages.
    /// Call engine.SetLocale(code) to set the active locale.</para></summary>
    public class BlueprintExport
    {
        /// <summary>Schema version of this export format.</summary>
        public string Version { get; set; } = "";

        /// <summary>ISO 8601 timestamp of when this export was generated.</summary>
        public string ExportDate { get; set; } = "";

        /// <summary>Name of the LSDE project.</summary>
        public string? ProjectName { get; set; }

        /// <summary>Primary language locale code (e.g. "fr", "en").</summary>
        public string? PrimaryLanguage { get; set; }

        /// <summary>All language locale codes included in this export.</summary>
        public List<string> Locales { get; set; } = new List<string>();

        /// <summary>Dictionary groups for conditions and action parameters.</summary>
        public List<LsdeDictionary>? Dictionaries { get; set; }

        /// <summary>Action signature definitions describing available action types.</summary>
        public List<ActionSignature>? Signatures { get; set; }

        /// <summary>All exported scenes.</summary>
        public List<BlueprintScene> Scenes { get; set; } = new List<BlueprintScene>();
    }

    // ─── Engine Types ────────────────────────────────────────────────────────────

    /// <summary>Single diagnostic entry (error or warning).</summary>
    public class DiagnosticEntry
    {
        /// <summary>Machine-readable error/warning code (e.g. "NO_ENTRY_BLOCK").</summary>
        public string Code { get; set; } = "";

        /// <summary>Human-readable description of the issue.</summary>
        public string Message { get; set; } = "";

        /// <summary>UUID of the scene where the issue was found, if applicable.</summary>
        public string? SceneId { get; set; }

        /// <summary>UUID of the block where the issue was found, if applicable.</summary>
        public string? BlockId { get; set; }
    }

    /// <summary>Aggregate statistics from blueprint validation.</summary>
    public class DiagnosticStats
    {
        public int SceneCount { get; set; }
        public int BlockCount { get; set; }
        public int ConnectionCount { get; set; }
    }

    /// <summary>Result of engine.Init() — validation report.</summary>
    public class DiagnosticReport
    {
        public List<DiagnosticEntry> Errors { get; set; } = new List<DiagnosticEntry>();
        public List<DiagnosticEntry> Warnings { get; set; } = new List<DiagnosticEntry>();
        public DiagnosticStats Stats { get; set; } = new DiagnosticStats();
    }

    /// <summary>Options for cross-validating blueprint data against game capabilities.
    /// When provided, the engine warns about references that don't match your game.</summary>
    public class CheckOptions
    {
        /// <summary>Known action signature IDs in your game.</summary>
        public List<string>? Signatures { get; set; }

        /// <summary>Known dictionary groups and their row keys.</summary>
        public Dictionary<string, List<string>>? Dictionaries { get; set; }

        /// <summary>Known character names in your game.</summary>
        public List<string>? Characters { get; set; }
    }

    /// <summary>Options passed to engine.Init().</summary>
    public class InitOptions
    {
        /// <summary>The blueprint data to load and validate.</summary>
        public BlueprintExport Data { get; set; } = new BlueprintExport();

        /// <summary>Optional cross-validation options.</summary>
        public CheckOptions? Check { get; set; }
    }

    /// <summary>Result of block validation.</summary>
    public class ValidationResult
    {
        /// <summary>Whether the block passed validation. When false, OnInvalidateBlock is called.</summary>
        public bool Valid { get; set; }

        /// <summary>Reason for validation failure.</summary>
        public string? Reason { get; set; }

        public static ValidationResult Ok() => new ValidationResult { Valid = true };

        public static ValidationResult Fail(string reason) =>
            new ValidationResult { Valid = false, Reason = reason };
    }

    // ─── Context Types ───────────────────────────────────────────────────────────

    /// <summary>Base context available to all block handlers.</summary>
    public interface IBaseBlockContext
    {
        /// <summary>Character resolved by OnResolveCharacter for this block, or null if none.</summary>
        BlockCharacter? Character { get; }

        /// <summary>Prevent the global (Tier 1) handler from executing after this scene handler.</summary>
        void PreventGlobalHandler();
    }

    /// <summary>Context for DIALOG block handlers.</summary>
    public interface IDialogContext : IBaseBlockContext
    {
        /// <summary>When PortPerCharacter is enabled, specify which character port to follow.
        /// Matches by character UUID first, then by name as fallback.</summary>
        void ResolveCharacterPort(string characterUuid);
    }

    /// <summary>Context for CHOICE block handlers.</summary>
    public interface IChoiceContext : IBaseBlockContext
    {
        /// <summary>All choices with optional visibility tags. When SetChoiceFilter() is configured,
        /// each choice is tagged Visible = true/false. Filter with <c>choices.Where(c => c.Visible != false)</c>.
        /// Without a filter, Visible is null and all choices pass.</summary>
        IReadOnlyList<RuntimeChoiceItem> Choices { get; }

        /// <summary>Select a choice by UUID. The engine follows the matching port.</summary>
        void SelectChoice(string choiceUuid);
    }

    /// <summary>Context for CONDITION block handlers.</summary>
    public interface IConditionContext : IBaseBlockContext
    {
        /// <summary>Resolve the condition: true → port index 0, false → port index 1.</summary>
        void Resolve(bool result);
    }

    /// <summary>Context for ACTION block handlers.</summary>
    public interface IActionContext : IBaseBlockContext
    {
        /// <summary>Mark action as succeeded. Engine follows the "then" port.</summary>
        void Resolve();

        /// <summary>Mark action as failed. Engine follows the "catch" port (fallback "then" if no catch port exists).</summary>
        void Reject(object? error);
    }

    /// <summary>Context passed to OnBeforeBlock handler.</summary>
    public class BeforeBlockContext
    {
        /// <summary>Pointer to the block's native execution properties, or null if none.</summary>
        public NativeProperties? NativeProperties { get; set; }
    }

    /// <summary>Context passed to scene lifecycle handlers. Extensible — reserved for future scene-level data.</summary>
    public class SceneContext { }

    // ─── Handler Args & Delegates ────────────────────────────────────────────────

    /// <summary>Arguments passed to any block handler.
    /// <para>The engine uses a two-tier handler system:
    /// Tier 2 (scene) is called first, Tier 1 (global) after — unless PreventGlobalHandler() is called.
    /// A block-specific override via OnBlock(uuid) takes highest priority.</para></summary>
    public class BlockHandlerArgs<TBlock, TContext>
        where TBlock : BlueprintBlock
        where TContext : IBaseBlockContext
    {
        /// <summary>The scene handle that owns this block.</summary>
        public ISceneHandle Scene { get; }

        /// <summary>The block being executed.</summary>
        public TBlock Block { get; }

        /// <summary>Type-specific context providing actions for this block.</summary>
        public TContext Context { get; }

        /// <summary>Advance the flow to the next block. Must be called exactly once.</summary>
        public Action Next { get; }

        public BlockHandlerArgs(ISceneHandle scene, TBlock block, TContext context, Action next)
        {
            Scene = scene;
            Block = block;
            Context = context;
            Next = next;
        }
    }

    /// <summary>Context attached to a block inside <see cref="ValidateNextBlockArgs"/>.
    /// The character is resolved by OnResolveCharacter before the validation handler is invoked.</summary>
    public class ValidateNextBlockContext
    {
        /// <summary>Character resolved for this block, or null if none.</summary>
        public BlockCharacter? Character { get; set; }
    }

    /// <summary>Arguments for OnValidateNextBlock handler.
    /// Called before each block is executed. Provides the resolved character for both
    /// the upcoming block (NextContext) and the previously executed block (FromContext).</summary>
    public class ValidateNextBlockArgs
    {
        /// <summary>The block about to be executed.</summary>
        public BlueprintBlock NextBlock { get; set; } = null!;

        /// <summary>The block that was just executed (null for the first block).</summary>
        public BlueprintBlock? FromBlock { get; set; }

        /// <summary>Context for the upcoming block (character, etc.).</summary>
        public ValidateNextBlockContext NextContext { get; set; } = new ValidateNextBlockContext();

        /// <summary>Context for the previous block, or null if this is the first block.</summary>
        public ValidateNextBlockContext? FromContext { get; set; }

        /// <summary>The port that was followed to reach NextBlock (reserved for future use).</summary>
        public string? Port { get; set; }
    }

    /// <summary>Arguments for OnInvalidateBlock handler.</summary>
    public class InvalidateBlockArgs
    {
        /// <summary>The scene handle owning the invalidated block.</summary>
        public ISceneHandle Scene { get; set; } = null!;

        /// <summary>Reason for validation failure.</summary>
        public string Reason { get; set; } = "";
    }

    /// <summary>Arguments for OnBeforeBlock handler.</summary>
    public class BeforeBlockArgs
    {
        /// <summary>The block about to be executed.</summary>
        public BlueprintBlock Block { get; set; } = null!;

        /// <summary>The scene handle owning this block.</summary>
        public ISceneHandle Scene { get; set; } = null!;

        /// <summary>Context with native properties.</summary>
        public BeforeBlockContext Context { get; set; } = new BeforeBlockContext();

        /// <summary>Call Resolve() to continue execution. Must be called exactly once.</summary>
        public Action Resolve { get; set; } = null!;
    }

    /// <summary>Arguments for scene lifecycle handlers.</summary>
    public class SceneLifecycleArgs
    {
        /// <summary>The scene handle for the entering/exiting scene.</summary>
        public ISceneHandle Scene { get; set; } = null!;

        /// <summary>Scene-level context (extensible).</summary>
        public SceneContext Context { get; set; } = new SceneContext();
    }

    /// <summary>Block handler delegate. May return a cleanup function called when leaving the block.</summary>
    public delegate Action? BlockHandler<TBlock, TContext>(BlockHandlerArgs<TBlock, TContext> args)
        where TBlock : BlueprintBlock
        where TContext : IBaseBlockContext;

    /// <summary>Handler for block validation. Return Ok() to continue, Fail() to invalidate.</summary>
    public delegate ValidationResult ValidateNextBlockHandler(ValidateNextBlockArgs args);

    /// <summary>Handler called when a block fails validation.</summary>
    public delegate void InvalidateBlockHandler(InvalidateBlockArgs args);

    /// <summary>Handler called before every block. Must call Resolve() to continue.</summary>
    public delegate void BeforeBlockHandler(BeforeBlockArgs args);

    /// <summary>Handler for scene enter/exit events.</summary>
    public delegate void SceneLifecycleHandler(SceneLifecycleArgs args);

    // ─── SceneHandle Interface ──────────────────────────────────────────────────

    /// <summary>Public interface for controlling a running scene.
    /// <para>Obtain an ISceneHandle by calling engine.Scene(sceneUuid). Register scene-specific
    /// (Tier 2) handlers, then call Start() to begin traversal from the entry block.</para>
    /// <para>Lifecycle: Start() → OnSceneEnter → blocks dispatched → scene ends → OnSceneExit.
    /// Scene-level handlers are called BEFORE global handlers. Both execute unless PreventGlobalHandler() is called.</para></summary>
    public interface ISceneHandle
    {
        /// <summary>Start the scene flow. Validates that all 4 mandatory handlers are registered — throws if any are missing.</summary>
        void Start();

        /// <summary>Cancel the scene flow. All async tracks are cancelled, cleanup runs, OnSceneExit fires.</summary>
        void Cancel();

        /// <summary>Override the global OnSceneEnter for this scene.</summary>
        void OnEnter(SceneLifecycleHandler handler);

        /// <summary>Override the global OnSceneExit for this scene.</summary>
        void OnExit(SceneLifecycleHandler handler);

        /// <summary>Override a specific block by UUID. Takes highest priority over type handlers.</summary>
        void OnBlock(string blockUuid, BlockHandler<BlueprintBlock, IBaseBlockContext> handler);

        /// <summary>Override all DIALOG blocks for this scene (Tier 2).</summary>
        void OnDialog(BlockHandler<DialogBlock, IDialogContext> handler);

        /// <summary>Override all CHOICE blocks for this scene (Tier 2).</summary>
        void OnChoice(BlockHandler<ChoiceBlock, IChoiceContext> handler);

        /// <summary>Override all CONDITION blocks for this scene (Tier 2).</summary>
        void OnCondition(BlockHandler<ConditionBlock, IConditionContext> handler);

        /// <summary>Override all ACTION blocks for this scene (Tier 2).</summary>
        void OnAction(BlockHandler<ActionBlock, IActionContext> handler);

        /// <summary>Get the block currently being executed, or null if scene is not running.</summary>
        BlueprintBlock? GetCurrentBlock();

        /// <summary>Get UUIDs of all blocks visited so far, in order.</summary>
        IReadOnlyCollection<string> GetVisitedBlocks();

        /// <summary>Check if the scene flow is currently active.</summary>
        bool IsRunning();

        /// <summary>Get the number of async tracks currently running in parallel.</summary>
        int GetActiveTracks();

        /// <summary>Get detailed info for all currently running async tracks.</summary>
        IReadOnlyList<TrackInfo> GetTrackInfos();

        /// <summary>Get the full choice history. Keys are block UUIDs, values are arrays of selected choice UUIDs.</summary>
        IReadOnlyDictionary<string, IReadOnlyList<string>> GetChoiceHistory();

        /// <summary>Get the choice(s) selected at a specific block. Returns null if block never visited as choice.</summary>
        IReadOnlyList<string>? GetChoice(string blockUuid);

        /// <summary>Evaluate a condition. Handles choice: conditions via internal choice history. Returns false for non-choice conditions.</summary>
        bool EvaluateCondition(ExportCondition condition);

        /// <summary>Override character resolution for this scene. Defaults to engine-level resolver.</summary>
        void OnResolveCharacter(Func<List<BlockCharacter>, BlockCharacter?> resolver);
    }

    // ─── Dialogue Engine Interface ─────────────────────────────────────────────

    /// <summary>Public contract for the LSDE dialogue engine.
    /// <para>Top-level entry point managing blueprint loading, global handler registration, and scene creation.</para></summary>
    public interface IDialogueEngine
    {
        /// <summary>Validate blueprint data, build internal graph, return diagnostic report.</summary>
        DiagnosticReport Init(InitOptions options);

        /// <summary>Set the active locale for text resolution. Validates against blueprint.Locales. Syncs LsdeUtils.Locale.</summary>
        void SetLocale(string locale);

        /// <summary>Install a condition evaluator for choice visibility tagging. The engine handles choice: conditions internally via choice history — this callback evaluates game-state conditions only.</summary>
        void SetChoiceFilter(Func<ExportCondition, bool> evaluator);

        /// <summary>Register a global character resolver. Called for every block with Metadata.Characters. Default: first character.</summary>
        void OnResolveCharacter(Func<List<BlockCharacter>, BlockCharacter?> resolver);

        /// <summary>Register a handler called before each block to validate it.</summary>
        void OnValidateNextBlock(ValidateNextBlockHandler handler);

        /// <summary>Register a handler called when a block fails validation.</summary>
        void OnInvalidateBlock(InvalidateBlockHandler handler);

        /// <summary>Register a handler called before every block. Must call Resolve() to continue.</summary>
        void OnBeforeBlock(BeforeBlockHandler handler);

        /// <summary>Register a global handler for DIALOG blocks. May return a cleanup function.</summary>
        void OnDialog(BlockHandler<DialogBlock, IDialogContext> handler);

        /// <summary>Register a global handler for CHOICE blocks. Choices are tagged with Visible when SetChoiceFilter() is configured.</summary>
        void OnChoice(BlockHandler<ChoiceBlock, IChoiceContext> handler);

        /// <summary>Register a global handler for CONDITION blocks. The developer MUST handle evaluation.</summary>
        void OnCondition(BlockHandler<ConditionBlock, IConditionContext> handler);

        /// <summary>Register a global handler for ACTION blocks. The developer MUST handle execution.</summary>
        void OnAction(BlockHandler<ActionBlock, IActionContext> handler);

        /// <summary>Register a handler called when any scene starts.</summary>
        void OnSceneEnter(SceneLifecycleHandler handler);

        /// <summary>Register a handler called when any scene ends (natural or cancelled).</summary>
        void OnSceneExit(SceneLifecycleHandler handler);

        /// <summary>Create a scene handle. Does NOT start the flow — call handle.Start().</summary>
        ISceneHandle Scene(string sceneId);

        /// <summary>Stop all active scenes.</summary>
        void Stop();

        /// <summary>True if at least one scene is active.</summary>
        bool IsRunning();

        /// <summary>Get all currently active scene handles.</summary>
        List<ISceneHandle> GetActiveScenes();

        /// <summary>Get the current block of every active scene.</summary>
        List<BlueprintBlock> GetCurrentBlocks();

        /// <summary>Get connections for a scene.</summary>
        List<BlueprintConnection> GetSceneConnections(string sceneId);
    }

    // ─── Port Resolution Types ──────────────────────────────────────────────────

    /// <summary>Input data for port resolution. The block's Type determines the routing rules.</summary>
    public class PortResolutionInput
    {
        /// <summary>The block whose output port is being resolved.</summary>
        public BlueprintBlock Block { get; set; } = null!;

        /// <summary>All outgoing connections from this block.</summary>
        public List<BlueprintConnection> Connections { get; set; } =
            new List<BlueprintConnection>();

        /// <summary>CHOICE blocks only — UUID of the selected choice.</summary>
        public string? SelectedChoiceUuid { get; set; }

        /// <summary>CONDITION blocks only — true → port 0, false → port 1.</summary>
        public bool? ConditionResult { get; set; }

        /// <summary>ACTION blocks only — if true, resolver looks for "catch" port first.</summary>
        public bool? ActionRejected { get; set; }

        /// <summary>DIALOG blocks with PortPerCharacter — character index.</summary>
        public int? CharacterPortIndex { get; set; }
    }

    /// <summary>Result of port resolution — all matching connections.</summary>
    public class PortResolutionResult
    {
        public List<BlueprintConnection> Connections { get; }

        public PortResolutionResult(List<BlueprintConnection> connections)
        {
            Connections = connections;
        }

        private static readonly PortResolutionResult _none = new PortResolutionResult(
            new List<BlueprintConnection>()
        );
        public static PortResolutionResult None => _none;
    }
}
