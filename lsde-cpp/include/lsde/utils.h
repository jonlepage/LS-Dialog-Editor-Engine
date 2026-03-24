// LSDE Dialog Engine — Shared helpers (header-only)

#pragma once

#include <lsde/types.h>

namespace lsde {

inline bool isDialogBlock(const BlueprintBlock& b) { return dynamic_cast<const DialogBlock*>(&b) != nullptr; }
inline bool isChoiceBlock(const BlueprintBlock& b) { return dynamic_cast<const ChoiceBlock*>(&b) != nullptr; }
inline bool isConditionBlock(const BlueprintBlock& b) { return dynamic_cast<const ConditionBlock*>(&b) != nullptr; }
inline bool isActionBlock(const BlueprintBlock& b) { return dynamic_cast<const ActionBlock*>(&b) != nullptr; }
inline bool isNoteBlock(const BlueprintBlock& b) { return dynamic_cast<const NoteBlock*>(&b) != nullptr; }

} // namespace lsde
