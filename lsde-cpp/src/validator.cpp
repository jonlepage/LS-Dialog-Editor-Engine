// LSDE Dialog Engine — Init validation + diagnostic report

#include <lsde/validator.h>

namespace lsde {

static void validateScene(
    const BlueprintScene& scene,
    std::unordered_set<std::string>& globalBlockUuids,
    std::vector<DiagnosticEntry>& errors,
    std::vector<DiagnosticEntry>& warnings)
{
    if (scene.uuid.empty()) {
        errors.push_back({"MISSING_SCENE_UUID", "Scene is missing a UUID."});
    }
    if (scene.label.empty()) {
        errors.push_back({"MISSING_SCENE_LABEL", "Scene is missing a label.", scene.uuid});
    }

    std::unordered_set<std::string> sceneBlockUuids;
    int startBlockCount = 0;

    for (const auto& block : scene.blocks) {
        if (sceneBlockUuids.count(block->uuid)) {
            errors.push_back({
                "DUPLICATE_BLOCK_UUID",
                "Duplicate block UUID \"" + block->uuid + "\" within scene \"" + scene.label + "\".",
                scene.uuid, block->uuid
            });
        }
        sceneBlockUuids.insert(block->uuid);

        if (globalBlockUuids.count(block->uuid)) {
            errors.push_back({
                "DUPLICATE_BLOCK_UUID_GLOBAL",
                "Block UUID \"" + block->uuid + "\" exists in multiple scenes.",
                scene.uuid, block->uuid
            });
        }
        globalBlockUuids.insert(block->uuid);

        if (block->isStartBlock && *block->isStartBlock) {
            startBlockCount++;
        }
    }

    if (startBlockCount > 1) {
        errors.push_back({
            "MULTIPLE_START_BLOCKS",
            "Scene \"" + scene.label + "\" has " + std::to_string(startBlockCount) + " start blocks (expected at most 1).",
            scene.uuid
        });
    }

    if (scene.entryBlockId && !sceneBlockUuids.count(*scene.entryBlockId)) {
        errors.push_back({
            "INVALID_ENTRY_BLOCK",
            "Scene \"" + scene.label + "\" entryBlockId \"" + *scene.entryBlockId + "\" does not reference an existing block.",
            scene.uuid, *scene.entryBlockId
        });
    }

    for (const auto& conn : scene.connections) {
        if (!sceneBlockUuids.count(conn.fromId)) {
            errors.push_back({
                "BROKEN_CONNECTION_FROM",
                "Connection \"" + conn.id + "\" fromId \"" + conn.fromId + "\" references a non-existent block.",
                scene.uuid
            });
        }
        if (!sceneBlockUuids.count(conn.toId)) {
            errors.push_back({
                "BROKEN_CONNECTION_TO",
                "Connection \"" + conn.id + "\" toId \"" + conn.toId + "\" references a non-existent block.",
                scene.uuid
            });
        }
    }

    // Fork validation: max 1 non-async target per output port group
    std::unordered_map<std::string, const BlueprintBlock*> blockMap;
    for (const auto& block : scene.blocks) {
        blockMap[block->uuid] = block.get();
    }

    std::unordered_map<std::string, std::vector<std::string>> portGroups;
    for (const auto& conn : scene.connections) {
        std::string key = conn.fromPortIndex.has_value()
            ? conn.fromId + ":idx:" + std::to_string(*conn.fromPortIndex)
            : conn.fromId + ":port:" + conn.fromPort;

        portGroups[key].push_back(conn.toId);
    }

    for (const auto& [key, targets] : portGroups) {
        if (targets.size() <= 1) continue;

        int nonAsyncCount = 0;
        for (const auto& toId : targets) {
            auto it = blockMap.find(toId);
            if (it != blockMap.end()) {
                const auto* target = it->second;
                if (!target->nativeProperties || !target->nativeProperties->isAsync || !*target->nativeProperties->isAsync) {
                    nonAsyncCount++;
                }
            }
        }

        if (nonAsyncCount > 1) {
            warnings.push_back({
                "MULTIPLE_NON_ASYNC_FORK",
                "A port has " + std::to_string(targets.size()) + " outgoing connections with " + std::to_string(nonAsyncCount) + " non-async targets. Mark secondary targets as isAsync.",
                scene.uuid
            });
        }
    }
}

static void crossValidate(
    const BlueprintExport& data,
    const CheckOptions& check,
    std::vector<DiagnosticEntry>& warnings)
{
    if (!check.signatures.empty() && !data.signatures.empty()) {
        std::unordered_set<std::string> gameSignatures(check.signatures.begin(), check.signatures.end());
        for (const auto& sig : data.signatures) {
            if (!gameSignatures.count(sig.id)) {
                warnings.push_back({
                    "UNKNOWN_SIGNATURE",
                    "Blueprint uses signature \"" + sig.id + "\" which is not declared in the game."
                });
            }
        }
    }

    if (!check.dictionaries.empty() && !data.dictionaries.empty()) {
        for (const auto& dict : data.dictionaries) {
            std::string label = dict.label.value_or(dict.uuid);
            auto it = check.dictionaries.find(label);
            if (it == check.dictionaries.end()) {
                warnings.push_back({
                    "UNKNOWN_DICTIONARY_GROUP",
                    "Blueprint uses dictionary group \"" + label + "\" which is not declared in the game."
                });
                continue;
            }
            std::unordered_set<std::string> gameKeySet(it->second.begin(), it->second.end());
            for (const auto& row : dict.rows) {
                if (!gameKeySet.count(row.key)) {
                    warnings.push_back({
                        "UNKNOWN_DICTIONARY_KEY",
                        "Dictionary group \"" + label + "\" uses key \"" + row.key + "\" not declared in the game."
                    });
                }
            }
        }
    }

    if (!check.characters.empty()) {
        std::unordered_set<std::string> gameCharacters(check.characters.begin(), check.characters.end());
        std::unordered_set<std::string> blueprintCharacters;
        for (const auto& scene : data.scenes) {
            for (const auto& block : scene.blocks) {
                if (block->metadata) {
                    for (const auto& ch : block->metadata->characters) {
                        blueprintCharacters.insert(ch.name);
                    }
                }
            }
        }
        for (const auto& name : blueprintCharacters) {
            if (!gameCharacters.count(name)) {
                warnings.push_back({
                    "UNKNOWN_CHARACTER",
                    "Blueprint uses character \"" + name + "\" which is not declared in the game."
                });
            }
        }
    }
}

DiagnosticReport validateBlueprint(const InitOptions& options) {
    DiagnosticReport report;
    const auto& data = options.data;

    if (data.version.empty()) {
        report.errors.push_back({"MISSING_VERSION", "Blueprint version is required."});
    }

    if (data.scenes.empty()) {
        report.errors.push_back({"NO_SCENES", "Blueprint must contain at least one scene."});
        return report;
    }

    std::unordered_set<std::string> globalBlockUuids;
    int totalBlocks = 0;
    int totalConnections = 0;

    for (const auto& scene : data.scenes) {
        validateScene(scene, globalBlockUuids, report.errors, report.warnings);
        totalBlocks += static_cast<int>(scene.blocks.size());
        totalConnections += static_cast<int>(scene.connections.size());
    }

    if (options.check) {
        crossValidate(data, *options.check, report.warnings);
    }

    report.stats.sceneCount = static_cast<int>(data.scenes.size());
    report.stats.blockCount = totalBlocks;
    report.stats.connectionCount = totalConnections;

    return report;
}

} // namespace lsde
