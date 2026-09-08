// LSDE Dialog Engine — Init validation + diagnostic report (C++ port of validator.ts)
//
// The first thing this file does is refuse a payload it cannot read.
//
// It did not, before. The engine opened whatever it was handed and went straight to work, so a
// file written by a different exporter version produced no error at all — it produced a scene that
// stopped in the middle, silently, at the point where the flow needed a field that was not there.
// That is the worst failure a loader can have: the game ships, and the dialogue just ends early.
//
// So `format` and `version` are read before anything else, and a mismatch is fatal and named.

#include "lsde/validator.h"
#include "lsde/utils.h"

#include <unordered_set>
#include <map>

namespace lsde {

namespace {

/// The only payload this engine reads. A file that says anything else is refused outright.
constexpr const char* SUPPORTED_FORMAT = "lsde-blueprints";

/// The format version this engine reads. Bumps only when the payload contract itself changes.
constexpr int SUPPORTED_VERSION = 1;

/// How a block is named in a diagnostic.
///
/// DIALOG-007 is already readable on its own — that is what replaced the v1 uuid, and it is why
/// blocks carry no mandatory name. When the writer left a note, it says far more than any label
/// would, so it is appended. A label wins over both when an export happens to carry one.
std::string describeBlock(const BlueprintBlock& block) {
    if (block.label.has_value() && !block.label->empty()) {
        return "Block " + block.id + " (\"" + *block.label + "\")";
    }
    if (block.note.has_value() && !block.note->empty()) {
        std::string note = *block.note;
        if (note.size() > 60) note = note.substr(0, 59) + "...";
        return "Block " + block.id + " (\"" + note + "\")";
    }
    return "Block " + block.id;
}

bool isAsync(const BlueprintBlock& block) {
    auto it = block.props.find("isAsync");
    if (it == block.props.end()) return false;
    const bool* flag = std::get_if<bool>(&it->second);
    return flag != nullptr && *flag;
}

/// waitForBlocks names blocks OF THIS SCENE that must have been visited before this one advances.
///
/// A name that is not in the scene can never be visited, so the block parks for good: on the main
/// flow that is the whole dialogue stopping with no onSceneExit, and on a parallel track it is a
/// branch that silently never finishes. Neither shows up anywhere at runtime, which is why it is
/// said here - a warning, not an error: the rest of the scene still plays.
void validateWaits(
    const BlueprintScene& scene,
    const BlueprintBlock& block,
    const std::unordered_set<std::string>& blockIds,
    std::vector<DiagnosticEntry>& warnings) {
    for (const auto& waitId : getNativeProperties(block).waitForBlocks) {
        if (waitId.empty() || blockIds.count(waitId) > 0) continue;
        DiagnosticEntry entry;
        entry.code = "UNKNOWN_WAIT_BLOCK";
        entry.message = describeBlock(block) + " waits for \"" + waitId
                        + "\", which is not a block of scene \"" + scene.scene
                        + "\". It can never be visited, so this block never advances.";
        entry.sceneId = scene.scene;
        entry.blockId = block.id;
        warnings.push_back(std::move(entry));
    }
}

void validateLinks(
    const BlueprintScene& scene,
    const BlueprintBlock& block,
    const std::unordered_set<std::string>& blockIds,
    const std::unordered_map<std::string, const BlueprintBlock*>& blockById,
    std::vector<DiagnosticEntry>& errors,
    std::vector<DiagnosticEntry>& warnings) {
    if (block.next.empty()) return;

    // A link's target is relative to the same scene — a wire has never crossed one.
    // std::map keeps the ports in a stable order, so two runs report the same thing.
    std::map<std::string, std::vector<std::string>> byPort;

    for (const auto& link : block.next) {
        if (blockIds.count(link.to) == 0) {
            errors.push_back(DiagnosticEntry{
                "BROKEN_LINK",
                describeBlock(block) + " links from port \"" + link.port + "\" to \"" + link.to
                    + "\", which is not a block of scene \"" + scene.scene + "\".",
                scene.scene,
                block.id,
            });
        }
        byPort[link.port].push_back(link.to);
    }

    // One port, several wires: the first non-async target becomes the main flow and the rest run
    // as parallel tracks. Two non-async targets on one port means the second silently never
    // becomes the main track — almost always a wiring mistake rather than an intent.
    for (const auto& entry : byPort) {
        if (entry.second.size() <= 1) continue;

        int nonAsyncCount = 0;
        for (const auto& to : entry.second) {
            auto target = blockById.find(to);
            if (target == blockById.end() || !isAsync(*target->second)) nonAsyncCount++;
        }

        if (nonAsyncCount > 1) {
            warnings.push_back(DiagnosticEntry{
                "MULTIPLE_NON_ASYNC_FORK",
                describeBlock(block) + " port \"" + entry.first + "\" has "
                    + std::to_string(entry.second.size()) + " outgoing links with "
                    + std::to_string(nonAsyncCount)
                    + " non-async targets. Mark the secondary ones isAsync.",
                scene.scene,
                block.id,
            });
        }
    }
}

void validateScene(
    const BlueprintScene& scene,
    std::vector<DiagnosticEntry>& errors,
    std::vector<DiagnosticEntry>& warnings) {
    if (scene.scene.empty()) {
        errors.push_back(DiagnosticEntry{
            "MISSING_SCENE_PATH", "Scene is missing its path.", std::nullopt, std::nullopt});
    }

    // A block id is unique inside its scene and nowhere else: the counter restarts at 1 in every
    // scene, so DIALOG-001 in two scenes is not a collision, it is the normal case.
    std::unordered_set<std::string> blockIds;
    std::unordered_map<std::string, const BlueprintBlock*> blockById;

    for (const auto& block : scene.blocks) {
        if (!blockIds.insert(block.id).second) {
            errors.push_back(DiagnosticEntry{
                "DUPLICATE_BLOCK_ID",
                "Duplicate block id \"" + block.id + "\" within scene \"" + scene.scene + "\".",
                scene.scene,
                block.id,
            });
        }
        blockById[block.id] = &block;
    }

    // The scene names its own entry, so there is no such thing as two start blocks.
    if (!scene.start.has_value() || scene.start->empty()) {
        warnings.push_back(DiagnosticEntry{
            "NO_START_BLOCK",
            "Scene \"" + scene.scene + "\" has no start block and cannot play.",
            scene.scene,
            std::nullopt,
        });
    } else if (blockIds.count(*scene.start) == 0) {
        errors.push_back(DiagnosticEntry{
            "INVALID_START_BLOCK",
            "Scene \"" + scene.scene + "\" starts on \"" + *scene.start
                + "\", which is not a block of this scene.",
            scene.scene,
            *scene.start,
        });
    }

    for (const auto& block : scene.blocks) {
        validateLinks(scene, block, blockIds, blockById, errors, warnings);
        validateWaits(scene, block, blockIds, warnings);
    }
}

void crossValidate(
    const BlueprintExport& data,
    const CheckOptions& check,
    std::vector<DiagnosticEntry>& warnings) {
    if (!check.functions.empty()) {
        std::unordered_set<std::string> known(check.functions.begin(), check.functions.end());
        for (const auto& fn : data.functions) {
            if (known.count(fn.id) == 0) {
                warnings.push_back(DiagnosticEntry{
                    "UNKNOWN_FUNCTION",
                    "Blueprint declares function \"" + fn.id + "\" which the game does not implement.",
                    std::nullopt, std::nullopt});
            }
        }
    }

    if (!check.dictionaries.empty()) {
        for (const auto& dict : data.dictionaries) {
            auto known = check.dictionaries.find(dict.id);
            if (known == check.dictionaries.end()) {
                warnings.push_back(DiagnosticEntry{
                    "UNKNOWN_DICTIONARY",
                    "Blueprint uses dictionary \"" + dict.id + "\" which the game does not declare.",
                    std::nullopt, std::nullopt});
                continue;
            }
            std::unordered_set<std::string> knownSet(known->second.begin(), known->second.end());
            for (const auto& entry : dict.entries) {
                if (knownSet.count(entry) == 0) {
                    warnings.push_back(DiagnosticEntry{
                        "UNKNOWN_DICTIONARY_ENTRY",
                        "Dictionary \"" + dict.id + "\" declares entry \"" + entry
                            + "\" which the game does not know.",
                        std::nullopt, std::nullopt});
                }
            }
        }
    }

    // Cards — matched on the NAME the game gives them, not on the editor id.
    if (!check.cards.empty()) {
        std::unordered_set<std::string> known(check.cards.begin(), check.cards.end());
        for (const auto& card : data.cards) {
            if (known.count(card.name) == 0) {
                warnings.push_back(DiagnosticEntry{
                    "UNKNOWN_CARD",
                    "Blueprint declares card \"" + card.name + "\" (" + card.role
                        + ") which the game does not know.",
                    std::nullopt, std::nullopt});
            }
        }
    }
}

} // namespace

std::optional<BlueprintExport> mergePayloads(
    const std::vector<BlueprintExport>& payloads,
    std::optional<DiagnosticEntry>& error) {
    error.reset();
    const BlueprintExport& first = payloads[0];

    for (size_t i = 1; i < payloads.size(); ++i) {
        const BlueprintExport& next = payloads[i];
        if (next.project != first.project || next.exportedAt != first.exportedAt) {
            error = DiagnosticEntry{
                "MISMATCHED_EXPORTS",
                "These files are not from the same export: \"" + first.project + "\" ("
                    + first.exportedAt + ") and \"" + next.project + "\" (" + next.exportedAt
                    + "). Pass the files of one export at a time.",
                std::nullopt, std::nullopt};
            return std::nullopt;
        }
    }

    BlueprintExport merged = first;
    merged.scenes.clear();
    for (const auto& payload : payloads) {
        merged.scenes.insert(merged.scenes.end(), payload.scenes.begin(), payload.scenes.end());
    }
    return merged;
}

DiagnosticReport validateBlueprint(const InitOptions& options) {
    DiagnosticReport report;

    // ─── The header, before anything else ────────────────────────────────

    const BlueprintExport* payload = &options.data;
    BlueprintExport merged;

    if (!options.files.empty()) {
        // A per-scene export arrives as several self-contained files. Fold them before validating,
        // so everything below sees one payload and no rule has to know about split modes.
        std::optional<DiagnosticEntry> mergeError;
        auto folded = mergePayloads(options.files, mergeError);
        if (mergeError.has_value()) {
            report.errors.push_back(*mergeError);
            return report;
        }
        merged = std::move(*folded);
        payload = &merged;
    }

    if (payload->format != SUPPORTED_FORMAT) {
        // No naming-convention check here, unlike TypeScript and GDScript: those two are handed
        // the raw payload and can spot an `exported_at` key. This runtime validates a typed object
        // the game already deserialized, so the original key names are gone. The file is refused
        // either way - WRONG_NAMING_CONVENTION is a better message, not a different verdict.
        report.errors.push_back(DiagnosticEntry{
            "INVALID_FORMAT",
            std::string("Not an LSDE blueprint: expected format \"") + SUPPORTED_FORMAT
                + "\", got " + (payload->format.empty() ? "nothing" : "\"" + payload->format + "\"") + ".",
            std::nullopt, std::nullopt});
        return report;
    }

    if (payload->version != SUPPORTED_VERSION) {
        report.errors.push_back(DiagnosticEntry{
            "UNSUPPORTED_FORMAT_VERSION",
            "This engine reads blueprint format version " + std::to_string(SUPPORTED_VERSION)
                + ", the file is version " + std::to_string(payload->version)
                + ". Re-export from LSDE, or install the engine version that matches it.",
            std::nullopt, std::nullopt});
        return report;
    }

    // ─── Scenes ──────────────────────────────────────────────────────────

    if (payload->scenes.empty()) {
        report.errors.push_back(DiagnosticEntry{
            "NO_SCENES", "Blueprint must contain at least one scene.", std::nullopt, std::nullopt});
        return report;
    }

    std::unordered_set<std::string> scenePaths;
    int totalBlocks = 0;
    int totalConnections = 0;

    for (const auto& scene : payload->scenes) {
        if (!scenePaths.insert(scene.scene).second) {
            report.errors.push_back(DiagnosticEntry{
                "DUPLICATE_SCENE",
                "Scene \"" + scene.scene + "\" appears more than once. "
                    "When loading a per-scene export, pass each file exactly once.",
                scene.scene, std::nullopt});
        }

        validateScene(scene, report.errors, report.warnings);
        totalBlocks += static_cast<int>(scene.blocks.size());
        for (const auto& block : scene.blocks) {
            totalConnections += static_cast<int>(block.next.size());
        }
    }

    if (options.check.has_value()) {
        crossValidate(*payload, *options.check, report.warnings);
    }

    report.stats.sceneCount = static_cast<int>(payload->scenes.size());
    report.stats.blockCount = totalBlocks;
    report.stats.connectionCount = totalConnections;

    return report;
}

} // namespace lsde
