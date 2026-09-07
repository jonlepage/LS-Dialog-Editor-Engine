// LSDE Dialog Engine — Public utilities for game developers (C++ port of lsde-utils.ts)
//
// Static helpers, never hooks. Nothing here is called by the engine: a game calls them, with data
// it already has. That distinction is the whole point of the file — the engine reads STRUCTURE and
// never the content of a text, so anything to do with reading a line lives out here.
//
// Which is also why an onResolveText callback does not exist and will not. A callback is how the
// engine ASKS for something it needs; it never needs a line. It does not display it, measure it or
// validate it. The handler already has the block — it looks its text up wherever it keeps it.

#pragma once

#include <lsde/types.h>
#include <lsde/condition_evaluator.h>
#include <algorithm>
#include <stdexcept>

#include <map>

#include <variant>

#include <optional>

#include <string>

namespace lsde {

// ─── Type Guards ─────────────────────────────────────────────────────────────
//
// v2 block types are LOWERCASE strings. A payload still carrying "DIALOG" matches no guard at all,
// which is the point: a casing mismatch used to route silently, a name does not.

/// True when the block is a dialog.
/// The shape of a `localization/<locale>/__blueprints__.json` file: scene -> block, and
/// scene -> block -> option for a choice.
///
/// This is what an export writes when "Write texts separately" is on - the mode most integrations
/// want. Keeping every locale inline forces a game to load twenty languages to play one; the split
/// lets it load only the one the player picked.
///
/// A block's entry is either a plain line or, for a choice, one line per option id.
using LocaleEntry = std::variant<std::string, std::map<std::string, std::string>>;
using LocaleTable = std::map<std::string, std::map<std::string, LocaleEntry>>;

inline bool isDialogBlock(const BlueprintBlock& b) { return b.type == BlockType::Dialog; }
/// True when the block is a choice.
inline bool isChoiceBlock(const BlueprintBlock& b) { return b.type == BlockType::Choice; }
/// True when the block is a condition.
inline bool isConditionBlock(const BlueprintBlock& b) { return b.type == BlockType::Condition; }
/// True when the block is an action.
inline bool isActionBlock(const BlueprintBlock& b) { return b.type == BlockType::Action; }
/// True when the block is a note.
inline bool isNoteBlock(const BlueprintBlock& b) { return b.type == BlockType::Note; }

// ─── Display Helpers ─────────────────────────────────────────────────────────

/// How to name a block on screen or in a log.
///
/// There is no mandatory block name in v2, and none is needed: DIALOG-007 already reads better
/// than the uuid it replaced. A writer's note says far more than a three-word label would, so it
/// comes next; a label wins when an export carries one.
inline std::string getBlockLabel(const BlueprintBlock& b) {
    if (b.label.has_value() && !b.label->empty()) return *b.label;
    if (b.note.has_value() && !b.note->empty()) return *b.note;
    return b.id;
}

// ─── Condition Helpers ───────────────────────────────────────────────────────

/// Does this test read a past answer of the player rather than game state?
///
/// "choice" is a reserved dictionary id that no project dictionary may take: `entry` is a CHOICE
/// block id of this scene, `value` an option id of that block. The engine answers these from its
/// own history, so a game never has to remember what it already told the engine.
inline bool isChoiceCondition(const ConditionTest& test) { return isChoiceTest(test); }

/// The CHOICE block a "choice" test reads, or nullopt for any other test.
inline std::optional<std::string> getChoiceConditionBlockId(const ConditionTest& test) {
    if (test.dict == Ports::Choice) return test.entry;
    return std::nullopt;
}

// ─── Properties ──────────────────────────────────────────────────────────────

/// The properties the ENGINE acts on, pulled out of a block's props.
///
/// v2 puts natives and the writer's own properties in one bag, keyed by bare id, and ids cannot
/// collide — LSDE refuses a project property that takes a native name. So this is a lookup against
/// nativePropertyIds(), not a guess.
///
/// **delay and timeout are MILLISECONDS.** They were seconds in v1 and nothing reports the change
/// at runtime: a migrated project turns a 3-second pause into 3 ms.
inline NativeProperties getNativeProperties(const BlueprintBlock& block) {
    NativeProperties natives;

    auto readBool = [&block](const char* key) -> std::optional<bool> {
        auto it = block.props.find(key);
        if (it == block.props.end()) return std::nullopt;
        if (const bool* flag = std::get_if<bool>(&it->second)) return *flag;
        return std::nullopt;
    };

    auto readNumber = [&block](const char* key) -> std::optional<double> {
        auto it = block.props.find(key);
        if (it == block.props.end()) return std::nullopt;
        if (const double* number = std::get_if<double>(&it->second)) return *number;
        return std::nullopt;
    };

    natives.isAsync = readBool("isAsync");
    natives.delay = readNumber("delay");
    natives.timeout = readNumber("timeout");
    natives.waitInput = readBool("waitInput");
    natives.debug = readBool("debug");
    natives.portPerCharacter = readBool("portPerCharacter");
    natives.skipIfMissingActor = readBool("skipIfMissingActor");
    natives.portPerCase = readBool("portPerCase");

    // waitForBlocks is the one native holding a LIST rather than a scalar.
    auto waits = block.props.find("waitForBlocks");
    if (waits != block.props.end()) {
        if (const auto* list = std::get_if<std::vector<std::string>>(&waits->second)) {
            natives.waitForBlocks = *list;
        }
    }

    return natives;
}

/// The properties the WRITER declared, with the natives taken out — everything the game is free to
/// give its own meaning to.
inline PropertyBag getCustomProperties(const BlueprintBlock& block) {
    PropertyBag custom;
    const auto& natives = nativePropertyIds();

    for (const auto& entry : block.props) {
        if (std::find(natives.begin(), natives.end(), entry.first) == natives.end()) {
            custom[entry.first] = entry.second;
        }
    }
    return custom;
}

// ─── LsdeUtils ──────────────────────────────────────────────────────────────

/// Public helpers, mirroring the TS and C# LsdeUtils for cross-language parity.
class LsdeUtils {
public:
    /// Active locale code, synced by engine.setLocale(). Used as the default by the text helpers.
    static inline std::string locale;

    static bool IsDialogBlock(const BlueprintBlock& b) { return isDialogBlock(b); }
    static bool IsChoiceBlock(const BlueprintBlock& b) { return isChoiceBlock(b); }
    static bool IsConditionBlock(const BlueprintBlock& b) { return isConditionBlock(b); }
    static bool IsActionBlock(const BlueprintBlock& b) { return isActionBlock(b); }
    static bool IsNoteBlock(const BlueprintBlock& b) { return isNoteBlock(b); }

    static std::string GetBlockLabel(const BlueprintBlock& b) { return getBlockLabel(b); }

    /// Pick a locale out of an inline text map — block.text, or an option's.
    ///
    /// Only works when texts were exported INSIDE the payload. With the separate mode the blocks
    /// carry no text at all and GetTextFromTable is the one to use.
    ///
    /// @throws std::runtime_error when no locale is set, by parameter or by engine.setLocale().
    static std::optional<std::string> GetLocalizedText(
        const TextByLocale& text,
        const std::string& localeOverride = "")
    {
        const std::string& resolved = localeOverride.empty() ? locale : localeOverride;
        if (resolved.empty()) {
            throw std::runtime_error(
                "No locale set. Call engine.setLocale() first or pass a locale parameter.");
        }
        auto it = text.find(resolved);
        return it != text.end() ? std::optional<std::string>(it->second) : std::nullopt;
    }

    /// Read a line out of a loaded `localization/<locale>/__blueprints__.json`, for the separate
    /// text mode.
    ///
    /// The game loads the file - the engine does no IO, ever. Pass the block's scene and id, plus
    /// an option id for one answer of a choice.
    ///
    /// This existed in TypeScript, C# and GDScript and not here, while the comment on
    /// GetLocalizedText above told a C++ reader to use it. The separate-text mode was simply
    /// unreachable from Unreal.
    static std::optional<std::string> GetTextFromTable(
        const LocaleTable& table,
        const std::string& scene,
        const std::string& blockId,
        const std::string& optionId = "") {
        const auto sceneIt = table.find(scene);
        if (sceneIt == table.end()) return std::nullopt;

        const auto blockIt = sceneIt->second.find(blockId);
        if (blockIt == sceneIt->second.end()) return std::nullopt;

        if (const auto* line = std::get_if<std::string>(&blockIt->second)) {
            // A plain line. Asking for an option of a block that has none is a miss, not that line.
            return optionId.empty() ? std::optional<std::string>{*line} : std::nullopt;
        }

        if (optionId.empty()) return std::nullopt;

        const auto& options = std::get<std::map<std::string, std::string>>(blockIt->second);
        const auto optionIt = options.find(optionId);
        return optionIt == options.end() ? std::nullopt
                                         : std::optional<std::string>{optionIt->second};
    }

    /// The i18n key of a block, or of one option of a choice.
    ///
    /// The key is already in the payload (block.key), so this only builds the option variant —
    /// useful for a voice file, whose name is derived from the key.
    static std::string GetTextKey(const BlueprintBlock& block, const std::string& optionId = "") {
        return optionId.empty() ? block.key : block.key + "." + optionId;
    }

    static NativeProperties GetNativeProperties(const BlueprintBlock& b) { return getNativeProperties(b); }
    static PropertyBag GetCustomProperties(const BlueprintBlock& b) { return getCustomProperties(b); }

    static bool IsChoiceCondition(const ConditionTest& t) { return isChoiceCondition(t); }
    static std::optional<std::string> GetChoiceConditionBlockId(const ConditionTest& t) {
        return getChoiceConditionBlockId(t);
    }

    /// Evaluate a chain of tests left to right, with NO operator precedence.
    static bool EvaluateConditionChain(
        const std::vector<ConditionTest>& tests,
        const ConditionEvaluatorFn& evaluator)
    {
        return evaluateConditionChain(tests, evaluator);
    }

    /// The exit port of a condition block: "out"/"default" in if mode, K1… with portPerCase.
    /// Replaces the v1 evaluateConditionGroups, which returned an index and had a third,
    /// dispatcher mode that no longer exists.
    static std::string EvaluateConditionCases(
        const std::vector<ConditionCase>& cases,
        bool portPerCase,
        const ConditionEvaluatorFn& evaluator)
    {
        return evaluateConditionCases(cases, portPerCase, evaluator);
    }

    /// Each case on its own, in order — to show what matched without changing the flow.
    static std::vector<bool> EvaluateEachCase(
        const std::vector<ConditionCase>& cases,
        const ConditionEvaluatorFn& evaluator)
    {
        return evaluateEachCase(cases, evaluator);
    }

    /// Tag every option of a choice with whether its `when` holds, returning them ALL.
    /// Replaces the v1 FilterVisibleChoices, which shortened the list and took away the ability to
    /// show a locked answer.
    static std::vector<RuntimeChoiceItem> TagOptionVisibility(
        const std::vector<Option>& options,
        const ConditionEvaluatorFn* evaluator)
    {
        return tagOptionVisibility(options, evaluator);
    }
};

} // namespace lsde
