// LSDE Dialog Engine — Public facade

#pragma once

#include <lsde/types.h>
#include <lsde/graph.h>
#include <lsde/handler_registry.h>

namespace lsde {

/// LSDE Dialog Engine — callback-driven graph dispatcher.
///
/// This is the top-level entry point for the LSDE runtime. It manages blueprint loading,
/// global handler registration, and scene creation. Use ISceneHandle for per-scene control.
///
/// Usage:
///   DialogueEngine engine;
///   auto report = engine.init({ blueprint });
///   engine.setLocale("en");
///   engine.onResolveCharacter([](auto& chars) { return chars.empty() ? nullptr : &chars[0]; });
///   engine.onDialog([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn { next(); return {}; });
///   engine.onChoice([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn { next(); return {}; });
///   engine.onCondition([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn { ctx->resolve(true); next(); return {}; });
///   engine.onAction([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn { ctx->resolve(); next(); return {}; });
///   auto handle = engine.scene(sceneId);
///   handle->start();
class DialogueEngine {
public:
    DialogueEngine() = default;

    // ─── Initialization ──────────────────────────────────────────────

    /// Validate blueprint data, build internal graph, return diagnostic report.
    DiagnosticReport init(const InitOptions& options);
    /// Set the active locale for text resolution. Validates against blueprint.locales.
    /// Also syncs LsdeUtils::locale.
    void setLocale(const std::string& locale);

    // ─── Character resolution ────────────────────────────────────────

    /// Register a global character resolver. Called for every block with metadata.characters.
    /// Default: returns the first character in the list.
    void onResolveCharacter(std::function<const BlockCharacter*(const std::vector<BlockCharacter>&)> fn);

    // ─── Choice visibility ───────────────────────────────────────────

    /// Install a condition evaluator for choice visibility tagging.
    /// When set, the engine evaluates each choice's visibilityConditions before calling onChoice,
    /// tagging each choice with visible = true/false. The engine handles choice: conditions
    /// internally via choice history — this callback evaluates game-state conditions only.
    void setChoiceFilter(std::function<bool(const ExportCondition&)> evaluator);

    // ─── Validation ──────────────────────────────────────────────────

    /// Register a handler called before each block to validate it.
    void onValidateNextBlock(ValidateNextBlockHandler handler);
    /// Register a handler called when a block fails validation.
    void onInvalidateBlock(InvalidateBlockHandler handler);

    // ─── Pre-execution ───────────────────────────────────────────────

    /// Register a handler called before every block. Must call resolve() to continue.
    void onBeforeBlock(BeforeBlockHandler handler);

    // ─── Type handlers (Tier 1 — global) ─────────────────────────────

    /// Register a global handler for DIALOG blocks. May return a cleanup function.
    void onDialog(TypedBlockHandler<DialogBlock, IDialogContext> handler);
    /// Register a global handler for CHOICE blocks.
    /// All choices are provided, tagged with visible when setChoiceFilter() is configured.
    void onChoice(TypedBlockHandler<ChoiceBlock, IChoiceContext> handler);
    /// Register a global handler for CONDITION blocks. The developer MUST handle evaluation.
    void onCondition(TypedBlockHandler<ConditionBlock, IConditionContext> handler);
    /// Register a global handler for ACTION blocks. The developer MUST handle execution.
    void onAction(TypedBlockHandler<ActionBlock, IActionContext> handler);

    // ─── Scene lifecycle ─────────────────────────────────────────────

    /// Register a handler called when any scene starts.
    void onSceneEnter(SceneLifecycleHandler handler);
    /// Register a handler called when any scene ends (natural or cancelled).
    void onSceneExit(SceneLifecycleHandler handler);

    // ─── Scene handles ───────────────────────────────────────────────

    /// Create a scene handle. Does NOT start the flow — call handle->start().
    std::unique_ptr<ISceneHandle> scene(const std::string& sceneId);

    // ─── Engine control ──────────────────────────────────────────────

    /// Stop all active scenes.
    void stop();
    /// True if at least one scene is active.
    bool isRunning() const;
    /// Get all currently active scene handles.
    std::vector<ISceneHandle*> getActiveScenes() const;
    /// Get the current block of every active scene.
    std::vector<const BlueprintBlock*> getCurrentBlocks() const;
    /// Get connections for a scene (for inter-scene navigation).
    std::vector<const BlueprintConnection*> getSceneConnections(const std::string& sceneId) const;

private:
    std::unique_ptr<BlueprintGraph> _graph;
    HandlerRegistry _globalRegistry;
    std::string _locale;
    std::unordered_map<std::string, ISceneHandle*> _activeScenes;
    bool _initialized = false;
    /// Character resolution callback. Default: first character in the list.
    std::function<const BlockCharacter*(const std::vector<BlockCharacter>&)> _resolveCharacter =
        [](const std::vector<BlockCharacter>& chars) -> const BlockCharacter* { return chars.empty() ? nullptr : &chars[0]; };
    /// Choice visibility evaluator. When set, the engine tags each choice with visible before calling onChoice.
    std::function<bool(const ExportCondition&)> _choiceFilter;
};

} // namespace lsde
