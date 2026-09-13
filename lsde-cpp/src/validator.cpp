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

#include <cmath>
#include <map>
#include <sstream>
#include <unordered_map>
#include <unordered_set>

namespace lsde {

namespace {

/// The only payload this engine reads. A file that says anything else is refused outright.
constexpr const char* SUPPORTED_FORMAT = "lsde-blueprints";

/// The format version this engine reads. Bumps only when the payload contract itself changes.
constexpr int SUPPORTED_VERSION = 1;

/// What the header of the export declares, looked up by id — for the checks that read what the
/// blocks USE. The pointers are into the payload being validated, which outlives the report.
struct Declared {
    std::unordered_map<std::string, const FunctionDefinition*> functions;
    /// Dictionary id → its entry keys.
    std::unordered_map<std::string, std::unordered_set<std::string>> dictionaries;
};

Declared declaredBy(const BlueprintExport& payload) {
    Declared declared;
    for (const auto& fn : payload.functions) declared.functions[fn.id] = &fn;
    for (const auto& dict : payload.dictionaries) {
        declared.dictionaries[dict.id] =
            std::unordered_set<std::string>(dict.entries.begin(), dict.entries.end());
    }
    return declared;
}

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

/// A value as the text a dictionary entry or an option id is written in. A whole number prints
/// without a fractional part, the way the other three runtimes print it: 3, not 3.000000.
std::string valueText(const PropertyValue& value) {
    if (const auto* text = std::get_if<std::string>(&value)) return *text;
    if (const auto* flag = std::get_if<bool>(&value)) return *flag ? "true" : "false";
    if (const auto* number = std::get_if<double>(&value)) {
        if (*number == std::floor(*number) && std::abs(*number) < 1e15) {
            return std::to_string(static_cast<long long>(*number));
        }
        std::ostringstream out;
        out << *number;
        return out.str();
    }
    return "";
}

DiagnosticEntry usage(const char* code, std::string message, const BlueprintScene& scene,
                      const BlueprintBlock& block) {
    return DiagnosticEntry{code, std::move(message), scene.id, block.id, scene.scene};
}

/// waitForBlocks names blocks OF THIS SCENE that must have FINISHED before this one is dispatched.
///
/// A name that is not in the scene can never finish, so the block parks for good. It used to hold
/// the scene open with no onSceneExit; the engine now closes it as deadlocked - either way the
/// dialogue stops there, and nothing on screen says why, which is why it is said here. A warning,
/// not an error: the rest of the scene still plays.
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
        entry.sceneId = scene.id;
        entry.scenePath = scene.scene;
        entry.blockId = block.id;
        warnings.push_back(std::move(entry));
    }
}

// ─── What the blocks use ─────────────────────────────────────────────────────

/// Every condition test a block carries: the cases of a condition or a router, and the options of
/// a choice.
std::vector<const ConditionTest*> testsOf(const BlueprintBlock& block) {
    std::vector<const ConditionTest*> tests;
    for (const auto& conditionCase : block.cases) {
        if (!conditionCase.when) continue;
        for (const auto& test : *conditionCase.when) tests.push_back(&test);
    }
    for (const auto& option : block.options) {
        if (!option.when) continue;
        for (const auto& test : *option.when) tests.push_back(&test);
    }
    return tests;
}

void validateCall(
    const BlueprintScene& scene,
    const BlueprintBlock& block,
    const ActionCall& call,
    const Declared& declared,
    std::vector<DiagnosticEntry>& warnings) {
    const std::string where = describeBlock(block) + " in scene \"" + scene.scene + "\"";

    // The contract allows it - "not picked yet" - but the game is then handed a call it cannot run.
    if (call.fn.empty()) {
        warnings.push_back(usage("EMPTY_FUNCTION", where + " has a call with no function picked.", scene, block));
        return;
    }

    auto fn = declared.functions.find(call.fn);
    if (fn == declared.functions.end()) {
        warnings.push_back(usage("UNDECLARED_FUNCTION",
            where + " calls \"" + call.fn + "\", which the export does not declare in its functions.", scene, block));
        // Nothing more to say about its arguments: nobody knows what they should be.
        return;
    }

    const FunctionDefinition& definition = *fn->second;
    std::unordered_map<std::string, const FunctionParameter*> params;
    for (const auto& param : definition.params) params[param.name] = &param;

    // A PropertyBag is an unordered_map: warnings about two arguments of one call may come in
    // either order. The shared spec checks codes, never their order within a call.
    for (const auto& arg : call.args) {
        auto param = params.find(arg.first);
        if (param == params.end()) {
            warnings.push_back(usage("UNDECLARED_ARGUMENT",
                where + " calls \"" + definition.id + "\" with argument \"" + arg.first + "\", which \""
                    + definition.id + "\" does not declare.", scene, block));
            continue;
        }

        if (param->second->type != "dictionaryKey") continue;

        const std::string value = valueText(arg.second);
        const auto& dictionary = param->second->dictionary;
        auto entries = dictionary ? declared.dictionaries.find(*dictionary) : declared.dictionaries.end();

        if (entries == declared.dictionaries.end()) {
            warnings.push_back(usage("UNDECLARED_DICTIONARY_KEY",
                where + " passes \"" + value + "\" as \"" + arg.first + "\" of \"" + definition.id
                    + "\", picked in dictionary \"" + dictionary.value_or("")
                    + "\", which the export does not declare.", scene, block));
        } else if (entries->second.count(value) == 0) {
            warnings.push_back(usage("UNDECLARED_DICTIONARY_KEY",
                where + " passes \"" + value + "\" as \"" + arg.first + "\" of \"" + definition.id
                    + "\", which is not an entry of dictionary \"" + *dictionary + "\".", scene, block));
        }
    }
}

void validateTest(
    const BlueprintScene& scene,
    const BlueprintBlock& block,
    const ConditionTest& test,
    const std::unordered_map<std::string, const BlueprintBlock*>& blocksById,
    const Declared& declared,
    std::vector<DiagnosticEntry>& warnings) {
    const std::string where = describeBlock(block) + " in scene \"" + scene.scene + "\"";

    // The reserved "choice" dictionary is not declared anywhere: it reads the answers given IN THIS
    // SCENE, so its entry must be a CHOICE block of this scene and its value one of that block's
    // options.
    if (test.dict == Ports::Choice) {
        auto target = blocksById.find(test.entry);
        if (target == blocksById.end() || target->second->type != BlockType::Choice) {
            warnings.push_back(usage("UNKNOWN_CHOICE_BLOCK",
                where + " tests the answer given at \"" + test.entry + "\", which is not a CHOICE block of this "
                    "scene. The engine only remembers the answers given in the scene that is playing.", scene, block));
            return;
        }
        const std::string picked = valueText(test.value);
        bool offered = false;
        for (const auto& option : target->second->options) {
            if (option.id == picked) { offered = true; break; }
        }
        if (!offered) {
            warnings.push_back(usage("UNKNOWN_CHOICE_OPTION",
                where + " tests whether \"" + picked + "\" was picked at " + test.entry
                    + ", which has no such option.", scene, block));
        }
        return;
    }

    auto entries = declared.dictionaries.find(test.dict);
    if (entries == declared.dictionaries.end()) {
        warnings.push_back(usage("UNDECLARED_DICTIONARY",
            where + " tests dictionary \"" + test.dict + "\", which the export does not declare.", scene, block));
        return;
    }
    if (entries->second.count(test.entry) == 0) {
        warnings.push_back(usage("UNDECLARED_ENTRY",
            where + " tests \"" + test.dict + "." + test.entry + "\", an entry dictionary \"" + test.dict
                + "\" does not declare.", scene, block));
    }
}

/// What a block USES must be what the export DECLARES.
///
/// An export carries two kinds of facts: the tables its header declares, and what its blocks use.
/// `check` compares the first kind against the game; nothing read the second. So an action calling
/// a function the export does not declare - a v1 id left behind in the project - loaded without a
/// word, and failed in game, far from the cause.
///
/// Always on, no `check` needed: the export contradicts ITSELF, whatever the game knows. Warnings,
/// not errors - the scene still plays. The codes say UNDECLARED where the existing ones say UNKNOWN:
/// those mean "the game does not know it".
///
/// Left alone on purpose: a declared parameter with no argument (the format does not say which are
/// optional), and the TYPE of a value (noisier than the defect it would catch).
void validateUsage(
    const BlueprintScene& scene,
    const BlueprintBlock& block,
    const std::unordered_map<std::string, const BlueprintBlock*>& blocksById,
    const Declared& declared,
    std::vector<DiagnosticEntry>& warnings) {
    for (const auto& call : block.calls) validateCall(scene, block, call, declared, warnings);
    for (const auto* test : testsOf(block)) validateTest(scene, block, *test, blocksById, declared, warnings);
}

void validateLinks(
    const BlueprintScene& scene,
    const BlueprintBlock& block,
    const std::unordered_set<std::string>& blockIds,
    std::vector<DiagnosticEntry>& errors) {
    if (block.next.empty()) return;

    // A link's target is relative to the same scene — a wire has never crossed one.
    //
    // Several wires on one port is NOT reported. It used to be, as MULTIPLE_NON_ASYNC_FORK:
    // "two non-async targets on one port, mark the secondary ones isAsync". The warning was right
    // about the engine of the day — every wire but the first was detached whatever the designer had
    // ticked — and it asked them to give up what they had drawn. The traversal now walks those
    // wires in turn, which is what the drawing said, so there is nothing left to warn about.
    for (const auto& link : block.next) {
        if (blockIds.count(link.to) == 0) {
            errors.push_back(DiagnosticEntry{
                "BROKEN_LINK",
                describeBlock(block) + " links from port \"" + link.port + "\" to \"" + link.to
                    + "\", which is not a block of scene \"" + scene.scene + "\".",
                scene.id,
                block.id,
                scene.scene,
            });
        }
    }
}

void validateScene(
    const BlueprintScene& scene,
    const Declared& declared,
    std::vector<DiagnosticEntry>& errors,
    std::vector<DiagnosticEntry>& warnings) {
    if (scene.scene.empty()) {
        // Named by its id: without a path, that is the one name left to find the scene by.
        errors.push_back(DiagnosticEntry{
            "MISSING_SCENE_PATH", "Scene is missing its path.", scene.id, std::nullopt});
    }

    // A block id is unique inside its scene and nowhere else: the counter restarts at 1 in every
    // scene, so DIALOG-001 in two scenes is not a collision, it is the normal case.
    std::unordered_set<std::string> blockIds;
    std::unordered_map<std::string, const BlueprintBlock*> blocksById;

    for (const auto& block : scene.blocks) {
        if (!blockIds.insert(block.id).second) {
            errors.push_back(DiagnosticEntry{
                "DUPLICATE_BLOCK_ID",
                "Duplicate block id \"" + block.id + "\" within scene \"" + scene.scene + "\".",
                scene.id,
                block.id,
                scene.scene,
            });
        }
        blocksById[block.id] = &block;
    }

    // The scene names its own entry, so there is no such thing as two start blocks.
    if (!scene.start.has_value() || scene.start->empty()) {
        warnings.push_back(DiagnosticEntry{
            "NO_START_BLOCK",
            "Scene \"" + scene.scene + "\" has no start block and cannot play.",
            scene.id,
            std::nullopt,
            scene.scene,
        });
    } else if (blockIds.count(*scene.start) == 0) {
        errors.push_back(DiagnosticEntry{
            "INVALID_START_BLOCK",
            "Scene \"" + scene.scene + "\" starts on \"" + *scene.start
                + "\", which is not a block of this scene.",
            scene.id,
            *scene.start,
            scene.scene,
        });
    }

    for (const auto& block : scene.blocks) {
        validateLinks(scene, block, blockIds, errors);
        validateWaits(scene, block, blockIds, warnings);
        validateUsage(scene, block, blocksById, declared, warnings);
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

    const Declared declared = declaredBy(*payload);
    std::unordered_set<std::string> scenePaths;
    // Stable id -> the path of the first scene that carried it.
    std::unordered_map<std::string, std::string> sceneIds;
    int totalBlocks = 0;
    int totalConnections = 0;

    for (const auto& scene : payload->scenes) {
        if (!scenePaths.insert(scene.scene).second) {
            report.errors.push_back(DiagnosticEntry{
                "DUPLICATE_SCENE",
                "Scene \"" + scene.scene + "\" appears more than once. "
                    "When loading a per-scene export, pass each file exactly once.",
                scene.id, std::nullopt, scene.scene});
        } else if (!scene.id.empty() && sceneIds.count(scene.id) > 0) {
            // Two paths, one stable id: a scene file copied and renamed by hand. It used to load, and a
            // lookup by that id opened whichever of the two came last, without a word. The same scene
            // passed twice repeats its path as well, and is reported once, just above.
            report.errors.push_back(DiagnosticEntry{
                "DUPLICATE_SCENE",
                "Scenes \"" + sceneIds[scene.id] + "\" and \"" + scene.scene + "\" share the stable id \""
                    + scene.id + "\", so a lookup by that id cannot tell them apart.",
                scene.id, std::nullopt, scene.scene});
        }
        if (!scene.id.empty()) sceneIds.emplace(scene.id, scene.scene);

        validateScene(scene, declared, report.errors, report.warnings);
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
