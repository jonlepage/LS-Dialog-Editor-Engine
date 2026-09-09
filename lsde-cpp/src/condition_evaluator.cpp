// LSDE Dialog Engine — Condition evaluation (C++ port of condition-evaluator.ts)

#include "lsde/condition_evaluator.h"

namespace lsde {

bool evaluateConditionChain(
    const std::vector<ConditionTest>& tests,
    const ConditionEvaluatorFn& evaluator) {
    if (tests.empty()) return true;

    bool result = evaluator(tests[0]);

    for (size_t i = 1; i < tests.size(); ++i) {
        const ConditionTest& test = tests[i];
        bool current = evaluator(test);

        if (test.join.has_value() && *test.join == ConditionJoin::Or) {
            result = result || current;
        } else {
            result = result && current;
        }
    }

    return result;
}

bool evaluateConditionChain(
    const std::optional<std::vector<ConditionTest>>& tests,
    const ConditionEvaluatorFn& evaluator) {
    if (!tests.has_value()) return true;
    return evaluateConditionChain(*tests, evaluator);
}

std::string evaluateConditionCases(
    const std::vector<ConditionCase>& cases,
    bool portPerCase,
    const ConditionEvaluatorFn& evaluator) {
    if (cases.empty()) return Ports::Out;

    if (portPerCase) {
        for (const auto& conditionCase : cases) {
            if (evaluateConditionChain(conditionCase.when, evaluator)) {
                return conditionCase.port;
            }
        }
        return Ports::Default;
    }

    // if mode: the cases share one exit, so they all have to hold to take it.
    for (const auto& conditionCase : cases) {
        if (!evaluateConditionChain(conditionCase.when, evaluator)) {
            return Ports::Default;
        }
    }
    return Ports::Out;
}

std::string pickPortFromResults(
    const std::vector<ConditionCase>& cases,
    bool portPerCase,
    const std::vector<bool>& results) {
    if (cases.empty()) return Ports::Out;

    if (portPerCase) {
        for (size_t i = 0; i < cases.size(); ++i) {
            if (i < results.size() && results[i]) return cases[i].port;
        }
        return Ports::Default;
    }

    // if mode: the cases share one exit, so they all have to hold to take it.
    for (size_t i = 0; i < cases.size(); ++i) {
        if (i >= results.size() || !results[i]) return Ports::Default;
    }
    return Ports::Out;
}

std::vector<std::string> pickRouterPorts(
    const std::vector<ConditionCase>& cases,
    const std::vector<bool>& results) {
    if (cases.empty()) return {Ports::Then};

    std::vector<std::string> ports;
    size_t matched = 0;
    for (size_t i = 0; i < cases.size(); ++i) {
        if (i >= results.size() || !results[i]) continue;
        ports.push_back(cases[i].port);
        matched++;
    }

    ports.push_back(matched == cases.size() ? Ports::Then : Ports::Catch);
    return ports;
}

std::vector<bool> evaluateEachCase(
    const std::vector<ConditionCase>& cases,
    const ConditionEvaluatorFn& evaluator) {
    std::vector<bool> results;
    results.reserve(cases.size());
    for (const auto& conditionCase : cases) {
        results.push_back(evaluateConditionChain(conditionCase.when, evaluator));
    }
    return results;
}

std::vector<RuntimeChoiceItem> tagOptionVisibility(
    const std::vector<Option>& options,
    const ConditionEvaluatorFn* evaluator) {
    std::vector<RuntimeChoiceItem> tagged;
    tagged.reserve(options.size());

    for (const auto& option : options) {
        RuntimeChoiceItem item;
        item.id = option.id;
        item.key = option.key;
        item.text = option.text;
        item.when = option.when;
        if (evaluator != nullptr) {
            item.visible = evaluateConditionChain(option.when, *evaluator);
        }
        tagged.push_back(std::move(item));
    }

    return tagged;
}

bool isChoiceTest(const ConditionTest& test) {
    return test.dict == Ports::Choice;
}

} // namespace lsde
