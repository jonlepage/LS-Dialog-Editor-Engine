// LSDE Dialog Engine — Public utilities for game developers (header-only)

#pragma once

#include <lsde/types.h>
#include <algorithm>

namespace lsde {

// ─── Type Guards ─────────────────────────────────────────────────────────────

inline bool isDialogBlock(const BlueprintBlock& b) { return dynamic_cast<const DialogBlock*>(&b) != nullptr; }
inline bool isChoiceBlock(const BlueprintBlock& b) { return dynamic_cast<const ChoiceBlock*>(&b) != nullptr; }
inline bool isConditionBlock(const BlueprintBlock& b) { return dynamic_cast<const ConditionBlock*>(&b) != nullptr; }
inline bool isActionBlock(const BlueprintBlock& b) { return dynamic_cast<const ActionBlock*>(&b) != nullptr; }
inline bool isNoteBlock(const BlueprintBlock& b) { return dynamic_cast<const NoteBlock*>(&b) != nullptr; }

// ─── Display Helpers ─────────────────────────────────────────────────────────

/// Returns the block's label, or the first 8 characters of its UUID as fallback.
inline std::string getBlockLabel(const BlueprintBlock& b) {
    if (b.label) return *b.label;
    return b.uuid.size() >= 8 ? b.uuid.substr(0, 8) : b.uuid;
}

/// Looks up a localized text value from a dialogueText map.
inline std::optional<std::string> getLocalizedText(
    const std::unordered_map<std::string, std::string>& dialogueText,
    const std::string& locale)
{
    auto it = dialogueText.find(locale);
    return it != dialogueText.end() ? std::optional<std::string>(it->second) : std::nullopt;
}

// ─── Condition Helpers ───────────────────────────────────────────────────────

/// Returns true if the condition references a previous choice selection (key starts with "choice:").
inline bool isChoiceCondition(const ExportCondition& c) {
    return c.key.size() >= 7 && c.key.substr(0, 7) == "choice:";
}

/// Extracts the referenced choice block UUID from a choice condition, or nullopt if not a choice condition.
inline std::optional<std::string> getChoiceConditionBlockUuid(const ExportCondition& c) {
    if (c.key.size() >= 7 && c.key.substr(0, 7) == "choice:") {
        return c.key.substr(7);
    }
    return std::nullopt;
}

} // namespace lsde
