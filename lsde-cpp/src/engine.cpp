// LSDE Dialog Engine — Public facade

#include <lsde/engine.h>
#include <lsde/validator.h>
#include <lsde/scene_handle.h>
#include <lsde/utils.h>
#include <stdexcept>
#include <algorithm>

namespace lsde {

DiagnosticReport DialogueEngine::init(const InitOptions& options) {
    auto report = validateBlueprint(options);

    if (report.errors.empty()) {
        _graph = std::make_unique<BlueprintGraph>(options.data);
        _initialized = true;
    }

    return report;
}

void DialogueEngine::setLocale(const std::string& locale) {
    if (_graph) {
        auto validLocales = _graph->getLocales();
        if (!validLocales.empty() &&
            std::find(validLocales.begin(), validLocales.end(), locale) == validLocales.end()) {
            throw std::runtime_error(
                "Invalid locale \"" + locale + "\". Available locales: " +
                [&]() {
                    std::string result;
                    for (size_t i = 0; i < validLocales.size(); ++i) {
                        if (i > 0) result += ", ";
                        result += validLocales[i];
                    }
                    return result;
                }());
        }
    }
    _locale = locale;
    LsdeUtils::locale = locale;
}

void DialogueEngine::onResolveCharacter(std::function<const Card*(const std::vector<Card>&)> fn) {
    _resolveCharacter = std::move(fn);
}

void DialogueEngine::onResolveCondition(std::function<bool(const ConditionTest&)> evaluator) {
    _conditionResolver = std::move(evaluator);
}

void DialogueEngine::onValidateNextBlock(ValidateNextBlockHandler h) { _globalRegistry.validateNextBlockHandler = std::move(h); }
void DialogueEngine::onInvalidateBlock(InvalidateBlockHandler h) { _globalRegistry.invalidateBlockHandler = std::move(h); }
void DialogueEngine::onBeforeBlock(BeforeBlockHandler h) { _globalRegistry.beforeBlockHandler = std::move(h); }

void DialogueEngine::onDialog(TypedBlockHandler<BlueprintBlock, IDialogContext> h) { _globalRegistry.dialogHandler = wrapHandler<BlueprintBlock, IDialogContext>(std::move(h)); }
void DialogueEngine::onChoice(TypedBlockHandler<BlueprintBlock, IChoiceContext> h) { _globalRegistry.choiceHandler = wrapHandler<BlueprintBlock, IChoiceContext>(std::move(h)); }
void DialogueEngine::onCondition(TypedBlockHandler<BlueprintBlock, IConditionContext> h) { _globalRegistry.conditionHandler = wrapHandler<BlueprintBlock, IConditionContext>(std::move(h)); }
void DialogueEngine::onAction(TypedBlockHandler<BlueprintBlock, IActionContext> h) { _globalRegistry.actionHandler = wrapHandler<BlueprintBlock, IActionContext>(std::move(h)); }

void DialogueEngine::onSceneEnter(SceneLifecycleHandler h) { _globalRegistry.sceneEnterHandler = std::move(h); }
void DialogueEngine::onSceneExit(SceneLifecycleHandler h) { _globalRegistry.sceneExitHandler = std::move(h); }

std::unique_ptr<ISceneHandle> DialogueEngine::scene(const std::string& sceneRef) {
    if (!_initialized || !_graph) {
        throw std::runtime_error("Engine not initialized. Call init() first.");
    }

    auto* sg = _graph->getSceneGraph(sceneRef);
    if (!sg) {
        throw std::runtime_error("Scene \"" + sceneRef + "\" not found.");
    }

    auto handle = std::make_unique<SceneHandleImpl>(*sg, _globalRegistry, SceneHandleCallbacks{
        [this, sceneRef](ISceneHandle* h) { _activeScenes[sceneRef] = h; },
        // Only if the entry still points at the handle that is ending. Nothing stops a game from
        // opening the same scene twice - a hub revisited while a first pass is parked on a handler
        // - and a blind erase then dropped the LIVE one from the registry: the engine reported
        // itself idle while a scene was still running, and stop() no longer reached it.
        [this, sceneRef](ISceneHandle* h) {
            auto it = _activeScenes.find(sceneRef);
            if (it != _activeScenes.end() && it->second == h) _activeScenes.erase(it);
        },
        [this]() { return _resolveCharacter; },
        [this]() -> std::function<bool(const ConditionTest&)> { return _conditionResolver; },
        [this](const std::string& cardId) { return _graph->getCard(cardId); },
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

std::vector<BlueprintConnection> DialogueEngine::getSceneConnections(const std::string& sceneRef) const {
    if (!_graph) return {};
    return _graph->getSceneConnections(sceneRef);
}

} // namespace lsde
