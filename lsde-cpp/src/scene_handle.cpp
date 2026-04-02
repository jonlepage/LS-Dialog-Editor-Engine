// LSDE Dialog Engine — SceneHandle + AsyncTrack (C++ port of scene-handle.ts)

#include <lsde/scene_handle.h>
#include <lsde/port_resolver.h>
#include <lsde/condition_evaluator.h>
#include <lsde/utils.h>
#include <algorithm>
#include <stdexcept>

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

AsyncTrack::AsyncTrack(const SceneGraph& sg, SceneHandleImpl& parent, const BlueprintBlock& startBlock, int id_, int parentTrackId_)
    : id(id_), parentTrackId(parentTrackId_), startBlockUuid(startBlock.uuid),
      _startBlock(&startBlock), _sceneGraph(sg), _parent(parent)
{
}

void AsyncTrack::start() {
    if (_startBlock->nativeProperties && _startBlock->nativeProperties->waitForBlocks) {
        const auto& waitBlocks = *_startBlock->nativeProperties->waitForBlocks;
        if (!waitBlocks.empty()) {
            bool allVisited = true;
            for (const auto& uuid : waitBlocks) {
                if (!_parent.isVisited(uuid)) { allVisited = false; break; }
            }
            if (!allVisited) {
                _pendingAdvance = [this]() { processBlock(*_startBlock); };
                _parent.registerWaitForBlocks(this, waitBlocks);
                return;
            }
        }
    }
    processBlock(*_startBlock);
}

void AsyncTrack::cancel() {
    if (!_running) return;
    _running = false;
    if (_previousCleanup) { _previousCleanup(); _previousCleanup = {}; }
    _currentBlock = nullptr;
    _pendingAdvance = {};
    for (auto childId : _childTrackIds) {
        _parent.cancelTrack(childId);
    }
    _childTrackIds.clear();
}

bool AsyncTrack::isRunning() const { return _running; }

void AsyncTrack::notifyWaitSatisfied() {
    if (!_running || !_pendingAdvance) return;
    auto advance = std::move(_pendingAdvance);
    _pendingAdvance = {};
    advance();
}

TrackInfo AsyncTrack::getTrackInfo() const {
    TrackInfo info;
    info.id = id;
    info.parentTrackId = parentTrackId;
    info.startBlockUuid = startBlockUuid;
    info.currentBlockUuid = _currentBlock ? _currentBlock->uuid : "";
    info.running = _running;
    return info;
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

    // Fire onBeforeBlock — same gate pattern as SceneHandleImpl::processBlock
    const auto& registry = _parent.getGlobalRegistry();
    if (registry.beforeBlockHandler) {
        BeforeBlockArgs args;
        args.block = &block;
        args.scene = &_parent;
        args.context.nativeProperties = block.nativeProperties ? &*block.nativeProperties : nullptr;
        args.resolve = [this, &block]() { executeBlockHandler(block); };
        registry.beforeBlockHandler(args);
    } else {
        executeBlockHandler(block);
    }
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
        advanceToNextBlock(block, context);
        return;
    }

    bool nextCalled = false;
    bool syncPhase = true;
    CleanupFn sceneCleanup, globalCleanup;

    const BlueprintBlock* blockPtr = &block;
    auto next = [&nextCalled, &syncPhase, this, blockPtr, context]() {
        if (nextCalled) return;
        nextCalled = true;

        // waitForBlocks: defer advance until all required blocks are visited
        if (blockPtr->nativeProperties && blockPtr->nativeProperties->waitForBlocks) {
            const auto& waitBlocks = *blockPtr->nativeProperties->waitForBlocks;
            if (!waitBlocks.empty()) {
                bool allVisited = true;
                for (const auto& uuid : waitBlocks) {
                    if (!_parent.isVisited(uuid)) { allVisited = false; break; }
                }
                if (!allVisited) {
                    _pendingAdvance = [this, blockPtr, context]() { advanceToNextBlock(*blockPtr, context); };
                    _parent.registerWaitForBlocks(this, waitBlocks);
                    return;
                }
            }
        }

        if (syncPhase) return;
        advanceToNextBlock(*blockPtr, context);
    };

    std::function<void()> nextFn = next;

    try {
        if (resolved.sceneHandler) {
            sceneCleanup = resolved.sceneHandler(&_parent, &block, context, nextFn);
            if (!getGlobalPreventedImpl(context) && resolved.globalHandler) {
                globalCleanup = resolved.globalHandler(&_parent, &block, context, nextFn);
            }
        } else if (resolved.globalHandler) {
            globalCleanup = resolved.globalHandler(&_parent, &block, context, nextFn);
        }
    } catch (...) {
        endTrack();
        return;
    }

    _previousCleanup = combineCleanupsImpl(std::move(sceneCleanup), std::move(globalCleanup));

    syncPhase = false;
    if (nextCalled && !_pendingAdvance) {
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

    // Separate main (first non-async) from async connections
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

    // Spawn sub-tracks
    for (auto* conn : asyncConnections) {
        auto* targetBlock = _sceneGraph.getBlock(conn->toId);
        if (targetBlock) {
            int trackId = _parent.spawnAsyncTrack(*targetBlock, this->id);
            _childTrackIds.push_back(trackId);
        }
    }

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
    endTrack();
}

void AsyncTrack::endTrack() {
    if (_previousCleanup) { _previousCleanup(); _previousCleanup = {}; }
    // Child tracks survive — only explicit cancel() cascades
    _running = false;
    _currentBlock = nullptr;
    _parent.removeTrack(this);
}

// ─── SceneHandleImpl ─────────────────────────────────────────────────────────

SceneHandleImpl::SceneHandleImpl(const SceneGraph& sg, const HandlerRegistry& gr, SceneHandleCallbacks cb)
    : _sceneGraph(sg), _globalRegistry(gr), _callbacks(std::move(cb)) {}

void SceneHandleImpl::start() {
    if (_running) return;

    // Validate that all 4 mandatory handlers are registered
    std::vector<std::string> missing;
    if (!_sceneRegistry.dialogHandler && !_globalRegistry.dialogHandler) missing.push_back("onDialog");
    if (!_sceneRegistry.choiceHandler && !_globalRegistry.choiceHandler) missing.push_back("onChoice");
    // onCondition is optional when onResolveCondition is installed — the engine auto-routes
    // from pre-evaluated conditionGroups. The handler becomes a logging/override hook.
    auto condResolver = _callbacks.getConditionResolver ? _callbacks.getConditionResolver() : ConditionResolverFn{};
    if (!_sceneRegistry.conditionHandler && !_globalRegistry.conditionHandler && !condResolver) missing.push_back("onCondition");
    if (!_sceneRegistry.actionHandler && !_globalRegistry.actionHandler) missing.push_back("onAction");
    if (!missing.empty()) {
        std::string msg = "Cannot start scene — missing required handler(s): ";
        for (size_t i = 0; i < missing.size(); ++i) {
            if (i > 0) msg += ", ";
            msg += missing[i];
        }
        msg += ".\nRegister all 4 handlers before starting:\n"
               "  engine.onDialog(handler)\n  engine.onChoice(handler)\n"
               "  engine.onCondition(handler)\n  engine.onAction(handler)";
        throw std::runtime_error(msg);
    }

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
    _pendingWaits.clear();
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
void SceneHandleImpl::onDialogId(const std::string& uuid, TypedBlockHandler<DialogBlock, IDialogContext> h) { _sceneRegistry.setBlockHandler(uuid, wrapHandler<DialogBlock, IDialogContext>(std::move(h))); }
void SceneHandleImpl::onChoiceId(const std::string& uuid, TypedBlockHandler<ChoiceBlock, IChoiceContext> h) { _sceneRegistry.setBlockHandler(uuid, wrapHandler<ChoiceBlock, IChoiceContext>(std::move(h))); }
void SceneHandleImpl::onConditionId(const std::string& uuid, TypedBlockHandler<ConditionBlock, IConditionContext> h) { _sceneRegistry.setBlockHandler(uuid, wrapHandler<ConditionBlock, IConditionContext>(std::move(h))); }
void SceneHandleImpl::onActionId(const std::string& uuid, TypedBlockHandler<ActionBlock, IActionContext> h) { _sceneRegistry.setBlockHandler(uuid, wrapHandler<ActionBlock, IActionContext>(std::move(h))); }
void SceneHandleImpl::onDialog(TypedBlockHandler<DialogBlock, IDialogContext> h) { _sceneRegistry.dialogHandler = wrapHandler<DialogBlock, IDialogContext>(std::move(h)); }
void SceneHandleImpl::onChoice(TypedBlockHandler<ChoiceBlock, IChoiceContext> h) { _sceneRegistry.choiceHandler = wrapHandler<ChoiceBlock, IChoiceContext>(std::move(h)); }
void SceneHandleImpl::onCondition(TypedBlockHandler<ConditionBlock, IConditionContext> h) { _sceneRegistry.conditionHandler = wrapHandler<ConditionBlock, IConditionContext>(std::move(h)); }
void SceneHandleImpl::onAction(TypedBlockHandler<ActionBlock, IActionContext> h) { _sceneRegistry.actionHandler = wrapHandler<ActionBlock, IActionContext>(std::move(h)); }

const BlueprintBlock* SceneHandleImpl::getCurrentBlock() const { return _currentBlock; }
const std::vector<std::string>& SceneHandleImpl::getVisitedBlocks() const { return _visitedOrder; }
bool SceneHandleImpl::isRunning() const { return _running; }

int SceneHandleImpl::getActiveTracks() const {
    int count = 0;
    for (const auto& t : _asyncTracks) { if (t->isRunning()) count++; }
    return count;
}

const SceneGraph& SceneHandleImpl::getSceneGraph() const { return _sceneGraph; }
const SceneHandlerRegistry& SceneHandleImpl::getSceneRegistry() const { return _sceneRegistry; }
const HandlerRegistry& SceneHandleImpl::getGlobalRegistry() const { return _globalRegistry; }
std::vector<TrackInfo> SceneHandleImpl::getTrackInfos() const {
    std::vector<TrackInfo> result;
    for (const auto& t : _asyncTracks) {
        if (t->isRunning()) result.push_back(t->getTrackInfo());
    }
    return result;
}

void SceneHandleImpl::addVisited(const std::string& uuid) {
    if (_visitedSet.insert(uuid).second) {
        _visitedOrder.push_back(uuid);
    }
    if (!_pendingWaits.empty()) {
        std::vector<AsyncTrack*> satisfied;
        for (auto& [track, required] : _pendingWaits) {
            bool allVisited = true;
            for (const auto& u : required) {
                if (_visitedSet.find(u) == _visitedSet.end()) { allVisited = false; break; }
            }
            if (allVisited) satisfied.push_back(track);
        }
        for (auto* track : satisfied) {
            _pendingWaits.erase(track);
            track->notifyWaitSatisfied();
        }
    }
}

int SceneHandleImpl::spawnAsyncTrack(const BlueprintBlock& startBlock, int parentTrackId) {
    int trackId = _nextTrackId++;
    auto track = std::make_unique<AsyncTrack>(_sceneGraph, *this, startBlock, trackId, parentTrackId);
    auto* trackPtr = track.get();
    _asyncTracks.push_back(std::move(track));
    trackPtr->start();
    return trackId;
}

void SceneHandleImpl::cancelTrack(int trackId) {
    for (auto& t : _asyncTracks) {
        if (t->id == trackId) { t->cancel(); return; }
    }
}

void SceneHandleImpl::registerWaitForBlocks(AsyncTrack* track, const std::vector<std::string>& blockUuids) {
    _pendingWaits[track] = blockUuids;
}

bool SceneHandleImpl::isVisited(const std::string& uuid) const {
    return _visitedSet.find(uuid) != _visitedSet.end();
}

void SceneHandleImpl::removeTrack(AsyncTrack* track) {
    auto it = std::find_if(_asyncTracks.begin(), _asyncTracks.end(),
        [track](const std::unique_ptr<AsyncTrack>& t) { return t.get() == track; });
    if (it != _asyncTracks.end()) _asyncTracks.erase(it);
}

std::unique_ptr<IBaseBlockContext> SceneHandleImpl::createBlockContext(const BlueprintBlock& block) {
    return createContext(block);
}

void SceneHandleImpl::recordChoice(const std::string& blockUuid, const std::string& choiceUuid) {
    _choiceHistory[blockUuid].push_back(choiceUuid);
}

bool SceneHandleImpl::evaluateConditionForBlock(const ExportCondition& condition,
    const std::function<bool(const ExportCondition&)>& fallbackEvaluator) {
    return evaluateConditionWithHistory(condition, fallbackEvaluator);
}

const std::unordered_map<std::string, std::vector<std::string>>& SceneHandleImpl::getChoiceHistory() const {
    return _choiceHistory;
}

const std::vector<std::string>* SceneHandleImpl::getChoice(const std::string& blockUuid) const {
    auto it = _choiceHistory.find(blockUuid);
    if (it == _choiceHistory.end()) return nullptr;
    return &it->second;
}

// Uses the unified resolver as fallback for non-choice conditions.
// Without a resolver, non-choice conditions default to false.
bool SceneHandleImpl::evaluateCondition(const ExportCondition& condition) {
    auto resolver = _callbacks.getConditionResolver ? _callbacks.getConditionResolver() : ConditionResolverFn{};
    return evaluateConditionWithHistory(condition, resolver ? resolver : [](const ExportCondition&) { return false; });
}

void SceneHandleImpl::onResolveCharacter(std::function<const BlockCharacter*(const std::vector<BlockCharacter>&)> fn) {
    _resolveCharacter = std::move(fn);
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
        static const std::vector<BlockCharacter> emptyChars;
        const auto& nextChars = block.metadata ? block.metadata->characters : emptyChars;
        auto resolverFn = getResolveCharacterFn();
        const BlockCharacter* nextCharacter = resolverFn ? resolverFn(nextChars) : nullptr;

        ValidateNextBlockArgs args;
        args.nextBlock = &block;
        args.fromBlock = _previousBlock;
        args.nextContext.character = nextCharacter;
        if (_previousBlock) {
            args.hasFromContext = true;
            args.fromContext.character = _previousCharacter;
        }
        args.port = nullptr;

        auto result = _globalRegistry.validateNextBlockHandler(args);
        if (!result.valid) {
            if (_globalRegistry.invalidateBlockHandler) {
                _globalRegistry.invalidateBlockHandler({this, result.reason.value_or("validation_failed")});
            }
            return;
        }
    }

    if (_cancelled) return;

    _currentBlock = &block;
    addVisited(block.uuid);

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

    // No handler → advance silently (handlers are validated at start())
    if (!resolved.sceneHandler && !resolved.globalHandler) {
        advanceToNextBlock(block, context);
        return;
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

    try {
        if (resolved.sceneHandler) {
            sceneCleanup = resolved.sceneHandler(this, blockPtr, context, nextFn);
            if (!getGlobalPreventedImpl(context) && resolved.globalHandler) {
                globalCleanup = resolved.globalHandler(this, &block, context, nextFn);
            }
        } else if (resolved.globalHandler) {
            globalCleanup = resolved.globalHandler(this, &block, context, nextFn);
        }
    } catch (...) {
        endScene();
        return;
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
    _previousCharacter = context ? context->character() : nullptr;

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
            spawnAsyncTrack(*targetBlock, -1);
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
    _pendingWaits.clear();
    for (auto& track : _asyncTracks) track->cancel();
    _asyncTracks.clear();
    if (_previousCleanup) { _previousCleanup(); _previousCleanup = {}; }
    _running = false;
    _currentBlock = nullptr;
    fireSceneExit();
    if (_callbacks.onSceneEnded) _callbacks.onSceneEnded(this);
}

// ─── Choice history condition evaluation ─────────────────────────────────────

bool SceneHandleImpl::evaluateConditionWithHistory(const ExportCondition& condition,
    const std::function<bool(const ExportCondition&)>& fallbackEvaluator) {
    if (condition.key.size() >= 7 && condition.key.substr(0, 7) == "choice:") {
        std::string blockUuid = condition.key.substr(7);
        auto it = _choiceHistory.find(blockUuid);
        if (it == _choiceHistory.end()) {
            return condition.op == "!=";
        }
        const auto& history = it->second;
        bool includes = std::find(history.begin(), history.end(), condition.value) != history.end();
        return condition.op == "!=" ? !includes : includes;
    }
    return fallbackEvaluator(condition);
}

// ─── Choice visibility tagging ───────────────────────────────────────────────

std::vector<RuntimeChoiceItem> SceneHandleImpl::tagChoiceVisibility(
    const std::vector<ChoiceItem>& choices,
    const ConditionResolverFn& resolver)
{
    std::vector<RuntimeChoiceItem> result;
    result.reserve(choices.size());

    for (const auto& choice : choices) {
        RuntimeChoiceItem tagged;
        // Copy base ChoiceItem fields
        static_cast<ChoiceItem&>(tagged) = choice;

        if (!resolver) {
            // No resolver → visible stays nullopt (undefined)
            result.push_back(std::move(tagged));
            continue;
        }

        if (choice.visibilityConditions.empty()) {
            tagged.visible = true;
        } else {
            tagged.visible = evaluateConditionChain(choice.visibilityConditions, [this, &resolver](const ExportCondition& cond) {
                if (cond.key.size() >= 7 && cond.key.substr(0, 7) == "choice:") {
                    return evaluateConditionWithHistory(cond, [](const ExportCondition&) { return false; });
                }
                return resolver(cond);
            });
        }
        result.push_back(std::move(tagged));
    }
    return result;
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

// ─── Internal helpers ────────────────────────────────────────────────────────

ResolveCharacterFn SceneHandleImpl::getResolveCharacterFn() const {
    if (_resolveCharacter) return _resolveCharacter;
    if (_callbacks.getResolveCharacter) return _callbacks.getResolveCharacter();
    return [](const std::vector<BlockCharacter>& chars) -> const BlockCharacter* {
        return chars.empty() ? nullptr : &chars[0];
    };
}

std::unique_ptr<IBaseBlockContext> SceneHandleImpl::createContext(const BlueprintBlock& block) {
    // Character resolved fresh every time — no caching.
    // A pre-resolve cache was removed because async tracks (spawned via waitForBlocks →
    // notifyWaitSatisfied) consumed the main track's cached character, producing wrong results.
    static const std::vector<BlockCharacter> emptyCharacters;
    const auto& characters = block.metadata ? block.metadata->characters : emptyCharacters;
    auto resolverFn = getResolveCharacterFn();
    const BlockCharacter* resolvedCharacter = resolverFn ? resolverFn(characters) : nullptr;

    if (auto* db = dynamic_cast<const DialogBlock*>(&block)) {
        return createDialogContext(*db, resolvedCharacter);
    }
    if (auto* cb = dynamic_cast<const ChoiceBlock*>(&block)) {
        auto resolver = _callbacks.getConditionResolver ? _callbacks.getConditionResolver() : ConditionResolverFn{};
        auto taggedChoices = tagChoiceVisibility(cb->choices, resolver);
        auto onChoiceSelected = [this](const std::string& blockUuid, const std::string& choiceUuid) {
            recordChoice(blockUuid, choiceUuid);
        };
        return createChoiceContext(*cb, std::move(taggedChoices), resolvedCharacter, std::move(onChoiceSelected));
    }
    if (auto* condBlock = dynamic_cast<const ConditionBlock*>(&block)) {
        auto resolver = _callbacks.getConditionResolver ? _callbacks.getConditionResolver() : ConditionResolverFn{};
        if (resolver) {
            const auto& rawGroups = condBlock->conditions;
            // Unified evaluator: choice: conditions resolved internally via choice history,
            // game-state conditions delegated to the onResolveCondition callback.
            auto evaluate = [this, &resolver](const ExportCondition& cond) -> bool {
                if (cond.key.size() >= 7 && cond.key.substr(0, 7) == "choice:")
                    return evaluateConditionWithHistory(cond, [](const ExportCondition&) { return false; });
                return resolver(cond);
            };
            auto ctx = createConditionContext(resolvedCharacter);
            auto* condCtx = dynamic_cast<InternalConditionContext*>(ctx.get());
            // Auto-resolve from pre-evaluated groups
            std::vector<int> matched;
            for (size_t i = 0; i < rawGroups.size(); ++i) {
                if (evaluateConditionChain(rawGroups[i], evaluate))
                    matched.push_back(static_cast<int>(i));
            }
            bool isDispatcher = condBlock->nativeProperties
                && condBlock->nativeProperties->enableDispatcher
                && *condBlock->nativeProperties->enableDispatcher;
            if (isDispatcher) {
                condCtx->conditionResult = matched;
            } else {
                condCtx->conditionResult = matched.empty() ? -1 : matched[0];
            }
            return ctx;
        }
        return createConditionContext(resolvedCharacter);
    }
    if (dynamic_cast<const ActionBlock*>(&block)) {
        return createActionContext(resolvedCharacter);
    }
    return nullptr;
}

} // namespace lsde
