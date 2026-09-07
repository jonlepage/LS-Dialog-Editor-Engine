// LSDE Dialog Engine — Handler registration + resolution

#include <lsde/handler_registry.h>

namespace lsde {

// ─── HandlerRegistry (Tier 1) ────────────────────────────────────────────────

InternalBlockHandler HandlerRegistry::getTypeHandler(const std::string& type) const {
    if (type == BlockType::Dialog)    return dialogHandler;
    if (type == BlockType::Choice)    return choiceHandler;
    if (type == BlockType::Condition) return conditionHandler;
    if (type == BlockType::Action)    return actionHandler;
    // A note is never dispatched, and a type this engine does not know is not either.
    return {};
    return {};
}

// ─── SceneHandlerRegistry (Tier 2) ──────────────────────────────────────────

void SceneHandlerRegistry::setBlockHandler(const std::string& blockId, InternalBlockHandler handler) {
    _blockHandlers[blockId] = std::move(handler);
}

InternalBlockHandler SceneHandlerRegistry::getBlockHandler(const std::string& blockId) const {
    auto it = _blockHandlers.find(blockId);
    return it != _blockHandlers.end() ? it->second : InternalBlockHandler{};
}

InternalBlockHandler SceneHandlerRegistry::getTypeHandler(const std::string& type) const {
    if (type == BlockType::Dialog)    return dialogHandler;
    if (type == BlockType::Choice)    return choiceHandler;
    if (type == BlockType::Condition) return conditionHandler;
    if (type == BlockType::Action)    return actionHandler;
    // A note is never dispatched, and a type this engine does not know is not either.
    return {};
    return {};
}

// ─── Resolution ──────────────────────────────────────────────────────────────

ResolvedHandlers resolveHandler(
    const std::string& blockType,
    const std::string& blockId,
    const SceneHandlerRegistry* sceneRegistry,
    const HandlerRegistry& globalRegistry)
{
    auto globalHandler = globalRegistry.getTypeHandler(blockType);

    if (!sceneRegistry) {
        return {{}, globalHandler};
    }

    // Most specific: onBlock(uuid)
    auto blockOverride = sceneRegistry->getBlockHandler(blockId);
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
