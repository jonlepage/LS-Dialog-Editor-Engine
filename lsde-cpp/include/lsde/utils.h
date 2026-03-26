// LSDE Dialog Engine — Public utilities for game developers (header-only)

#pragma once

#include <lsde/types.h>
#include <lsde/condition_evaluator.h>
#include <algorithm>
#include <stdexcept>

namespace lsde {

// ─── Type Guards ─────────────────────────────────────────────────────────────

/// Returns true if the block is a DialogBlock.
inline bool isDialogBlock(const BlueprintBlock& b) { return dynamic_cast<const DialogBlock*>(&b) != nullptr; }
/// Returns true if the block is a ChoiceBlock.
inline bool isChoiceBlock(const BlueprintBlock& b) { return dynamic_cast<const ChoiceBlock*>(&b) != nullptr; }
/// Returns true if the block is a ConditionBlock.
inline bool isConditionBlock(const BlueprintBlock& b) { return dynamic_cast<const ConditionBlock*>(&b) != nullptr; }
/// Returns true if the block is an ActionBlock.
inline bool isActionBlock(const BlueprintBlock& b) { return dynamic_cast<const ActionBlock*>(&b) != nullptr; }
/// Returns true if the block is a NoteBlock.
inline bool isNoteBlock(const BlueprintBlock& b) { return dynamic_cast<const NoteBlock*>(&b) != nullptr; }

// ─── Display Helpers ─────────────────────────────────────────────────────────

/// Returns the block's label, or the first 8 characters of its UUID as fallback.
inline std::string getBlockLabel(const BlueprintBlock& b) {
    if (b.label) return *b.label;
    return b.uuid.size() >= 8 ? b.uuid.substr(0, 8) : b.uuid;
}

// ─── Condition Helpers ───────────────────────────────────────────────────────

/// Returns true if the condition references a previous choice selection.
/// Choice conditions use the key format "choice:<blockUuid>" and are
/// evaluated internally by the engine against the scene's choice history.
inline bool isChoiceCondition(const ExportCondition& c) {
    return c.key.size() >= 7 && c.key.substr(0, 7) == "choice:";
}

/// Extracts the referenced choice block UUID from a choice condition.
/// @returns The block UUID, or nullopt if the condition is not a choice condition.
inline std::optional<std::string> getChoiceConditionBlockUuid(const ExportCondition& c) {
    if (c.key.size() >= 7 && c.key.substr(0, 7) == "choice:") {
        return c.key.substr(7);
    }
    return std::nullopt;
}

// ─── LsdeUtils ──────────────────────────────────────────────────────────────

/// Public utility class exposing common helpers for game developers integrating the LSDE engine.
/// Mirrors the TS/C# LsdeUtils API for cross-language parity.
class LsdeUtils {
public:
    /// Active locale code, synced by engine.setLocale().
    /// Used as default by GetLocalizedText().
    static inline std::string locale;

    // ─── Type Guards ─────────────────────────────────────────────────

    /// Returns true if the block is a DialogBlock.
    static bool IsDialogBlock(const BlueprintBlock& b) { return isDialogBlock(b); }
    /// Returns true if the block is a ChoiceBlock.
    static bool IsChoiceBlock(const BlueprintBlock& b) { return isChoiceBlock(b); }
    /// Returns true if the block is a ConditionBlock.
    static bool IsConditionBlock(const BlueprintBlock& b) { return isConditionBlock(b); }
    /// Returns true if the block is an ActionBlock.
    static bool IsActionBlock(const BlueprintBlock& b) { return isActionBlock(b); }
    /// Returns true if the block is a NoteBlock.
    static bool IsNoteBlock(const BlueprintBlock& b) { return isNoteBlock(b); }

    // ─── Display Helpers ─────────────────────────────────────────────

    /// Returns the block's label, or the first 8 characters of its UUID as fallback.
    static std::string GetBlockLabel(const BlueprintBlock& b) { return getBlockLabel(b); }

    /// Looks up a localized text value from a dialogueText map.
    /// Works with both DialogBlock.dialogueText and ChoiceItem.dialogueText.
    /// Uses the engine locale (set via engine.setLocale()) by default.
    /// @param dialogueText The localized text map.
    /// @param localeOverride Optional locale override. If empty, uses LsdeUtils::locale.
    /// @returns The localized string, or nullopt if the key is not found.
    /// @throws std::runtime_error if no locale is set (neither via parameter nor engine.setLocale()).
    static std::optional<std::string> GetLocalizedText(
        const std::unordered_map<std::string, std::string>& dialogueText,
        const std::string& localeOverride = "")
    {
        const std::string& resolvedLocale = localeOverride.empty() ? locale : localeOverride;
        if (resolvedLocale.empty()) {
            throw std::runtime_error("No locale set. Call engine.setLocale() first or pass a locale parameter.");
        }
        auto it = dialogueText.find(resolvedLocale);
        return it != dialogueText.end() ? std::optional<std::string>(it->second) : std::nullopt;
    }

    // ─── Condition Helpers ───────────────────────────────────────────

    /// Returns true if the condition references a previous choice selection.
    /// Choice conditions use the key format "choice:<blockUuid>".
    static bool IsChoiceCondition(const ExportCondition& c) { return isChoiceCondition(c); }

    /// Extracts the referenced choice block UUID from a choice condition.
    /// @returns The block UUID, or nullopt if not a choice condition.
    static std::optional<std::string> GetChoiceConditionBlockUuid(const ExportCondition& c) { return getChoiceConditionBlockUuid(c); }

    /// Evaluates a chain of conditions with & (AND) / | (OR) chaining.
    /// Left-to-right evaluation, no operator precedence. Empty array returns true.
    /// @param conditions The condition chain to evaluate.
    /// @param evaluator A callback that evaluates a single condition.
    static bool EvaluateConditionChain(
        const std::vector<ExportCondition>& conditions,
        const std::function<bool(const ExportCondition&)>& evaluator)
    {
        return evaluateConditionChain(conditions, evaluator);
    }

    /// Filters choice items by their visibility conditions.
    /// Choices without visibilityConditions are always visible.
    /// @param choices The full list of choices.
    /// @param evaluator A callback that evaluates a single condition.
    /// @param scene Optional ISceneHandle. When provided, choice: conditions are resolved
    ///   automatically via the scene's internal choice history and the developer never
    ///   sees them — only non-choice conditions are delegated to the evaluator callback.
    static std::vector<ChoiceItem> FilterVisibleChoices(
        const std::vector<ChoiceItem>& choices,
        const std::function<bool(const ExportCondition&)>& evaluator,
        ISceneHandle* scene = nullptr)
    {
        return filterVisibleChoices(choices, evaluator, scene);
    }
};

} // namespace lsde
