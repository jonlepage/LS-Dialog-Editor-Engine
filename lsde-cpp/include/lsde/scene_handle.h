// LSDE Dialog Engine — SceneHandle: the scene and everything its tracks share
//
// This header does NOT describe walking the graph. Walking is one thing, written once, in
// track.h. What lives here is what every track of a scene has in common and could not own:
// the blocks already visited, what the player answered, the handler registries, the tracks
// parked on a waitForBlocks, and the scene's own lifecycle.

#pragma once

#include <lsde/types.h>
#include <lsde/block_context.h>
#include <lsde/condition_evaluator.h>
#include <lsde/graph.h>
#include <lsde/handler_registry.h>
#include <lsde/block_context.h>
#include <lsde/track.h>

namespace lsde {

/// Callback type for character resolution.
using ResolveCharacterFn = std::function<const Card*(const std::vector<Card>&)>;
/// Callback type for unified condition resolution (game-state conditions only).
using ConditionResolverFn = std::function<bool(const ConditionTest&)>;

/// Internal callbacks passed from DialogueEngine to SceneHandleImpl.
struct SceneHandleCallbacks {
    /// Called when the scene starts. Registers the scene in the engine's active map.
    std::function<void(ISceneHandle*)> onSceneStarted;
    /// Called when the scene ends. Removes the scene from the engine's active map.
    std::function<void(ISceneHandle*)> onSceneEnded;
    /// Returns the engine-level character resolver.
    std::function<ResolveCharacterFn()> getResolveCharacter;
    /// Returns the unified condition resolver, or empty function if none installed.
    std::function<ConditionResolverFn()> getConditionResolver;
    /// Returns the current locale.
    /// Look a card id (var1) up in the export's cards table.
    std::function<const Card*(const std::string&)> getCard;
};

class SceneHandleImpl;

/// Concrete implementation of ISceneHandle.
///
/// Manages the main traversal loop, async tracks, handler resolution (two-tier:
/// scene-level Tier 2 + global Tier 1), choice history, and character resolution.
///
/// The engine uses a two-tier handler system:
/// 1. Tier 2 (scene): registered via handle->onDialog(), handle->onChoice(), etc.
/// 2. Tier 1 (global): registered via engine.onDialog(), engine.onChoice(), etc.
///
/// When a block is dispatched, the scene handler (Tier 2) is called first. The global handler
/// (Tier 1) is then called after, unless context->preventGlobalHandler() was invoked.
/// A block-specific override via handle->onBlock(blockId, handler) takes highest priority.
class SceneHandleImpl : public ISceneHandle, public ITrackHost {
public:
    SceneHandleImpl(const SceneGraph& sceneGraph, const HandlerRegistry& globalRegistry, SceneHandleCallbacks callbacks);

    /// Closing the scene down is part of destroying it.
    ///
    /// scene() hands back a unique_ptr, so a scoped handle is ordinary C++ — and the engine keeps
    /// a raw pointer to it. Without this, destroying a RUNNING handle left that pointer dangling:
    /// isRunning() answered true for a scene that no longer existed, and stop() read freed memory.
    /// The three garbage collected runtimes cannot have this, because the engine's own reference
    /// keeps the scene alive there; here the handle has to hand itself back.
    ///
    /// Destroying a running scene therefore behaves like cancelling it: cleanups run, onSceneExit
    /// fires, the engine deregisters. Nothing escapes — a destructor must not throw.
    ~SceneHandleImpl() override;

    // ─── ISceneHandle public API ─────────────────────────────────────
    void start() override;
    void cancel() override;
    void onEnter(SceneLifecycleHandler handler) override;
    void onExit(SceneLifecycleHandler handler) override;
    void onBlock(const std::string& blockId, InternalBlockHandler handler) override;
    void onDialogId(const std::string& blockId, TypedBlockHandler<BlueprintBlock, IDialogContext> handler) override;
    void onChoiceId(const std::string& blockId, TypedBlockHandler<BlueprintBlock, IChoiceContext> handler) override;
    void onConditionId(const std::string& blockId, TypedBlockHandler<BlueprintBlock, IConditionContext> handler) override;
    void onActionId(const std::string& blockId, TypedBlockHandler<BlueprintBlock, IActionContext> handler) override;
    void onDialog(TypedBlockHandler<BlueprintBlock, IDialogContext> handler) override;
    void onChoice(TypedBlockHandler<BlueprintBlock, IChoiceContext> handler) override;
    void onCondition(TypedBlockHandler<BlueprintBlock, IConditionContext> handler) override;
    void onAction(TypedBlockHandler<BlueprintBlock, IActionContext> handler) override;
    const BlueprintBlock* getCurrentBlock() const override;
    const std::vector<std::string>& getVisitedBlocks() const override;
    bool isRunning() const override;
    int getActiveTracks() const override;
    std::vector<TrackInfo> getTrackInfos() const override;
    const std::unordered_map<std::string, std::vector<std::string>>& getChoiceHistory() const override;
    const std::vector<std::string>* getChoice(const std::string& blockId) const override;
    bool evaluateCondition(const ConditionTest& test) override;
    void onResolveCharacter(std::function<const Card*(const std::vector<Card>&)> fn) override;

    // ─── ITrackHost — what a track asks the scene for ────────────────
    const SceneGraph& hostSceneGraph() const override;
    const SceneHandlerRegistry& hostSceneRegistry() const override;
    const HandlerRegistry& hostGlobalRegistry() const override;
    ISceneHandle* asSceneHandle() override;
    bool isSceneRunning() const override;
    void addVisited(const std::string& blockId) override;
    /// Open a parallel track. Returns its id.
    int spawnTrack(const BlueprintBlock& startBlock, int parentTrackId) override;
    /// Cancel a specific track by ID (used for parent->child cascade).
    std::exception_ptr cancelTrack(int trackId) override;
    /// Park a track - the main flow included - until every listed block has been visited.
    void registerWaitForBlocks(IWaiter* waiter, const std::vector<std::string>& blockIds) override;

    /// A track has nowhere left to go. Retire it, and close the scene once nothing is left that
    /// could still move.
    ///
    /// Every track is retired the same way, the main flow included. What ends the scene is the pool
    /// running out of tracks able to advance, not the main flow reaching its end.
    ///
    /// It used to be the main flow: trackEnded on track 0 called shutdown(), which cancels every
    /// live track. That contradicted the promise Track::endFlow makes — child tracks survive, only
    /// an explicit cancel() cascades — for the one track that opens most of them, and it made a
    /// whole port silently do nothing: a port whose targets are ALL isAsync leaves the main flow no
    /// continuation, so it ends the instant it has spawned them, and shutdown cancelled the
    /// branches born three lines earlier. They never got past onBeforeBlock.
    ///
    /// A track parked on a waitForBlocks does NOT count as able to advance: it is waiting for
    /// another track to visit a block, so once every survivor is parked, nothing will ever visit
    /// anything again. Keeping the scene open on those would turn an unreachable wait into a scene
    /// that never closes.
    ///
    /// An explicit cancel() still tears the whole scene down at once — that is its job.
    std::exception_ptr trackEnded(Track* track) override;

    /// Run onValidateNextBlock for a block, and onInvalidateBlock when it refuses.
    ///
    /// Called by BOTH the main flow and every parallel track. It used to live inline in the main
    /// flow only, so a game using this hook as a gate - "do not enter this block unless the player
    /// has the keycard" - was bypassed the moment a branch was marked isAsync. Nothing in the
    /// hook's contract said it only applied to the flow the player was watching.
    ///
    /// Returns false when the caller must stop rather than dispatch the block.
    bool runValidation(const BlueprintBlock& block, const BlueprintBlock* fromBlock,
                       const Card* fromCharacter) override;

    /// Check if a block id has been visited in this scene.
    bool isVisited(const std::string& blockId) const override;
    /// Create the appropriate context for a block (Dialog/Choice/Condition/Action).
    std::unique_ptr<IBaseBlockContext> createBlockContext(const BlueprintBlock& block) override;
    /// Record a choice selection in the history for condition evaluation.
    void recordChoice(const std::string& blockId, const std::string& optionId);
    /// Evaluate a condition with choice history support. Non-choice conditions delegate to fallbackEvaluator.
    bool evaluateConditionForBlock(const ConditionTest& test,
        const std::function<bool(const ConditionTest&)>& fallbackEvaluator);

private:
    /// Close the scene down: cancel every track, fire onSceneExit, tell the engine.
    std::exception_ptr shutdown();
    /// A track that ended is stopped, not deleted — see the note in shutdown().
    /// Retire an ended parallel track. A no-op by design — see the definition.
    void retireTrack(Track* track);
    std::vector<Track*> parallelTracks() const;
    /// Evaluate a condition using choice history for choice: keys, fallback for others.
    bool evaluateConditionWithHistory(const ConditionTest& test,
        const std::function<bool(const ConditionTest&)>& fallbackEvaluator);
    void fireSceneEnter();
    void fireSceneExit();
    std::unique_ptr<IBaseBlockContext> createContext(const BlueprintBlock& block);
    /// Returns the scene-level resolver if set, otherwise the engine-level resolver.
    ResolveCharacterFn getResolveCharacterFn() const;
    /// Tag each choice with visible = true/false based on the installed resolver.
    /// Look up the cards a block cites, and let the game pick which actor is speaking.
    ResolvedCards resolveCardsFor(const BlueprintBlock& block) const;

    /// The evaluator that ROUTES a condition block. Always present.
    ///
    /// With no game resolver installed it still answers "choice" tests on its own, and says false
    /// to anything about game state — a scene that only asks about its own past answers therefore
    /// plays without a single line of game code, and one that asks about the world takes its
    /// default branch rather than stalling.
    ConditionEvaluatorFn routingEvaluator();

    /// The evaluator that TAGS option visibility, or empty when there is no game resolver.
    ///
    /// Routing and tagging cannot share one answer here. Routing has to pick a branch, so an
    /// unanswerable test has to become false. An option has no such obligation: saying false about
    /// a question nobody could answer would HIDE an answer from the player. Empty says unknown,
    /// and a game reading `visible != false` still offers it.
    ConditionEvaluatorFn visibilityEvaluator();

    const SceneGraph& _sceneGraph;
    const HandlerRegistry& _globalRegistry;
    SceneHandlerRegistry _sceneRegistry;
    SceneHandleCallbacks _callbacks;

    bool _running = false;

    // ─── Shared by every track of this scene ─────────────────────────
    std::unordered_set<std::string> _visitedSet;
    std::vector<std::string> _visitedOrder;
    std::unordered_map<std::string, std::vector<std::string>> _choiceHistory;
    /// Tracks — the main flow included — parked until a set of blocks has been visited.
    std::vector<std::pair<IWaiter*, std::vector<std::string>>> _pendingWaits;

    // ─── The tracks ──────────────────────────────────────────────────
    /// Every live track, the main flow first.
    std::vector<std::unique_ptr<Track>> _tracks;
    /// The flow the player is watching. Null until start().
    Track* _mainTrack = nullptr;
    /// Auto-incremented track id. kMainTrackId (0) belongs to the main flow.
    int _nextTrackId = kMainTrackId + 1;
    /// Scene-level character resolver override.
    ResolveCharacterFn _resolveCharacter;
};

} // namespace lsde
