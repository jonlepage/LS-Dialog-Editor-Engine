// LSDE Dialog Engine — SceneHandle + AsyncTrack (C++ port of scene-handle.ts)

#include <lsde/scene_handle.h>
#include <lsde/port_resolver.h>
#include <lsde/condition_evaluator.h>
#include <lsde/utils.h>
#include <algorithm>

namespace lsde {

// ─── Helper ──────────────────────────────────────────────────────────────────

static bool getGlobalPreventedImpl(IBaseBlockContext* ctx) {
    if (auto* dc = dynamic_cast<InternalDialogContext*>(ctx)) return dc->globalPrevented;
    if (auto* cc = dynamic_cast<InternalChoiceContext*>(ctx)) return cc->globalPrevented;
    if (auto* cndc = dynamic_cast<InternalConditionContext*>(ctx)) return cndc->globalPrevented;
    if (auto* ac = dynamic_cast<InternalActionContext*>(ctx)) return ac->globalPrevented;
    return false;
}

static CleanupFn combineCleanupsImpl(CleanupFn a, CleanupFn b) {
    if (a && b) return [a = std::move(a), b = std::move(b)]() { a(); b(); };
    if (a) return a;
    if (b) return b;
    return {};
}

// ─── AsyncTrack ──────────────────────────────────────────────────────────────

AsyncTrack::AsyncTrack(const SceneGraph& sg, SceneHandleImpl& parent, const BlueprintBlock& startBlock)
    : _sceneGraph(sg), _parent(parent)
{
    _followNarrative = startBlock.nativeProperties && startBlock.nativeProperties->followNarrative
        && *startBlock.nativeProperties->followNarrative;
    processBlock(startBlock);
}

void AsyncTrack::cancel() {
    if (!_running) return;
    _running = false;
    if (_previousCleanup) { _previousCleanup(); _previousCleanup = {}; }
    _currentBlock = nullptr;
    _pendingAdvance = {};
}

bool AsyncTrack::isRunning() const { return _running; }
bool AsyncTrack::isFollowNarrative() const { return _followNarrative; }

void AsyncTrack::notifyMainAdvance() {
    if (!_running || !_followNarrative) return;
    if (_pendingAdvance) {
        auto advance = std::move(_pendingAdvance);
        _pendingAdvance = {};
        advance();
    } else {
        forceAdvance();
    }
}

void AsyncTrack::processBlock(const BlueprintBlock& block) {
    if (!_running) return;

    if (block.type == BlockType::Note) {
        auto conns = _sceneGraph.getOutgoingConnections(block.uuid);
        if (!conns.empty()) {
            auto* next = _sceneGraph.getBlock(conns[0]->toId);
            if (next) { processBlock(*next); return; }
        }
        endTrack();
        return;
    }

    _currentBlock = &block;
    _parent.addVisited(block.uuid);
    executeBlockHandler(block);
}

void AsyncTrack::executeBlockHandler(const BlueprintBlock& block) {
    if (!_running) return;

    auto resolved = resolveHandler(block.type, block.uuid, &_parent.getSceneRegistry(), _parent.getGlobalRegistry());

    _ownedContext = _parent.createBlockContext(block);
    auto* context = _ownedContext.get();
    if (!context) {
        advanceToNextBlock(block, nullptr);
        return;
    }

    if (!resolved.sceneHandler && !resolved.globalHandler) {
        if (block.type == BlockType::Condition) {
            autoEvaluateCondition(block, dynamic_cast<InternalConditionContext*>(context));
            return;
        }
        if (block.type == BlockType::Action) {
            autoExecuteAction(block, dynamic_cast<InternalActionContext*>(context));
            return;
        }
    }

    bool nextCalled = false;
    bool syncPhase = true;
    CleanupFn sceneCleanup, globalCleanup;

    const BlueprintBlock* blockPtr = &block;
    auto next = [&nextCalled, &syncPhase, this, blockPtr, context]() {
        if (nextCalled) return;
        nextCalled = true;
        if (_followNarrative) {
            _pendingAdvance = [this, blockPtr, context]() { advanceToNextBlock(*blockPtr, context); };
            return;
        }
        if (syncPhase) return;
        advanceToNextBlock(*blockPtr, context);
    };

    std::function<void()> nextFn = next;

    if (resolved.sceneHandler) {
        sceneCleanup = resolved.sceneHandler(&_parent, &block, context, nextFn);
        if (!getGlobalPreventedImpl(context) && resolved.globalHandler) {
            globalCleanup = resolved.globalHandler(&_parent, &block, context, nextFn);
        }
    } else if (resolved.globalHandler) {
        globalCleanup = resolved.globalHandler(&_parent, &block, context, nextFn);
    }

    _previousCleanup = combineCleanupsImpl(std::move(sceneCleanup), std::move(globalCleanup));

    syncPhase = false;
    if (nextCalled && !_followNarrative) {
        advanceToNextBlock(block, context);
    }
}

void AsyncTrack::advanceToNextBlock(const BlueprintBlock& block, IBaseBlockContext* context) {
    if (!_running) return;

    auto conns = _sceneGraph.getOutgoingConnections(block.uuid);
    std::vector<BlueprintConnection> connsCopy;
    for (auto* c : conns) connsCopy.push_back(*c);

    PortResolutionInput input;
    input.block = &block;
    input.connections = &connsCopy;
    if (auto* cc = dynamic_cast<InternalChoiceContext*>(context)) input.selectedChoiceUuid = cc->selectedChoiceUuid;
    if (auto* cndc = dynamic_cast<InternalConditionContext*>(context)) input.conditionResult = cndc->conditionResult;
    if (auto* ac = dynamic_cast<InternalActionContext*>(context)) input.actionRejected = ac->actionRejected;
    if (auto* dc = dynamic_cast<InternalDialogContext*>(context)) input.characterPortIndex = dc->characterPortIndex;

    auto resolution = resolvePort(input);

    if (!resolution.connections.empty()) {
        auto* conn = resolution.connections[0];
        auto* nextBlock = _sceneGraph.getBlock(conn->toId);
        if (nextBlock) {
            auto cleanup = std::move(_previousCleanup);
            _previousCleanup = {};
            if (cleanup) cleanup();
            processBlock(*nextBlock);
            return;
        }
    }
    endTrack();
}

void AsyncTrack::forceAdvance() {
    if (!_running || !_currentBlock) return;
    auto* block = _currentBlock;
    if (_previousCleanup) { _previousCleanup(); _previousCleanup = {}; }
    advanceToNextBlock(*block, nullptr);
}

void AsyncTrack::endTrack() {
    if (_previousCleanup) { _previousCleanup(); _previousCleanup = {}; }
    _running = false;
    _currentBlock = nullptr;
    _parent.removeTrack(this);
}

void AsyncTrack::autoEvaluateCondition(const BlueprintBlock& block, InternalConditionContext* context) {
    auto* bridge = _parent.getStateBridge();
    if (!bridge) { endTrack(); return; }
    if (block.type == BlockType::Condition) {
        context->conditionResult = evaluateConditionChain(block.conditions,
            [bridge](const ExportCondition& c) { return bridge->evaluateCondition(c); });
    }
    _previousCleanup = {};
    advanceToNextBlock(block, context);
}

void AsyncTrack::autoExecuteAction(const BlueprintBlock& block, InternalActionContext* context) {
    auto* bridge = _parent.getStateBridge();
    if (!bridge) { endTrack(); return; }
    if (block.type == BlockType::Action) {
        for (const auto& action : block.actions) {
            bridge->executeAction(action, nullptr);
        }
    }
    context->actionRejected = false;
    _previousCleanup = {};
    advanceToNextBlock(block, context);
}

// ─── SceneHandleImpl ─────────────────────────────────────────────────────────

SceneHandleImpl::SceneHandleImpl(const SceneGraph& sg, const HandlerRegistry& gr, SceneHandleCallbacks cb)
    : _sceneGraph(sg), _globalRegistry(gr), _callbacks(std::move(cb)) {}

void SceneHandleImpl::start() {
    if (_running) return;
    _running = true;
    _cancelled = false;
    if (_callbacks.onSceneStarted) _callbacks.onSceneStarted(this);

    fireSceneEnter();

    auto* startBlock = _sceneGraph.getStartBlock();
    if (startBlock) {
        processBlock(*startBlock);
    } else {
        endScene();
    }
}

void SceneHandleImpl::cancel() {
    if (!_running) return;
    _cancelled = true;
    for (auto& track : _asyncTracks) track->cancel();
    _asyncTracks.clear();
    if (_previousCleanup) { _previousCleanup(); _previousCleanup = {}; }
    _running = false;
    _currentBlock = nullptr;
    fireSceneExit();
    if (_callbacks.onSceneEnded) _callbacks.onSceneEnded(this);
}

void SceneHandleImpl::onEnter(SceneLifecycleHandler h) { _sceneRegistry.enterHandler = std::move(h); }
void SceneHandleImpl::onExit(SceneLifecycleHandler h) { _sceneRegistry.exitHandler = std::move(h); }
void SceneHandleImpl::onBlock(const std::string& uuid, InternalBlockHandler h) { _sceneRegistry.setBlockHandler(uuid, std::move(h)); }
void SceneHandleImpl::onDialog(TypedBlockHandler<IDialogContext> h) { _sceneRegistry.dialogHandler = wrapHandler<IDialogContext>(std::move(h)); }
void SceneHandleImpl::onChoice(TypedBlockHandler<IChoiceContext> h) { _sceneRegistry.choiceHandler = wrapHandler<IChoiceContext>(std::move(h)); }
void SceneHandleImpl::onCondition(TypedBlockHandler<IConditionContext> h) { _sceneRegistry.conditionHandler = wrapHandler<IConditionContext>(std::move(h)); }
void SceneHandleImpl::onAction(TypedBlockHandler<IActionContext> h) { _sceneRegistry.actionHandler = wrapHandler<IActionContext>(std::move(h)); }

const BlueprintBlock* SceneHandleImpl::getCurrentBlock() const { return _currentBlock; }
const std::unordered_set<std::string>& SceneHandleImpl::getVisitedBlocks() const { return _visited; }
bool SceneHandleImpl::isRunning() const { return _running; }

int SceneHandleImpl::getActiveTracks() const {
    int count = 0;
    for (const auto& t : _asyncTracks) { if (t->isRunning()) count++; }
    return count;
}

const SceneGraph& SceneHandleImpl::getSceneGraph() const { return _sceneGraph; }
const SceneHandlerRegistry& SceneHandleImpl::getSceneRegistry() const { return _sceneRegistry; }
const HandlerRegistry& SceneHandleImpl::getGlobalRegistry() const { return _globalRegistry; }
IStateBridge* SceneHandleImpl::getStateBridge() const { return _callbacks.getStateBridge ? _callbacks.getStateBridge() : nullptr; }
void SceneHandleImpl::addVisited(const std::string& uuid) { _visited.insert(uuid); }

void SceneHandleImpl::removeTrack(AsyncTrack* track) {
    auto it = std::find_if(_asyncTracks.begin(), _asyncTracks.end(),
        [track](const std::unique_ptr<AsyncTrack>& t) { return t.get() == track; });
    if (it != _asyncTracks.end()) _asyncTracks.erase(it);
}

std::unique_ptr<IBaseBlockContext> SceneHandleImpl::createBlockContext(const BlueprintBlock& block) {
    return createContext(block);
}

// ─── Traversal ───────────────────────────────────────────────────────────────

void SceneHandleImpl::processBlock(const BlueprintBlock& block) {
    if (_cancelled) return;

    // Skip NOTE
    if (block.type == BlockType::Note) {
        auto conns = _sceneGraph.getOutgoingConnections(block.uuid);
        if (!conns.empty()) {
            auto* next = _sceneGraph.getBlock(conns[0]->toId);
            if (next) { processBlock(*next); return; }
        }
        endScene();
        return;
    }

    // Validate
    if (_globalRegistry.validateNextBlockHandler) {
        auto result = _globalRegistry.validateNextBlockHandler({&block, _previousBlock, nullptr, {}});
        if (!result.valid) {
            if (_globalRegistry.invalidateBlockHandler) {
                _globalRegistry.invalidateBlockHandler({this, result.reason.value_or("validation_failed")});
            }
            return;
        }
    }

    if (_cancelled) return;

    _currentBlock = &block;
    _visited.insert(block.uuid);

    // onBeforeBlock
    if (_globalRegistry.beforeBlockHandler) {
        BeforeBlockArgs args;
        args.block = &block;
        args.scene = this;
        args.context.nativeProperties = block.nativeProperties ? &*block.nativeProperties : nullptr;
        args.resolve = [this, &block]() { executeBlockHandler(block); };
        _globalRegistry.beforeBlockHandler(args);
    } else {
        executeBlockHandler(block);
    }
}

void SceneHandleImpl::executeBlockHandler(const BlueprintBlock& block) {
    if (_cancelled) return;

    auto resolved = resolveHandler(block.type, block.uuid, &_sceneRegistry, _globalRegistry);

    _ownedContext = createContext(block);
    auto* context = _ownedContext.get();
    if (!context) {
        advanceToNextBlock(block, nullptr);
        return;
    }

    if (!resolved.sceneHandler && !resolved.globalHandler) {
        if (block.type == BlockType::Condition) {
            autoEvaluateCondition(block, dynamic_cast<InternalConditionContext*>(context));
            return;
        }
        if (block.type == BlockType::Action) {
            autoExecuteAction(block, dynamic_cast<InternalActionContext*>(context));
            return;
        }
    }

    bool nextCalled = false;
    bool syncPhase = true;
    CleanupFn sceneCleanup, globalCleanup;

    const BlueprintBlock* blockPtr = &block;
    auto next = [&nextCalled, &syncPhase, this, blockPtr, context]() {
        if (nextCalled) return;
        nextCalled = true;
        if (syncPhase) return;
        advanceToNextBlock(*blockPtr, context);
    };

    std::function<void()> nextFn = next;

    if (resolved.sceneHandler) {
        sceneCleanup = resolved.sceneHandler(this, blockPtr, context, nextFn);
        if (!getGlobalPreventedImpl(context) && resolved.globalHandler) {
            globalCleanup = resolved.globalHandler(this, &block, context, nextFn);
        }
    } else if (resolved.globalHandler) {
        globalCleanup = resolved.globalHandler(this, &block, context, nextFn);
    }

    _previousCleanup = combineCleanupsImpl(std::move(sceneCleanup), std::move(globalCleanup));

    syncPhase = false;
    if (nextCalled) {
        advanceToNextBlock(block, context);
    }
}

void SceneHandleImpl::advanceToNextBlock(const BlueprintBlock& block, IBaseBlockContext* context) {
    if (_cancelled) return;

    _previousBlock = &block;

    auto conns = _sceneGraph.getOutgoingConnections(block.uuid);
    std::vector<BlueprintConnection> connsCopy;
    for (auto* c : conns) connsCopy.push_back(*c);

    PortResolutionInput input;
    input.block = &block;
    input.connections = &connsCopy;
    if (auto* cc = dynamic_cast<InternalChoiceContext*>(context)) input.selectedChoiceUuid = cc->selectedChoiceUuid;
    if (auto* cndc = dynamic_cast<InternalConditionContext*>(context)) input.conditionResult = cndc->conditionResult;
    if (auto* ac = dynamic_cast<InternalActionContext*>(context)) input.actionRejected = ac->actionRejected;
    if (auto* dc = dynamic_cast<InternalDialogContext*>(context)) input.characterPortIndex = dc->characterPortIndex;

    auto resolution = resolvePort(input);

    // Separate: first non-async = main, rest = async
    const BlueprintConnection* mainConnection = nullptr;
    std::vector<const BlueprintConnection*> asyncConnections;

    for (auto* conn : resolution.connections) {
        auto* targetBlock = _sceneGraph.getBlock(conn->toId);
        if (!targetBlock) continue;

        if (!mainConnection && !(targetBlock->nativeProperties && targetBlock->nativeProperties->isAsync
            && *targetBlock->nativeProperties->isAsync)) {
            mainConnection = conn;
        } else {
            asyncConnections.push_back(conn);
        }
    }

    // Spawn async tracks
    for (auto* conn : asyncConnections) {
        auto* targetBlock = _sceneGraph.getBlock(conn->toId);
        if (targetBlock) {
            _asyncTracks.push_back(std::make_unique<AsyncTrack>(_sceneGraph, *this, *targetBlock));
        }
    }

    // Notify follow-narrative tracks
    for (auto& track : _asyncTracks) {
        if (track->isFollowNarrative()) {
            track->notifyMainAdvance();
        }
    }

    // Continue main track
    if (mainConnection) {
        auto* nextBlock = _sceneGraph.getBlock(mainConnection->toId);
        if (nextBlock) {
            auto cleanup = std::move(_previousCleanup);
            _previousCleanup = {};
            if (cleanup) cleanup();
            processBlock(*nextBlock);
            return;
        }
    }

    endScene();
}

void SceneHandleImpl::endScene() {
    for (auto& track : _asyncTracks) track->cancel();
    _asyncTracks.clear();
    if (_previousCleanup) { _previousCleanup(); _previousCleanup = {}; }
    _running = false;
    _currentBlock = nullptr;
    fireSceneExit();
    if (_callbacks.onSceneEnded) _callbacks.onSceneEnded(this);
}

// ─── Auto-behaviors ──────────────────────────────────────────────────────────

void SceneHandleImpl::autoEvaluateCondition(const BlueprintBlock& block, InternalConditionContext* context) {
    auto* bridge = getStateBridge();
    if (!bridge) { endScene(); return; }
    if (block.type == BlockType::Condition) {
        context->conditionResult = evaluateConditionChain(block.conditions,
            [bridge](const ExportCondition& c) { return bridge->evaluateCondition(c); });
    }
    _previousCleanup = {};
    advanceToNextBlock(block, context);
}

void SceneHandleImpl::autoExecuteAction(const BlueprintBlock& block, InternalActionContext* context) {
    auto* bridge = getStateBridge();
    if (!bridge) { endScene(); return; }
    if (block.type == BlockType::Action) {
        for (const auto& action : block.actions) {
            bridge->executeAction(action, nullptr);
        }
    }
    context->actionRejected = false;
    _previousCleanup = {};
    advanceToNextBlock(block, context);
}

// ─── Scene lifecycle ─────────────────────────────────────────────────────────

void SceneHandleImpl::fireSceneEnter() {
    auto handler = _sceneRegistry.enterHandler ? _sceneRegistry.enterHandler : _globalRegistry.sceneEnterHandler;
    if (handler) handler({this, {}});
}

void SceneHandleImpl::fireSceneExit() {
    auto handler = _sceneRegistry.exitHandler ? _sceneRegistry.exitHandler : _globalRegistry.sceneExitHandler;
    if (handler) handler({this, {}});
}

// ─── Internal ────────────────────────────────────────────────────────────────

std::unique_ptr<IBaseBlockContext> SceneHandleImpl::createContext(const BlueprintBlock& block) {
    switch (block.type) {
        case BlockType::Dialog:
            return createDialogContext(block);
        case BlockType::Choice: {
            auto* bridge = getStateBridge();
            std::function<bool(const ExportCondition&)> evaluator;
            if (bridge) {
                evaluator = [bridge](const ExportCondition& c) { return bridge->evaluateCondition(c); };
            } else {
                evaluator = [](const ExportCondition&) { return true; };
            }
            return createChoiceContext(block, evaluator);
        }
        case BlockType::Condition:
            return createConditionContext();
        case BlockType::Action:
            return createActionContext();
        default:
            return nullptr;
    }
}

} // namespace lsde
