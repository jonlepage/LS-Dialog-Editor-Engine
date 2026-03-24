// LSDE Dialog Engine — Public facade

#include <lsde/engine.h>
#include <lsde/validator.h>
#include <lsde/scene_handle.h>
#include <stdexcept>

namespace lsde {

DiagnosticReport DialogueEngine::init(const InitOptions& options) {
    auto report = validateBlueprint(options);

    if (report.errors.empty()) {
        _graph = std::make_unique<BlueprintGraph>(options.data);
        _initialized = true;
    }

    return report;
}

void DialogueEngine::setLocale(const std::string& locale) { _locale = locale; }
void DialogueEngine::setStateBridge(IStateBridge* bridge) { _stateBridge = bridge; }

void DialogueEngine::onValidateNextBlock(ValidateNextBlockHandler h) { _globalRegistry.validateNextBlockHandler = std::move(h); }
void DialogueEngine::onInvalidateBlock(InvalidateBlockHandler h) { _globalRegistry.invalidateBlockHandler = std::move(h); }
void DialogueEngine::onBeforeBlock(BeforeBlockHandler h) { _globalRegistry.beforeBlockHandler = std::move(h); }

void DialogueEngine::onDialog(TypedBlockHandler<IDialogContext> h) { _globalRegistry.dialogHandler = wrapHandler<IDialogContext>(std::move(h)); }
void DialogueEngine::onChoice(TypedBlockHandler<IChoiceContext> h) { _globalRegistry.choiceHandler = wrapHandler<IChoiceContext>(std::move(h)); }
void DialogueEngine::onCondition(TypedBlockHandler<IConditionContext> h) { _globalRegistry.conditionHandler = wrapHandler<IConditionContext>(std::move(h)); }
void DialogueEngine::onAction(TypedBlockHandler<IActionContext> h) { _globalRegistry.actionHandler = wrapHandler<IActionContext>(std::move(h)); }

void DialogueEngine::onSceneEnter(SceneLifecycleHandler h) { _globalRegistry.sceneEnterHandler = std::move(h); }
void DialogueEngine::onSceneExit(SceneLifecycleHandler h) { _globalRegistry.sceneExitHandler = std::move(h); }

std::unique_ptr<ISceneHandle> DialogueEngine::scene(const std::string& sceneId) {
    if (!_initialized || !_graph) {
        throw std::runtime_error("Engine not initialized. Call init() first.");
    }

    auto* sg = _graph->getSceneGraph(sceneId);
    if (!sg) {
        throw std::runtime_error("Scene \"" + sceneId + "\" not found.");
    }

    auto handle = std::make_unique<SceneHandleImpl>(*sg, _globalRegistry, SceneHandleCallbacks{
        [this, sceneId](ISceneHandle* h) { _activeScenes[sceneId] = h; },
        [this, sceneId](ISceneHandle*) { _activeScenes.erase(sceneId); },
        [this]() -> IStateBridge* { return _stateBridge; },
        [this]() -> std::string { return _locale; },
    });

    return handle;
}

void DialogueEngine::stop() {
    // Copy keys to avoid modifying map during iteration
    std::vector<ISceneHandle*> handles;
    for (auto& [_, h] : _activeScenes) handles.push_back(h);
    for (auto* h : handles) h->cancel();
}

bool DialogueEngine::isRunning() const { return !_activeScenes.empty(); }

std::vector<ISceneHandle*> DialogueEngine::getActiveScenes() const {
    std::vector<ISceneHandle*> result;
    for (const auto& [_, h] : _activeScenes) result.push_back(h);
    return result;
}

std::vector<const BlueprintBlock*> DialogueEngine::getCurrentBlocks() const {
    std::vector<const BlueprintBlock*> blocks;
    for (const auto& [_, h] : _activeScenes) {
        auto* block = h->getCurrentBlock();
        if (block) blocks.push_back(block);
    }
    return blocks;
}

std::vector<const BlueprintConnection*> DialogueEngine::getSceneConnections(const std::string& sceneId) const {
    if (!_graph) return {};
    return _graph->getSceneConnections(sceneId);
}

} // namespace lsde
