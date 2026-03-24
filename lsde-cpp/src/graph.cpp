// LSDE Dialog Engine — Graph indexing and lookups

#include <lsde/graph.h>

namespace lsde {

// ─── SceneGraph ──────────────────────────────────────────────────────────────

SceneGraph::SceneGraph(const BlueprintScene& scene) : _scene(scene) {
    for (const auto& block : scene.blocks) {
        _blocksByUuid[block.uuid] = &block;
    }
    for (const auto& conn : scene.connections) {
        _connectionsByFromId[conn.fromId].push_back(&conn);
    }
}

const BlueprintBlock* SceneGraph::getBlock(const std::string& uuid) const {
    auto it = _blocksByUuid.find(uuid);
    return it != _blocksByUuid.end() ? it->second : nullptr;
}

std::vector<const BlueprintConnection*> SceneGraph::getOutgoingConnections(const std::string& blockUuid) const {
    auto it = _connectionsByFromId.find(blockUuid);
    return it != _connectionsByFromId.end() ? it->second : std::vector<const BlueprintConnection*>{};
}

const BlueprintBlock* SceneGraph::getStartBlock() const {
    for (const auto& block : _scene.blocks) {
        if (block.isStartBlock && *block.isStartBlock) return &block;
    }
    if (_scene.entryBlockId) {
        return getBlock(*_scene.entryBlockId);
    }
    return nullptr;
}

const BlueprintScene& SceneGraph::getScene() const {
    return _scene;
}

// ─── BlueprintGraph ──────────────────────────────────────────────────────────

BlueprintGraph::BlueprintGraph(BlueprintExport data) : _data(std::move(data)) {
    // Build scene graphs (references into _data.scenes which is now stable)
    for (const auto& scene : _data.scenes) {
        _sceneGraphs.emplace(scene.uuid, SceneGraph(scene));
    }

    for (const auto& sig : _data.signatures) {
        _signaturesById[sig.id] = &sig;
    }

    for (const auto& dict : _data.dictionaries) {
        if (dict.label) {
            _dictionariesByLabel[*dict.label] = &dict;
        }
    }
}

const SceneGraph* BlueprintGraph::getSceneGraph(const std::string& sceneUuid) const {
    auto it = _sceneGraphs.find(sceneUuid);
    return it != _sceneGraphs.end() ? &it->second : nullptr;
}

const ActionSignature* BlueprintGraph::getSignature(const std::string& actionId) const {
    auto it = _signaturesById.find(actionId);
    return it != _signaturesById.end() ? it->second : nullptr;
}

const LsdeDictionary* BlueprintGraph::getDictionary(const std::string& groupLabel) const {
    auto it = _dictionariesByLabel.find(groupLabel);
    return it != _dictionariesByLabel.end() ? it->second : nullptr;
}

std::vector<std::string> BlueprintGraph::getAllSceneIds() const {
    std::vector<std::string> ids;
    for (const auto& [key, _] : _sceneGraphs) {
        ids.push_back(key);
    }
    return ids;
}

std::vector<const BlueprintConnection*> BlueprintGraph::getSceneConnections(const std::string& sceneUuid) const {
    auto it = _sceneGraphs.find(sceneUuid);
    if (it == _sceneGraphs.end()) return {};
    std::vector<const BlueprintConnection*> result;
    for (const auto& conn : it->second.getScene().connections) {
        result.push_back(&conn);
    }
    return result;
}

} // namespace lsde
