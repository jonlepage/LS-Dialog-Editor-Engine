// LSDE Dialog Engine — SceneHandle + AsyncTrack

#pragma once

#include <lsde/types.h>
#include <lsde/graph.h>
#include <lsde/handler_registry.h>
#include <lsde/block_context.h>

namespace lsde {

/// Callback type for character resolution.
using ResolveCharacterFn = std::function<const BlockCharacter*(const std::vector<BlockCharacter>&)>;
/// Callback type for choice visibility filtering (game-state conditions only).
using ChoiceFilterFn = std::function<bool(const ExportCondition&)>;

/// Internal callbacks passed from DialogueEngine to SceneHandleImpl.
struct SceneHandleCallbacks {
    /// Called when the scene starts. Registers the scene in the engine's active map.
    std::function<void(ISceneHandle*)> onSceneStarted;
    /// Called when the scene ends. Removes the scene from the engine's active map.
    std::function<void(ISceneHandle*)> onSceneEnded;
    /// Returns the engine-level character resolver.
    std::function<ResolveCharacterFn()> getResolveCharacter;
    /// Returns the engine-level choice filter, or empty function if none installed.
    std::function<ChoiceFilterFn()> getChoiceFilter;
    /// Returns the current locale.
    std::function<std::string()> getLocale;
};

class SceneHandleImpl;

/// Parallel execution branch spawned from async connections.
///
/// Mirrors the main track traversal logic but operates independently.
/// Supports sub-track spawning, waitForBlocks synchronization, and cancel cascade.
class AsyncTrack {
public:
    AsyncTrack(const SceneGraph& sceneGraph, SceneHandleImpl& parent, const BlueprintBlock& startBlock, int id, int parentTrackId);

    /// Begin track execution. Must be called after the track is added to the pool.
    void start();
    /// Cancel this track. Runs cleanup and cascades cancel to child tracks.
    void cancel();
    /// Whether this track is still executing.
    bool isRunning() const;
    /// Called by the parent handle when all waitForBlocks UUIDs have been visited.
    void notifyWaitSatisfied();
    /// Build a read-only snapshot of this track's state for the public API.
    TrackInfo getTrackInfo() const;

    /// Unique auto-incremented identifier for this track.
    const int id;
    /// ID of the parent track (-1 = spawned by main).
    const int parentTrackId;
    /// UUID of the block that started this track.
    const std::string startBlockUuid;

private:
    void processBlock(const BlueprintBlock& block);
    void executeBlockHandler(const BlueprintBlock& block);
    void advanceToNextBlock(const BlueprintBlock& block, IBaseBlockContext* context);
    void endTrack();

    bool _running = true;
    const BlueprintBlock* _currentBlock = nullptr;
    CleanupFn _previousCleanup;
    std::function<void()> _pendingAdvance;
    std::vector<int> _childTrackIds;

    const BlueprintBlock* _startBlock;
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
class SceneHandleImpl : public ISceneHandle {
public:
    SceneHandleImpl(const SceneGraph& sceneGraph, const HandlerRegistry& globalRegistry, SceneHandleCallbacks callbacks);

    // ─── ISceneHandle public API ─────────────────────────────────────
    void start() override;
    void cancel() override;
    void onEnter(SceneLifecycleHandler handler) override;
    void onExit(SceneLifecycleHandler handler) override;
    void onBlock(const std::string& blockUuid, InternalBlockHandler handler) override;
    void onDialogId(const std::string& blockUuid, TypedBlockHandler<DialogBlock, IDialogContext> handler) override;
    void onChoiceId(const std::string& blockUuid, TypedBlockHandler<ChoiceBlock, IChoiceContext> handler) override;
    void onConditionId(const std::string& blockUuid, TypedBlockHandler<ConditionBlock, IConditionContext> handler) override;
    void onActionId(const std::string& blockUuid, TypedBlockHandler<ActionBlock, IActionContext> handler) override;
    void onDialog(TypedBlockHandler<DialogBlock, IDialogContext> handler) override;
    void onChoice(TypedBlockHandler<ChoiceBlock, IChoiceContext> handler) override;
    void onCondition(TypedBlockHandler<ConditionBlock, IConditionContext> handler) override;
    void onAction(TypedBlockHandler<ActionBlock, IActionContext> handler) override;
    const BlueprintBlock* getCurrentBlock() const override;
    const std::vector<std::string>& getVisitedBlocks() const override;
    bool isRunning() const override;
    int getActiveTracks() const override;
    std::vector<TrackInfo> getTrackInfos() const override;
    const std::unordered_map<std::string, std::vector<std::string>>& getChoiceHistory() const override;
    const std::vector<std::string>* getChoice(const std::string& blockUuid) const override;
    bool evaluateCondition(const ExportCondition& condition) override;
    void onResolveCharacter(std::function<const BlockCharacter*(const std::vector<BlockCharacter>&)> fn) override;

    // ─── Internal API (used by AsyncTrack) ───────────────────────────
    const SceneGraph& getSceneGraph() const;
    const SceneHandlerRegistry& getSceneRegistry() const;
    const HandlerRegistry& getGlobalRegistry() const;
    void addVisited(const std::string& uuid);
    /// Spawn a new async track in the flat pool. Returns the assigned track ID.
    int spawnAsyncTrack(const BlueprintBlock& startBlock, int parentTrackId);
    /// Cancel a specific track by ID (used for parent->child cascade).
    void cancelTrack(int trackId);
    /// Register a track as waiting for specific block UUIDs to be visited.
    void registerWaitForBlocks(AsyncTrack* track, const std::vector<std::string>& blockUuids);
    /// Check if a block UUID has been visited in this scene.
    bool isVisited(const std::string& uuid) const;
    void removeTrack(AsyncTrack* track);
    /// Create the appropriate context for a block (Dialog/Choice/Condition/Action).
    std::unique_ptr<IBaseBlockContext> createBlockContext(const BlueprintBlock& block);
    /// Record a choice selection in the history for condition evaluation.
    void recordChoice(const std::string& blockUuid, const std::string& choiceUuid);
    /// Evaluate a condition with choice history support. Non-choice conditions delegate to fallbackEvaluator.
    bool evaluateConditionForBlock(const ExportCondition& condition,
        const std::function<bool(const ExportCondition&)>& fallbackEvaluator);

private:
    void processBlock(const BlueprintBlock& block);
    void executeBlockHandler(const BlueprintBlock& block);
    void advanceToNextBlock(const BlueprintBlock& block, IBaseBlockContext* context);
    void endScene();
    /// Evaluate a condition using choice history for choice: keys, fallback for others.
    bool evaluateConditionWithHistory(const ExportCondition& condition,
        const std::function<bool(const ExportCondition&)>& fallbackEvaluator);
    void fireSceneEnter();
    void fireSceneExit();
    std::unique_ptr<IBaseBlockContext> createContext(const BlueprintBlock& block);
    /// Returns the scene-level resolver if set, otherwise the engine-level resolver.
    ResolveCharacterFn getResolveCharacterFn() const;
    /// Tag each choice with visible = true/false based on the installed filter.
    /// If no filter, returns choices as RuntimeChoiceItem with visible = nullopt.
    std::vector<RuntimeChoiceItem> tagChoiceVisibility(
        const std::vector<ChoiceItem>& choices,
        const ChoiceFilterFn& filter);
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
    const BlockCharacter* _previousCharacter = nullptr;
    const BlockCharacter* _preResolvedNextCharacter = nullptr;
    bool _hasPreResolvedCharacter = false;
    std::unordered_set<std::string> _visitedSet;
    std::vector<std::string> _visitedOrder;
    std::unordered_map<std::string, std::vector<std::string>> _choiceHistory;
    CleanupFn _previousCleanup;
    std::vector<std::unique_ptr<AsyncTrack>> _asyncTracks;
    int _nextTrackId = 1;
    std::unordered_map<AsyncTrack*, std::vector<std::string>> _pendingWaits;
    std::unique_ptr<IBaseBlockContext> _ownedContext;
    /// Scene-level character resolver override.
    ResolveCharacterFn _resolveCharacter;
};

} // namespace lsde
