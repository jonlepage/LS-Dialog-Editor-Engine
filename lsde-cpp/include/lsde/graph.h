// LSDE Dialog Engine — Graph indexing and lookups (C++ port of graph.ts)
//
// Two things changed with the v2 format, and both live here.
//
// **Block ids repeat across scenes.** The counter restarts at 1 in every scene, so DIALOG-001
// legitimately exists in two of them at once. A block is identified by the pair (scene, id) and
// nothing else — which is why every lookup goes through a SceneGraph and there is no global block
// index anywhere in this file. The v1 engine had one, and it refused a perfectly good export.
//
// **Wires are carried by the block they leave.** There is no connection table: a block lists its
// own outgoing links in `next`, and a Link only says where it goes. So an outgoing lookup is a
// field read rather than a map hit, and anything that needs both ends of a wire gets it flattened
// into a BlueprintConnection.

#pragma once

#include <lsde/types.h>

namespace lsde {

/// Indexed representation of a single scene for O(1) block lookups.
class SceneGraph {
public:
    explicit SceneGraph(const BlueprintScene& scene);

    /// A block by its id, which is unique WITHIN this scene only. nullptr when absent.
    const BlueprintBlock* getBlock(const std::string& id) const;

    /// The wires leaving a block, in the order the file lists them.
    ///
    /// Returned as-is: a Link knows its port and its target, and the caller already knows which
    /// block it asked about. Use getConnections() when the source id has to travel with the wire.
    const std::vector<Link>& getOutgoingLinks(const std::string& blockId) const;

    /// Every wire of the scene, flattened so each one carries the block it leaves.
    ///
    /// Graph inspection only — a debug tool that wants to see how a scene is wired without playing
    /// it. Traversal never needs this: it walks from a block, so it uses getOutgoingLinks().
    std::vector<BlueprintConnection> getConnections() const;

    /// The block the scene starts on, named by BlueprintScene::start.
    ///
    /// There is no per-block start flag in v2 — the scene names its entry, so a scene cannot
    /// declare two of them. nullptr means the scene has no entry and cannot play.
    const BlueprintBlock* getStartBlock() const;

    const BlueprintScene& getScene() const;

private:
    const BlueprintScene& _scene;
    std::unordered_map<std::string, const BlueprintBlock*> _blocksById;
};

/// Indexed representation of an entire blueprint export.
/// Owns the BlueprintExport data and builds scene graphs for O(1) lookups.
class BlueprintGraph {
public:
    /// Takes ownership of the blueprint data and indexes all scenes.
    explicit BlueprintGraph(BlueprintExport data);

    /// Not copyable, not movable.
    ///
    /// _data is owned BY VALUE, and _functionsById, _dictionariesById, _cardsById and every
    /// SceneGraph::_scene point INTO it. A copy or a move would rebuild the maps' owner while the
    /// maps kept pointing at the old storage - dangling references, no diagnostic, undefined
    /// behaviour at the first lookup. Deleting them turns that into a compile error.
    BlueprintGraph(const BlueprintGraph&) = delete;
    BlueprintGraph& operator=(const BlueprintGraph&) = delete;
    BlueprintGraph(BlueprintGraph&&) = delete;
    BlueprintGraph& operator=(BlueprintGraph&&) = delete;

    /// A scene by its path (reactor_breach) or by its stable id (sc_u0vqg2g8).
    const SceneGraph* getSceneGraph(const std::string& sceneRef) const;

    /// A declared engine function, as an action call's `fn` names it.
    const FunctionDefinition* getFunction(const std::string& functionId) const;

    /// A declared dictionary, as a condition test's `dict` cites it.
    const DictionaryDefinition* getDictionary(const std::string& dictionaryId) const;

    /// A card by its editor id (var1), the other end of a block's actors and emotion.
    const Card* getCard(const std::string& cardId) const;

    /// Every card holding a given role — cards mixes characters, emotions, places and none.
    std::vector<Card> getCardsByRole(const std::string& role) const;

    /// The path of every scene in the export — what engine.scene() takes.
    std::vector<std::string> getAllScenePaths() const;

    /// Every wire INSIDE a scene, flattened. Inspection only.
    std::vector<BlueprintConnection> getSceneConnections(const std::string& sceneRef) const;

    std::vector<std::string> getLocales() const;

    /// The locale written first in the export. Empty when the project declares none.
    const std::string& getReferenceLocale() const;

private:
    BlueprintExport _data; // Owns the data
    std::unordered_map<std::string, SceneGraph> _sceneGraphs;
    std::unordered_map<std::string, std::string> _scenePathById;
    std::unordered_map<std::string, const FunctionDefinition*> _functionsById;
    std::unordered_map<std::string, const DictionaryDefinition*> _dictionariesById;
    std::unordered_map<std::string, const Card*> _cardsById;
};

} // namespace lsde
