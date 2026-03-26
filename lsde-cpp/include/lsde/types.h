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

/// Directed connection between two blocks.
struct BlueprintConnection {
    std::string id;
    std::string fromId;
    std::string toId;
    std::string fromPort;
    std::string toPort;
    std::optional<int> fromPortIndex;
};

/// Generic key-value property attached to a block.
struct BlockProperty {
    std::string key;
    PropertyValue value;
};

/// Condition evaluated to control dialogue flow or choice visibility.
struct ExportCondition {
    std::string uuid;
    std::string key;
    std::optional<std::string> chain; // "|" or "&"
    std::string op;                   // operator (reserved keyword in C++)
    std::string value;
};

/// Action triggered during block execution.
struct ExportAction {
    std::string uuid;
    std::string actionId;
    std::vector<PropertyValue> params;
};

/// Player choice option within a choice block.
struct ChoiceItem {
    std::string uuid;
    std::string structureKey;
    std::optional<std::string> label;
    std::unordered_map<std::string, std::string> dialogueText;
    std::vector<ExportCondition> visibilityConditions;
};

/// LSDE native execution properties for a block.
struct NativeProperties {
    std::optional<bool> isAsync;
    std::optional<double> delay;
    std::optional<double> timeout;
    std::optional<bool> debug;
    std::optional<bool> portPerCharacter;
    std::optional<bool> skipIfMissingActor;
    std::optional<bool> followNarrative;
};

/// Character (actor) assigned to a block.
struct BlockCharacter {
    /// Internal UUID used by the dialog engine.
    std::string uuid;
    /// Game-side character identifier.
    std::string id;
    /// Display name for debugging and editor preview.
    std::string name;
    /// Emotion label (e.g. "happy", "angry", "sad").
    std::optional<std::string> emotion;
    /// Emotion intensity (e.g. 0 = neutral, higher = stronger).
    std::optional<double> emotionIntensity;
};

/// Screenshot captured from the editor.
struct BlockScreenshot {
    std::string src;
    std::optional<std::string> note;
};

/// Non-logic metadata for display and organization.
struct BlockMetadata {
    std::optional<std::string> color;
    std::optional<std::string> comments;
    std::vector<std::string> tags;
    std::vector<BlockScreenshot> screenShots;
    std::vector<BlockCharacter> characters;
    // others: preserved as-is, not used by engine
};

/// Base class for all blueprint blocks. Use typed subclasses for block-specific data.
struct BlueprintBlock {
    virtual ~BlueprintBlock() = default;

    std::string uuid;
    BlockType type = BlockType::Dialog;
    std::optional<std::string> label;
    std::vector<std::string> parentLabels;
    std::vector<BlockProperty> properties;
    std::unordered_map<std::string, PropertyValue> userProperties;
    std::optional<NativeProperties> nativeProperties;
    std::optional<BlockMetadata> metadata;
    std::optional<bool> isStartBlock;
};

/// A dialogue block displaying text from a character.
struct DialogBlock : BlueprintBlock {
    std::optional<std::string> structureKey;
    std::optional<std::string> content;
    std::unordered_map<std::string, std::string> dialogueText;
};

/// A choice block presenting player options.
struct ChoiceBlock : BlueprintBlock {
    std::vector<ChoiceItem> choices;
    std::optional<std::string> note;
};

/// A condition block evaluating game state to branch the flow.
struct ConditionBlock : BlueprintBlock {
    std::vector<ExportCondition> conditions;
    std::optional<std::string> note;
};

/// An action block triggering game-side effects.
struct ActionBlock : BlueprintBlock {
    std::vector<ExportAction> actions;
    std::optional<std::string> note;
};

/// A designer-only note block. Skipped during traversal.
struct NoteBlock : BlueprintBlock {};

/// A scene containing blocks and their connections.
struct BlueprintScene {
    std::string uuid;
    std::string label;
    std::optional<std::string> note;
    std::optional<std::string> entryBlockId;
    std::string date;
    std::vector<std::shared_ptr<BlueprintBlock>> blocks;
    std::vector<BlueprintConnection> connections;
};

/// A single entry in a dictionary group.
struct DictionaryRow {
    std::string key;
    std::optional<std::string> note;
};

/// Dictionary group defining reusable key-value pairs.
struct LsdeDictionary {
    std::string uuid;
    std::optional<std::string> label;
    std::string valueType = "string";
    std::vector<DictionaryRow> rows;
};

/// Enum option for a signature parameter.
struct EnumOption {
    std::string id;
    std::optional<std::string> label;
};

/// Parameter definition for an action signature.
struct SignatureParam {
    std::optional<std::string> label;
    std::string type = "string";
    std::optional<std::string> dictionaryGroupUuid;
    std::vector<EnumOption> enumOptions;
};

/// Action signature defining a reusable action type.
struct ActionSignature {
    std::string uuid;
    std::string id;
    std::optional<std::string> label;
    std::vector<SignatureParam> params;
};

/// Root container for exported blueprint data.
struct BlueprintExport {
    std::string version;
    std::string exportDate;
    std::optional<std::string> projectName;
    std::optional<std::string> primaryLanguage;
    std::vector<std::string> locales;
    std::vector<LsdeDictionary> dictionaries;
    std::vector<ActionSignature> signatures;
    std::vector<BlueprintScene> scenes;
};

// ─── Engine Types ────────────────────────────────────────────────────────────

/// Single diagnostic entry (error or warning).
struct DiagnosticEntry {
    std::string code;
    std::string message;
    std::optional<std::string> sceneId;
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
struct CheckOptions {
    std::vector<std::string> signatures;
    std::unordered_map<std::string, std::vector<std::string>> dictionaries;
    std::vector<std::string> characters;
};

/// Options passed to engine.init().
struct InitOptions {
    BlueprintExport data;
    std::optional<CheckOptions> check;
};

/// Bridge between the engine and the game state (pure virtual = interface).
class IStateBridge {
public:
    virtual ~IStateBridge() = default;
    virtual bool evaluateCondition(const ExportCondition& condition) = 0;
    virtual void executeAction(const ExportAction& action, const ActionSignature* signature) = 0;
    virtual PropertyValue resolveDictionary(const std::string& groupLabel, const std::string& rowKey) = 0;
    virtual const BlockCharacter* resolveCharacter(const std::vector<BlockCharacter>& characters) = 0;
};

/// Result of block validation.
struct ValidationResult {
    bool valid = true;
    std::optional<std::string> reason;

    static ValidationResult ok() { return {true, std::nullopt}; }
    static ValidationResult fail(const std::string& r) { return {false, r}; }
};

/// Cleanup function returned by a block handler.
using CleanupFn = std::function<void()>;

// ─── Context Types ───────────────────────────────────────────────────────────

/// Base context available to all block handlers.
class IBaseBlockContext {
public:
    virtual ~IBaseBlockContext() = default;
    virtual const BlockCharacter* character() const = 0;
    virtual void preventGlobalHandler() = 0;
};

/// Context for DIALOG block handlers.
class IDialogContext : public IBaseBlockContext {
public:
    virtual void resolveCharacterPort(const std::string& characterName) = 0;
};

/// Context for CHOICE block handlers.
class IChoiceContext : public IBaseBlockContext {
public:
    virtual const std::vector<ChoiceItem>& choices() const = 0;
    virtual void selectChoice(const std::string& choiceUuid) = 0;
};

/// Context for CONDITION block handlers.
class IConditionContext : public IBaseBlockContext {
public:
    virtual void resolve(bool result) = 0;
};

/// Context for ACTION block handlers.
class IActionContext : public IBaseBlockContext {
public:
    virtual void resolve() = 0;
    virtual void reject(const std::string& error = "") = 0;
};

/// Context passed to onBeforeBlock handler.
struct BeforeBlockContext {
    const NativeProperties* nativeProperties = nullptr;
};

/// Context passed to scene lifecycle handlers.
struct SceneContext {};

// ─── Handler Types ───────────────────────────────────────────────────────────

/// Internal non-generic handler type (type-erased).
using InternalBlockHandler = std::function<CleanupFn(
    ISceneHandle* scene,
    const BlueprintBlock* block,
    IBaseBlockContext* context,
    std::function<void()> next
)>;

/// Typed handler for a specific block + context type pair.
template<typename TBlock, typename TContext>
using TypedBlockHandler = std::function<CleanupFn(
    ISceneHandle* scene,
    const TBlock* block,
    TContext* context,
    std::function<void()> next
)>;

/// Wrap a typed handler into the internal non-generic type.
template<typename TBlock, typename TContext>
InternalBlockHandler wrapHandler(TypedBlockHandler<TBlock, TContext> handler) {
    return [h = std::move(handler)](
        ISceneHandle* scene, const BlueprintBlock* block,
        IBaseBlockContext* ctx, std::function<void()> next
    ) -> CleanupFn {
        return h(scene, static_cast<const TBlock*>(block), static_cast<TContext*>(ctx), std::move(next));
    };
}

/// Arguments for the onValidateNextBlock handler.
struct ValidateNextBlockArgs {
    const BlueprintBlock* nextBlock = nullptr;
    const BlueprintBlock* fromBlock = nullptr;
    const std::string* port = nullptr;
    SceneContext context;
};

/// Arguments for the onInvalidateBlock handler.
struct InvalidateBlockArgs {
    ISceneHandle* scene = nullptr;
    std::string reason;
};

/// Arguments for the onBeforeBlock handler.
struct BeforeBlockArgs {
    const BlueprintBlock* block = nullptr;
    ISceneHandle* scene = nullptr;
    BeforeBlockContext context;
    std::function<void()> resolve;
};

/// Arguments for scene lifecycle handlers.
struct SceneLifecycleArgs {
    ISceneHandle* scene = nullptr;
    SceneContext context;
};

// Handler delegate types
using ValidateNextBlockHandler = std::function<ValidationResult(const ValidateNextBlockArgs&)>;
using InvalidateBlockHandler = std::function<void(const InvalidateBlockArgs&)>;
using BeforeBlockHandler = std::function<void(const BeforeBlockArgs&)>;
using SceneLifecycleHandler = std::function<void(const SceneLifecycleArgs&)>;

// ─── SceneHandle Interface ──────────────────────────────────────────────────

/// Public interface for a scene handle.
class ISceneHandle {
public:
    virtual ~ISceneHandle() = default;

    virtual void start() = 0;
    virtual void cancel() = 0;

    virtual void onEnter(SceneLifecycleHandler handler) = 0;
    virtual void onExit(SceneLifecycleHandler handler) = 0;

    virtual void onBlock(const std::string& blockUuid, InternalBlockHandler handler) = 0;
    virtual void onDialog(TypedBlockHandler<DialogBlock, IDialogContext> handler) = 0;
    virtual void onChoice(TypedBlockHandler<ChoiceBlock, IChoiceContext> handler) = 0;
    virtual void onCondition(TypedBlockHandler<ConditionBlock, IConditionContext> handler) = 0;
    virtual void onAction(TypedBlockHandler<ActionBlock, IActionContext> handler) = 0;

    virtual const BlueprintBlock* getCurrentBlock() const = 0;
    virtual const std::vector<std::string>& getVisitedBlocks() const = 0;
    virtual bool isRunning() const = 0;
    virtual int getActiveTracks() const = 0;

    /** Get the full choice history for this scene. Keys are block UUIDs, values are arrays of selected choice UUIDs. */
    virtual const std::unordered_map<std::string, std::vector<std::string>>& getChoiceHistory() const = 0;
    /** Get the choice(s) selected at a specific block. Returns nullptr if block never visited as choice. */
    virtual const std::vector<std::string>* getChoice(const std::string& blockUuid) const = 0;
};

// ─── Port Resolution Types ──────────────────────────────────────────────────

/// Input data for port resolution.
struct PortResolutionInput {
    const BlueprintBlock* block = nullptr;
    const std::vector<BlueprintConnection>* connections = nullptr;
    std::optional<std::string> selectedChoiceUuid;
    std::optional<bool> conditionResult;
    std::optional<bool> actionRejected;
    std::optional<int> characterPortIndex;
};

/// Result of port resolution — all matching connections.
struct PortResolutionResult {
    std::vector<const BlueprintConnection*> connections;
};

} // namespace lsde
