// LSDE Dialog Engine — one track walking the graph (C++ port of track.ts)
//
// This is THE traversal. There is one of it, and every track uses it: the one the player is
// watching and every parallel branch isAsync opens. A track is a cursor — it knows which block it
// is on, what it still has to clean up, and whether it is parked. It does not know it is the main
// one; only the scene knows that, and only when the track ends.
//
// It used to be written twice. SceneHandleImpl walked the graph itself for the main flow, and
// AsyncTrack walked it again for the parallel ones — the same five methods, side by side in one
// file. Then the two drifted, because a change to one is silent in the other:
//
//   waitForBlocks was added to the parallel copy       -> inert on the main flow, for months
//   onValidateNextBlock was added to the main copy     -> never fired on a parallel branch
//
// Both shipped in v1 and neither showed up at runtime. That is the whole argument for this file.

#pragma once

#include <lsde/types.h>
#include <lsde/block_context.h>
#include <lsde/graph.h>
#include <lsde/handler_registry.h>

#include <exception>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace lsde {

/// Anything the engine can park until a set of blocks has been visited.
class IWaiter {
public:
    virtual ~IWaiter() = default;
    virtual void notifyWaitSatisfied() = 0;
};

class Track;

/// The id of the track the player is watching. Every other track is numbered from 1.
///
/// A number and not a flag because the main track is not special: it is the first one, and the
/// scene ends when it ends. That is the ONLY thing that sets it apart.
inline constexpr int kMainTrackId = 0;

// ─── Cleanup faults ──────────────────────────────────────────────────────────

/// Run a cleanup and hand back what it threw instead of letting it escape.
///
/// A fault has to be CARRIED rather than propagated on the spot. A cleanup runs while the engine
/// is tearing something down — leaving a block, ending a track, closing a scene — and an exception
/// escaping mid-teardown stopped the teardown: the scene stayed running, onSceneExit never fired,
/// the remaining tracks were never cancelled, and the handle sat in the engine's registry forever.
/// The game got its exception and an engine it could no longer use.
///
/// So the shutdown always finishes, and the fault is re-thrown once there is nothing left to
/// unwind — the same contract as a handler that throws.
std::exception_ptr runCleanup(const CleanupFn& cleanup);

/// Combine a scene cleanup and a global one into the single cleanup a track keeps.
///
/// BOTH always run. They release unrelated things — a scene handler's panel and a global handler's
/// audio voice — so letting the first one's failure skip the second leaked whatever the second
/// owned. The first fault is re-thrown once both have had their turn.
CleanupFn combineCleanups(CleanupFn a, CleanupFn b);

// ─── Shared reading helpers ──────────────────────────────────────────────────

/// Walk past NOTE blocks to the first block the engine actually dispatches.
///
/// NOTE blocks are designer-only: they carry no handler and are never executed, so a track steps
/// over them and follows their first outgoing link.
///
/// Returns nullptr when the walk runs out of connections — and also when it comes back to a NOTE
/// it already stepped over. A designer can wire a NOTE into a loop, and following it recursively
/// overflowed the stack instead of ending the flow.
const BlueprintBlock* skipNotes(const BlueprintBlock& block, const SceneGraph& sceneGraph);

/// Does this block open a parallel track?
bool isAsyncBlock(const BlueprintBlock& block);

// ─── The scene, seen from a track ────────────────────────────────────────────

/// What a track needs from the scene that owns it.
///
/// Deliberately narrow. Everything here is SHARED between tracks — the visited set, the
/// registries, the pending waits — which is exactly why it lives on the scene and not on a track.
/// A track that could reach the whole SceneHandleImpl would drift back into doing the scene's job.
class ITrackHost {
public:
    virtual ~ITrackHost() = default;

    virtual const SceneGraph& hostSceneGraph() const = 0;
    virtual const HandlerRegistry& hostGlobalRegistry() const = 0;
    virtual const SceneHandlerRegistry& hostSceneRegistry() const = 0;

    /// The handle handed to handlers as `scene`. Always the scene, never the track.
    virtual ISceneHandle* asSceneHandle() = 0;
    /// Is the scene still playing? A track stops the moment its scene does.
    virtual bool isSceneRunning() const = 0;

    virtual void addVisited(const std::string& blockId) = 0;
    virtual bool isVisited(const std::string& blockId) const = 0;
    virtual void registerWaitForBlocks(IWaiter* waiter, const std::vector<std::string>& blockIds) = 0;

    virtual std::unique_ptr<IBaseBlockContext> createBlockContext(const BlueprintBlock& block) = 0;
    virtual bool runValidation(const BlueprintBlock& block, const BlueprintBlock* fromBlock,
                               const Card* fromCharacter) = 0;

    /// Open a parallel track on startBlock. Returns its id.
    virtual int spawnTrack(const BlueprintBlock& startBlock, int parentTrackId) = 0;
    virtual std::exception_ptr cancelTrack(int trackId) = 0;
    /// This track reached the end of its flow. The scene decides what that means.
    virtual std::exception_ptr trackEnded(Track* track) = 0;
};

// ─── Track ───────────────────────────────────────────────────────────────────

/// One cursor walking the graph. The main flow is one of these, with id 0.
class Track : public IWaiter {
public:
    Track(ITrackHost& host, const BlueprintBlock& startBlock, int id, int parentTrackId);

    /// Begin walking. Must be called after the track is in the scene's pool.
    void start();

    /// Stop this track and every track it opened.
    ///
    /// Returns a fault instead of throwing one: the scene cancels the whole pool in a loop, and
    /// one badly-behaved cleanup must not leave the tracks after it running.
    std::exception_ptr cancel();

    bool isRunning() const;
    const BlueprintBlock* getCurrentBlock() const;

    /// Called once every block this track was waiting on has been visited.
    void notifyWaitSatisfied() override;

    /// A read-only snapshot, for a debug view.
    TrackInfo getTrackInfo() const;

    /// Unique within the scene. kMainTrackId is the flow the player is watching.
    const int id;
    /// The track that opened this one, or -1 when the main flow opened it.
    const int parentTrackId;
    /// The block this track started on.
    const std::string startBlockUuid;

private:
    void processBlock(const BlueprintBlock& startingBlock);
    void executeBlockHandler(const BlueprintBlock& block);
    void advanceToNextBlock(const BlueprintBlock& block, IBaseBlockContext* context);
    /// This track has nowhere left to go. Its cleanup runs, then the scene is told.
    std::exception_ptr endFlow();
    bool allVisited(const std::vector<std::string>& blockIds) const;

    ITrackHost& _host;
    const BlueprintBlock* _startBlock;
    /// Tracks this one opened. Only an explicit cancel() cascades to them.
    std::vector<int> _childTrackIds;

    bool _running = true;
    const BlueprintBlock* _currentBlock = nullptr;
    /// Where this track came from, for onValidateNextBlock. Its own, not another track's.
    const BlueprintBlock* _previousBlock = nullptr;
    /// Owned: the context that produced this card is destroyed on the way out of the block.
    std::optional<Card> _previousCard;
    CleanupFn _previousCleanup;
    /// What to resume when a waitForBlocks is satisfied.
    std::function<void()> _pendingAdvance;
    /// The context of the block being dispatched, alive for as long as the block is.
    std::unique_ptr<IBaseBlockContext> _ownedContext;
    /// The natives handed to onBeforeBlock. Shared, because a game may defer its resolve().
    std::shared_ptr<NativeProperties> _currentNatives;
};

} // namespace lsde
