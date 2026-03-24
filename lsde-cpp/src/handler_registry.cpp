// LSDE Dialog Engine — Handler registration + resolution

#include <lsde/handler_registry.h>

namespace lsde {

// ─── HandlerRegistry (Tier 1) ────────────────────────────────────────────────

InternalBlockHandler HandlerRegistry::getTypeHandler(BlockType type) const {
    switch (type) {
        case BlockType::Dialog:    return dialogHandler;
        case BlockType::Choice:    return choiceHandler;
        case BlockType::Condition: return conditionHandler;
        case BlockType::Action:    return actionHandler;
        case BlockType::Note:      return {};
    }
    return {};
}

// ─── SceneHandlerRegistry (Tier 2) ──────────────────────────────────────────

void SceneHandlerRegistry::setBlockHandler(const std::string& blockUuid, InternalBlockHandler handler) {
    _blockHandlers[blockUuid] = std::move(handler);
}

InternalBlockHandler SceneHandlerRegistry::getBlockHandler(const std::string& blockUuid) const {
    auto it = _blockHandlers.find(blockUuid);
    return it != _blockHandlers.end() ? it->second : InternalBlockHandler{};
}

InternalBlockHandler SceneHandlerRegistry::getTypeHandler(BlockType type) const {
    switch (type) {
        case BlockType::Dialog:    return dialogHandler;
        case BlockType::Choice:    return choiceHandler;
        case BlockType::Condition: return conditionHandler;
        case BlockType::Action:    return actionHandler;
        case BlockType::Note:      return {};
    }
    return {};
}

// ─── Resolution ──────────────────────────────────────────────────────────────

ResolvedHandlers resolveHandler(
    BlockType blockType,
    const std::string& blockUuid,
    const SceneHandlerRegistry* sceneRegistry,
    const HandlerRegistry& globalRegistry)
{
    auto globalHandler = globalRegistry.getTypeHandler(blockType);

    if (!sceneRegistry) {
        return {{}, globalHandler};
    }

    // Most specific: onBlock(uuid)
    auto blockOverride = sceneRegistry->getBlockHandler(blockUuid);
    if (blockOverride) {
        return {blockOverride, globalHandler};
    }

    // Scene type override
    auto sceneTypeHandler = sceneRegistry->getTypeHandler(blockType);
    if (sceneTypeHandler) {
        return {sceneTypeHandler, globalHandler};
    }

    return {{}, globalHandler};
}

} // namespace lsde
