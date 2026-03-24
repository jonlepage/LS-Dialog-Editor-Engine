// LSDE Dialog Engine — Graph indexing and lookups

#pragma once

#include <lsde/types.h>

namespace lsde {

/// Indexed representation of a single scene for O(1) lookups.
class SceneGraph {
public:
    explicit SceneGraph(const BlueprintScene& scene);

    const BlueprintBlock* getBlock(const std::string& uuid) const;
    std::vector<const BlueprintConnection*> getOutgoingConnections(const std::string& blockUuid) const;
    const BlueprintBlock* getStartBlock() const;
    const BlueprintScene& getScene() const;

private:
    const BlueprintScene& _scene;
    std::unordered_map<std::string, const BlueprintBlock*> _blocksByUuid;
    std::unordered_map<std::string, std::vector<const BlueprintConnection*>> _connectionsByFromId;
};

/// Indexed representation of an entire blueprint export.
class BlueprintGraph {
public:
    explicit BlueprintGraph(BlueprintExport data);

    const SceneGraph* getSceneGraph(const std::string& sceneUuid) const;
    const ActionSignature* getSignature(const std::string& actionId) const;
    const LsdeDictionary* getDictionary(const std::string& groupLabel) const;
    std::vector<std::string> getAllSceneIds() const;
    std::vector<const BlueprintConnection*> getSceneConnections(const std::string& sceneUuid) const;

private:
    BlueprintExport _data; // Owns the data
    std::unordered_map<std::string, SceneGraph> _sceneGraphs;
    std::unordered_map<std::string, const ActionSignature*> _signaturesById;
    std::unordered_map<std::string, const LsdeDictionary*> _dictionariesByLabel;
};

} // namespace lsde
