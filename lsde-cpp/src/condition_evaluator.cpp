// LSDE Dialog Engine — Condition chain evaluation

#include <lsde/condition_evaluator.h>

namespace lsde {

bool evaluateConditionChain(
    const std::vector<ExportCondition>& conditions,
    const std::function<bool(const ExportCondition&)>& evaluator)
{
    if (conditions.empty()) return true;

    bool result = evaluator(conditions[0]);

    for (size_t i = 1; i < conditions.size(); ++i) {
        const auto& cond = conditions[i];
        bool current = evaluator(cond);

        if (cond.chain && *cond.chain == "|") {
            result = result || current;
        } else {
            // '&' or absent — default to AND
            result = result && current;
        }
    }

    return result;
}

ConditionResult evaluateConditionGroups(
    const std::vector<std::vector<ExportCondition>>& groups,
    const std::function<bool(const ExportCondition&)>& evaluator,
    bool dispatcher)
{
    if (dispatcher) {
        std::vector<int> matched;
        for (size_t i = 0; i < groups.size(); ++i) {
            if (evaluateConditionChain(groups[i], evaluator))
                matched.push_back(static_cast<int>(i));
        }
        return matched;
    }
    // Switch mode: first match wins
    for (size_t i = 0; i < groups.size(); ++i) {
        if (evaluateConditionChain(groups[i], evaluator))
            return static_cast<int>(i);
    }
    return -1;
}

std::vector<ChoiceItem> filterVisibleChoices(
    const std::vector<ChoiceItem>& choices,
    const std::function<bool(const ExportCondition&)>& evaluator,
    ISceneHandle* scene)
{
    std::vector<ChoiceItem> result;
    for (const auto& choice : choices) {
        if (choice.visibilityConditions.empty()
            || evaluateConditionChain(choice.visibilityConditions, [&evaluator, scene](const ExportCondition& cond) {
                if (scene && cond.key.size() >= 7 && cond.key.substr(0, 7) == "choice:") {
                    return scene->evaluateCondition(cond);
                }
                return evaluator(cond);
            })) {
            result.push_back(choice);
        }
    }
    return result;
}

} // namespace lsde
