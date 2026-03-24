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

    InternalBlockHandler getTypeHandler(BlockType type) const;
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

    void setBlockHandler(const std::string& blockUuid, InternalBlockHandler handler);
    InternalBlockHandler getBlockHandler(const std::string& blockUuid) const;
    InternalBlockHandler getTypeHandler(BlockType type) const;

private:
    std::unordered_map<std::string, InternalBlockHandler> _blockHandlers;
};

/// Resolve which handlers to call. Priority: onBlock(uuid) > scene.onType > engine.onType.
ResolvedHandlers resolveHandler(
    BlockType blockType,
    const std::string& blockUuid,
    const SceneHandlerRegistry* sceneRegistry,
    const HandlerRegistry& globalRegistry);

} // namespace lsde
