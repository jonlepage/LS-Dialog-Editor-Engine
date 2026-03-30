// LSDE Dialog Engine — Type definitions (C++ port of types.ts)
// All structs, enums, abstract classes, and type aliases.
// ZERO external dependencies — only C++17 stdlib.

#pragma once

#include <string>
#include <vector>
#include <optional>
#include <variant>
#include <functional>
#include <memory>
#include <unordered_map>
#include <unordered_set>

namespace lsde {

// ─── Forward declarations ────────────────────────────────────────────────────

class ISceneHandle;
class IBaseBlockContext;
class IDialogContext;
class IChoiceContext;
class IConditionContext;
class IActionContext;

// ─── Blueprint Data Types ────────────────────────────────────────────────────

/// All possible block types in a blueprint.
enum class BlockType { Dialog, Choice, Condition, Action, Note };

/// Mixed value type for properties and action params.
using PropertyValue = std::variant<std::string, double, bool>;

/// Directed connection between two blocks in the blueprint.
/// Connections define the dialogue flow by linking output ports of source blocks
/// to input ports of target blocks.
struct BlueprintConnection {
    /// Unique identifier for this connection.
    std::string id;
    /// UUID of the source block.
    std::string fromId;
    /// UUID of the target block.
    std::string toId;
    /// Output port identifier on the source block.
    /// For CHOICE blocks: the selected choice UUID. For ACTION blocks: "then" or "catch".
    std::string fromPort;
    /// Input port identifier on the target block.
    std::string toPort;
    /// Zero-based index of the output port.
    /// For CONDITION blocks: 0 = true, 1 = false. For DIALOG with portPerCharacter: index of the character.
    std::optional<int> fromPortIndex;
};

/// Generic key-value property attached to a block.
struct BlockProperty {
    /// Property name or identifier.
    std::string key;
    /// Property value.
    PropertyValue value;
};

/// Condition evaluated to control dialogue flow or choice visibility.
///
/// Conditions are evaluated left-to-right with no operator precedence. The `chain` field
/// on each condition determines how it combines with the accumulated result:
/// - Empty vector -> true (no conditions = pass)
/// - First condition -> its raw boolean result (chain is ignored)
/// - chain = '&' or absent -> AND with the accumulated result
/// - chain = '|' -> OR with the accumulated result
///
/// This means A AND B OR C evaluates as (A AND B) OR C, not A AND (B OR C).
///
/// The developer is responsible for interpreting key, operator, and value against
/// the game state via the onCondition handler — the engine only handles the chaining logic.
struct ExportCondition {
    /// Unique identifier for this condition instance.
    std::string uuid;
    /// State key to evaluate (e.g. "has_item", "player_level").
    /// Interpreted by the onCondition handler.
    std::string key;
    /// Logical chaining with the previous condition: "|" (OR) or "&" (AND).
    /// Defaults to AND if omitted. Ignored on the first condition in a chain.
    std::optional<std::string> chain; // "|" or "&"
    /// Comparison operator (e.g. "==", "!=", ">", "<", ">=", "<=").
    /// Interpretation is up to the onCondition handler.
    std::string op;                   // operator (reserved keyword in C++)
    /// Value to compare against. Always a string — the developer is responsible for type coercion.
    std::string value;
};

/// Action triggered during block execution.
struct ExportAction {
    /// Unique identifier for this action instance.
    std::string uuid;
    /// UUID of the ActionSignature this action references.
    std::optional<std::string> signatureUuid;
    /// Action type identifier matching an ActionSignature.id (e.g. "set_flag", "play_sound").
    /// The dev maps this to game-side functions.
    std::string actionId;
    /// Ordered parameter values for the action, as defined by the matching ActionSignature.params.
    std::vector<PropertyValue> params;
};

/// Player choice option within a choice block.
struct ChoiceItem {
    /// Unique identifier for this choice.
    std::string uuid;
    /// Hierarchical key for localization lookup.
    std::string structureKey;
    /// Display label for editor reference.
    std::optional<std::string> label;
    /// Localized text map: { locale -> text }.
    std::unordered_map<std::string, std::string> dialogueText;
    /// Conditions controlling whether this choice is visible.
    /// If all pass (or none set), the choice is shown.
    std::vector<ExportCondition> visibilityConditions;
};

/// Choice item with runtime visibility tag, set by the engine when setChoiceFilter() is configured.
/// Use `visible != false` (i.e. `!visible.has_value() || visible.value()`) to get visible choices.
struct RuntimeChoiceItem : ChoiceItem {
    /// true = visible, false = hidden, nullopt = no filter installed (treat as visible).
    std::optional<bool> visible;
};

/// LSDE native execution properties controlling how a block is dispatched by the engine.
///
/// These properties affect the engine's execution flow, not the block's content:
///
/// - Async tracks: When isAsync = true, the block runs on a parallel track independent
///   of the main flow. Async tracks call onBeforeBlock, can spawn sub-tracks, and are
///   automatically cancelled when the scene ends.
///
/// - waitForBlocks: Defers block progression until all listed block UUIDs have been visited.
///   If set on the start block of an async track, the entire track waits before beginning.
///
/// - delay: Consumed by onBeforeBlock — the engine does not enforce it automatically.
///   Your onBeforeBlock handler should read block.nativeProperties.delay and call
///   resolve() after the delay.
///
/// - portPerCharacter: Creates one output port per character in metadata.characters.
///   The DIALOG handler must call context.resolveCharacterPort(character.uuid) to pick which port
///   to follow.
struct NativeProperties {
    /// Execute this block on a separate async track running in parallel with the main flow.
    std::optional<bool> isAsync;
    /// Delay in seconds before the block is executed. Applied by the onBeforeBlock handler.
    std::optional<double> delay;
    /// Timeout in seconds for block execution.
    std::optional<double> timeout;
    /// Enable debug mode for this block (editor use).
    std::optional<bool> debug;
    /// One output port per character in metadata.characters.
    /// The handler calls resolveCharacterPort() to pick which port to follow.
    std::optional<bool> portPerCharacter;
    /// Skip this block entirely if the assigned actor/character is missing at runtime.
    std::optional<bool> skipIfMissingActor;
    /// UUIDs of blocks that must have been visited before this block can progress.
    /// Enables precise synchronization of parallel async branches.
    std::optional<std::vector<std::string>> waitForBlocks;
    /// Passive flag indicating this block should wait for explicit player input.
    /// The engine does NOT interpret this flag — it is exposed as-is to game handlers.
    std::optional<bool> waitInput;
};

/// Character (actor) assigned to a block.
struct BlockCharacter {
    /// Internal UUID used by the dialog engine.
    std::string uuid;
    /// Game-side character identifier. Use this to look up the character in your game engine.
    std::string id;
    /// Display name for debugging and editor preview. Not intended for in-game display.
    std::string name;
    /// Emotion label for the character in this block (e.g. "happy", "angry", "sad").
    std::optional<std::string> emotion;
    /// Emotion intensity (e.g. 0 = neutral, higher = stronger).
    std::optional<double> emotionIntensity;
};

/// Screenshot or image captured from the editor for documentation.
struct BlockScreenshot {
    /// Image source as a data URL (base64) or file path.
    std::string src;
    /// Optional caption or description.
    std::optional<std::string> note;
};

/// Non-logic metadata for display and organization. Should not affect game logic.
struct BlockMetadata {
    /// Visual color coding (hex) assigned by the designer.
    std::optional<std::string> color;
    /// Free-form designer notes. Not displayed to players.
    std::optional<std::string> comments;
    /// Contextual tags for categorization and filtering.
    std::vector<std::string> tags;
    /// Screenshots captured from the editor for this block.
    std::vector<BlockScreenshot> screenShots;
    /// Characters (actors) assigned to this block.
    std::vector<BlockCharacter> characters;
    // others: preserved as-is, not used by engine
};

/// Common properties shared by all block types.
///
/// All five block types (DialogBlock, ChoiceBlock, ConditionBlock, ActionBlock, NoteBlock)
/// extend this base. Use the `type` field to determine the concrete block type and
/// dynamic_cast to access block-specific data.
///
/// The `properties` array contains designer-defined key-value pairs from the editor's block
/// configuration panel. `userProperties` is a free-form dictionary for narrative-designer data
/// that doesn't fit the structured property model.
struct BlueprintBlock {
    virtual ~BlueprintBlock() = default;

    /// Unique block identifier.
    std::string uuid;
    /// Block type determining behavior and rendering.
    BlockType type = BlockType::Dialog;
    /// Display label assigned in the editor.
    std::optional<std::string> label;
    /// Hierarchy of parent folder labels providing structural context.
    std::vector<std::string> parentLabels;
    /// Custom key-value properties defined by block configuration.
    std::vector<BlockProperty> properties;
    /// User-defined custom properties dictionary set by the narrative designer.
    std::unordered_map<std::string, PropertyValue> userProperties;
    /// LSDE native execution properties (async, delay, portPerCharacter, etc.).
    std::optional<NativeProperties> nativeProperties;
    /// Non-logic metadata for display and organization.
    std::optional<BlockMetadata> metadata;
    /// When true, this block is the entry point of the scene. Only one per scene.
    std::optional<bool> isStartBlock;
};

/// Dialog block — displays text spoken by a character.
///
/// The character is resolved by the onResolveCharacter callback and exposed as
/// context->character() in the handler.
/// When nativeProperties.portPerCharacter is enabled, each character gets a dedicated output port
/// and the handler must call context->resolveCharacterPort(character.uuid) to select which port to follow.
struct DialogBlock : BlueprintBlock {
    /// Hierarchical key for tree navigation and localization lookup.
    std::optional<std::string> structureKey;
    /// Raw text content in the primary language.
    std::optional<std::string> content;
    /// Localized text map: { locale -> text }.
    std::unordered_map<std::string, std::string> dialogueText;
};

/// Choice block — presents selectable options to the player.
///
/// context->choices() returns ALL choices — none are filtered out.
/// When setChoiceFilter() is configured, the engine evaluates each choice's
/// visibilityConditions and tags every RuntimeChoiceItem with visible = true/false.
/// Filter with: choices where visible != false.
/// Without a filter, visible is nullopt and all choices pass.
///
/// The handler must call context->selectChoice(uuid) to pick a choice. The engine then follows
/// the connection whose fromPort matches the selected choice UUID.
struct ChoiceBlock : BlueprintBlock {
    /// Available player choices. Visibility is tagged at runtime via visibilityConditions.
    std::vector<ChoiceItem> choices;
    /// Designer note. Not displayed to players.
    std::optional<std::string> note;
};

/// Condition block — evaluates logic to branch the dialogue flow.
///
/// The developer MUST handle evaluation in the onCondition handler. Conditions are chained
/// left-to-right with no operator precedence: '&' = AND, '|' = OR. An empty array
/// evaluates to true.
///
/// The result maps to output ports: true follows port index 0, false follows port index 1.
/// Call context->resolve(result) to set the branch direction.
struct ConditionBlock : BlueprintBlock {
    /// Conditions to evaluate. Chained left-to-right with chain operators.
    std::vector<ExportCondition> conditions;
    /// Designer note. Not displayed to players.
    std::optional<std::string> note;
};

/// Action block — triggers game state changes.
///
/// The developer MUST handle execution in the onAction handler.
///
/// The block has two output ports: "then" (success) and "catch" (failure).
/// Call context->resolve() for success or context->reject(error) for failure.
/// If no "catch" connection exists, rejection falls back to the "then" port.
struct ActionBlock : BlueprintBlock {
    /// Actions to execute. Each references an ActionSignature via actionId.
    std::vector<ExportAction> actions;
    /// Designer note. Not displayed to players.
    std::optional<std::string> note;
};

/// Note block — designer documentation, never executed at runtime. Skipped during traversal.
struct NoteBlock : BlueprintBlock {};

/// A scene — an independent dialogue subgraph with its own entry point.
///
/// A scene is the unit of execution in the engine. Call engine.scene(uuid) to obtain an
/// ISceneHandle, then handle->start() to begin traversing from the entry block.
///
/// The blocks vector contains all blocks in this scene. The connections vector defines the
/// directed edges between blocks (output port -> input port). Together they form a directed
/// graph that the engine traverses at runtime.
///
/// Multiple scenes can run concurrently — each gets its own ISceneHandle with independent
/// state, visited blocks, and async tracks.
struct BlueprintScene {
    /// Unique scene identifier.
    std::string uuid;
    /// Scene name assigned by the designer.
    std::string label;
    /// Scene-level designer notes.
    std::optional<std::string> note;
    /// UUID of the entry block for this scene.
    std::optional<std::string> entryBlockId;
    /// Scene creation or last modification date.
    std::string date;
    /// All blocks contained within this scene.
    std::vector<std::shared_ptr<BlueprintBlock>> blocks;
    /// All connections defining the dialogue flow in this scene.
    std::vector<BlueprintConnection> connections;
};

/// A single entry in a dictionary group.
struct DictionaryRow {
    /// Key identifier referenced in conditions and action parameters.
    std::string key;
};

/// Dictionary group defining reusable key-value pairs for conditions and actions.
struct LsdeDictionary {
    /// Unique identifier for this dictionary group.
    std::string uuid;
    /// Identifier used as prefix in condition keys (e.g. "groupId.rowKey").
    std::string id;
    /// All entries in this dictionary group.
    std::vector<DictionaryRow> rows;
};

/// Enum option for a signature parameter.
struct EnumOption {
    /// Option identifier.
    std::string id;
    /// Display label for this option.
    std::optional<std::string> label;
};

/// Parameter definition for an action signature.
struct SignatureParam {
    /// Display label for this parameter.
    std::optional<std::string> label;
    /// Data type of this parameter.
    std::string type = "string";
    /// UUID of the dictionary group this parameter references. Only when type is "dictionary".
    std::optional<std::string> dictionaryGroupUuid;
    /// Available options when type is "enum".
    std::vector<EnumOption> enumOptions;
};

/// Action signature defining a reusable action type. Map id to your engine's action handlers.
struct ActionSignature {
    /// Unique identifier for this signature.
    std::string uuid;
    /// Short action type identifier (e.g. "set_flag"). Referenced by ExportAction.actionId.
    std::string id;
    /// Parameter definitions describing the expected inputs.
    std::vector<SignatureParam> params;
};

/// Root container for exported blueprint data.
///
/// This is the top-level JSON structure exported by the LS-Dialog editor. Pass it to
/// engine.init({ data }) to load and validate the blueprint. The engine indexes all scenes,
/// blocks, and connections internally — the original object is not mutated.
///
/// The locales vector lists all available languages. Call engine.setLocale(code) to store
/// the active locale — your handlers are responsible for reading the appropriate key from
/// DialogBlock.dialogueText and ChoiceItem.dialogueText.
struct BlueprintExport {
    /// Schema version of this export format.
    std::string version;
    /// ISO 8601 timestamp of when this export was generated.
    std::string exportDate;
    /// Name of the LSDE project.
    std::optional<std::string> projectName;
    /// Primary language locale code (e.g. "fr", "en").
    std::optional<std::string> primaryLanguage;
    /// All language locale codes included in this export.
    std::vector<std::string> locales;
    /// Dictionary groups for conditions and action parameters.
    std::vector<LsdeDictionary> dictionaries;
    /// Action signature definitions describing available action types.
    std::vector<ActionSignature> signatures;
    /// All exported scenes.
    std::vector<BlueprintScene> scenes;
};

// ─── Engine Types ────────────────────────────────────────────────────────────

/// Single diagnostic entry (error or warning).
struct DiagnosticEntry {
    /// Machine-readable error/warning code (e.g. "NO_ENTRY_BLOCK", "ORPHAN_CONNECTION").
    std::string code;
    /// Human-readable description of the issue.
    std::string message;
    /// UUID of the scene where the issue was found, if applicable.
    std::optional<std::string> sceneId;
    /// UUID of the block where the issue was found, if applicable.
    std::optional<std::string> blockId;
};

/// Aggregate statistics from blueprint validation.
struct DiagnosticStats {
    int sceneCount = 0;
    int blockCount = 0;
    int connectionCount = 0;
};

/// Result of engine.init() — validation report.
struct DiagnosticReport {
    std::vector<DiagnosticEntry> errors;
    std::vector<DiagnosticEntry> warnings;
    DiagnosticStats stats;
};

/// Options for cross-validating blueprint data against game capabilities.
/// When provided, the engine warns about blueprint references that don't match
/// your game's known capabilities.
struct CheckOptions {
    /// Known action signature IDs in your game. Blueprint actions referencing unknown IDs will produce warnings.
    std::vector<std::string> signatures;
    /// Known dictionary groups and their row keys. Blueprint references to unknown groups/keys will produce warnings.
    std::unordered_map<std::string, std::vector<std::string>> dictionaries;
    /// Known character names in your game. Blueprint blocks referencing unknown characters will produce warnings.
    std::vector<std::string> characters;
};

/// Options passed to engine.init().
struct InitOptions {
    /// The blueprint data to load and validate.
    BlueprintExport data;
    /// Optional cross-validation options.
    std::optional<CheckOptions> check;
};

/// Result of block validation.
struct ValidationResult {
    /// Whether the block passed validation. When false, the onInvalidateBlock handler is called.
    bool valid = true;
    /// Reason for validation failure. Passed to InvalidateBlockArgs.reason when valid is false.
    std::optional<std::string> reason;

    static ValidationResult ok() { return {true, std::nullopt}; }
    static ValidationResult fail(const std::string& r) { return {false, r}; }
};

/// Cleanup function returned by a block handler, called when the engine leaves the block.
/// Use this to tear down UI, stop timers, etc.
using CleanupFn = std::function<void()>;

// ─── Context Types ───────────────────────────────────────────────────────────

/// Base context available to all block handlers.
class IBaseBlockContext {
public:
    virtual ~IBaseBlockContext() = default;
    /// Character resolved by the onResolveCharacter callback for this block, or nullptr if none.
    virtual const BlockCharacter* character() const = 0;
    /// Prevent the global (Tier 1) handler from executing after this scene handler.
    virtual void preventGlobalHandler() = 0;
};

/// Context for DIALOG block handlers.
class IDialogContext : public IBaseBlockContext {
public:
    /// When portPerCharacter is enabled, specify which character port to follow.
    /// Matches by character UUID first, then by name as fallback.
    virtual void resolveCharacterPort(const std::string& characterUuid) = 0;
};

/// Context for CHOICE block handlers.
class IChoiceContext : public IBaseBlockContext {
public:
    /// All choices with optional visibility tags. When engine.setChoiceFilter() is configured,
    /// each choice is tagged visible = true/false. Filter with: choices where visible != false.
    /// Without a filter, visible is nullopt and all choices pass.
    virtual const std::vector<RuntimeChoiceItem>& choices() const = 0;
    /// Select a choice by UUID. The engine follows the matching port.
    virtual void selectChoice(const std::string& choiceUuid) = 0;
};

/// Context for CONDITION block handlers.
class IConditionContext : public IBaseBlockContext {
public:
    /// Resolve the condition: true -> port index 0, false -> port index 1.
    virtual void resolve(bool result) = 0;
};

/// Context for ACTION block handlers.
class IActionContext : public IBaseBlockContext {
public:
    /// Mark action as succeeded. Engine follows the "then" port.
    virtual void resolve() = 0;
    /// Mark action as failed. Engine follows the "catch" port (fallback "then" if no catch port exists).
    virtual void reject(const std::string& error = "") = 0;
};

/// Context passed to onBeforeBlock handler.
struct BeforeBlockContext {
    /// Pointer to the block's native execution properties, or nullptr if none.
    const NativeProperties* nativeProperties = nullptr;
};

/// Context passed to scene lifecycle handlers. Extensible — reserved for future scene-level data.
struct SceneContext {};

// ─── Handler Types ───────────────────────────────────────────────────────────

/// Internal non-generic handler type (type-erased).
/// Arguments: scene handle, block pointer, context pointer, next() callback.
/// Returns an optional cleanup function.
using InternalBlockHandler = std::function<CleanupFn(
    ISceneHandle* scene,
    const BlueprintBlock* block,
    IBaseBlockContext* context,
    std::function<void()> next
)>;

/// Typed handler for a specific block + context type pair.
/// TBlock: the concrete block type (DialogBlock, ChoiceBlock, etc.)
/// TContext: the matching context interface (IDialogContext, IChoiceContext, etc.)
template<typename TBlock, typename TContext>
using TypedBlockHandler = std::function<CleanupFn(
    ISceneHandle* scene,
    const TBlock* block,
    TContext* context,
    std::function<void()> next
)>;

/// Wrap a typed handler into the internal non-generic type via static_cast.
template<typename TBlock, typename TContext>
InternalBlockHandler wrapHandler(TypedBlockHandler<TBlock, TContext> handler) {
    return [h = std::move(handler)](
        ISceneHandle* scene, const BlueprintBlock* block,
        IBaseBlockContext* ctx, std::function<void()> next
    ) -> CleanupFn {
        return h(scene, static_cast<const TBlock*>(block), static_cast<TContext*>(ctx), std::move(next));
    };
}

/// Context attached to a block inside ValidateNextBlockArgs.
/// The character is resolved by the onResolveCharacter callback before
/// the validation handler is invoked.
struct ValidateNextBlockContext {
    /// Character resolved for this block, or nullptr if none.
    const BlockCharacter* character = nullptr;
};

/// Arguments for the onValidateNextBlock handler.
/// Called before each block is executed. Provides the resolved character for both
/// the upcoming block (nextContext) and the previously executed block (fromContext).
struct ValidateNextBlockArgs {
    /// The block about to be executed.
    const BlueprintBlock* nextBlock = nullptr;
    /// The block that was just executed (nullptr for the first block).
    const BlueprintBlock* fromBlock = nullptr;
    /// Context for the upcoming block (character, etc.).
    ValidateNextBlockContext nextContext;
    /// Context for the previous block. Only valid when hasFromContext is true.
    ValidateNextBlockContext fromContext;
    /// True when fromContext is populated (false for the first block of a scene).
    bool hasFromContext = false;
    /// The port that was followed to reach nextBlock (reserved for future use).
    const std::string* port = nullptr;
};

/// Arguments for the onInvalidateBlock handler.
struct InvalidateBlockArgs {
    /// The scene handle owning the invalidated block.
    ISceneHandle* scene = nullptr;
    /// Reason for validation failure.
    std::string reason;
};

/// Arguments for the onBeforeBlock handler.
struct BeforeBlockArgs {
    /// The block about to be executed.
    const BlueprintBlock* block = nullptr;
    /// The scene handle owning this block.
    ISceneHandle* scene = nullptr;
    /// Context with native properties.
    BeforeBlockContext context;
    /// Call resolve() to continue execution. Must be called exactly once.
    std::function<void()> resolve;
};

/// Arguments for scene lifecycle handlers.
struct SceneLifecycleArgs {
    /// The scene handle for the entering/exiting scene.
    ISceneHandle* scene = nullptr;
    /// Scene-level context (extensible).
    SceneContext context;
};

/// Handler for block validation. Return ValidationResult::ok() to continue, fail() to invalidate.
using ValidateNextBlockHandler = std::function<ValidationResult(const ValidateNextBlockArgs&)>;
/// Handler called when a block fails validation.
using InvalidateBlockHandler = std::function<void(const InvalidateBlockArgs&)>;
/// Handler called before every block. Must call resolve() to continue.
using BeforeBlockHandler = std::function<void(const BeforeBlockArgs&)>;
/// Handler for scene enter/exit events.
using SceneLifecycleHandler = std::function<void(const SceneLifecycleArgs&)>;

// ─── SceneHandle Interface ──────────────────────────────────────────────────

/// Public interface for controlling a running scene.
///
/// Obtain an ISceneHandle by calling engine.scene(sceneUuid). Use it to register
/// scene-specific (Tier 2) handlers, then call start() to begin traversal from the
/// scene's entry block.
///
/// Lifecycle:
/// 1. start() -> onSceneEnter fires -> first block is dispatched
/// 2. Blocks are dispatched sequentially, following connections via port resolution
/// 3. Scene ends when: no more connections, or cancel() is called
/// 4. All async tracks are cancelled -> current block cleanup runs -> onSceneExit fires
///
/// Scene-level handlers (onDialog, onChoice, etc.) are called BEFORE global handlers.
/// Both tiers execute unless the scene handler calls context->preventGlobalHandler().
/// Use onBlock(uuid, handler) for a block-specific handler that takes highest priority.
/// Read-only snapshot of an async track's state.
/// Returned by ISceneHandle::getTrackInfos() for debug, rendering, and validation.
struct TrackInfo {
    /// Unique auto-incremented identifier for this track within the scene. Main track is implicit (id 0).
    int id = 0;
    /// ID of the track that spawned this one. -1 means spawned directly by the main track.
    int parentTrackId = -1;
    /// UUID of the first block that started this track's execution.
    std::string startBlockUuid;
    /// UUID of the block currently being processed, or empty if the track has not yet started.
    std::string currentBlockUuid;
    /// Whether this track is still actively executing.
    bool running = false;
};

class ISceneHandle {
public:
    virtual ~ISceneHandle() = default;

    /// Start the scene flow from the entry block.
    /// Validates that all 4 mandatory handlers (onDialog, onChoice, onCondition, onAction)
    /// are registered — throws if any are missing.
    virtual void start() = 0;
    /// Cancel the scene flow. All async tracks are cancelled, cleanup runs, onSceneExit fires.
    virtual void cancel() = 0;

    /// Override the global onSceneEnter for this scene.
    virtual void onEnter(SceneLifecycleHandler handler) = 0;
    /// Override the global onSceneExit for this scene.
    virtual void onExit(SceneLifecycleHandler handler) = 0;

    /// Override a specific block by UUID. Takes highest priority over type handlers.
    virtual void onBlock(const std::string& blockUuid, InternalBlockHandler handler) = 0;
    /// Override all DIALOG blocks for this scene (Tier 2).
    virtual void onDialog(TypedBlockHandler<DialogBlock, IDialogContext> handler) = 0;
    /// Override all CHOICE blocks for this scene (Tier 2).
    virtual void onChoice(TypedBlockHandler<ChoiceBlock, IChoiceContext> handler) = 0;
    /// Override all CONDITION blocks for this scene (Tier 2).
    virtual void onCondition(TypedBlockHandler<ConditionBlock, IConditionContext> handler) = 0;
    /// Override all ACTION blocks for this scene (Tier 2).
    virtual void onAction(TypedBlockHandler<ActionBlock, IActionContext> handler) = 0;

    /// Get the block currently being executed, or nullptr if scene is not running.
    virtual const BlueprintBlock* getCurrentBlock() const = 0;
    /// Get UUIDs of all blocks visited so far, in order.
    virtual const std::vector<std::string>& getVisitedBlocks() const = 0;
    /// Check if the scene flow is currently active.
    virtual bool isRunning() const = 0;
    /// Get the number of async tracks currently running in parallel.
    virtual int getActiveTracks() const = 0;
    /// Get detailed info for all currently running async tracks.
    virtual std::vector<TrackInfo> getTrackInfos() const = 0;

    /// Get the full choice history for this scene.
    /// Keys are block UUIDs, values are arrays of selected choice UUIDs.
    virtual const std::unordered_map<std::string, std::vector<std::string>>& getChoiceHistory() const = 0;
    /// Get the choice(s) selected at a specific block. Returns nullptr if block never visited as choice.
    virtual const std::vector<std::string>* getChoice(const std::string& blockUuid) const = 0;

    /// Evaluate a condition. Handles choice: conditions via internal choice history.
    /// Returns false for non-choice conditions (the engine cannot evaluate game state).
    virtual bool evaluateCondition(const ExportCondition& condition) = 0;
    /// Override character resolution for this scene. Defaults to engine-level resolver.
    virtual void onResolveCharacter(std::function<const BlockCharacter*(const std::vector<BlockCharacter>&)> fn) = 0;
};

// ─── Port Resolution Types ──────────────────────────────────────────────────

/// Input data for port resolution. The block's type determines the routing rules:
/// - DIALOG: characterPortIndex selects the character port, fallback to "out"
/// - CHOICE: selectedChoiceUuid matches connection.fromPort
/// - CONDITION: conditionResult true -> port index 0, false -> port index 1
/// - ACTION: actionRejected=true tries "catch" port, fallback "then"; otherwise "then"
/// - NOTE: returns all connections
struct PortResolutionInput {
    /// The block whose output port is being resolved.
    const BlueprintBlock* block = nullptr;
    /// All outgoing connections from this block.
    const std::vector<BlueprintConnection>* connections = nullptr;
    /// CHOICE blocks only — UUID of the selected choice. Matches connection.fromPort.
    std::optional<std::string> selectedChoiceUuid;
    /// CONDITION blocks only — evaluation result. true -> port index 0, false -> port index 1.
    std::optional<bool> conditionResult;
    /// ACTION blocks only — if true, the resolver looks for a "catch" port before falling back to "then".
    std::optional<bool> actionRejected;
    /// DIALOG blocks with portPerCharacter — character index to match against connection.fromPortIndex.
    std::optional<int> characterPortIndex;
};

/// Result of port resolution — all matching connections.
struct PortResolutionResult {
    std::vector<const BlueprintConnection*> connections;
};

} // namespace lsde
