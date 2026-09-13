// LSDE Dialog Engine — SceneHandle: the scene and everything its tracks share
//
// This file does NOT walk the graph. Walking is one thing, written once, in track.cpp.

#include <lsde/scene_handle.h>
#include <lsde/port_resolver.h>
#include <lsde/condition_evaluator.h>
#include <lsde/utils.h>
#include <algorithm>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_set>

namespace lsde {

// ─── SceneHandleImpl ─────────────────────────────────────────────────────────

SceneHandleImpl::SceneHandleImpl(const SceneGraph& sg, const HandlerRegistry& gr, SceneHandleCallbacks cb)
    : _sceneGraph(sg), _globalRegistry(gr), _callbacks(std::move(cb)) {}

SceneHandleImpl::~SceneHandleImpl() {
    if (!_running || _closing) return;
    // Swallowed, not propagated: a fault thrown out of a destructor terminates the process, and
    // there is no caller left to hand it to. The teardown itself still runs to the end.
    try {
        shutdown(SceneEndReason::Cancelled);
    } catch (...) {
    }
}

void SceneHandleImpl::start() {
    if (_running) return;

    // Validate the type handlers this scene needs
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
        msg += ".\nRegister handlers before starting:\n"
               "  engine.onDialog(handler)\n  engine.onChoice(handler)\n"
               "  engine.onCondition(handler)\n  engine.onAction(handler)\n"
               "Note: onCondition is optional when engine.onResolveCondition() is installed.";
        throw std::runtime_error(msg);
    }

    _running = true;
    _closing = false;
    _ownerThread = std::this_thread::get_id();
    if (_callbacks.onSceneStarted) _callbacks.onSceneStarted(this);

    // onSceneEnter is the game's code like any handler, and it runs before there is a track to
    // catch what it throws. It used to leave the scene registered and running with no track at
    // all: nothing to advance, nothing to end it. Same rule as the walk — close, then surface.
    try {
        fireSceneEnter();
    } catch (...) {
        shutdown(SceneEndReason::Faulted, {}, std::current_exception());
        throw;
    }
    // onSceneEnter is allowed to cancel the scene it was told about.
    if (!_running) return;

    auto* startBlock = _sceneGraph.getStartBlock();
    if (startBlock) {
        // The flow the player watches is a track like any other. The only thing that sets it
        // apart is what happens when it ends — see trackEnded.
        auto track = std::make_unique<Track>(*this, *startBlock, kMainTrackId, -1, Ports::In);
        _mainTrack = track.get();
        _tracks.push_back(std::move(track));
        _mainTrack->start();
    } else {
        if (auto fault = shutdown(SceneEndReason::Completed)) std::rethrow_exception(fault);
    }
}

void SceneHandleImpl::cancel() {
    if (!_running || _closing) return;
    ensureOwnerThread("cancel()");

    if (auto fault = shutdown(SceneEndReason::Cancelled)) std::rethrow_exception(fault);
}

void SceneHandleImpl::onEnter(SceneLifecycleHandler h) { _sceneRegistry.enterHandler = std::move(h); }
void SceneHandleImpl::onExit(SceneLifecycleHandler h) { _sceneRegistry.exitHandler = std::move(h); }
void SceneHandleImpl::onBlock(const std::string& blockId, InternalBlockHandler h) { _sceneRegistry.setBlockHandler(blockId, std::move(h)); }
void SceneHandleImpl::onDialogId(const std::string& blockId, TypedBlockHandler<BlueprintBlock, IDialogContext> h) { _sceneRegistry.setBlockHandler(blockId, wrapHandler<BlueprintBlock, IDialogContext>(std::move(h))); }
void SceneHandleImpl::onChoiceId(const std::string& blockId, TypedBlockHandler<BlueprintBlock, IChoiceContext> h) { _sceneRegistry.setBlockHandler(blockId, wrapHandler<BlueprintBlock, IChoiceContext>(std::move(h))); }
void SceneHandleImpl::onConditionId(const std::string& blockId, TypedBlockHandler<BlueprintBlock, IConditionContext> h) { _sceneRegistry.setBlockHandler(blockId, wrapHandler<BlueprintBlock, IConditionContext>(std::move(h))); }
void SceneHandleImpl::onActionId(const std::string& blockId, TypedBlockHandler<BlueprintBlock, IActionContext> h) { _sceneRegistry.setBlockHandler(blockId, wrapHandler<BlueprintBlock, IActionContext>(std::move(h))); }
void SceneHandleImpl::onDialog(TypedBlockHandler<BlueprintBlock, IDialogContext> h) { _sceneRegistry.dialogHandler = wrapHandler<BlueprintBlock, IDialogContext>(std::move(h)); }
void SceneHandleImpl::onChoice(TypedBlockHandler<BlueprintBlock, IChoiceContext> h) { _sceneRegistry.choiceHandler = wrapHandler<BlueprintBlock, IChoiceContext>(std::move(h)); }
void SceneHandleImpl::onCondition(TypedBlockHandler<BlueprintBlock, IConditionContext> h) { _sceneRegistry.conditionHandler = wrapHandler<BlueprintBlock, IConditionContext>(std::move(h)); }
void SceneHandleImpl::onAction(TypedBlockHandler<BlueprintBlock, IActionContext> h) { _sceneRegistry.actionHandler = wrapHandler<BlueprintBlock, IActionContext>(std::move(h)); }

/// The stable id of this scene — the one to store outside the payload.
///
/// onSceneExit is global, and the handle it is given was the only way to tell WHICH scene ended
/// when several play at once; it could not say. The id is what survives a rename.
const std::string& SceneHandleImpl::getSceneId() const { return _sceneGraph.getScene().id; }
/// The path of this scene — what a writer reads, and what a rename changes.
const std::string& SceneHandleImpl::getScenePath() const { return _sceneGraph.getScene().scene; }

/// The block the flow the player is watching is on. Parallel tracks have their own.
const BlueprintBlock* SceneHandleImpl::getCurrentBlock() const {
    return _mainTrack ? _mainTrack->getCurrentBlock() : nullptr;
}
const std::vector<std::string>& SceneHandleImpl::getVisitedBlocks() const { return _visitedOrder; }
bool SceneHandleImpl::isRunning() const { return _running; }

int SceneHandleImpl::getActiveTracks() const {
    int count = 0;
    for (const auto* t : parallelTracks()) { (void)t; count++; }
    return count;
}

const SceneGraph& SceneHandleImpl::hostSceneGraph() const { return _sceneGraph; }
const SceneHandlerRegistry& SceneHandleImpl::hostSceneRegistry() const { return _sceneRegistry; }
const HandlerRegistry& SceneHandleImpl::hostGlobalRegistry() const { return _globalRegistry; }
ISceneHandle* SceneHandleImpl::asSceneHandle() { return this; }
bool SceneHandleImpl::isSceneRunning() const { return _running; }

std::vector<Track*> SceneHandleImpl::parallelTracks() const {
    std::vector<Track*> result;
    for (const auto& t : _tracks) {
        if (t->id != kMainTrackId && t->isRunning()) result.push_back(t.get());
    }
    return result;
}
std::vector<TrackInfo> SceneHandleImpl::getTrackInfos() const {
    std::vector<TrackInfo> result;
    for (const auto* t : parallelTracks()) {
        if (t->isRunning()) result.push_back(t->getTrackInfo());
    }
    return result;
}

void SceneHandleImpl::addVisited(const std::string& blockId) {
    if (_visitedSet.insert(blockId).second) {
        _visitedOrder.push_back(blockId);
    }
}

void SceneHandleImpl::addCompleted(const std::string& blockId) {
    _completedSet.insert(blockId);
    if (!_pendingWaits.empty()) {
        // Collected before notifying: releasing a track re-enters the traversal, which can park
        // or release others, and mutating the vector mid-iteration would invalidate the iterators.
        std::vector<IWaiter*> satisfied;
        for (const auto& entry : _pendingWaits) {
            bool allCompleted = true;
            for (const auto& u : entry.second) {
                if (_completedSet.find(u) == _completedSet.end()) { allCompleted = false; break; }
            }
            if (allCompleted) satisfied.push_back(entry.first);
        }
        for (auto* waiter : satisfied) {
            const auto before = _pendingWaits.size();
            _pendingWaits.erase(
                std::remove_if(_pendingWaits.begin(), _pendingWaits.end(),
                    [waiter](const std::pair<IWaiter*, std::vector<std::string>>& entry) {
                        return entry.first == waiter;
                    }),
                _pendingWaits.end());
            // Closing the scene clears the waits: a release that closed it leaves nothing for the
            // ones after it to wake.
            if (_pendingWaits.size() == before) continue;
            waiter->notifyWaitSatisfied();
        }
    }
}

int SceneHandleImpl::spawnTrack(const BlueprintBlock& startBlock, int parentTrackId,
                                const std::string& entryPort) {
    int trackId = _nextTrackId++;
    // -1 when the main flow opened it — the convention TrackInfo publishes.
    const int parent = parentTrackId == kMainTrackId ? -1 : parentTrackId;
    auto track = std::make_unique<Track>(*this, startBlock, trackId, parent, entryPort);
    auto* trackPtr = track.get();
    _tracks.push_back(std::move(track));
    trackPtr->start();
    return trackId;
}

std::exception_ptr SceneHandleImpl::cancelTrack(int trackId) {
    for (auto& t : _tracks) {
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

std::exception_ptr SceneHandleImpl::trackEnded(Track* track, const std::string& ending) {
    retireTrack(track);

    // `retire` already cleared this track's `_running`, so it does not count itself here.
    if (_closing || canStillAdvance()) return nullptr;

    auto waiting = waitingFor();
    if (!waiting.empty()) return shutdown(SceneEndReason::Deadlocked, std::move(waiting));
    return shutdown(ending);
}

std::exception_ptr SceneHandleImpl::trackParked() {
    if (_closing || canStillAdvance()) return nullptr;
    return shutdown(SceneEndReason::Deadlocked, waitingFor());
}

void SceneHandleImpl::fault(std::exception_ptr error) {
    if (!_running || _closing) return;
    shutdown(SceneEndReason::Faulted, {}, std::move(error));
}

void SceneHandleImpl::ensureOwnerThread(const char* call) {
    if (!_running) return;
    const auto current = std::this_thread::get_id();
    if (current == _ownerThread) return;
    std::ostringstream message;
    message << "LSDE: " << call << " was called on thread " << current
            << ", but this scene was started on thread " << _ownerThread
            << ". The engine is not thread-safe: call it from the thread that started the scene "
               "- in Unreal, the game thread. Queue the call back to that thread before making it.";
    throw std::logic_error(message.str());
}

bool SceneHandleImpl::runValidation(const BlueprintBlock& block, const std::string& entryPort,
                                    const BlueprintBlock* fromBlock, const Card* fromCharacter) {
    if (!_globalRegistry.validateNextBlockHandler) return true;

    ResolvedCards nextCards = resolveCardsFor(block, entryPort);

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

bool SceneHandleImpl::isVisited(const std::string& blockId) const {
    return _visitedSet.find(blockId) != _visitedSet.end();
}

bool SceneHandleImpl::isCompleted(const std::string& blockId) const {
    return _completedSet.find(blockId) != _completedSet.end();
}

/// A track that ended is stopped, not deleted — see the note in shutdown().
/// A parallel track that reached its end is retired IN PLACE, not erased.
///
/// Erasing it would destroy it, and a game can be holding a next() or an onBeforeBlock resolve()
/// that captured it — see the note in shutdown(). Nothing reads a stopped track any more:
/// parallelTracks() filters on isRunning(). It is freed with the scene handle.
void SceneHandleImpl::retireTrack(Track*) {}

bool SceneHandleImpl::canStillAdvance() const {
    for (const auto& other : _tracks) {
        if (other->isRunning() && !other->isWaitingForBlocks()) return true;
    }
    return false;
}

std::vector<std::string> SceneHandleImpl::waitingFor() const {
    std::vector<std::string> ids;
    for (const auto& entry : _pendingWaits) {
        for (const auto& id : entry.second) {
            if (_completedSet.find(id) != _completedSet.end()) continue;
            if (std::find(ids.begin(), ids.end(), id) == ids.end()) ids.push_back(id);
        }
    }
    return ids;
}

std::unique_ptr<IBaseBlockContext> SceneHandleImpl::createBlockContext(const BlueprintBlock& block,
                                                                        const std::string& entryPort) {
    return createContext(block, entryPort);
}

void SceneHandleImpl::recordChoice(const std::string& blockId, const std::string& optionId) {
    _choiceHistory[blockId].push_back(optionId);
}

bool SceneHandleImpl::evaluateConditionForBlock(const ConditionTest& test,
    const std::function<bool(const ConditionTest&)>& fallbackEvaluator) {
    return evaluateConditionWithHistory(test, fallbackEvaluator);
}

const std::unordered_map<std::string, std::vector<std::string>>& SceneHandleImpl::getChoiceHistory() const {
    return _choiceHistory;
}

const std::vector<std::string>* SceneHandleImpl::getChoice(const std::string& blockId) const {
    auto it = _choiceHistory.find(blockId);
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


std::exception_ptr SceneHandleImpl::shutdown(const std::string& reason, std::vector<std::string> waitingFor,
                                             std::exception_ptr error) {
    if (_closing) return nullptr;
    _closing = true;

    _pendingWaits.clear();

    std::exception_ptr fault = nullptr;
    // A copy of the raw pointers: cancelling a track cascades to its children, and every track is
    // cancelled even if an earlier cleanup threw. Leaving live tracks behind on a closed scene is
    // how a dialogue kept running after it ended.
    std::vector<Track*> pool;
    pool.reserve(_tracks.size());
    for (const auto& track : _tracks) pool.push_back(track.get());
    for (auto* track : pool) {
        auto trackFault = track->cancel();
        if (!fault) fault = trackFault;
    }

    // The pool is NOT cleared: a cancelled track is stopped, not deleted. A game can hold an
    // onBeforeBlock resolve() past the end of the scene, and that closure captures its track —
    // destroying it here turns a stale callback into a dangling pointer. In the three garbage
    // collected runtimes the object simply outlives the pool; C++ has to say so. It is a bounded
    // cost: the tracks of one scene, freed with the handle.
    //
    // Nothing reads them any more either — getActiveTracks() and getTrackInfos() filter on
    // isRunning(), and a stopped track answers false.

    _running = false;

    // onSceneExit is the game's code too, and it used to throw between `_running = false` and
    // telling the engine: the handle then sat in the engine's registry for good, isRunning()
    // answered true, and stop() could not reach it — cancel() returns at once on a scene that is
    // not running. The engine is ALWAYS told; what onSceneExit threw is carried like a cleanup's
    // fault.
    SceneContext context;
    context.reason = reason;
    if (reason == SceneEndReason::Deadlocked) context.waitingFor = std::move(waitingFor);
    context.error = std::move(error);

    std::exception_ptr exitFault = nullptr;
    try {
        fireSceneExit(context);
    } catch (...) {
        exitFault = std::current_exception();
    }
    if (_callbacks.onSceneEnded) _callbacks.onSceneEnded(this);
    return fault ? fault : exitFault;
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

ResolvedCards SceneHandleImpl::resolveCardsFor(const BlueprintBlock& block,
                                               const std::string& entryPort) const {
    auto lookup = _callbacks.getCard
        ? _callbacks.getCard
        : std::function<const Card*(const std::string&)>{[](const std::string&) { return nullptr; }};
    std::optional<std::string> designated;
    if (getNativeProperties(block).inPortPerCharacter.value_or(false) && entryPort != Ports::In) {
        designated = entryPort;
    }
    return ResolvedCards::resolve(block, lookup, getResolveCharacterFn(), designated);
}

std::vector<RuntimeConditionCase> SceneHandleImpl::evaluateCases(const BlueprintBlock& block) {
    ConditionEvaluatorFn evaluate = routingEvaluator();
    std::vector<RuntimeConditionCase> cases;
    cases.reserve(block.cases.size());
    for (const auto& conditionCase : block.cases) {
        RuntimeConditionCase runtimeCase;
        runtimeCase.port = conditionCase.port;
        runtimeCase.when = conditionCase.when;
        runtimeCase.result = evaluateConditionChain(conditionCase.when, evaluate);
        cases.push_back(std::move(runtimeCase));
    }
    return cases;
}

namespace {
std::vector<bool> resultsOf(const std::vector<RuntimeConditionCase>& cases) {
    std::vector<bool> results;
    results.reserve(cases.size());
    for (const auto& c : cases) results.push_back(c.result.value_or(false));
    return results;
}
} // namespace

// ─── Scene lifecycle ─────────────────────────────────────────────────────────

void SceneHandleImpl::fireSceneEnter() {
    auto handler = _sceneRegistry.enterHandler ? _sceneRegistry.enterHandler : _globalRegistry.sceneEnterHandler;
    if (handler) handler({this, {}});
}

void SceneHandleImpl::fireSceneExit(const SceneContext& context) {
    auto handler = _sceneRegistry.exitHandler ? _sceneRegistry.exitHandler : _globalRegistry.sceneExitHandler;
    if (handler) handler({this, context});
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

// Cards are resolved fresh every time, never cached. This runs for every track, and a cache would
// leak one track's actor into another released later by waitForBlocks.
std::unique_ptr<IBaseBlockContext> SceneHandleImpl::createContext(const BlueprintBlock& block,
                                                                  const std::string& entryPort) {
    ResolvedCards cards = resolveCardsFor(block, entryPort);

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
        // Every case is evaluated up front, so the handler is handed results rather than
        // questions. With a resolver installed the engine already knows where to go, which is what
        // makes onCondition optional: the handler becomes a place to log or to override.
        auto cases = evaluateCases(block);
        auto results = resultsOf(cases);
        bool portPerCase = getNativeProperties(block).portPerCase.value_or(false);
        auto* ctx = new InternalConditionContext(block, std::move(cards), std::move(cases));
        ctx->conditionPort = pickPortFromResults(block.cases, portPerCase, results);
        return std::unique_ptr<IBaseBlockContext>(ctx);
    }

    if (block.type == BlockType::Router) {
        // The same cases, read the opposite way: EVERY case counts, each true one launches its
        // port, and the tally picks then or catch. That difference lives entirely in
        // pickRouterPorts — there is no second evaluator and no router-specific hook.
        auto cases = evaluateCases(block);
        auto results = resultsOf(cases);
        auto* ctx = new InternalRouterContext(block, std::move(cards), std::move(cases));
        ctx->routerPorts = pickRouterPorts(block.cases, results);
        return std::unique_ptr<IBaseBlockContext>(ctx);
    }

    if (block.type == BlockType::Action) {
        return std::unique_ptr<IBaseBlockContext>(new InternalActionContext(block, std::move(cards)));
    }

    return nullptr;
}

} // namespace lsde
