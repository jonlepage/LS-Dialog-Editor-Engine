// LSDE Dialog Engine — Condition chain evaluation

#pragma once

#include <lsde/types.h>

namespace lsde {

/// Evaluate a chain of conditions left-to-right with no operator precedence.
/// Empty vector returns true (no conditions = pass).
/// First condition: standalone result. Subsequent: '&' = AND, '|' = OR with accumulated result.
/// @param conditions The condition chain to evaluate.
/// @param evaluator A callback that evaluates a single condition against the game state.
bool evaluateConditionChain(
    const std::vector<ExportCondition>& conditions,
    const std::function<bool(const ExportCondition&)>& evaluator);

/// Filter choices by their visibilityConditions.
/// Choices with no conditions are always visible.
/// When scene is provided, choice: conditions are resolved automatically via the scene's
/// internal choice history — the developer never sees them. Non-choice conditions are
/// delegated to the evaluator callback.
/// @param choices The full list of choices.
/// @param evaluator A callback that evaluates a single condition against the game state.
/// @param scene Optional scene handle. When provided, choice: conditions are resolved via choice history.
std::vector<ChoiceItem> filterVisibleChoices(
    const std::vector<ChoiceItem>& choices,
    const std::function<bool(const ExportCondition&)>& evaluator,
    ISceneHandle* scene = nullptr);

} // namespace lsde
