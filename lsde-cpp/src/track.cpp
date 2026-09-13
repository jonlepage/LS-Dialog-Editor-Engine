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
    if (auto* rc = dynamic_cast<InternalRouterContext*>(ctx)) return rc->globalPrevented;
    if (auto* ac = dynamic_cast<InternalActionContext*>(ctx)) return ac->globalPrevented;
    return false;
}

} // namespace

// ─── Track ───────────────────────────────────────────────────────────────────

Track::Track(ITrackHost& host, const BlueprintBlock& startBlock, int id_, int parentTrackId_,
             std::string startEntryPort)
    : id(id_), parentTrackId(parentTrackId_), startBlockId(startBlock.id),
      _host(host), _startBlock(&startBlock), _startEntryPort(std::move(startEntryPort)) {}

void Track::start() {
    run(Step{Step::Kind::Process, _startBlock, _startEntryPort, nullptr});
}

std::exception_ptr Track::cancel() {
    if (!_running) return nullptr;
    _running = false;

    auto cleanup = std::move(_previousCleanup);
    _previousCleanup = {};
    auto fault = runCleanup(cleanup);

    _currentBlock = nullptr;
    _pendingStep.reset();
    _queue.clear();
    for (auto childId : _childTrackIds) {
        auto childFault = _host.cancelTrack(childId);
        if (!fault) fault = childFault;
    }
    _childTrackIds.clear();
    return fault;
}

bool Track::isRunning() const { return _running; }

bool Track::isWaitingForBlocks() const { return _pendingStep.has_value(); }

const BlueprintBlock* Track::getCurrentBlock() const { return _currentBlock; }

void Track::notifyWaitSatisfied() {
    if (!_running || !_host.isSceneRunning() || !_pendingStep) return;
    Step step = std::move(*_pendingStep);
    _pendingStep.reset();
    run(std::move(step));
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

// ─── The loop ────────────────────────────────────────────────────────────────

/// Walk from `first` until the track has to wait for the game. The one error boundary.
///
/// The stack. Every step used to CALL the next one — processBlock, executeBlockHandler,
/// advanceToNextBlock, processBlock again — several frames per block for as long as the game
/// advanced synchronously, and nothing brought the stack back down. A condition/action loop the
/// game walks without waiting overflowed it, and a stack overflow is not an exception: the process
/// dies. Every one of those calls was the LAST thing its caller did, so each step now RETURNS the
/// next one and this loop takes it: the same steps, in the same order, at a constant depth.
///
/// What still nests is what has to come back: opening a child track, and releasing a parked one.
/// Each runs the other track's loop and returns here. The depth they add is how many are opened or
/// released in a row without the game ever waiting — a property of the graph's async shape, not of
/// its length.
///
/// The faults. Only the type handler used to sit inside a try. A throwing validation, onBeforeBlock
/// or resolver — or a fault on a track this one had just opened — escaped through a track that had
/// not finished leaving its block, and the scene stayed open with nothing able to move it. Every
/// entry into the walk comes through here, so every line of the game's code the walk calls is
/// inside this try. The scene is closed down FIRST — cleanups run, tracks cancelled, onSceneExit
/// fired — and THEN the exception is re-thrown, to whoever called start(), next() or resolve().
/// That is problem 11 of MIGRATION-V2.md, and it now holds for all of them, on every track.
void Track::run(Step first) {
    std::optional<Step> step = std::move(first);
    try {
        while (step) step = take(*step);
    } catch (...) {
        _host.fault(std::current_exception());
        throw;
    }
}

std::optional<Track::Step> Track::take(const Step& step) {
    switch (step.kind) {
        case Step::Kind::Process: return processBlock(*step.block, step.entryPort);
        case Step::Kind::Execute: return executeBlockHandler(*step.block, step.entryPort);
        case Step::Kind::Advance: break;
    }
    return advanceToNextBlock(*step.block, step.context);
}

// ─── The traversal ───────────────────────────────────────────────────────────

/// Take a block, and either park on it or dispatch it.
///
/// The order matters and each step earns its place:
///
/// 1. Step over NOTEs. They are designer-only and never dispatched.
/// 2. Honour waitForBlocks. BEFORE anything else — see the note inside.
/// 3. Ask onValidateNextBlock. The game's gate; a refusal stops this track.
/// 4. Mark it current and visited.
/// 5. Fire onBeforeBlock, whose resolve() releases the type handler.
///
/// Returns the next step, or nothing when the track has to wait — for resolve(), for a join, or
/// for good.
std::optional<Track::Step> Track::processBlock(const BlueprintBlock& startingBlock, const std::string& entryPort) {
    if (!_running || !_host.isSceneRunning()) return std::nullopt;

    const SceneGraph& sceneGraph = _host.hostSceneGraph();

    const BlueprintBlock* resolvedBlock = skipNotes(startingBlock, sceneGraph);
    if (!resolvedBlock) {
        // The end of THIS branch, not of the track: whatever is queued is still owed.
        return endBranch();
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
        // The port is COPIED into the step: the caller's string may be gone by the time the wait
        // lifts.
        _pendingStep = Step{Step::Kind::Process, &block, entryPort, nullptr};
        _host.registerWaitForBlocks(this, waitBlocks);

        // Parking may be exactly what leaves the scene with nothing able to move. That used to be
        // noticed only when a track ENDED, so when the last track able to move PARKED instead — a
        // single flow waiting on a block of a branch it did not take — the scene stayed open for
        // good: no onSceneExit, the handle in the engine's registry, isRunning() true.
        if (auto deadlock = _host.trackParked()) std::rethrow_exception(deadlock);
        return std::nullopt;
    }

    if (!_host.runValidation(block, entryPort, _previousBlock,
                             _previousCard ? &(*_previousCard) : nullptr)) {
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
        if (auto fault = endFlow(SceneEndReason::Invalidated)) std::rethrow_exception(fault);
        return std::nullopt;
    }

    _currentBlock = &block;
    _host.addVisited(block.id);

    const auto& registry = _host.hostGlobalRegistry();
    if (!registry.beforeBlockHandler) return Step{Step::Kind::Execute, &block, entryPort, nullptr};

    BeforeBlockArgs args;
    args.block = &block;
    args.scene = _host.asSceneHandle();
    // The natives live in `props` alongside the writer's own properties. Ids cannot collide, so
    // this is a lookup, not a guess.
    //
    // Kept alive past this call, not left on the stack: onBeforeBlock is the one handler a game is
    // EXPECTED to defer — read `delay`, start a timer, resolve() when it fires — so the context it
    // was handed has to still be readable then.
    _currentNatives = std::make_shared<NativeProperties>(getNativeProperties(block));
    args.context.nativeProperties = _currentNatives.get();

    // GUARDED like next(): a delay timer that fires twice would otherwise dispatch the same block
    // twice — the handler runs again, cleanups pile up, and the track advances from a block it
    // already left.
    //
    // And DEFERRED like next(): a resolve() called while onBeforeBlock is still running only raises
    // a flag, and the block is dispatched once onBeforeBlock has returned. Dispatching it on the
    // spot ran the whole rest of the walk INSIDE the game's callback — a frame per block that
    // nothing ever gave back — and ran the type handler before the lines the game had written after
    // its resolve().
    //
    // The flags live in a shared cell, not on this frame: the game may keep resolve() and call it
    // a frame later, when this frame is gone.
    struct ResolveState {
        bool resolved = false;
        bool inside = true;
        bool resolvedInside = false;
    };
    auto resolveState = std::make_shared<ResolveState>();
    auto natives = _currentNatives;  // held for as long as the game holds resolve()
    const BlueprintBlock* blockPtr = &block;
    args.resolve = [this, blockPtr, resolveState, natives, entryPort]() {
        if (resolveState->resolved) return;
        _host.ensureOwnerThread("resolve()");
        resolveState->resolved = true;
        if (resolveState->inside) {
            resolveState->resolvedInside = true;
            return;
        }
        run(Step{Step::Kind::Execute, blockPtr, entryPort, nullptr});
    };
    registry.beforeBlockHandler(args);
    resolveState->inside = false;

    if (resolveState->resolvedInside) return Step{Step::Kind::Execute, &block, entryPort, nullptr};
    return std::nullopt;
}

/// Run the handlers for a block, then leave when the game says so.
///
/// next() is guarded and deferred: called during the handler it only raises a flag, and the
/// advance happens once both handlers have returned. Otherwise a scene handler calling next()
/// would move the flow on before the global handler ever ran.
///
/// Returns the advance, when the game has already said so; nothing while it has not.
std::optional<Track::Step> Track::executeBlockHandler(const BlueprintBlock& block, const std::string& entryPort) {
    // `_running` and not just the scene's: a resolve() kept in a closure and fired after this
    // track ended would otherwise restart it on a dead flow.
    if (!_running || !_host.isSceneRunning()) return std::nullopt;

    auto resolved = resolveHandler(block.type, block.id,
                                   &_host.hostSceneRegistry(), _host.hostGlobalRegistry());

    _ownedContext = _host.createBlockContext(block, entryPort);
    auto* context = _ownedContext.get();
    if (!context) return Step{Step::Kind::Advance, &block, Ports::In, nullptr};

    // No handler → advance silently. start() already refused a scene missing one.
    if (!resolved.sceneHandler && !resolved.globalHandler) {
        return Step{Step::Kind::Advance, &block, Ports::In, context};
    }

    // The two guards live in a shared cell, NOT on this stack frame.
    //
    // `next` is handed to the game by value, and the normal way to drive this engine is to keep it
    // and call it a frame later — the player pressed a key. By then this frame is gone, and reading
    // the guards through a reference to it is undefined: they read whatever the next call wrote
    // over them, and a deferred next() silently stopped advancing. Same reason `resolveState` above
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
        _host.ensureOwnerThread("next()");
        state->called = true;
        if (state->syncPhase) return;
        run(Step{Step::Kind::Advance, blockPtr, Ports::In, context});
    };

    ISceneHandle* sceneHandle = _host.asSceneHandle();

    // No try here any more. A handler that throws reaches run(), which closes the scene before
    // re-throwing — the same boundary as every other callback of the game, instead of a boundary of
    // its own that the others did not have.
    if (resolved.sceneHandler) {
        sceneCleanup = resolved.sceneHandler(sceneHandle, &block, context, nextFn);
        if (!globalPrevented(context) && resolved.globalHandler) {
            globalCleanup = resolved.globalHandler(sceneHandle, &block, context, nextFn);
        }
    } else if (resolved.globalHandler) {
        globalCleanup = resolved.globalHandler(sceneHandle, &block, context, nextFn);
    }

    auto cleanup = combineCleanups(std::move(sceneCleanup), std::move(globalCleanup));

    // The handler may have closed the flow from inside itself - scene->cancel(), engine.stop(),
    // anything that ends this track. Storing the cleanup then hung it on a block nobody will ever
    // leave again, and whatever it held - a panel, an audio voice - was never released. The engine
    // HAS left the block, so the cleanup runs now.
    if (!_running || !_host.isSceneRunning()) {
        if (auto fault = runCleanup(cleanup)) std::rethrow_exception(fault);
        return std::nullopt;
    }

    // Stored BEFORE any advance runs, so leaving the block finds it.
    _previousCleanup = std::move(cleanup);

    state->syncPhase = false;
    if (state->called) return Step{Step::Kind::Advance, &block, Ports::In, context};
    return std::nullopt;
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
///
/// Returns the block this track goes on to, or nothing when it has ended.
std::optional<Track::Step> Track::advanceToNextBlock(const BlueprintBlock& block, IBaseBlockContext* context) {
    if (!_running || !_host.isSceneRunning()) return std::nullopt;

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
    if (auto* rc = dynamic_cast<InternalRouterContext*>(context)) input.routerPorts = rc->routerPorts;
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
            _childTrackIds.push_back(_host.spawnTrack(*targetBlock, id, link->toPort));
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
    //
    // A cleanup that throws is a fault like a handler that throws: run() closes the scene, then
    // surfaces it.
    if (auto cleanupFault = runBlockCleanup()) std::rethrow_exception(cleanupFault);

    _host.addCompleted(block.id);

    // Releasing a parked track re-enters the traversal immediately, and a handler there is allowed
    // to cancel the scene, so the guard is re-read rather than assumed.
    if (!_running || !_host.isSceneRunning()) return std::nullopt;

    if (continuation) {
        auto* nextBlock = sceneGraph.getBlock(continuation->to);
        // The port is COPIED: `continuation` points into a resolution that dies with this call.
        if (nextBlock) return Step{Step::Kind::Process, nextBlock, continuation->toPort, nullptr};
    }

    return endBranch();
}

/// This branch has nowhere left to go — hand over to the queue, or stop.
///
/// The block's cleanup runs FIRST, before the next wire is picked up: leaving a block is leaving a
/// block, whether the track carries on or not. Hanging on to it until the queue emptied would keep
/// a panel open, or an audio voice alive, through everything that came after it.
std::optional<Track::Step> Track::endBranch() {
    if (auto cleanupFault = runBlockCleanup()) std::rethrow_exception(cleanupFault);
    const SceneGraph& sceneGraph = _host.hostSceneGraph();

    while (!_queue.empty()) {
        Link link = _queue.front();
        _queue.erase(_queue.begin());
        auto* target = sceneGraph.getBlock(link.to);
        if (!target) continue;
        return Step{Step::Kind::Process, target, link.toPort, nullptr};
    }

    if (auto fault = retire(SceneEndReason::Completed)) std::rethrow_exception(fault);
    return std::nullopt;
}

/// Run the cleanup of the block this track is leaving, once, carrying what it threw.
std::exception_ptr Track::runBlockCleanup() {
    auto cleanup = std::move(_previousCleanup);
    _previousCleanup = {};
    return runCleanup(cleanup);
}

/// Stop this track for good, DROPPING whatever it still owed.
///
/// For onValidateNextBlock refusing a block — the guide has always read onInvalidateBlock as "the
/// scene stops" — so the queue goes with it. Playing the next wire after the game refused this one
/// would be answering a no with "then try that". A handler or a cleanup that throws no longer comes
/// here: that closes the whole scene, in run().
std::exception_ptr Track::endFlow(const std::string& ending) {
    auto fault = runBlockCleanup();
    if (fault) return fault;
    return retire(ending);
}

/// The track is done. Its cleanup has already run; the scene decides what its ending means.
///
/// Child tracks SURVIVE: they live independently in the pool, and only an explicit cancel()
/// cascades to them.
std::exception_ptr Track::retire(const std::string& ending) {
    _running = false;
    _currentBlock = nullptr;
    _pendingStep.reset();
    _queue.clear();

    return _host.trackEnded(this, ending);
}

bool Track::allCompleted(const std::vector<std::string>& blockIds) const {
    for (const auto& blockId : blockIds) {
        if (!_host.isCompleted(blockId)) return false;
    }
    return true;
}

} // namespace lsde
