// LSDE Dialog Engine — SceneHandle + AsyncTrack

#pragma once

#include <lsde/types.h>
#include <lsde/block_context.h>
#include <lsde/condition_evaluator.h>
#include <lsde/graph.h>
#include <lsde/handler_registry.h>
#include <lsde/block_context.h>

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

/// Parallel execution branch spawned from async connections.
///
/// Mirrors the main track traversal logic but operates independently.
/// Supports sub-track spawning, waitForBlocks synchronization, and cancel cascade.
/// Anything the traversal can park until a set of blocks has been visited.
///
/// waitForBlocks is a property of the BLOCK - "the block waits for these before it advances", in
/// the format's own words. Only AsyncTrack read it, so a designer who set it on a block of the
/// main flow got nothing at all, silently, with the checkbox ticked in the editor. The main flow
/// parks through this same interface now.
class IWaiter {
public:
    virtual ~IWaiter() = default;
    virtual void notifyWaitSatisfied() = 0;
};

class AsyncTrack : public IWaiter {
public:
    AsyncTrack(const SceneGraph& sceneGraph, SceneHandleImpl& parent, const BlueprintBlock& startBlock, int id, int parentTrackId);

    /// Begin track execution. Must be called after the track is added to the pool.
    void start();
    /// Cancel this track. Runs cleanup and cascades cancel to child tracks.
    std::exception_ptr cancel();
    /// Whether this track is still executing.
    bool isRunning() const;
    /// Called by the parent handle when all waitForBlocks UUIDs have been visited.
    void notifyWaitSatisfied() override;
    /// Build a read-only snapshot of this track's state for the public API.
    TrackInfo getTrackInfo() const;

    /// Unique auto-incremented identifier for this track.
    const int id;
    /// ID of the parent track (-1 = spawned by main).
    const int parentTrackId;
    /// UUID of the block that started this track.
    const std::string startBlockUuid;

private:
    void processBlock(const BlueprintBlock& startingBlock);
    void executeBlockHandler(const BlueprintBlock& block);
    void advanceToNextBlock(const BlueprintBlock& block, IBaseBlockContext* context);
    std::exception_ptr endTrack();

    bool _running = true;
    const BlueprintBlock* _currentBlock = nullptr;
    CleanupFn _previousCleanup;
    std::function<void()> _pendingAdvance;
    std::vector<int> _childTrackIds;

    const BlueprintBlock* _startBlock;
    /// The block this track came from, for onValidateNextBlock. Its own, not the main flow's.
    const BlueprintBlock* _previousBlock = nullptr;
    std::optional<Card> _previousCard;
    const SceneGraph& _sceneGraph;
    SceneHandleImpl& _parent;
    std::unique_ptr<IBaseBlockContext> _ownedContext;
};

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
/// A block-specific override via handle->onBlock(uuid, handler) takes highest priority.
class SceneHandleImpl : public ISceneHandle, public IWaiter {
public:
    SceneHandleImpl(const SceneGraph& sceneGraph, const HandlerRegistry& globalRegistry, SceneHandleCallbacks callbacks);

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

    // ─── Internal API (used by AsyncTrack) ───────────────────────────
    const SceneGraph& getSceneGraph() const;
    const SceneHandlerRegistry& getSceneRegistry() const;
    const HandlerRegistry& getGlobalRegistry() const;
    void addVisited(const std::string& uuid);
    /// Spawn a new async track in the flat pool. Returns the assigned track ID.
    int spawnAsyncTrack(const BlueprintBlock& startBlock, int parentTrackId);
    /// Cancel a specific track by ID (used for parent->child cascade).
    std::exception_ptr cancelTrack(int trackId);
    /// Park a track - or the main flow - until every listed block has been visited.
    void registerWaitForBlocks(IWaiter* waiter, const std::vector<std::string>& blockIds);

    /// Run onValidateNextBlock for a block, and onInvalidateBlock when it refuses.
    ///
    /// Called by BOTH the main flow and every parallel track. It used to live inline in the main
    /// flow only, so a game using this hook as a gate - "do not enter this block unless the player
    /// has the keycard" - was bypassed the moment a branch was marked isAsync. Nothing in the
    /// hook's contract said it only applied to the flow the player was watching.
    ///
    /// Returns false when the caller must stop rather than dispatch the block.
    bool runValidation(const BlueprintBlock& block, const BlueprintBlock* fromBlock,
                       const Card* fromCharacter);

    /// Called once every block this flow was waiting on has been visited.
    void notifyWaitSatisfied() override;
    /// Check if a block UUID has been visited in this scene.
    bool isVisited(const std::string& uuid) const;
    void removeTrack(AsyncTrack* track);
    /// Create the appropriate context for a block (Dialog/Choice/Condition/Action).
    std::unique_ptr<IBaseBlockContext> createBlockContext(const BlueprintBlock& block);
    /// Record a choice selection in the history for condition evaluation.
    void recordChoice(const std::string& blockId, const std::string& choiceUuid);
    /// Evaluate a condition with choice history support. Non-choice conditions delegate to fallbackEvaluator.
    bool evaluateConditionForBlock(const ConditionTest& test,
        const std::function<bool(const ConditionTest&)>& fallbackEvaluator);

private:
    void processBlock(const BlueprintBlock& startingBlock);
    void executeBlockHandler(const BlueprintBlock& block);
    void advanceToNextBlock(const BlueprintBlock& block, IBaseBlockContext* context);
    std::exception_ptr endScene();
    std::exception_ptr shutdown();
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

    static bool getGlobalPrevented(IBaseBlockContext* context);
    static CleanupFn combineCleanups(CleanupFn a, CleanupFn b);

    const SceneGraph& _sceneGraph;
    const HandlerRegistry& _globalRegistry;
    SceneHandlerRegistry _sceneRegistry;
    SceneHandleCallbacks _callbacks;

    bool _running = false;
    bool _cancelled = false;
    const BlueprintBlock* _currentBlock = nullptr;
    const BlueprintBlock* _previousBlock = nullptr;
    /// The actor of the block we just left, for onValidateNextBlock's fromContext.
    /// Owned here: the context that produced it is destroyed on the way out of the block.
    std::optional<Card> _previousCard;
    const Card* _previousCharacter = nullptr;
    std::unordered_set<std::string> _visitedSet;
    std::vector<std::string> _visitedOrder;
    std::unordered_map<std::string, std::vector<std::string>> _choiceHistory;
    CleanupFn _previousCleanup;
    std::vector<std::unique_ptr<AsyncTrack>> _asyncTracks;
    int _nextTrackId = 1;
    std::vector<std::pair<IWaiter*, std::vector<std::string>>> _pendingWaits;
    /// The main flow's own parked advance, when its block carries waitForBlocks.
    std::function<void()> _pendingAdvance;
    std::unique_ptr<IBaseBlockContext> _ownedContext;
    /// Scene-level character resolver override.
    ResolveCharacterFn _resolveCharacter;
};

} // namespace lsde
