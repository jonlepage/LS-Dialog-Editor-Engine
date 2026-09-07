// LSDE Dialog Engine — Graph indexing and lookups (C++ port of graph.ts)

#include "lsde/graph.h"

namespace lsde {

namespace {
const std::vector<Link>& emptyLinks() {
    static const std::vector<Link> empty;
    return empty;
}
} // namespace

// ─── SceneGraph ──────────────────────────────────────────────────────────────

SceneGraph::SceneGraph(const BlueprintScene& scene) : _scene(scene) {
    for (const auto& block : scene.blocks) {
        _blocksById[block.id] = &block;
    }
}

const BlueprintBlock* SceneGraph::getBlock(const std::string& id) const {
    auto it = _blocksById.find(id);
    return it != _blocksById.end() ? it->second : nullptr;
}

const std::vector<Link>& SceneGraph::getOutgoingLinks(const std::string& blockId) const {
    const BlueprintBlock* block = getBlock(blockId);
    return block != nullptr ? block->next : emptyLinks();
}

std::vector<BlueprintConnection> SceneGraph::getConnections() const {
    std::vector<BlueprintConnection> wires;
    for (const auto& block : _scene.blocks) {
        for (const auto& link : block.next) {
            wires.push_back(BlueprintConnection{block.id, link.port, link.to, link.toPort});
        }
    }
    return wires;
}

const BlueprintBlock* SceneGraph::getStartBlock() const {
    if (!_scene.start.has_value() || _scene.start->empty()) return nullptr;
    return getBlock(*_scene.start);
}

const BlueprintScene& SceneGraph::getScene() const { return _scene; }

// ─── BlueprintGraph ──────────────────────────────────────────────────────────

BlueprintGraph::BlueprintGraph(BlueprintExport data) : _data(std::move(data)) {
    for (const auto& scene : _data.scenes) {
        _sceneGraphs.emplace(scene.scene, SceneGraph(scene));

        // A scene answers to its path AND to its rename-proof id. The path is what builds the i18n
        // keys and what a writer reads; the id is what an asset outside the payload must store,
        // because the path changes the day someone renames the scene.
        if (!scene.id.empty()) {
            _scenePathById[scene.id] = scene.scene;
        }
    }

    for (const auto& fn : _data.functions) _functionsById[fn.id] = &fn;
    for (const auto& dict : _data.dictionaries) _dictionariesById[dict.id] = &dict;
    for (const auto& card : _data.cards) _cardsById[card.id] = &card;
}

const SceneGraph* BlueprintGraph::getSceneGraph(const std::string& sceneRef) const {
    auto direct = _sceneGraphs.find(sceneRef);
    if (direct != _sceneGraphs.end()) return &direct->second;

    auto alias = _scenePathById.find(sceneRef);
    if (alias != _scenePathById.end()) {
        auto byId = _sceneGraphs.find(alias->second);
        if (byId != _sceneGraphs.end()) return &byId->second;
    }
    return nullptr;
}

const FunctionDefinition* BlueprintGraph::getFunction(const std::string& functionId) const {
    auto it = _functionsById.find(functionId);
    return it != _functionsById.end() ? it->second : nullptr;
}

const DictionaryDefinition* BlueprintGraph::getDictionary(const std::string& dictionaryId) const {
    auto it = _dictionariesById.find(dictionaryId);
    return it != _dictionariesById.end() ? it->second : nullptr;
}

const Card* BlueprintGraph::getCard(const std::string& cardId) const {
    auto it = _cardsById.find(cardId);
    return it != _cardsById.end() ? it->second : nullptr;
}

std::vector<Card> BlueprintGraph::getCardsByRole(const std::string& role) const {
    std::vector<Card> cards;
    for (const auto& card : _data.cards) {
        if (card.role == role) cards.push_back(card);
    }
    return cards;
}

std::vector<std::string> BlueprintGraph::getAllScenePaths() const {
    std::vector<std::string> ids;
    ids.reserve(_data.scenes.size());
    for (const auto& scene : _data.scenes) ids.push_back(scene.scene);
    return ids;
}

std::vector<BlueprintConnection> BlueprintGraph::getSceneConnections(const std::string& sceneRef) const {
    const SceneGraph* graph = getSceneGraph(sceneRef);
    return graph != nullptr ? graph->getConnections() : std::vector<BlueprintConnection>{};
}

std::vector<std::string> BlueprintGraph::getLocales() const { return _data.locales; }

const std::string& BlueprintGraph::getReferenceLocale() const { return _data.referenceLocale; }

} // namespace lsde
