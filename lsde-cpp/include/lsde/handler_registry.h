// LSDE Dialog Engine — Handler registration + Tier 1/Tier 2 resolution

#pragma once

#include <lsde/types.h>

namespace lsde {

/// Resolved handler pair (scene + global).
struct ResolvedHandlers {
    InternalBlockHandler sceneHandler;
    InternalBlockHandler globalHandler;
};

/// Stores global (Tier 1) handlers. Last-write-wins per slot.
class HandlerRegistry {
public:
    InternalBlockHandler dialogHandler;
    InternalBlockHandler choiceHandler;
    InternalBlockHandler conditionHandler;
    InternalBlockHandler actionHandler;

    SceneLifecycleHandler sceneEnterHandler;
    SceneLifecycleHandler sceneExitHandler;

    ValidateNextBlockHandler validateNextBlockHandler;
    InvalidateBlockHandler invalidateBlockHandler;
    BeforeBlockHandler beforeBlockHandler;

    InternalBlockHandler getTypeHandler(const std::string& type) const;
};

/// Stores per-scene (Tier 2) handlers.
class SceneHandlerRegistry {
public:
    InternalBlockHandler dialogHandler;
    InternalBlockHandler choiceHandler;
    InternalBlockHandler conditionHandler;
    InternalBlockHandler actionHandler;

    SceneLifecycleHandler enterHandler;
    SceneLifecycleHandler exitHandler;

    void setBlockHandler(const std::string& blockId, InternalBlockHandler handler);
    InternalBlockHandler getBlockHandler(const std::string& blockId) const;
    InternalBlockHandler getTypeHandler(const std::string& type) const;

private:
    std::unordered_map<std::string, InternalBlockHandler> _blockHandlers;
};

/// Resolve which handlers to call. Priority: onBlock(blockId) > scene.onType > engine.onType.
ResolvedHandlers resolveHandler(
    const std::string& blockType,
    const std::string& blockId,
    const SceneHandlerRegistry* sceneRegistry,
    const HandlerRegistry& globalRegistry);

} // namespace lsde
