// LSDE Dialog Engine — Shared helpers (header-only)

#pragma once

#include <lsde/types.h>

namespace lsde {

inline bool isDialogBlock(const BlueprintBlock& b) { return b.type == BlockType::Dialog; }
inline bool isChoiceBlock(const BlueprintBlock& b) { return b.type == BlockType::Choice; }
inline bool isConditionBlock(const BlueprintBlock& b) { return b.type == BlockType::Condition; }
inline bool isActionBlock(const BlueprintBlock& b) { return b.type == BlockType::Action; }
inline bool isNoteBlock(const BlueprintBlock& b) { return b.type == BlockType::Note; }

inline const BlockCharacter* getFirstCharacter(const BlueprintBlock& b) {
    if (b.metadata && !b.metadata->characters.empty()) {
        return &b.metadata->characters[0];
    }
    return nullptr;
}

} // namespace lsde
