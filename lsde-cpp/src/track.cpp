// LSDE Dialog Engine — one track walking the graph (C++ port of track.ts)

#include <lsde/track.h>
#include <lsde/port_resolver.h>
#include <lsde/utils.h>

#include <memory>
#include <unordered_set>

namespace lsde {

// ─── Cleanup faults ──────────────────────────────────────────────────────────

std::exception_ptr runCleanup(const CleanupFn& cleanup) {
    if (!cleanup) return nullptr;
    try {
        cleanup();
        return nullptr;
    } catch (...) {
        return std::current_exception();
    }
}

CleanupFn combineCleanups(CleanupFn a, CleanupFn b) {
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

// ─── Shared reading helpers ──────────────────────────────────────────────────

const BlueprintBlock* skipNotes(const BlueprintBlock& block, const SceneGraph& sceneGraph) {
    const BlueprintBlock* current = &block;
    std::unordered_set<std::string> seen;

    while (current && current->type == BlockType::Note) {
        if (!seen.insert(current->id).second) return nullptr;

        const auto& links = sceneGraph.getOutgoingLinks(current->id);
        current = links.empty() ? nullptr : sceneGraph.getBlock(links[0].to);
    }

    return current;
}

bool isAsyncBlock(const BlueprintBlock& block) {
    return getNativeProperties(block).isAsync.value_or(false);
}

namespace {

bool globalPrevented(IBaseBlockContext* ctx) {
    if (auto* dc = dynamic_cast<InternalDialogContext*>(ctx)) return dc->globalPrevented;
    if (auto* cc = dynamic_cast<InternalChoiceContext*>(ctx)) return cc->globalPrevented;
    if (auto* cndc = dynamic_cast<InternalConditionContext*>(ctx)) return cndc->globalPrevented;
    if (auto* ac = dynamic_cast<InternalActionContext*>(ctx)) return ac->globalPrevented;
    return false;
}

} // namespace

// ─── Track ───────────────────────────────────────────────────────────────────

Track::Track(ITrackHost& host, const BlueprintBlock& startBlock, int id_, int parentTrackId_)
    : id(id_), parentTrackId(parentTrackId_), startBlockId(startBlock.id),
      _host(host), _startBlock(&startBlock) {}

void Track::start() {
    processBlock(*_startBlock);
}

std::exception_ptr Track::cancel() {
    if (!_running) return nullptr;
    _running = false;

    auto cleanup = std::move(_previousCleanup);
    _previousCleanup = {};
    auto fault = runCleanup(cleanup);

    _currentBlock = nullptr;
    _pendingAdvance = {};
    _queue.clear();
    for (auto childId : _childTrackIds) {
        auto childFault = _host.cancelTrack(childId);
        if (!fault) fault = childFault;
    }
    _childTrackIds.clear();
    return fault;
}

bool Track::isRunning() const { return _running; }

bool Track::isWaitingForBlocks() const { return static_cast<bool>(_pendingAdvance); }

const BlueprintBlock* Track::getCurrentBlock() const { return _currentBlock; }

void Track::notifyWaitSatisfied() {
    if (!_running || !_host.isSceneRunning() || !_pendingAdvance) return;
    auto advance = std::move(_pendingAdvance);
    _pendingAdvance = {};
    advance();
}

TrackInfo Track::getTrackInfo() const {
    TrackInfo info;
    info.id = id;
    info.parentTrackId = parentTrackId;
    info.startBlockId = startBlockId;
    info.currentBlockId = _currentBlock ? _currentBlock->id : "";
    info.running = _running;
    return info;
}

// ─── The traversal ───────────────────────────────────────────────────────────

/// Take a block, and either park on it or dispatch it.
///
/// The order matters and each step earns its place:
///
/// 1. Step over NOTEs. They are designer-only and never dispatched.
/// 2. Honour waitForBlocks. BEFORE anything else — see the note inside.
/// 3. Ask onValidateNextBlock. The game's gate; a refusal stops this track.
/// 4. Mark it current and visited, which may release another parked track.
/// 5. Fire onBeforeBlock, whose resolve() releases the type handler.
void Track::processBlock(const BlueprintBlock& startingBlock) {
    if (!_running || !_host.isSceneRunning()) return;

    const SceneGraph& sceneGraph = _host.hostSceneGraph();

    const BlueprintBlock* resolvedBlock = skipNotes(startingBlock, sceneGraph);
    if (!resolvedBlock) {
        // The end of THIS branch, not of the track: whatever is queued is still owed.
        if (auto fault = endBranch()) std::rethrow_exception(fault);
        return;
    }
    const BlueprintBlock& block = *resolvedBlock;

    // waitForBlocks holds the block BEFORE it is dispatched — the handler is never called, so the
    // game does not even learn the block exists until the wait lifts. That is the engine's
    // decision, not a rendering choice a game could make differently: the property is native, the
    // designer ticks it in LSDE, and the engine owes them the behaviour.
    //
    // It used to mean two different things depending on where the block sat: a track's FIRST block
    // was held before dispatch, any later one was dispatched and held before advancing. Same
    // checkbox, two meanings, and the second one showed the line early.
    // It waits on blocks that have FINISHED, not on blocks that have been reached. Reaching was
    // the old rule and it made the property nearly inert: a join is normally drawn onto blocks
    // dispatched a fraction of a millisecond earlier, so the wait lifted in the very tick it was
    // registered and the joining line spoke over the one it had been told to wait for.
    // MIGRATION-V2.md records the decision.
    const auto waitBlocks = getNativeProperties(block).waitForBlocks;
    if (!waitBlocks.empty() && !allCompleted(waitBlocks)) {
        const BlueprintBlock* parked = &block;
        _pendingAdvance = [this, parked]() { processBlock(*parked); };
        _host.registerWaitForBlocks(this, waitBlocks);
        return;
    }

    if (!_host.runValidation(block, _previousBlock, _previousCard ? &(*_previousCard) : nullptr)) {
        // A refusal is a dead end like any other, so it ENDS this track.
        //
        // There is no API to resume a refused track - no goto, no retry, and start() refuses a
        // running scene. Returning silently left the track alive and idle for good: on the main
        // flow that was the whole scene hung open, with no onSceneExit, the handle still in the
        // engine's registry and isRunning() answering true forever; on a parallel branch it was a
        // phantom track getActiveTracks() kept counting.
        //
        // Every other dead end here already does it: a NOTE loop, a port with no wire, a missing
        // target.
        if (auto fault = endFlow()) std::rethrow_exception(fault);
        return;
    }

    _currentBlock = &block;
    _host.addVisited(block.id);

    const auto& registry = _host.hostGlobalRegistry();
    if (registry.beforeBlockHandler) {
        BeforeBlockArgs args;
        args.block = &block;
        args.scene = _host.asSceneHandle();
        // The natives live in `props` alongside the writer's own properties. Ids cannot collide,
        // so this is a lookup, not a guess.
        //
        // Kept alive past this call, not left on the stack: onBeforeBlock is the one handler a game
        // is EXPECTED to defer — read `delay`, start a timer, resolve() when it fires — so the
        // context it was handed has to still be readable then.
        _currentNatives = std::make_shared<NativeProperties>(getNativeProperties(block));
        args.context.nativeProperties = _currentNatives.get();
        // GUARDED like next(): a delay timer that fires twice would otherwise dispatch the same
        // block twice — the handler runs again, cleanups pile up, and the track advances from a
        // block it already left.
        auto resolvedOnce = std::make_shared<bool>(false);
        auto natives = _currentNatives;  // held for as long as the game holds resolve()
        args.resolve = [this, &block, resolvedOnce, natives]() {
            if (*resolvedOnce) return;
            *resolvedOnce = true;
            executeBlockHandler(block);
        };
        registry.beforeBlockHandler(args);
    } else {
        executeBlockHandler(block);
    }
}

/// Run the handlers for a block, then leave when the game says so.
///
/// next() is guarded and deferred: called during the handler it only raises a flag, and the
/// advance happens once both handlers have returned. Otherwise a scene handler calling next()
/// would move the flow on before the global handler ever ran.
void Track::executeBlockHandler(const BlueprintBlock& block) {
    // `_running` and not just the scene's: a resolve() kept in a closure and fired after this
    // track ended would otherwise restart it on a dead flow.
    if (!_running || !_host.isSceneRunning()) return;

    auto resolved = resolveHandler(block.type, block.id,
                                   &_host.hostSceneRegistry(), _host.hostGlobalRegistry());

    _ownedContext = _host.createBlockContext(block);
    auto* context = _ownedContext.get();
    if (!context) {
        advanceToNextBlock(block, nullptr);
        return;
    }

    // No handler → advance silently. start() already refused a scene missing one.
    if (!resolved.sceneHandler && !resolved.globalHandler) {
        advanceToNextBlock(block, context);
        return;
    }

    // The two guards live in a shared cell, NOT on this stack frame.
    //
    // `next` is handed to the game by value, and the normal way to drive this engine is to keep it
    // and call it a frame later — the player pressed a key. By then this frame is gone, and reading
    // the guards through a reference to it is undefined: they read whatever the next call wrote
    // over them, and a deferred next() silently stopped advancing. Same reason `resolvedOnce` above
    // is a shared_ptr, and the same shape as the state Array the GDScript port uses. The three
    // garbage collected runtimes get this for free; C++ has to say it.
    struct NextState {
        bool called = false;
        bool syncPhase = true;
    };
    auto state = std::make_shared<NextState>();
    CleanupFn sceneCleanup, globalCleanup;

    const BlueprintBlock* blockPtr = &block;
    std::function<void()> nextFn = [state, this, blockPtr, context]() {
        if (state->called) return;
        state->called = true;
        if (state->syncPhase) return;
        advanceToNextBlock(*blockPtr, context);
    };

    ISceneHandle* sceneHandle = _host.asSceneHandle();

    try {
        if (resolved.sceneHandler) {
            sceneCleanup = resolved.sceneHandler(sceneHandle, &block, context, nextFn);
            if (!globalPrevented(context) && resolved.globalHandler) {
                globalCleanup = resolved.globalHandler(sceneHandle, &block, context, nextFn);
            }
        } else if (resolved.globalHandler) {
            globalCleanup = resolved.globalHandler(sceneHandle, &block, context, nextFn);
        }
    } catch (...) {
        // The flow is closed down first, THEN the error is re-thrown. By the time the game sees
        // it, the cleanups have run and onSceneExit has fired if this was the main track. The
        // dialogue stopped PROPERLY, and the error surfaces where the game called start() or
        // next().
        endFlow();
        throw;
    }

    auto cleanup = combineCleanups(std::move(sceneCleanup), std::move(globalCleanup));

    // The handler may have closed the flow from inside itself - scene->cancel(), engine.stop(),
    // anything that ends this track. Storing the cleanup then hung it on a block nobody will ever
    // leave again, and whatever it held - a panel, an audio voice - was never released. The engine
    // HAS left the block, so the cleanup runs now.
    if (!_running || !_host.isSceneRunning()) {
        if (auto fault = runCleanup(cleanup)) std::rethrow_exception(fault);
        return;
    }

    // Stored BEFORE any advance runs, so leaving the block finds it.
    _previousCleanup = std::move(cleanup);

    state->syncPhase = false;
    if (state->called) {
        advanceToNextBlock(block, context);
    }
}

/// Leave a block: open a track per parallel target, walk the rest one after the other.
///
/// A port may carry several wires, and each one's TARGET says how it is walked: isAsync opens its
/// own track and runs beside this one; anything else belongs to THIS track — the first becomes the
/// continuation, the others queue up and are walked when the continuation runs out of graph.
///
/// That second line is what isAsync used to be unable to say. Every wire but the first was
/// detached whether the designer had ticked the box or not, so on a secondary wire the property
/// was INERT. MIGRATION-V2.md records the whole decision.
void Track::advanceToNextBlock(const BlueprintBlock& block, IBaseBlockContext* context) {
    if (!_running || !_host.isSceneRunning()) return;

    _previousBlock = &block;
    if (context && context->character()) {
        _previousCard = *context->character();
    } else {
        _previousCard.reset();
    }

    const SceneGraph& sceneGraph = _host.hostSceneGraph();

    PortResolutionInput input;
    input.block = &block;
    input.links = sceneGraph.getOutgoingLinks(block.id);
    if (auto* cc = dynamic_cast<InternalChoiceContext*>(context)) input.selectedOptionId = cc->selectedOptionId;
    if (auto* cndc = dynamic_cast<InternalConditionContext*>(context)) input.conditionPort = cndc->conditionPort;
    if (auto* ac = dynamic_cast<InternalActionContext*>(context)) input.actionRejected = ac->actionRejected;
    if (auto* dc = dynamic_cast<InternalDialogContext*>(context)) input.actorPort = dc->actorPort;

    auto resolution = resolvePort(input);

    const Link* continuation = nullptr;
    std::vector<const Link*> detached;
    std::vector<Link> queued;

    // Sorted first, acted on after. Opening a track runs its handler immediately, and a handler may
    // cancel the scene — so nothing here may depend on state a spawn could change.
    for (const auto& link : resolution.links) {
        auto* targetBlock = sceneGraph.getBlock(link.to);
        // A wire to a block that is not in this scene: init() reports it as BROKEN_LINK, and the
        // traversal simply has nowhere to go.
        if (!targetBlock) continue;

        if (isAsyncBlock(*targetBlock)) {
            detached.push_back(&link);
        } else if (!continuation) {
            continuation = &link;
        } else {
            queued.push_back(link);
        }
    }

    // In front of what was already owed: this block's own siblings come before an ancestor's.
    if (!queued.empty()) {
        _queue.insert(_queue.begin(), queued.begin(), queued.end());
    }

    for (const auto* link : detached) {
        auto* targetBlock = sceneGraph.getBlock(link->to);
        if (targetBlock) {
            _childTrackIds.push_back(_host.spawnTrack(*targetBlock, id));
        }
    }

    // The block is now DONE, and this is the one place that says so.
    //
    // Its handler returned, its exit port is resolved and its cleanup has just run, so a bubble is
    // off the screen and an audio voice is stopped BEFORE anything waiting on this block is allowed
    // to speak. Marking it any earlier would let the joining line play over the one it was told to
    // wait for.
    //
    // The cleanup runs here rather than inside endBranch for the same reason; endBranch calls it
    // again and finds nothing, which is what makes that safe.
    if (auto cleanupFault = runBlockCleanup()) {
        // Same order as a handler that throws: close down first, surface after.
        endFlow();
        std::rethrow_exception(cleanupFault);
    }

    _host.addCompleted(block.id);

    // Releasing a parked track re-enters the traversal immediately, and a handler there is allowed
    // to cancel the scene, so the guard is re-read rather than assumed.
    if (!_running || !_host.isSceneRunning()) return;

    if (continuation) {
        auto* nextBlock = sceneGraph.getBlock(continuation->to);
        if (nextBlock) {
            processBlock(*nextBlock);
            return;
        }
    }

    if (auto fault = endBranch()) std::rethrow_exception(fault);
}

/// This branch has nowhere left to go — hand over to the queue, or stop.
///
/// The block's cleanup runs FIRST, before the next wire is picked up: leaving a block is leaving a
/// block, whether the track carries on or not. Hanging on to it until the queue emptied would keep
/// a panel open, or an audio voice alive, through everything that came after it.
std::exception_ptr Track::endBranch() {
    auto fault = runBlockCleanup();
    const SceneGraph& sceneGraph = _host.hostSceneGraph();

    while (!_queue.empty()) {
        Link link = _queue.front();
        _queue.erase(_queue.begin());
        auto* target = sceneGraph.getBlock(link.to);
        if (!target) continue;
        processBlock(*target);
        return fault;
    }

    if (fault) return fault;
    return retire();
}

/// Run the cleanup of the block this track is leaving, once, carrying what it threw.
std::exception_ptr Track::runBlockCleanup() {
    auto cleanup = std::move(_previousCleanup);
    _previousCleanup = {};
    return runCleanup(cleanup);
}

/// Stop this track for good, DROPPING whatever it still owed.
///
/// For the ends that are not a branch running out of graph: onValidateNextBlock refusing a block, a
/// handler throwing, a cleanup throwing. All three say the flow is over — the guide has always read
/// onInvalidateBlock as "the scene stops" — so the queue goes with it. Playing the next wire after
/// the game refused this one would be answering a no with "then try that".
std::exception_ptr Track::endFlow() {
    auto fault = runBlockCleanup();
    if (fault) return fault;
    return retire();
}

/// The track is done. Its cleanup has already run; the scene decides what its ending means.
///
/// Child tracks SURVIVE: they live independently in the pool, and only an explicit cancel()
/// cascades to them.
std::exception_ptr Track::retire() {
    _running = false;
    _currentBlock = nullptr;
    _pendingAdvance = {};
    _queue.clear();

    return _host.trackEnded(this);
}

bool Track::allCompleted(const std::vector<std::string>& blockIds) const {
    for (const auto& blockId : blockIds) {
        if (!_host.isCompleted(blockId)) return false;
    }
    return true;
}

} // namespace lsde
