// LSDE Dialog Engine — Graph indexing and lookups

#pragma once

#include <lsde/types.h>

namespace lsde {

/// Indexed representation of a single scene for O(1) block and connection lookups.
class SceneGraph {
public:
    explicit SceneGraph(const BlueprintScene& scene);

    /// Get a block by UUID, or nullptr if not found.
    const BlueprintBlock* getBlock(const std::string& uuid) const;
    /// Get all outgoing connections from a block.
    std::vector<const BlueprintConnection*> getOutgoingConnections(const std::string& blockUuid) const;
    /// Get the start block (isStartBlock=true or entryBlockId), or nullptr.
    const BlueprintBlock* getStartBlock() const;
    /// Get the underlying BlueprintScene.
    const BlueprintScene& getScene() const;

private:
    const BlueprintScene& _scene;
    std::unordered_map<std::string, const BlueprintBlock*> _blocksByUuid;
    std::unordered_map<std::string, std::vector<const BlueprintConnection*>> _connectionsByFromId;
};

/// Indexed representation of an entire blueprint export.
/// Owns the BlueprintExport data and builds scene graphs for O(1) lookups.
class BlueprintGraph {
public:
    /// Takes ownership of the blueprint data and indexes all scenes.
    explicit BlueprintGraph(BlueprintExport data);

    /// Get the scene graph for a scene UUID, or nullptr if not found.
    const SceneGraph* getSceneGraph(const std::string& sceneUuid) const;
    /// Get an action signature by its id, or nullptr if not found.
    const ActionSignature* getSignature(const std::string& actionId) const;
    /// Get a dictionary by its label, or nullptr if not found.
    const LsdeDictionary* getDictionary(const std::string& groupLabel) const;
    /// Get all scene UUIDs.
    std::vector<std::string> getAllSceneIds() const;
    /// Get all connections for a scene.
    std::vector<const BlueprintConnection*> getSceneConnections(const std::string& sceneUuid) const;
    /// Returns the list of available locales from the blueprint.
    std::vector<std::string> getLocales() const;

private:
    BlueprintExport _data; // Owns the data
    std::unordered_map<std::string, SceneGraph> _sceneGraphs;
    std::unordered_map<std::string, const ActionSignature*> _signaturesById;
    std::unordered_map<std::string, const LsdeDictionary*> _dictionariesByLabel;
};

} // namespace lsde
