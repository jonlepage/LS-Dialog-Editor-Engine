// LSDE Dialog Engine — SceneHandle + AsyncTrack (C++ port of scene-handle.ts)

#include <lsde/scene_handle.h>
#include <lsde/port_resolver.h>
#include <lsde/condition_evaluator.h>
#include <lsde/utils.h>
#include <algorithm>
#include <stdexcept>
#include <string>
#include <unordered_set>

namespace lsde {

// ─── Helper ──────────────────────────────────────────────────────────────────

// Walk past NOTE blocks to the first block the engine actually dispatches.
//
// NOTE blocks are designer-only: they carry no handler and are never executed, so the
// traversal steps over them and follows their first outgoing connection.
//
// Returns nullptr when the walk runs out of connections — and also when it comes back to a
// NOTE it already stepped over. A designer can wire a NOTE into a loop, and following it
// recursively overflowed the stack instead of ending the flow.
static const BlueprintBlock* skipNotes(const BlueprintBlock& block, const SceneGraph& sceneGraph) {
    const BlueprintBlock* current = &block;
    std::unordered_set<std::string> seen;

    while (current && current->type == BlockType::Note) {
        if (!seen.insert(current->id).second) return nullptr;

        const auto& links = sceneGraph.getOutgoingLinks(current->id);
        current = links.empty() ? nullptr : sceneGraph.getBlock(links[0].to);
    }

    return current;
}

static bool getGlobalPreventedImpl(IBaseBlockContext* ctx) {
    if (auto* dc = dynamic_cast<InternalDialogContext*>(ctx)) return dc->globalPrevented;
    if (auto* cc = dynamic_cast<InternalChoiceContext*>(ctx)) return cc->globalPrevented;
    if (auto* cndc = dynamic_cast<InternalConditionContext*>(ctx)) return cndc->globalPrevented;
    if (auto* ac = dynamic_cast<InternalActionContext*>(ctx)) return ac->globalPrevented;
    return false;
}

/// Run a cleanup and hand back what it threw instead of letting it escape.
///
/// A cleanup runs while the engine is tearing something down - leaving a block, ending a track,
/// closing a scene. An exception escaping mid-teardown STOPPED the teardown: the scene stayed
/// running, onSceneExit never fired, the remaining tracks were never cancelled, and the handle sat
/// in the engine's registry forever. The game got its exception and an engine it could no longer
/// use.
///
/// So the shutdown always finishes and the fault is re-thrown once there is nothing left to
/// unwind - the same contract as a handler that throws.
static std::exception_ptr runCleanup(const CleanupFn& cleanup) {
    if (!cleanup) return nullptr;
    try {
        cleanup();
        return nullptr;
    } catch (...) {
        return std::current_exception();
    }
}

/// Combine a scene cleanup and a global one. BOTH always run.
///
/// They release unrelated things - a scene handler's panel and a global handler's audio voice - so
/// letting the first one's failure skip the second leaked whatever the second owned. The first
/// fault is re-thrown once both have had their turn.
static CleanupFn combineCleanupsImpl(CleanupFn a, CleanupFn b) {
    if (a && b) {
        return [a = std::move(a), b = std::move(b)]() {
            auto first = runCleanup(a);
            auto second = runCleanup(b);
            auto fault = first ? first : second;
            if (fault) std::rethrow_exception(fault);
        };
    }
    if (a) return a;
    if (b) return b;
    return {};
}

// ─── AsyncTrack ──────────────────────────────────────────────────────────────

AsyncTrack::AsyncTrack(const SceneGraph& sg, SceneHandleImpl& parent, const BlueprintBlock& startBlock, int id_, int parentTrackId_)
    : id(id_), parentTrackId(parentTrackId_), startBlockUuid(startBlock.id),
      _startBlock(&startBlock), _sceneGraph(sg), _parent(parent)
{
}

void AsyncTrack::start() {
    {
        const auto waitBlocks = getNativeProperties(*_startBlock).waitForBlocks;
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

/// Stop this track and every track it spawned.
///
/// Returns a fault instead of throwing one: endScene() cancels the whole pool in a loop, and one
/// badly-behaved cleanup must not leave the tracks after it running.
std::exception_ptr AsyncTrack::cancel() {
    if (!_running) return nullptr;
    _running = false;

    auto cleanup = std::move(_previousCleanup);
    _previousCleanup = {};
    auto fault = runCleanup(cleanup);

    _currentBlock = nullptr;
    _pendingAdvance = {};
    for (auto childId : _childTrackIds) {
        auto childFault = _parent.cancelTrack(childId);
        if (!fault) fault = childFault;
    }
    _childTrackIds.clear();
    return fault;
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
    info.currentBlockUuid = _currentBlock ? _currentBlock->id : "";
    info.running = _running;
    return info;
}

void AsyncTrack::processBlock(const BlueprintBlock& startingBlock) {
    if (!_running) return;

    const BlueprintBlock* resolvedBlock = skipNotes(startingBlock, _sceneGraph);
    if (!resolvedBlock) {
        if (auto fault = endTrack()) std::rethrow_exception(fault);
        return;
    }
    const BlueprintBlock& block = *resolvedBlock;

    // The same gate the main flow goes through. A parallel track is still the game's dialogue.
    if (!_parent.runValidation(block, _previousBlock,
                               _previousCard ? &(*_previousCard) : nullptr)) {
        return;
    }

    _currentBlock = &block;
    _parent.addVisited(block.id);

    // Fire onBeforeBlock — same gate pattern as SceneHandleImpl::processBlock
    const auto& registry = _parent.getGlobalRegistry();
    if (registry.beforeBlockHandler) {
        BeforeBlockArgs args;
        args.block = &block;
        args.scene = &_parent;
        // The natives live in `props` alongside the writer's own properties. Ids cannot
        // collide, so this is a lookup, not a guess.
        NativeProperties natives = getNativeProperties(block);
        args.context.nativeProperties = &natives;
        auto resolvedOnce = std::make_shared<bool>(false);
        args.resolve = [this, &block, resolvedOnce]() {
            if (*resolvedOnce) return;
            *resolvedOnce = true;
            executeBlockHandler(block);
        };
        registry.beforeBlockHandler(args);
    } else {
        executeBlockHandler(block);
    }
}

void AsyncTrack::executeBlockHandler(const BlueprintBlock& block) {
    if (!_running) return;

    auto resolved = resolveHandler(block.type, block.id, &_parent.getSceneRegistry(), _parent.getGlobalRegistry());

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
        {
            const auto waitBlocks = getNativeProperties(*blockPtr).waitForBlocks;
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
        // The track is closed down first, THEN the error is re-thrown. By the time it reaches the
        // game, the cleanups have run and the track is gone. Swallowing it here was the v1
        // behaviour, and it made the same fault behave in two opposite ways depending on whether
        // it happened in a handler or in the cleanup that handler returned.
        endTrack();
        throw;
    }

    _previousCleanup = combineCleanupsImpl(std::move(sceneCleanup), std::move(globalCleanup));

    syncPhase = false;
    if (nextCalled && !_pendingAdvance) {
        advanceToNextBlock(block, context);
    }
}

void AsyncTrack::advanceToNextBlock(const BlueprintBlock& block, IBaseBlockContext* context) {
    if (!_running) return;

    _previousBlock = &block;
    if (context && context->character()) {
        _previousCard = *context->character();
    } else {
        _previousCard.reset();
    }

    PortResolutionInput input;
    input.block = &block;
    input.links = _sceneGraph.getOutgoingLinks(block.id);
    if (auto* cc = dynamic_cast<InternalChoiceContext*>(context)) input.selectedOptionId = cc->selectedOptionId;
    if (auto* cndc = dynamic_cast<InternalConditionContext*>(context)) input.conditionPort = cndc->conditionPort;
    if (auto* ac = dynamic_cast<InternalActionContext*>(context)) input.actionRejected = ac->actionRejected;
    if (auto* dc = dynamic_cast<InternalDialogContext*>(context)) input.actorPort = dc->actorPort;

    auto resolution = resolvePort(input);

    // Separate main (first non-async) from async connections
    const Link* mainLink = nullptr;
    std::vector<const Link*> asyncLinks;

    for (const auto& link : resolution.links) {
        auto* targetBlock = _sceneGraph.getBlock(link.to);
        if (!targetBlock) continue;
        if (!mainLink && !getNativeProperties(*targetBlock).isAsync.value_or(false)) {
            mainLink = &link;
        } else {
            asyncLinks.push_back(&link);
        }
    }

    // Spawn sub-tracks
    for (const auto* link : asyncLinks) {
        auto* targetBlock = _sceneGraph.getBlock(link->to);
        if (targetBlock) {
            int trackId = _parent.spawnAsyncTrack(*targetBlock, this->id);
            _childTrackIds.push_back(trackId);
        }
    }

    if (mainLink) {
        auto* nextBlock = _sceneGraph.getBlock(mainLink->to);
        if (nextBlock) {
            auto cleanup = std::move(_previousCleanup);
            _previousCleanup = {};
            if (auto fault = runCleanup(cleanup)) {
                endTrack();
                std::rethrow_exception(fault);
            }
            processBlock(*nextBlock);
            return;
        }
    }
    if (auto fault = endTrack()) std::rethrow_exception(fault);
}

/// Close this track down. Returns what its cleanup threw, having finished regardless.
std::exception_ptr AsyncTrack::endTrack() {
    auto cleanup = std::move(_previousCleanup);
    _previousCleanup = {};
    auto fault = runCleanup(cleanup);

    // Child tracks survive — only explicit cancel() cascades
    _running = false;
    _currentBlock = nullptr;
    _parent.removeTrack(this);
    return fault;
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
        if (auto fault = endScene()) std::rethrow_exception(fault);
    }
}

void SceneHandleImpl::cancel() {
    if (!_running) return;
    _cancelled = true;
    if (auto fault = shutdown()) std::rethrow_exception(fault);
}

void SceneHandleImpl::onEnter(SceneLifecycleHandler h) { _sceneRegistry.enterHandler = std::move(h); }
void SceneHandleImpl::onExit(SceneLifecycleHandler h) { _sceneRegistry.exitHandler = std::move(h); }
void SceneHandleImpl::onBlock(const std::string& uuid, InternalBlockHandler h) { _sceneRegistry.setBlockHandler(uuid, std::move(h)); }
void SceneHandleImpl::onDialogId(const std::string& uuid, TypedBlockHandler<BlueprintBlock, IDialogContext> h) { _sceneRegistry.setBlockHandler(uuid, wrapHandler<BlueprintBlock, IDialogContext>(std::move(h))); }
void SceneHandleImpl::onChoiceId(const std::string& uuid, TypedBlockHandler<BlueprintBlock, IChoiceContext> h) { _sceneRegistry.setBlockHandler(uuid, wrapHandler<BlueprintBlock, IChoiceContext>(std::move(h))); }
void SceneHandleImpl::onConditionId(const std::string& uuid, TypedBlockHandler<BlueprintBlock, IConditionContext> h) { _sceneRegistry.setBlockHandler(uuid, wrapHandler<BlueprintBlock, IConditionContext>(std::move(h))); }
void SceneHandleImpl::onActionId(const std::string& uuid, TypedBlockHandler<BlueprintBlock, IActionContext> h) { _sceneRegistry.setBlockHandler(uuid, wrapHandler<BlueprintBlock, IActionContext>(std::move(h))); }
void SceneHandleImpl::onDialog(TypedBlockHandler<BlueprintBlock, IDialogContext> h) { _sceneRegistry.dialogHandler = wrapHandler<BlueprintBlock, IDialogContext>(std::move(h)); }
void SceneHandleImpl::onChoice(TypedBlockHandler<BlueprintBlock, IChoiceContext> h) { _sceneRegistry.choiceHandler = wrapHandler<BlueprintBlock, IChoiceContext>(std::move(h)); }
void SceneHandleImpl::onCondition(TypedBlockHandler<BlueprintBlock, IConditionContext> h) { _sceneRegistry.conditionHandler = wrapHandler<BlueprintBlock, IConditionContext>(std::move(h)); }
void SceneHandleImpl::onAction(TypedBlockHandler<BlueprintBlock, IActionContext> h) { _sceneRegistry.actionHandler = wrapHandler<BlueprintBlock, IActionContext>(std::move(h)); }

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
        std::vector<IWaiter*> satisfied;
        for (const auto& entry : _pendingWaits) {
            bool allVisited = true;
            for (const auto& u : entry.second) {
                if (_visitedSet.find(u) == _visitedSet.end()) { allVisited = false; break; }
            }
            if (allVisited) satisfied.push_back(entry.first);
        }
        for (auto* waiter : satisfied) {
            _pendingWaits.erase(
                std::remove_if(_pendingWaits.begin(), _pendingWaits.end(),
                    [waiter](const std::pair<IWaiter*, std::vector<std::string>>& entry) {
                        return entry.first == waiter;
                    }),
                _pendingWaits.end());
            waiter->notifyWaitSatisfied();
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

std::exception_ptr SceneHandleImpl::cancelTrack(int trackId) {
    for (auto& t : _asyncTracks) {
        if (t->id == trackId) return t->cancel();
    }
    return nullptr;
}

void SceneHandleImpl::registerWaitForBlocks(IWaiter* waiter, const std::vector<std::string>& blockIds) {
    for (auto& entry : _pendingWaits) {
        if (entry.first == waiter) { entry.second = blockIds; return; }
    }
    _pendingWaits.emplace_back(waiter, blockIds);
}

void SceneHandleImpl::notifyWaitSatisfied() {
    if (!_running || _cancelled || !_pendingAdvance) return;
    auto advance = std::move(_pendingAdvance);
    _pendingAdvance = {};
    advance();
}

bool SceneHandleImpl::runValidation(const BlueprintBlock& block, const BlueprintBlock* fromBlock,
                                    const Card* fromCharacter) {
    if (!_globalRegistry.validateNextBlockHandler) return true;

    ResolvedCards nextCards = resolveCardsFor(block);

    ValidateNextBlockArgs args;
    args.nextBlock = &block;
    args.fromBlock = fromBlock;
    args.nextContext.character = nextCards.character.has_value() ? &(*nextCards.character) : nullptr;
    if (fromBlock) {
        args.hasFromContext = true;
        args.fromContext.character = fromCharacter;
    }
    args.port = nullptr;

    auto result = _globalRegistry.validateNextBlockHandler(args);
    if (result.valid) return true;

    if (_globalRegistry.invalidateBlockHandler) {
        _globalRegistry.invalidateBlockHandler({this, result.reason.value_or("validation_failed")});
    }
    return false;
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

bool SceneHandleImpl::evaluateConditionForBlock(const ConditionTest& test,
    const std::function<bool(const ConditionTest&)>& fallbackEvaluator) {
    return evaluateConditionWithHistory(test, fallbackEvaluator);
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
// A `choice` test is answered from this scene's own history; anything else goes to the game's
// resolver, and is false when none is installed.
bool SceneHandleImpl::evaluateCondition(const ConditionTest& test) {
    auto resolver = _callbacks.getConditionResolver ? _callbacks.getConditionResolver() : ConditionResolverFn{};
    if (!resolver) resolver = [](const ConditionTest&) { return false; };
    return evaluateConditionWithHistory(test, resolver);
}

void SceneHandleImpl::onResolveCharacter(std::function<const Card*(const std::vector<Card>&)> fn) {
    _resolveCharacter = std::move(fn);
}

// ─── Traversal ───────────────────────────────────────────────────────────────

void SceneHandleImpl::processBlock(const BlueprintBlock& startingBlock) {
    if (!_running || _cancelled) return;

    // Skip NOTE
    const BlueprintBlock* resolvedBlock = skipNotes(startingBlock, _sceneGraph);
    if (!resolvedBlock) {
        if (auto fault = endScene()) std::rethrow_exception(fault);
        return;
    }
    const BlueprintBlock& block = *resolvedBlock;

    // Validate
    if (!runValidation(block, _previousBlock, _previousCharacter)) return;

    if (_cancelled) return;

    _currentBlock = &block;
    addVisited(block.id);

    // onBeforeBlock
    if (_globalRegistry.beforeBlockHandler) {
        BeforeBlockArgs args;
        args.block = &block;
        args.scene = this;
        // The natives live in `props` alongside the writer's own properties. Ids cannot
        // collide, so this is a lookup, not a guess.
        NativeProperties natives = getNativeProperties(block);
        args.context.nativeProperties = &natives;
        // GUARDED like next(): a delay timer that fires twice would otherwise dispatch
        // the same block twice.
        auto resolvedOnce = std::make_shared<bool>(false);
        args.resolve = [this, &block, resolvedOnce]() {
            if (*resolvedOnce) return;
            *resolvedOnce = true;
            executeBlockHandler(block);
        };
        _globalRegistry.beforeBlockHandler(args);
    } else {
        executeBlockHandler(block);
    }
}

void SceneHandleImpl::executeBlockHandler(const BlueprintBlock& block) {
    // `_running` and not just `_cancelled`: a resolve() kept in a closure and fired after
    // the scene ended on its own would otherwise restart traversal on a dead scene.
    if (!_running || _cancelled) return;

    auto resolved = resolveHandler(block.type, block.id, &_sceneRegistry, _globalRegistry);

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

        // waitForBlocks: park until every listed block has been visited. The main flow honours it
        // exactly like a parallel track - this is the join half of the fork isAsync opens.
        {
            const auto waitBlocks = getNativeProperties(*blockPtr).waitForBlocks;
            if (!waitBlocks.empty()) {
                bool allVisited = true;
                for (const auto& id : waitBlocks) {
                    if (!isVisited(id)) { allVisited = false; break; }
                }
                if (!allVisited) {
                    _pendingAdvance = [this, blockPtr, context]() {
                        advanceToNextBlock(*blockPtr, context);
                    };
                    registerWaitForBlocks(this, waitBlocks);
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
            sceneCleanup = resolved.sceneHandler(this, blockPtr, context, nextFn);
            if (!getGlobalPreventedImpl(context) && resolved.globalHandler) {
                globalCleanup = resolved.globalHandler(this, &block, context, nextFn);
            }
        } else if (resolved.globalHandler) {
            globalCleanup = resolved.globalHandler(this, &block, context, nextFn);
        }
    } catch (...) {
        // The scene is closed down first, THEN the error is re-thrown. The order is what makes
        // this usable: by the time the game sees the error, the cleanups have run, the async
        // tracks are cancelled and onSceneExit has fired. The dialogue stopped PROPERLY, and the
        // error surfaces where the game called start() or next().
        //
        // v1 swallowed it — silently, not even logged — while an exception from the cleanup that
        // same handler returned reached the caller.
        endScene();
        throw;
    }

    _previousCleanup = combineCleanupsImpl(std::move(sceneCleanup), std::move(globalCleanup));

    // Unless the block is parked on waitForBlocks: releasing it is notifyWaitSatisfied's job.
    syncPhase = false;
    if (nextCalled && !_pendingAdvance) {
        advanceToNextBlock(block, context);
    }
}

void SceneHandleImpl::advanceToNextBlock(const BlueprintBlock& block, IBaseBlockContext* context) {
    if (_cancelled) return;

    _previousBlock = &block;
    // Owned, not borrowed: the context that produced this card is destroyed when we leave.
    if (context != nullptr && context->character() != nullptr) {
        _previousCard = *context->character();
        _previousCharacter = &(*_previousCard);
    } else {
        _previousCard.reset();
        _previousCharacter = nullptr;
    }

    PortResolutionInput input;
    input.block = &block;
    input.links = _sceneGraph.getOutgoingLinks(block.id);
    if (auto* cc = dynamic_cast<InternalChoiceContext*>(context)) input.selectedOptionId = cc->selectedOptionId;
    if (auto* cndc = dynamic_cast<InternalConditionContext*>(context)) input.conditionPort = cndc->conditionPort;
    if (auto* ac = dynamic_cast<InternalActionContext*>(context)) input.actionRejected = ac->actionRejected;
    if (auto* dc = dynamic_cast<InternalDialogContext*>(context)) input.actorPort = dc->actorPort;

    auto resolution = resolvePort(input);

    // Separate: first non-async = main, rest = async
    const Link* mainLink = nullptr;
    std::vector<const Link*> asyncLinks;

    for (const auto& link : resolution.links) {
        auto* targetBlock = _sceneGraph.getBlock(link.to);
        if (!targetBlock) continue;
        if (!mainLink && !getNativeProperties(*targetBlock).isAsync.value_or(false)) {
            mainLink = &link;
        } else {
            asyncLinks.push_back(&link);
        }
    }

    // Spawn async tracks
    for (const auto* link : asyncLinks) {
        auto* targetBlock = _sceneGraph.getBlock(link->to);
        if (targetBlock) {
            spawnAsyncTrack(*targetBlock, -1);
        }
    }

    // Continue main track
    if (mainLink) {
        auto* nextBlock = _sceneGraph.getBlock(mainLink->to);
        if (nextBlock) {
            auto cleanup = std::move(_previousCleanup);
            _previousCleanup = {};
            if (auto fault = runCleanup(cleanup)) {
                // Same order as a handler that throws: the scene is closed down first, and the
                // error reaches the game with the dialogue already stopped properly.
                endScene();
                std::rethrow_exception(fault);
            }
            processBlock(*nextBlock);
            return;
        }
    }

    if (auto fault = endScene()) std::rethrow_exception(fault);
}

/// Close the scene down: cancel every track, run the pending cleanup, fire onSceneExit.
///
/// Returns what a cleanup threw rather than throwing it, so the teardown always runs to the end.
/// Callers re-throw once there is nothing left to unwind.
std::exception_ptr SceneHandleImpl::endScene() {
    return shutdown();
}

std::exception_ptr SceneHandleImpl::shutdown() {
    _pendingWaits.clear();
    _pendingAdvance = {};

    std::exception_ptr fault = nullptr;
    for (auto& track : _asyncTracks) {
        // Every track is cancelled even if an earlier one's cleanup threw: leaving live tracks
        // behind on a closed scene is how a dialogue kept running after it ended.
        auto trackFault = track->cancel();
        if (!fault) fault = trackFault;
    }
    _asyncTracks.clear();

    auto cleanup = std::move(_previousCleanup);
    _previousCleanup = {};
    if (auto cleanupFault = runCleanup(cleanup)) { if (!fault) fault = cleanupFault; }

    _running = false;
    _currentBlock = nullptr;
    fireSceneExit();
    if (_callbacks.onSceneEnded) _callbacks.onSceneEnded(this);
    return fault;
}

// ─── Choice history condition evaluation ─────────────────────────────────────

/// Answer a test, taking the reserved "choice" dictionary on ourselves.
///
/// { dict: "choice", entry: "CHOICE-001", value: "C1" } asks whether the player picked C1 at
/// CHOICE-001 earlier IN THIS SCENE. The engine kept that history, so the question never reaches
/// the game: it would otherwise have to mirror a record the engine already holds, and the two
/// would drift. The memory starts and ends with the scene.
///
/// A block that was never reached answers false for equals, and true for notEquals.
bool SceneHandleImpl::evaluateConditionWithHistory(const ConditionTest& test,
    const std::function<bool(const ConditionTest&)>& fallbackEvaluator) {
    if (test.dict != Ports::Choice) return fallbackEvaluator(test);

    bool negated = test.op == ConditionOperator::NotEquals;
    auto it = _choiceHistory.find(test.entry);
    if (it == _choiceHistory.end()) return negated;

    const std::string* picked = std::get_if<std::string>(&test.value);
    if (picked == nullptr) return negated;

    const auto& history = it->second;
    bool found = std::find(history.begin(), history.end(), *picked) != history.end();
    return negated ? !found : found;
}

ConditionEvaluatorFn SceneHandleImpl::routingEvaluator() {
    auto resolver = _callbacks.getConditionResolver ? _callbacks.getConditionResolver() : ConditionResolverFn{};
    if (!resolver) {
        return [this](const ConditionTest& test) -> bool {
            if (test.dict != Ports::Choice) return false;
            return evaluateConditionWithHistory(test, [](const ConditionTest&) { return false; });
        };
    }
    return [this, resolver](const ConditionTest& test) -> bool {
        return evaluateConditionWithHistory(test, resolver);
    };
}

ConditionEvaluatorFn SceneHandleImpl::visibilityEvaluator() {
    auto resolver = _callbacks.getConditionResolver ? _callbacks.getConditionResolver() : ConditionResolverFn{};
    if (!resolver) return {};
    return [this, resolver](const ConditionTest& test) -> bool {
        return evaluateConditionWithHistory(test, resolver);
    };
}

ResolvedCards SceneHandleImpl::resolveCardsFor(const BlueprintBlock& block) const {
    auto lookup = _callbacks.getCard
        ? _callbacks.getCard
        : std::function<const Card*(const std::string&)>{[](const std::string&) { return nullptr; }};
    return ResolvedCards::resolve(block, lookup, getResolveCharacterFn());
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
    // A default has to pick something; the format does not say the first one speaks.
    return [](const std::vector<Card>& actors) -> const Card* {
        return actors.empty() ? nullptr : &actors[0];
    };
}

// ─── Context creation ────────────────────────────────────────────────────────

// Cards are resolved fresh every time, never cached. This runs for the main track AND for async
// tracks (through createBlockContext), and a cache would leak the main track's actor into a track
// released later by waitForBlocks.
std::unique_ptr<IBaseBlockContext> SceneHandleImpl::createContext(const BlueprintBlock& block) {
    ResolvedCards cards = resolveCardsFor(block);

    if (block.type == BlockType::Dialog) {
        return std::unique_ptr<IBaseBlockContext>(new InternalDialogContext(block, std::move(cards)));
    }

    if (block.type == BlockType::Choice) {
        ConditionEvaluatorFn visibility = visibilityEvaluator();
        auto options = tagOptionVisibility(block.options, visibility ? &visibility : nullptr);
        auto onChoiceSelected = [this](const std::string& blockId, const std::string& optionId) {
            recordChoice(blockId, optionId);
        };
        return std::unique_ptr<IBaseBlockContext>(new InternalChoiceContext(
            block, std::move(cards), std::move(options), std::move(onChoiceSelected)));
    }

    if (block.type == BlockType::Condition) {
        ConditionEvaluatorFn evaluate = routingEvaluator();
        bool portPerCase = getNativeProperties(block).portPerCase.value_or(false);

        // Every case is evaluated up front, so the handler is handed results rather than
        // questions. With a resolver installed the engine already knows where to go, which is what
        // makes onCondition optional: the handler becomes a place to log or to override.
        //
        // ONCE. The port is read off these same results rather than re-asking the game: each test
        // reaches onResolveCondition exactly one time, whatever the mode and whichever case matches.
        std::vector<RuntimeConditionCase> cases;
        std::vector<bool> results;
        cases.reserve(block.cases.size());
        results.reserve(block.cases.size());
        for (const auto& conditionCase : block.cases) {
            RuntimeConditionCase runtimeCase;
            runtimeCase.port = conditionCase.port;
            runtimeCase.when = conditionCase.when;
            runtimeCase.result = evaluateConditionChain(conditionCase.when, evaluate);
            results.push_back(runtimeCase.result.value_or(false));
            cases.push_back(std::move(runtimeCase));
        }

        auto* ctx = new InternalConditionContext(block, std::move(cards), std::move(cases));
        ctx->conditionPort = pickPortFromResults(block.cases, portPerCase, results);
        return std::unique_ptr<IBaseBlockContext>(ctx);
    }

    if (block.type == BlockType::Action) {
        return std::unique_ptr<IBaseBlockContext>(new InternalActionContext(block, std::move(cards)));
    }

    return nullptr;
}

} // namespace lsde
