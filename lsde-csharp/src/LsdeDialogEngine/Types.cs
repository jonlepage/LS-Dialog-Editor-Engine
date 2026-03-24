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
        NOTE
    }

    /// <summary>Directed connection between two blocks in the blueprint.</summary>
    public class BlueprintConnection
    {
        public string Id { get; set; } = "";
        public string FromId { get; set; } = "";
        public string ToId { get; set; } = "";
        public string FromPort { get; set; } = "";
        public string ToPort { get; set; } = "";
        public int? FromPortIndex { get; set; }
    }

    /// <summary>Generic key-value property attached to a block.</summary>
    public class BlockProperty
    {
        public string Key { get; set; } = "";
        public object Value { get; set; } = "";
    }

    /// <summary>Condition evaluated to control dialogue flow or choice visibility.</summary>
    public class ExportCondition
    {
        public string Uuid { get; set; } = "";
        public string Key { get; set; } = "";
        public string? Chain { get; set; }
        public string Operator { get; set; } = "";
        public string Value { get; set; } = "";
    }

    /// <summary>Action triggered during block execution.</summary>
    public class ExportAction
    {
        public string Uuid { get; set; } = "";
        public string ActionId { get; set; } = "";
        public List<object> Params { get; set; } = new List<object>();
    }

    /// <summary>Player choice option within a choice block.</summary>
    public class ChoiceItem
    {
        public string Uuid { get; set; } = "";
        public string StructureKey { get; set; } = "";
        public string? Label { get; set; }
        public Dictionary<string, string>? DialogueText { get; set; }
        public List<ExportCondition>? VisibilityConditions { get; set; }
    }

    /// <summary>LSDE native execution properties for a block.</summary>
    public class NativeProperties
    {
        public bool? IsAsync { get; set; }
        public double? Delay { get; set; }
        public double? Timeout { get; set; }
        public bool? Debug { get; set; }
        public bool? PortPerCharacter { get; set; }
        public bool? SkipIfMissingActor { get; set; }
        public bool? FollowNarrative { get; set; }
    }

    /// <summary>Character (actor) assigned to a dialogue block.</summary>
    public class BlockCharacter
    {
        public string Name { get; set; } = "";
        public string? Image { get; set; }
        public string? Emotion { get; set; }
        public double? EmotionIntensity { get; set; }
    }

    /// <summary>Screenshot or image captured from the editor.</summary>
    public class BlockScreenshot
    {
        public string Src { get; set; } = "";
        public string? Note { get; set; }
    }

    /// <summary>Non-logic metadata for display and organization.</summary>
    public class BlockMetadata
    {
        public string? Color { get; set; }
        public string? Comments { get; set; }
        public List<string>? Tags { get; set; }
        public List<BlockScreenshot>? ScreenShots { get; set; }
        public List<BlockCharacter>? Characters { get; set; }
        public Dictionary<string, object>? Others { get; set; }
    }

    /// <summary>Base class for all blueprint blocks. Use typed subclasses for block-specific data.</summary>
    public abstract class BlueprintBlock
    {
        public string Uuid { get; set; } = "";
        public BlockType Type { get; set; }
        public string? Label { get; set; }
        public List<string>? ParentLabels { get; set; }
        public List<BlockProperty> Properties { get; set; } = new List<BlockProperty>();
        public Dictionary<string, object>? UserProperties { get; set; }
        public NativeProperties? NativeProperties { get; set; }
        public BlockMetadata? Metadata { get; set; }
        public bool? IsStartBlock { get; set; }
    }

    /// <summary>A dialogue block displaying text from a character.</summary>
    public class DialogBlock : BlueprintBlock
    {
        public string? StructureKey { get; set; }
        public string? Content { get; set; }
        public Dictionary<string, string>? DialogueText { get; set; }
    }

    /// <summary>A choice block presenting player options.</summary>
    public class ChoiceBlock : BlueprintBlock
    {
        public List<ChoiceItem>? Choices { get; set; }
        public string? Note { get; set; }
    }

    /// <summary>A condition block evaluating game state to branch the flow.</summary>
    public class ConditionBlock : BlueprintBlock
    {
        public List<ExportCondition>? Conditions { get; set; }
        public string? Note { get; set; }
    }

    /// <summary>An action block triggering game-side effects.</summary>
    public class ActionBlock : BlueprintBlock
    {
        public List<ExportAction>? Actions { get; set; }
        public string? Note { get; set; }
    }

    /// <summary>A designer-only note block. Skipped during traversal.</summary>
    public class NoteBlock : BlueprintBlock
    {
    }

    /// <summary>A scene containing blocks and their connections.</summary>
    public class BlueprintScene
    {
        public string Uuid { get; set; } = "";
        public string Label { get; set; } = "";
        public string? Note { get; set; }
        public string? EntryBlockId { get; set; }
        public string Date { get; set; } = "";
        public List<BlueprintBlock> Blocks { get; set; } = new List<BlueprintBlock>();
        public List<BlueprintConnection> Connections { get; set; } = new List<BlueprintConnection>();
    }

    /// <summary>A single entry in a dictionary group.</summary>
    public class DictionaryRow
    {
        public string Key { get; set; } = "";
        public string? Note { get; set; }
    }

    /// <summary>Dictionary group defining reusable key-value pairs.</summary>
    public class LsdeDictionary
    {
        public string Uuid { get; set; } = "";
        public string? Label { get; set; }
        public string ValueType { get; set; } = "string";
        public List<DictionaryRow> Rows { get; set; } = new List<DictionaryRow>();
    }

    /// <summary>Enum option for a signature parameter.</summary>
    public class EnumOption
    {
        public string Id { get; set; } = "";
        public string? Label { get; set; }
    }

    /// <summary>Parameter definition for an action signature.</summary>
    public class SignatureParam
    {
        public string? Label { get; set; }
        public string Type { get; set; } = "string";
        public string? DictionaryGroupUuid { get; set; }
        public List<EnumOption>? EnumOptions { get; set; }
    }

    /// <summary>Action signature defining a reusable action type.</summary>
    public class ActionSignature
    {
        public string Uuid { get; set; } = "";
        public string Id { get; set; } = "";
        public string? Label { get; set; }
        public List<SignatureParam> Params { get; set; } = new List<SignatureParam>();
    }

    /// <summary>Root container for exported blueprint data.</summary>
    public class BlueprintExport
    {
        public string Version { get; set; } = "";
        public string ExportDate { get; set; } = "";
        public string? ProjectName { get; set; }
        public string? PrimaryLanguage { get; set; }
        public List<string> Locales { get; set; } = new List<string>();
        public List<LsdeDictionary>? Dictionaries { get; set; }
        public List<ActionSignature>? Signatures { get; set; }
        public List<BlueprintScene> Scenes { get; set; } = new List<BlueprintScene>();
    }

    // ─── Engine Types ────────────────────────────────────────────────────────────

    /// <summary>Single diagnostic entry (error or warning).</summary>
    public class DiagnosticEntry
    {
        public string Code { get; set; } = "";
        public string Message { get; set; } = "";
        public string? SceneId { get; set; }
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

    /// <summary>Options for cross-validating blueprint data against game capabilities.</summary>
    public class CheckOptions
    {
        public List<string>? Signatures { get; set; }
        public Dictionary<string, List<string>>? Dictionaries { get; set; }
        public List<string>? Characters { get; set; }
    }

    /// <summary>Options passed to engine.Init().</summary>
    public class InitOptions
    {
        public BlueprintExport Data { get; set; } = new BlueprintExport();
        public CheckOptions? Check { get; set; }
    }

    /// <summary>Bridge between the engine and the game state.</summary>
    public interface IStateBridge
    {
        bool EvaluateCondition(ExportCondition condition);
        void ExecuteAction(ExportAction action, ActionSignature? signature);
        object ResolveDictionary(string groupLabel, string rowKey);
        BlockCharacter? ResolveCharacter(IReadOnlyList<BlockCharacter> characters);
    }

    /// <summary>Result of block validation.</summary>
    public class ValidationResult
    {
        public bool Valid { get; set; }
        public string? Reason { get; set; }

        public static ValidationResult Ok() => new ValidationResult { Valid = true };
        public static ValidationResult Fail(string reason) => new ValidationResult { Valid = false, Reason = reason };
    }

    // ─── Context Types ───────────────────────────────────────────────────────────

    /// <summary>Base context available to all block handlers.</summary>
    public interface IBaseBlockContext
    {
        BlockCharacter? Character { get; }
        void PreventGlobalHandler();
    }

    /// <summary>Context for DIALOG block handlers.</summary>
    public interface IDialogContext : IBaseBlockContext
    {
        void ResolveCharacterPort(string characterName);
    }

    /// <summary>Context for CHOICE block handlers.</summary>
    public interface IChoiceContext : IBaseBlockContext
    {
        IReadOnlyList<ChoiceItem> Choices { get; }
        void SelectChoice(string choiceUuid);
    }

    /// <summary>Context for CONDITION block handlers.</summary>
    public interface IConditionContext : IBaseBlockContext
    {
        void Resolve(bool result);
    }

    /// <summary>Context for ACTION block handlers.</summary>
    public interface IActionContext : IBaseBlockContext
    {
        void Resolve();
        void Reject(object? error);
    }

    /// <summary>Context passed to onBeforeBlock handler.</summary>
    public class BeforeBlockContext
    {
        public NativeProperties? NativeProperties { get; set; }
    }

    /// <summary>Context passed to scene lifecycle handlers.</summary>
    public class SceneContext
    {
    }

    // ─── Handler Args & Delegates ────────────────────────────────────────────────

    /// <summary>Arguments passed to any block handler.</summary>
    public class BlockHandlerArgs<TBlock, TContext>
        where TBlock : BlueprintBlock
        where TContext : IBaseBlockContext
    {
        public ISceneHandle Scene { get; }
        public TBlock Block { get; }
        public TContext Context { get; }
        public Action Next { get; }

        public BlockHandlerArgs(ISceneHandle scene, TBlock block, TContext context, Action next)
        {
            Scene = scene;
            Block = block;
            Context = context;
            Next = next;
        }
    }

    /// <summary>Arguments for the onValidateNextBlock handler.</summary>
    public class ValidateNextBlockArgs
    {
        public BlueprintBlock NextBlock { get; set; } = null!;
        public BlueprintBlock? FromBlock { get; set; }
        public string? Port { get; set; }
        public SceneContext Context { get; set; } = new SceneContext();
    }

    /// <summary>Arguments for the onInvalidateBlock handler.</summary>
    public class InvalidateBlockArgs
    {
        public ISceneHandle Scene { get; set; } = null!;
        public string Reason { get; set; } = "";
    }

    /// <summary>Arguments for the onBeforeBlock handler.</summary>
    public class BeforeBlockArgs
    {
        public BlueprintBlock Block { get; set; } = null!;
        public ISceneHandle Scene { get; set; } = null!;
        public BeforeBlockContext Context { get; set; } = new BeforeBlockContext();
        public Action Resolve { get; set; } = null!;
    }

    /// <summary>Arguments for scene lifecycle handlers.</summary>
    public class SceneLifecycleArgs
    {
        public ISceneHandle Scene { get; set; } = null!;
        public SceneContext Context { get; set; } = new SceneContext();
    }

    public delegate Action? BlockHandler<TBlock, TContext>(BlockHandlerArgs<TBlock, TContext> args)
        where TBlock : BlueprintBlock
        where TContext : IBaseBlockContext;
    public delegate ValidationResult ValidateNextBlockHandler(ValidateNextBlockArgs args);
    public delegate void InvalidateBlockHandler(InvalidateBlockArgs args);
    public delegate void BeforeBlockHandler(BeforeBlockArgs args);
    public delegate void SceneLifecycleHandler(SceneLifecycleArgs args);

    // ─── SceneHandle Interface ──────────────────────────────────────────────────

    /// <summary>Public interface for a scene handle.</summary>
    public interface ISceneHandle
    {
        void Start();
        void Cancel();

        void OnEnter(SceneLifecycleHandler handler);
        void OnExit(SceneLifecycleHandler handler);

        void OnBlock(string blockUuid, BlockHandler<BlueprintBlock, IBaseBlockContext> handler);
        void OnDialog(BlockHandler<DialogBlock, IDialogContext> handler);
        void OnChoice(BlockHandler<ChoiceBlock, IChoiceContext> handler);
        void OnCondition(BlockHandler<ConditionBlock, IConditionContext> handler);
        void OnAction(BlockHandler<ActionBlock, IActionContext> handler);

        BlueprintBlock? GetCurrentBlock();
        IReadOnlyCollection<string> GetVisitedBlocks();
        bool IsRunning();
        int GetActiveTracks();
    }

    // ─── Port Resolution Types ──────────────────────────────────────────────────

    /// <summary>Input data for port resolution.</summary>
    public class PortResolutionInput
    {
        public BlueprintBlock Block { get; set; } = null!;
        public List<BlueprintConnection> Connections { get; set; } = new List<BlueprintConnection>();
        public string? SelectedChoiceUuid { get; set; }
        public bool? ConditionResult { get; set; }
        public bool? ActionRejected { get; set; }
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

        private static readonly PortResolutionResult _none = new PortResolutionResult(new List<BlueprintConnection>());
        public static PortResolutionResult None => _none;
    }
}
