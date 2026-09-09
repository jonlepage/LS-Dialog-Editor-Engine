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

// ─── The payload contract ────────────────────────────────────────────────────
//
// These mirror the C++ header LSDE generates beside its JSON. The core stays stdlib-only, so the
// payload is plain structs and the game brings its own parser (nlohmann/json in the tests and the
// playground only).
//
// Block ids repeat between scenes. The counter restarts at 1 in every scene, so DIALOG-001
// legitimately exists in two of them: a block is identified by the pair (scene, id).

/// What a block is. Decides which optional fields it carries. LOWERCASE in v2.
namespace BlockType {
    inline constexpr const char* Dialog = "dialog";
    inline constexpr const char* Choice = "choice";
    inline constexpr const char* Condition = "condition";
    inline constexpr const char* Action = "action";
    inline constexpr const char* Note = "note";
}

/// How a condition compares a dictionary entry to its value.
namespace ConditionOperator {
    inline constexpr const char* Equals = "equals";
    inline constexpr const char* NotEquals = "notEquals";
    inline constexpr const char* LessThan = "lessThan";
    inline constexpr const char* LessOrEqual = "lessOrEqual";
    inline constexpr const char* GreaterThan = "greaterThan";
    inline constexpr const char* GreaterOrEqual = "greaterOrEqual";
}

/// How a comparison links to the one ABOVE it. The list is flat: precedence is yours.
namespace ConditionJoin {
    inline constexpr const char* And = "and";
    inline constexpr const char* Or = "or";
}

/// What a card is used for in the editor.
namespace CardRole {
    inline constexpr const char* None = "none";
    inline constexpr const char* Characters = "characters";
    inline constexpr const char* Emotions = "emotions";
    inline constexpr const char* Places = "places";
}

/// The ports every runtime must know. Option, case and actor ports are named by the project.
namespace Ports {
    /// The single entry port of every block.
    inline constexpr const char* In = "in";
    /// The default exit of a dialog, and the true exit of an if-style condition.
    inline constexpr const char* Out = "out";
    /// The exit of an action block once its calls succeeded.
    inline constexpr const char* Then = "then";
    /// The exit of an action block when a call failed.
    inline constexpr const char* Catch = "catch";
    /// The fallback exit of a condition block: no case matched.
    inline constexpr const char* Default = "default";
    /// NOT a port: the reserved ConditionTest::dict that reads past answers of THIS scene.
    /// `entry` is a CHOICE block id, `value` an Option::id of that block. The engine answers it
    /// from what it recorded while the scene played; no project dictionary may take this id.
    inline constexpr const char* Choice = "choice";
}

/// What a property, an argument or a condition value can hold.
using PropertyValue = std::variant<std::string, double, bool, std::vector<std::string>>;

/// Named property values, keyed by the ids the project declared.
using PropertyBag = std::unordered_map<std::string, PropertyValue>;

/// A text by locale code, e.g. { "en": "Hello", "fr": "Bonjour" }.
using TextByLocale = std::unordered_map<std::string, std::string>;

/// Which software wrote the file, to trace a delivered payload back to its version.
struct Generator {
    /// Always LSDE.
    std::string app;
    /// The software version, e.g. 2.0.3 — not the format version.
    std::string version;
};

/// A dictionary the game maintains, as declared in the project. Conditions cite it by id.
struct DictionaryDefinition {
    /// The dictionary id, as ConditionTest::dict cites it.
    std::string id;
    /// What its entries are compared to: boolean, string or number.
    std::string valueType;
    /// The entry keys, in declaration order.
    std::vector<std::string> entries;
};

/// One parameter of an engine function.
struct FunctionParameter {
    /// The argument name, as ActionCall::args keys it.
    std::string name;
    /// What the argument holds.
    std::string type;
    /// Only when type is dictionaryKey: where the value is picked.
    std::optional<std::string> dictionary;
};

/// A function the game implements, as ActionCall::fn names it.
struct FunctionDefinition {
    /// The function id.
    std::string id;
    /// Its parameters, in declaration order.
    std::vector<FunctionParameter> params;
};

/// A card cited by blocks: the other end of BlueprintBlock::actors and ::emotion.
struct Card {
    /// The stable editor id (var3) that blocks reference.
    std::string id;
    /// The name the game gives this card, never the editor label.
    std::string name;
    /// What the card is used for: characters, emotions, places or none.
    std::string role;
};

/// An outgoing wire, seen from the block that carries it.
struct Link {
    /// The exit port: a fixed port (see Ports), an option id, a case port or a card id.
    std::string port;
    /// The target block id, relative to the SAME scene. A wire never crosses one.
    std::string to;
    /// The target's entry port, always "in" today.
    std::string toPort = "in";
};

/// A wire seen from OUTSIDE the block that carries it.
///
/// In the payload a wire is a Link listed in `next`, so it only knows where it goes. Graph
/// inspection needs both ends, so the engine flattens every `next` into this shape. Nothing in the
/// file has it; it exists only in memory.
struct BlueprintConnection {
    /// The id of the block this wire leaves, within its scene.
    std::string from;
    /// The exit port it leaves by.
    std::string port;
    /// The block it goes to, in the same scene.
    std::string to;
    /// The target's entry port.
    std::string toPort = "in";
};

/// What an action block asks the game to run.
struct ActionCall {
    /// The function id. May be empty when the writer has not picked one yet.
    std::string fn;
    /// The arguments BY NAME, as declared in FunctionDefinition::params.
    PropertyBag args;
};

/// One comparison: a dictionary entry against a value.
///
/// The reserved dict id "choice" is the exception — it reads the answers the player already gave
/// IN THIS SCENE, which the engine tracks on its own.
struct ConditionTest {
    /// The dictionary id. "choice" is reserved: see Ports::Choice.
    std::string dict;
    /// The entry read in that dictionary. With dict "choice", a CHOICE block id.
    std::string entry;
    /// The comparison. See ConditionOperator.
    std::string op;
    /// The right-hand side; its type follows the dictionary's valueType.
    PropertyValue value;
    /// Link with the comparison ABOVE. Absent on the first one; absent means AND.
    std::optional<std::string> join;
};

/// One case of a condition block: the exit port, and what must hold for it.
struct ConditionCase {
    /// The exit port of this case (K1…), or the block's `out` when cases share one exit.
    std::string port;
    /// Absent = always true. Such a case makes every following case unreachable.
    std::optional<std::vector<ConditionTest>> when;
};

/// One answer of a choice block, a translated key in its own right.
struct Option {
    /// The option id, which is ALSO its exit port (C1…).
    std::string id;
    /// The full i18n key of its text.
    std::string key;
    /// Its text by locale, when texts are exported inside the payload.
    TextByLocale text;
    /// Absent = always offered.
    std::optional<std::vector<ConditionTest>> when;
};

/// An option tagged with what onResolveCondition said about its `when`.
///
/// The engine hands over EVERY option, tagged — never a shortened list. Filter on
/// `visible != false`, or keep the rest to show them locked.
struct RuntimeChoiceItem : Option {
    /// true = offered, false = hidden, nullopt = no resolver installed (treat as offered).
    std::optional<bool> visible;
};

/// A condition case with its pre-evaluated result.
///
/// The case carries its own exit port, so there is no index to map back to anything — that is the
/// v1 shape and it is gone. Pass the port to resolve() to override the routing.
struct RuntimeConditionCase {
    /// The exit port of this case: K1… with portPerCase, otherwise the block's `out`.
    std::string port;
    /// Its comparisons, chained left to right with no precedence. Absent = always true.
    std::optional<std::vector<ConditionTest>> when;
    /// true if the case holds, false if not, nullopt if no resolver is installed.
    std::optional<bool> result;
};

/// The block properties the ENGINE acts on, read out of BlueprintBlock::props.
///
/// In v2 there is no separate bag: natives and the writer's own properties share `props`, keyed by
/// bare id. Ids cannot collide — LSDE refuses a project property that takes a native name — so
/// telling them apart is a lookup against NATIVE_PROPERTY_IDS, not a guess.
///
/// Most are inert: delay, timeout, debug, waitInput, portPerCharacter and skipIfMissingActor are
/// passed through untouched. Two are not: isAsync spawns a parallel track, and waitForBlocks parks
/// one until its blocks are seen.
///
/// **delay and timeout are MILLISECONDS in v2.** They were seconds in v1, and nothing reports the
/// difference at runtime: a migrated project turns a 3-second pause into 3 ms.
struct NativeProperties {
    /// Run this block on a parallel track instead of the main flow.
    std::optional<bool> isAsync;
    /// MILLISECONDS to wait before the block runs. Applied by onBeforeBlock, not by the engine.
    std::optional<double> delay;
    /// MILLISECONDS the block may take. Passed through — the engine enforces nothing.
    std::optional<double> timeout;
    /// Wait for player input or a game signal. Passed through, never interpreted.
    std::optional<bool> waitInput;
    /// Editor debug flag. Passed through.
    std::optional<bool> debug;
    /// One exit port per actor CARD ID, with `out` as the fallback.
    std::optional<bool> portPerCharacter;
    /// Skip the block when its actor is absent at runtime. Passed through.
    std::optional<bool> skipIfMissingActor;
    /// Condition blocks: each case exits by its own port instead of sharing `out`.
    std::optional<bool> portPerCase;
    /// Block ids OF THIS SCENE that must have FINISHED before this block STARTS.
    ///
    /// The join half of the fork `isAsync` opens: a branch runs in parallel, and a block
    /// downstream waits for it to be over before it plays.
    ///
    /// **Finished, not reached.** A listed block counts once the flow has LEFT it: the game
    /// called next(), the exit port was resolved, and the block's cleanup has run. So the bubble
    /// is off the screen and the audio voice is stopped before the joining line is dispatched.
    /// Being reached was the rule in the first v2 releases and it made the property nearly inert:
    /// a fork into two blocks, then a join on both, lifted in the very tick it was registered.
    ///
    /// **The engine holds the block BEFORE dispatching it.** No handler is called, so the game
    /// never learns the block exists until the wait lifts - nothing of it can reach the screen
    /// early. That is the engine's decision and not a rendering choice a game could make
    /// differently: this is a NATIVE property, the designer ticks it in LSDE, and the engine owes
    /// them the behaviour.
    ///
    /// The rule is the same on every track, the one the player is watching included.
    ///
    /// - ALL the listed blocks must have finished, not just one.
    /// - Finishing a block releases everything waiting on it, in turn.
    /// - A block that never finishes parks its track for good - and a block waiting on player
    ///   input forever never finishes. init() reports UNKNOWN_WAIT_BLOCK when an id is not a
    ///   block of the scene at all, but it cannot know whether a real one will ever be played.
    /// - getVisitedBlocks() is unaffected: it still lists what the player has been SHOWN.
    std::vector<std::string> waitForBlocks;
};

/// The nine ids of NativeProperties, to sort a props bag into natives and the writer's own
/// properties. Anything not in here belongs to the game.
inline const std::vector<std::string>& nativePropertyIds() {
    static const std::vector<std::string> ids = {
        "isAsync", "delay", "timeout", "waitInput", "debug",
        "portPerCharacter", "skipIfMissingActor", "portPerCase", "waitForBlocks",
    };
    return ids;
}

/// A node of the graph. `type` decides which optional fields are present.
struct BlueprintBlock {
    /// Identity RELATIVE to its scene (DIALOG-002): what links and BlueprintScene::start reference.
    std::string id;
    /// The full i18n key, as localization files carry it.
    std::string key;
    /// The readable name, when the writer wrote one. There is no mandatory block name.
    std::optional<std::string> label;
    /// Readable names above the block, root first. Empty ones are skipped.
    std::vector<std::string> parentLabels;
    /// What the block is. See BlockType — lowercase in v2.
    std::string type;
    /// Card ids of who speaks. Resolve them through the export's cards table.
    ///
    /// The ORDER is significant, but its meaning does not belong to the engine: LSDE deliberately
    /// refuses to say whether it is "who speaks" or "who is present". The game decides, through
    /// onResolveCharacter.
    std::vector<std::string> actors;
    /// Card id of the emotion — the tone of the LINE, not of a speaker.
    std::optional<std::string> emotion;
    /// Only with emotion.
    std::optional<double> intensity;
    /// The line by locale, dialogs only, when texts are exported inside the payload.
    ///
    /// The engine never reads what is INSIDE this string. Markers like {{@a1}} are the game's own,
    /// in the game's own keys, filled by the game's own system.
    TextByLocale text;
    /// The body of a note block: never translated, only when notes are exported.
    std::optional<std::string> body;
    /// The team note on the block, only when notes are exported.
    std::optional<std::string> note;
    /// Properties SET on the block, native and project-declared alike, by bare id.
    PropertyBag props;
    /// Action blocks: what to run, in order.
    std::vector<ActionCall> calls;
    /// Condition blocks: the cases, in evaluation order.
    std::vector<ConditionCase> cases;
    /// Choice blocks: the answers, in display order.
    std::vector<Option> options;
    /// Outgoing wires. Empty when nothing leaves the block.
    std::vector<Link> next;
};

/// One scene: its blocks, and where it starts.
struct BlueprintScene {
    /// The scene path without the reserved namespace (acte1, chap1.acte1).
    std::string scene;
    /// The scene identity that SURVIVES A RENAME (sc_ then eight chars).
    ///
    /// `scene` is what a writer reads and what builds the i18n keys, but it changes the day someone
    /// renames the scene — so an asset that stored it stops resolving, silently, with no compiler
    /// to catch it. Store THIS one wherever a scene is referenced from outside the payload.
    std::string id;
    /// The readable name of the scene, when written.
    std::optional<std::string> label;
    /// The entry block id. Empty = the scene has no entry and cannot play.
    std::optional<std::string> start;
    /// Every exported block of the scene.
    std::vector<BlueprintBlock> blocks;
};

/// The whole file. One scene per file or all of them: the only difference between the two split
/// modes.
struct BlueprintExport {
    /// Always "lsde-blueprints". Anything else is refused outright.
    std::string format;
    /// The FORMAT version. Bumps only when the payload contract changes.
    int version = 0;
    /// Which software wrote the file.
    Generator generator;
    /// ISO 8601 instant of the export.
    std::string exportedAt;
    /// The project name.
    std::string project;
    /// Every locale of the project.
    std::vector<std::string> locales;
    /// The locale that is written first. Empty when the project declares none.
    std::string referenceLocale;
    /// The declared vocabulary, whole, never trimmed to the exported scenes.
    std::vector<DictionaryDefinition> dictionaries;
    /// The declared engine functions.
    std::vector<FunctionDefinition> functions;
    /// The cards that blocks may cite.
    std::vector<Card> cards;
    /// The scenes carried by this file.
    std::vector<BlueprintScene> scenes;
};

// ─── Engine Types ────────────────────────────────────────────────────────────

/// Single diagnostic entry (error or warning).
struct DiagnosticEntry {
    /// Machine-readable error/warning code (e.g. "NO_ENTRY_BLOCK", "ORPHAN_CONNECTION").
    std::string code;
    /// Human-readable description of the issue.
    std::string message;
    /// Id of the scene where the issue was found, if applicable.
    std::optional<std::string> sceneId;
    /// Id of the block where the issue was found, if applicable.
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
    /// Function ids your game implements. A blueprint function outside this list warns.
    std::vector<std::string> functions;
    /// Dictionary ids and their entry keys, as your game holds them.
    std::unordered_map<std::string, std::vector<std::string>> dictionaries;
    /// Card NAMES your game knows — Card::name, never the editor id (var1).
    std::vector<std::string> cards;
};

/// Options passed to engine.init().
struct InitOptions {
    /// The blueprint data to load and validate.
    BlueprintExport data;
    /// The several files of a per-scene export, instead of `data`.
    ///
    /// Each file of that mode is self-contained — it carries the whole header, so a scene loads and
    /// plays on its own. Pass the list and the engine stacks the scenes behind one header, after
    /// checking `project` and `exportedAt` match across the files.
    std::vector<BlueprintExport> files;
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

/// What every block handler gets, whatever the block type.
class IBaseBlockContext {
public:
    virtual ~IBaseBlockContext() = default;

    /// The actor onResolveCharacter picked for this block, or nullptr.
    ///
    /// A block lists a CAST in `actors` — card ids, in an order LSDE deliberately refuses to give a
    /// meaning to. The engine hands the whole list to onResolveCharacter and keeps whatever comes
    /// back; it does not elect a first one, the way v1 did.
    virtual const Card* character() const = 0;

    /// Every card the block cites, resolved through the export's cards table, in file order.
    virtual const std::vector<Card>& actors() const = 0;

    /// The emotion of the BLOCK, resolved through cards — the tone of the line, not of a speaker.
    /// In v1 each character carried its own, which meant writing the same feeling twice for two
    /// actors saying one sentence.
    virtual const Card* emotion() const = 0;

    /// How strongly, when the writer set an emotion. Passed through untouched.
    virtual std::optional<double> intensity() const = 0;

    /// Stop the global (Tier 1) handler from running after this scene handler.
    virtual void preventGlobalHandler() = 0;
};

/// What a DIALOG handler gets.
class IDialogContext : public virtual IBaseBlockContext {
public:
    /// With portPerCharacter, name the actor whose port the flow should take.
    ///
    /// Takes a CARD ID (var1) — the same id BlueprintBlock::actors lists and the same one the port
    /// is named after. A card the block does not cite falls back to `out`.
    virtual void resolveCharacterPort(const std::string& cardId) = 0;
};

/// What a CHOICE handler gets.
class IChoiceContext : public virtual IBaseBlockContext {
public:
    /// EVERY option of the block, tagged. Not a shortened list.
    ///
    /// With onResolveCondition installed each carries visible = true/false; without one it is
    /// nullopt — unknown, not hidden. Show the offered ones by filtering on `visible != false`, or
    /// keep the rest to grey them out.
    virtual const std::vector<RuntimeChoiceItem>& options() const = 0;

    /// Pick an option by its id (C1). That id is also the port the flow leaves by.
    virtual void selectChoice(const std::string& optionId) = 0;
};

/// What a CONDITION handler gets.
class IConditionContext : public virtual IBaseBlockContext {
public:
    /// Override the exit port. Takes a PORT NAME: "out", "default", or a case port (K1).
    ///
    /// v1 took bool | int | vector<int> — three shapes for one method, the third being the
    /// dispatcher. Both are gone: a condition picks one path.
    virtual void resolve(const std::string& port) = 0;

    /// The block's cases, each with its port and its pre-evaluated result.
    virtual const std::vector<RuntimeConditionCase>& cases() const = 0;
};

/// What an ACTION handler gets.
class IActionContext : public virtual IBaseBlockContext {
public:
    /// The calls the block asks the game to run, in order, with their arguments BY NAME.
    virtual const std::vector<ActionCall>& calls() const = 0;

    /// The calls went through. The flow leaves by "then".
    virtual void resolve() = 0;

    /// A call failed. The flow leaves by "catch", or by "then" when no error branch was drawn.
    ///
    /// The error is OPTIONAL and the engine does nothing with it: routing only needs to know that
    /// the call failed. Pass one if it reads better next to your own logging — nothing here reads
    /// it, forwards it or logs it.
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
/// TBlock: BlueprintBlock — v2 has one block type, narrowed by its `type` field.
/// TContext: the matching context interface (IDialogContext, IChoiceContext, etc.)
template<typename TBlock, typename TContext>
using TypedBlockHandler = std::function<CleanupFn(
    ISceneHandle* scene,
    const TBlock* block,
    TContext* context,
    std::function<void()> next
)>;

/// Wrap a typed handler into the internal non-generic type.
///
/// The cast to the concrete context is a dynamic_cast, not a static one: the per-type contexts
/// inherit IBaseBlockContext VIRTUALLY (an InternalDialogContext is both an InternalBlockContext
/// and an IDialogContext, and there must be one IBaseBlockContext, not two), and a static_cast
/// down from a virtual base is not allowed. A block whose context does not match its handler
/// yields nullptr, which is the same as a block with no handler: it advances.
template<typename TBlock, typename TContext>
InternalBlockHandler wrapHandler(TypedBlockHandler<TBlock, TContext> handler) {
    return [h = std::move(handler)](
        ISceneHandle* scene, const BlueprintBlock* block,
        IBaseBlockContext* ctx, std::function<void()> next
    ) -> CleanupFn {
        return h(scene, block, dynamic_cast<TContext*>(ctx), std::move(next));
    };
}

/// Context attached to a block inside ValidateNextBlockArgs.
/// The character is resolved by the onResolveCharacter callback before
/// the validation handler is invoked.
struct ValidateNextBlockContext {
    /// Character resolved for this block, or nullptr if none.
    const Card* character = nullptr;
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
/// Obtain an ISceneHandle by calling engine.scene(sceneRef). Use it to register
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
/// Use onBlock(blockId, handler) for a block-specific handler that takes highest priority.
/// Read-only snapshot of an async track's state.
/// Returned by ISceneHandle::getTrackInfos() for debug, rendering, and validation.
struct TrackInfo {
    /// Unique auto-incremented identifier for this track within the scene. Main track is implicit (id 0).
    int id = 0;
    /// ID of the track that spawned this one. -1 means spawned directly by the main track.
    int parentTrackId = -1;
    /// Id of the first block this track started on.
    std::string startBlockId;
    /// Id of the block this track is on, or empty when it is on none — before it starts, and once
    /// it has ended.
    std::string currentBlockId;
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

    /// Override one block by its id (DIALOG-001). Takes highest priority over type handlers.
    virtual void onBlock(const std::string& blockId, InternalBlockHandler handler) = 0;
    /// Override one DIALOG block by its id (type-safe).
    virtual void onDialogId(const std::string& blockId, TypedBlockHandler<BlueprintBlock, IDialogContext> handler) = 0;
    /// Override one CHOICE block by its id (type-safe).
    virtual void onChoiceId(const std::string& blockId, TypedBlockHandler<BlueprintBlock, IChoiceContext> handler) = 0;
    /// Override one CONDITION block by its id (type-safe).
    virtual void onConditionId(const std::string& blockId, TypedBlockHandler<BlueprintBlock, IConditionContext> handler) = 0;
    /// Override one ACTION block by its id (type-safe).
    virtual void onActionId(const std::string& blockId, TypedBlockHandler<BlueprintBlock, IActionContext> handler) = 0;
    /// Override all DIALOG blocks for this scene (Tier 2).
    virtual void onDialog(TypedBlockHandler<BlueprintBlock, IDialogContext> handler) = 0;
    /// Override all CHOICE blocks for this scene (Tier 2).
    virtual void onChoice(TypedBlockHandler<BlueprintBlock, IChoiceContext> handler) = 0;
    /// Override all CONDITION blocks for this scene (Tier 2).
    virtual void onCondition(TypedBlockHandler<BlueprintBlock, IConditionContext> handler) = 0;
    /// Override all ACTION blocks for this scene (Tier 2).
    virtual void onAction(TypedBlockHandler<BlueprintBlock, IActionContext> handler) = 0;

    /// Get the block currently being executed, or nullptr if scene is not running.
    virtual const BlueprintBlock* getCurrentBlock() const = 0;
    /// The id of every block visited so far in this scene, in order.
    virtual const std::vector<std::string>& getVisitedBlocks() const = 0;
    /// Check if the scene flow is currently active.
    virtual bool isRunning() const = 0;
    /// Get the number of async tracks currently running in parallel.
    virtual int getActiveTracks() const = 0;
    /// Get detailed info for all currently running async tracks.
    virtual std::vector<TrackInfo> getTrackInfos() const = 0;

    /// Get the full choice history for this scene.
    /// Keys are block ids, values are the option ids the player picked there, in order.
    virtual const std::unordered_map<std::string, std::vector<std::string>>& getChoiceHistory() const = 0;
    /// Get the choice(s) selected at a specific block. Returns nullptr if block never visited as choice.
    virtual const std::vector<std::string>* getChoice(const std::string& blockId) const = 0;

    /// Evaluate a condition. Handles choice: conditions via internal choice history.
    /// Returns false for non-choice conditions (the engine cannot evaluate game state).
    /// Answer one comparison. A test on the reserved "choice" dictionary is answered from this
    /// scene's own history; anything else goes to the game's resolver, and is false when none is
    /// installed.
    virtual bool evaluateCondition(const ConditionTest& test) = 0;
    /// Override character resolution for this scene. Defaults to engine-level resolver.
    virtual void onResolveCharacter(std::function<const Card*(const std::vector<Card>&)> fn) = 0;
};

// ─── Port Resolution Types ──────────────────────────────────────────────────

/// What resolvePort() needs to pick the wires to follow.
struct PortResolutionInput {
    /// The block being left. Its `type` picks the routing rule.
    const BlueprintBlock* block = nullptr;
    /// The wires it carries — block->next, straight off the block.
    std::vector<Link> links;
    /// CHOICE only: the option the player picked. Its id IS its port (C1…).
    std::optional<std::string> selectedOptionId;
    /// CONDITION only: the port its cases picked — "out", "default", or K1….
    std::optional<std::string> conditionPort;
    /// ACTION only: true when a call failed, so "catch" is tried before "then".
    std::optional<bool> actionRejected;
    /// DIALOG with portPerCharacter: the CARD ID of the speaking actor, never an index.
    std::optional<std::string> actorPort;
};

/// The wires to follow. The traversal decides which is the main track.
struct PortResolutionResult {
    std::vector<Link> links;
};

} // namespace lsde
