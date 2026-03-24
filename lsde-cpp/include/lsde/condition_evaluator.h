// LSDE Dialog Engine — Condition chain evaluation

#pragma once

#include <lsde/types.h>

namespace lsde {

/// Evaluate a chain of conditions left-to-right with no operator precedence.
/// Empty vector returns true (no conditions = pass).
bool evaluateConditionChain(
    const std::vector<ExportCondition>& conditions,
    const std::function<bool(const ExportCondition&)>& evaluator);

/// Filter choices by their visibilityConditions.
std::vector<ChoiceItem> filterVisibleChoices(
    const std::vector<ChoiceItem>& choices,
    const std::function<bool(const ExportCondition&)>& evaluator);

} // namespace lsde
