// LSDE Dialog Engine — Public facade

#pragma once

#include <lsde/types.h>
#include <lsde/graph.h>
#include <lsde/handler_registry.h>

namespace lsde {

/// LSDE Dialog Engine — callback-driven graph dispatcher.
class DialogueEngine {
public:
    DialogueEngine() = default;

    // ─── Initialization ──────────────────────────────────────────────
    DiagnosticReport init(const InitOptions& options);
    void setLocale(const std::string& locale);
    void setStateBridge(IStateBridge* bridge);

    // ─── Validation ──────────────────────────────────────────────────
    void onValidateNextBlock(ValidateNextBlockHandler handler);
    void onInvalidateBlock(InvalidateBlockHandler handler);

    // ─── Pre-execution ───────────────────────────────────────────────
    void onBeforeBlock(BeforeBlockHandler handler);

    // ─── Type handlers ───────────────────────────────────────────────
    void onDialog(TypedBlockHandler<IDialogContext> handler);
    void onChoice(TypedBlockHandler<IChoiceContext> handler);
    void onCondition(TypedBlockHandler<IConditionContext> handler);
    void onAction(TypedBlockHandler<IActionContext> handler);

    // ─── Scene lifecycle ─────────────────────────────────────────────
    void onSceneEnter(SceneLifecycleHandler handler);
    void onSceneExit(SceneLifecycleHandler handler);

    // ─── Scene handles ───────────────────────────────────────────────
    std::unique_ptr<ISceneHandle> scene(const std::string& sceneId);

    // ─── Engine control ──────────────────────────────────────────────
    void stop();
    bool isRunning() const;
    std::vector<ISceneHandle*> getActiveScenes() const;
    std::vector<const BlueprintBlock*> getCurrentBlocks() const;
    std::vector<const BlueprintConnection*> getSceneConnections(const std::string& sceneId) const;

private:
    std::unique_ptr<BlueprintGraph> _graph;
    HandlerRegistry _globalRegistry;
    IStateBridge* _stateBridge = nullptr;
    std::string _locale;
    std::unordered_map<std::string, ISceneHandle*> _activeScenes;
    bool _initialized = false;
};

} // namespace lsde
