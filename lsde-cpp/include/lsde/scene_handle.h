// LSDE Dialog Engine — SceneHandle + AsyncTrack

#pragma once

#include <lsde/types.h>
#include <lsde/graph.h>
#include <lsde/handler_registry.h>
#include <lsde/block_context.h>

namespace lsde {

struct SceneHandleCallbacks {
    std::function<void(ISceneHandle*)> onSceneStarted;
    std::function<void(ISceneHandle*)> onSceneEnded;
    std::function<IStateBridge*()> getStateBridge;
    std::function<std::string()> getLocale;
};

class SceneHandleImpl;

/// Parallel execution branch.
class AsyncTrack {
public:
    AsyncTrack(const SceneGraph& sceneGraph, SceneHandleImpl& parent, const BlueprintBlock& startBlock);
    void cancel();
    bool isRunning() const;
    bool isFollowNarrative() const;
    void notifyMainAdvance();

private:
    void processBlock(const BlueprintBlock& block);
    void executeBlockHandler(const BlueprintBlock& block);
    void advanceToNextBlock(const BlueprintBlock& block, IBaseBlockContext* context);
    void forceAdvance();
    void endTrack();
    void autoEvaluateCondition(const BlueprintBlock& block, InternalConditionContext* context);
    void autoExecuteAction(const BlueprintBlock& block, InternalActionContext* context);
    static bool getGlobalPrevented(IBaseBlockContext* context);
    static CleanupFn combineCleanups(CleanupFn a, CleanupFn b);

    bool _running = true;
    const BlueprintBlock* _currentBlock = nullptr;
    CleanupFn _previousCleanup;
    bool _followNarrative = false;
    std::function<void()> _pendingAdvance;

    const SceneGraph& _sceneGraph;
    SceneHandleImpl& _parent;
    std::unique_ptr<IBaseBlockContext> _ownedContext; // keeps context alive during traversal
};

/// Concrete implementation of ISceneHandle.
class SceneHandleImpl : public ISceneHandle {
public:
    SceneHandleImpl(const SceneGraph& sceneGraph, const HandlerRegistry& globalRegistry, SceneHandleCallbacks callbacks);

    // ─── ISceneHandle public API ─────────────────────────────────────
    void start() override;
    void cancel() override;
    void onEnter(SceneLifecycleHandler handler) override;
    void onExit(SceneLifecycleHandler handler) override;
    void onBlock(const std::string& blockUuid, InternalBlockHandler handler) override;
    void onDialog(TypedBlockHandler<DialogBlock, IDialogContext> handler) override;
    void onChoice(TypedBlockHandler<ChoiceBlock, IChoiceContext> handler) override;
    void onCondition(TypedBlockHandler<ConditionBlock, IConditionContext> handler) override;
    void onAction(TypedBlockHandler<ActionBlock, IActionContext> handler) override;
    const BlueprintBlock* getCurrentBlock() const override;
    const std::vector<std::string>& getVisitedBlocks() const override;
    bool isRunning() const override;
    int getActiveTracks() const override;

    // ─── Internal API (used by AsyncTrack) ───────────────────────────
    const SceneGraph& getSceneGraph() const;
    const SceneHandlerRegistry& getSceneRegistry() const;
    const HandlerRegistry& getGlobalRegistry() const;
    IStateBridge* getStateBridge() const;
    void addVisited(const std::string& uuid);
    void removeTrack(AsyncTrack* track);
    std::unique_ptr<IBaseBlockContext> createBlockContext(const BlueprintBlock& block);

private:
    void processBlock(const BlueprintBlock& block);
    void executeBlockHandler(const BlueprintBlock& block);
    void advanceToNextBlock(const BlueprintBlock& block, IBaseBlockContext* context);
    void endScene();
    void autoEvaluateCondition(const BlueprintBlock& block, InternalConditionContext* context);
    void autoExecuteAction(const BlueprintBlock& block, InternalActionContext* context);
    void fireSceneEnter();
    void fireSceneExit();
    std::unique_ptr<IBaseBlockContext> createContext(const BlueprintBlock& block);
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
    std::unordered_set<std::string> _visitedSet;
    std::vector<std::string> _visitedOrder;
    CleanupFn _previousCleanup;
    std::vector<std::unique_ptr<AsyncTrack>> _asyncTracks;
    std::unique_ptr<IBaseBlockContext> _ownedContext; // keeps main-track context alive
};

} // namespace lsde
